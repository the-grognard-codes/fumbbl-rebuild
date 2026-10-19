import { BogrukBoard, distance, hasSkill, onPitch, playerValue, probability, prone, standing } from './bogruk-board.mjs';
import { isComputerGameOperation } from './computer-operations.mjs';

export const BOGRUK_SETTINGS = Object.freeze({ riskChances: [0.3, 0.5, 0.7], maxActions: 192, maxPathExpansions: 1800 });

// Purpose-specific draws avoid a mutable RNG and remain identical across process restarts.
export function policyRandom(seed, key) {
  let value = (seed >>> 0) ^ 2166136261;
  for (const char of key) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}

export function chooseBogrukDecision(state, options = {}) {
  const settings = { ...BOGRUK_SETTINGS, ...options };
  const computer = state.computer;
  const turnKey = computer.progress.turnKey;
  const saved = computer.policyState;
  const memory = saved?.turnKey === turnKey ? { ...saved } : { version: 1, turnKey, actions: 0, mistakeUsed: false, plan: null };
  const random = purpose => options.random ? options.random(purpose) : policyRandom(computer.seed, `${state.revision}:${purpose}`);
  const result = (decision, reason, plan = memory.plan, mistake = false) => ({ decision, reason,
    nextPolicyState: { ...memory, actions: Math.min(256, memory.actions + Number(!!decision && isComputerGameOperation(decision.operation))), mistakeUsed: memory.mistakeUsed || mistake, plan } });
  const role = state.callerRole;
  if (!['home', 'away'].includes(role)) return result(null, 'Waiting for a playing role.');
  if (state.saveResume && state.saveResume.status !== 'ACTIVE') {
    const savedMatch = state.saveResume;
    if (savedMatch.status === 'SAVE_PENDING' && savedMatch.proposer !== role) return result({ operation: 'saveAccept', proposalId: savedMatch.proposalId }, 'Accept the human coach\'s save request.');
    if (savedMatch.status === 'SUSPENDED') return result(null, 'Wait for the human coach to resume.');
    if (savedMatch.status === 'RESUME_PENDING' && savedMatch.proposer !== role) return result({ operation: 'resumeAccept', proposalId: savedMatch.proposalId }, 'Accept the match resume.');
    return result(null, 'Waiting for save or resume.');
  }
  if (state.phase === 'FULL_TIME') return result(null, 'The match is complete.', null);
  if (state.prompt?.actor === role) {
    const choices = state.prompt.options;
    const optionId = choices.includes('receive') ? 'receive' : choices[Math.min(choices.length - 1, Math.floor(random('coin') * choices.length))];
    return result({ operation: 'choice', promptId: state.prompt.id, optionId }, 'Choose the offered pre-match option.', null);
  }
  if (state.actor !== role && state.reaction?.actor !== role) return result(null, 'Waiting for the other coach.');
  if (state.phase === 'SETUP') return result(setup(state, options.setupVariant ?? 0), 'Spread the team and protect valuable players.', null);
  const actions = state.actions.filter(action => action.actor === role);
  if (!actions.length) return result(null, 'No offered decision.');
  const board = new BogrukBoard(state, { maxExpansions: settings.maxPathExpansions });
  const actionResult = (action, reason, plan = null, mistake = false) => result({ operation: 'action', actionId: action.id }, reason, plan, mistake);
  const kick = actions.filter(action => action.kind === 'kickoff');
  if (kick.length) {
    const depth = random('kick-depth') < 0.5 ? 3 : 9;
    const centre = { x: board.direction > 0 ? 13 + depth : 12 - depth, y: 3 + Math.floor(random('kick-width') * 9) };
    kick.sort((a, b) => distance(a.target, centre) - distance(b.target, centre) || a.id.localeCompare(b.id));
    return actionResult(kick[0], depth > 5 ? 'Try a deep kick.' : 'Try a shallow kick.');
  }
  const prompt = promptDecision(state, actions, board, memory.plan);
  if (prompt) return actionResult(prompt, 'Resolve the offered choice with basic judgment.', memory.plan);

  const candidates = [];
  const add = (action, score, reason, plan = null, category = null, safeScore = false) => {
    if (Number.isFinite(score)) candidates.push({ action, score, reason, plan, category, safeScore });
  };
  const active = board.players.find(player => player.id === state.activePlayerId);
  const declarations = new Set(['select', 'stand', 'blitz', 'selectBlock', 'declareFoul', 'declarePass', 'declareHandOff', 'secureBall']);
  for (const action of actions) {
    const player = board.players.find(item => item.id === (action.sourcePlayerId ?? action.target?.playerId ?? state.activePlayerId));
    if (!player) continue;
    if (declarations.has(action.kind)) {
      if (player.role !== role) continue;
      if (action.kind === 'selectBlock') {
        for (const defender of board.opponents.filter(item => standing(item) && distance(item, player) === 1)) {
          const dice = board.blockDice(player, defender);
          add(action, board.blockScore(player, defender, dice), 'Take a useful block.', planFor(player, 'blitz', player, defender.id), dice < 2 ? 'risky block' : 'ordering');
        }
      } else if (action.kind === 'blitz' || action.kind === 'declareFoul') {
        const foul = action.kind === 'declareFoul';
        for (const defender of board.opponents.filter(item => foul ? prone(item) : standing(item))) {
          const node = bestAdjacent(board.paths(player), defender);
          if (!node || node.steps.length + Number(!foul) > board.movement(player).remaining) continue;
          const dice = board.blockDice(player, defender, node);
          const score = (foul ? board.foulScore(player, defender, node) : board.blockScore(player, defender, dice))
            - (1 - node.success) * 50 - node.steps.length * 0.4;
          add(action, score, foul ? 'Foul a reachable opponent.' : 'Pressure the opponent with a blitz.', planFor(player, foul ? 'foul' : 'blitz', node, defender.id), foul ? 'low-value foul' : dice < 2 ? 'risky block' : 'ordering');
        }
      } else if (action.kind === 'declarePass' || action.kind === 'declareHandOff') {
        if (board.carrier?.id !== player.id) continue;
        const handOff = action.kind === 'declareHandOff';
        for (const catcher of board.own.filter(item => item.id !== player.id && standing(item) && !hasSkill(item, 'No Ball'))) {
          const nodes = [...board.paths(player).values()].filter(node => handOff ? distance(node, catcher) === 1 : distance(node, catcher) <= 6);
          const node = nodes.sort((a, b) => a.cost - b.cost)[0];
          if (!node) continue;
          const score = transferScore(board, player, catcher, handOff, node);
          add(action, score, handOff ? 'Set up a useful handoff.' : 'Set up a useful short pass.', planFor(player, handOff ? 'handOff' : 'pass', node, catcher.id), 'ordering');
        }
      } else {
        if (action.kind === 'secureBall' && (!board.ball || board.carrier)) continue;
        for (const node of board.paths(player).values()) {
          if (!node.steps.length) continue;
          if (action.kind === 'secureBall' && distance(node, board.ball) !== 0) continue;
          const safeScore = board.carrier?.id === player.id && node.x === board.endX && node.risks === 0;
          let score = safeScore ? 10000 - node.steps.length : board.positionScore(player, node) * node.success - (1 - node.success) * 35 - node.steps.length * 0.35;
          if (board.carrier?.id === player.id && node.x === board.endX) score += 100 * node.success;
          if (action.kind === 'secureBall') score += (probability(player.ag || 4) < 5 / 6 ? 8 : -2);
          add(action, score, safeScore ? 'Take the whole no-dice scoring route.' : board.carrier?.id === player.id ? 'Advance the ball.' : !board.carrier ? 'Pursue the loose ball.' : 'Move into useful support or defensive pressure.',
            planFor(player, action.kind === 'secureBall' ? 'secureBall' : 'move', node), node.risks ? 'movement gamble' : 'ordering', safeScore);
        }
        if (action.kind === 'stand') add(action, 15, 'Stand up an available player.');
      }
    } else if (action.kind === 'block' || action.kind === 'blitzTarget') {
      const defender = board.players.find(item => item.id === action.target?.playerId);
      if (!active || !defender) continue;
      const node = action.kind === 'blitzTarget' ? bestAdjacent(board.paths(active), defender) : active;
      if (!node) continue;
      const dice = board.blockDice(active, defender, node);
      const committedTarget = memory.plan?.playerId === active.id && memory.plan.targetPlayerId === defender.id;
      add(action, board.blockScore(active, defender, dice) + 4 + (committedTarget ? 100 : 0) - (1 - (node.success ?? 1)) * 50,
        'Block the selected opponent.', planFor(active, 'blitz', node, defender.id), dice < 2 ? 'risky block' : 'ordering');
    } else if (action.kind === 'foul' || action.kind === 'foulChainsaw') {
      const defender = board.players.find(item => item.id === action.target?.playerId);
      if (active && defender) add(action, board.foulScore(active, defender)
        + (memory.plan?.playerId === active.id && memory.plan.targetPlayerId === defender.id ? 100 : 0),
      'Weigh removal against a sending off.', null, 'low-value foul');
    } else if (action.kind === 'pass' || action.kind === 'handOff') {
      const catcher = board.own.find(item => item.id === action.target?.playerId || action.target?.x === item.x && action.target?.y === item.y);
      if (!active || !catcher || catcher.id === active.id) continue;
      const range = state.passing?.ranges?.[catcher.x]?.[catcher.y];
      if (action.kind === 'pass' && !['Q', 'S'].includes(range)) continue;
      add(action, transferScore(board, active, catcher, action.kind === 'handOff', active) + 3, 'Transfer the ball to a useful teammate.', null, 'ordering');
    }
  }

  if (active) {
    // A plan survives prompts and restarts; re-evaluate its route against current occupancy and guidance.
    const remembered = memory.plan?.playerId === active.id ? memory.plan : null;
    const paths = board.paths(active);
    let goals = [...paths.values()].filter(node => node.steps.length);
    if (remembered) {
      const goal = paths.get(`${remembered.target.x},${remembered.target.y}`);
      if (goal?.steps.length) goals = [goal, ...goals];
    }
    const offeredMoves = actions.filter(action => action.kind === 'move' || action.kind === 'jump');
    // Keep offered immediate gambles even when the search found a safer detour to the same square.
    for (const move of offeredMoves.filter(action => action.kind === 'move')) {
      const risk = board.stepRisk(active, active, move.target, 1, board.movement(active).normalRemaining);
      goals.push({ ...move.target, steps: [{ ...move.target, ...risk }], risks: risk.risks, success: risk.success });
    }
    for (const node of goals) {
      const first = node.steps[0];
      const move = offeredMoves.find(action => action.target?.x === first.x && action.target?.y === first.y);
      if (!move) continue;
      const safeScore = board.carrier?.id === active.id && node.x === board.endX && node.risks === 0;
      let score = safeScore ? 10000 - node.steps.length : board.positionScore(active, node) * node.success - (1 - node.success) * 35 - node.steps.length * 0.35;
      if (board.carrier?.id === active.id && node.x === board.endX) score += 100 * node.success;
      let plan = planFor(active, 'move', node);
      if (remembered && distance(node, remembered.target) === 0 && ['blitz', 'foul', 'pass', 'handOff', 'secureBall'].includes(remembered.kind)) {
        const target = board.players.find(player => player.id === remembered.targetPlayerId);
        if (target && ['blitz', 'foul'].includes(remembered.kind)) score = remembered.kind === 'foul' ? board.foulScore(active, target, node) : board.blockScore(active, target, board.blockDice(active, target, node));
        if (target && ['pass', 'handOff'].includes(remembered.kind)) score = transferScore(board, active, target, remembered.kind === 'handOff', node);
        plan = remembered;
      }
      add(move, score + (remembered && distance(node, remembered.target) === 0 ? 1 : 0), safeScore ? 'Finish the whole no-dice scoring route.' : 'Continue a purposeful activation.', plan, node.risks ? 'movement gamble' : 'ordering', safeScore);
    }
  }
  const sorted = candidates.filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score || a.action.id.localeCompare(b.action.id));
  if (sorted.length) {
    const best = sorted[0];
    if (!best.safeScore && memory.actions < settings.maxActions && !memory.mistakeUsed && state.actor === role && settings.recklessness !== false) {
      const chance = settings.riskChances[Math.min(2, computer.progress.stalledTurns)];
      const draw = options.random ? options.random('risk') : policyRandom(computer.seed, `${turnKey}:risk`);
      if (draw < chance) {
        const alternatives = sorted.filter(candidate => candidate.action.id !== best.action.id && candidate.category
          && candidate.score < best.score - 1 && candidate.score >= Math.max(1, best.score - 120));
        // Prefer a recognizable gamble over harmless tie-breaking, but never manufacture an impossible play.
        const gambles = alternatives.filter(candidate => candidate.category !== 'ordering');
        const pool = gambles.length ? gambles : alternatives;
        if (pool.length) {
          const chosen = pool[Math.min(pool.length - 1, Math.floor(random('alternative') * pool.length))];
          return actionResult(chosen.action, `Deliberate risk: ${chosen.category}; ${chosen.reason}`, chosen.plan, true);
        }
      }
    }
    if (memory.actions < settings.maxActions || best.safeScore) return actionResult(best.action, best.reason, best.plan);
  }
  const exit = actions.find(action => action.kind === 'endAction') ?? actions.find(action => action.kind === 'endTurn') ?? actions.find(action => action.kind === 'forgo');
  return actionResult(exit ?? actions[0], exit ? 'End an exhausted activation or turn.' : 'Resolve an unfamiliar offered action legally.');
}

function planFor(player, kind, target, targetPlayerId = null) {
  return { playerId: player.id, kind, targetPlayerId, target: { x: target.x, y: target.y } };
}

function bestAdjacent(paths, target) {
  return [...paths.values()].filter(node => distance(node, target) === 1).sort((a, b) => a.cost - b.cost)[0];
}

function transferScore(board, passer, catcher, handOff, from) {
  const advance = board.progress(passer, catcher);
  // A transfer must not surrender ground just to protect possession. Movement detours remain available.
  if (advance < 0 || board.progress(from, catcher) < 0) return -Infinity;
  const safer = board.marks(passer, passer.role).length - board.marks(catcher, catcher.role).length;
  if (advance < 2 && safer < 1) return -Infinity;
  if (board.progress(from, catcher) < 1 && safer < 1) return -Infinity;
  const catchChance = probability((catcher.ag || 4) + board.marks(catcher, catcher.role).length);
  const passChance = handOff ? 1 : probability((passer.pa || 6) + (distance(from, catcher) > 3 ? 1 : 0) + board.marks(from, passer.role).length);
  const catchReroll = hasSkill(catcher, 'Catch') ? 1 - (1 - catchChance) ** 2 : catchChance;
  const throwReroll = !handOff && hasSkill(passer, 'Pass') ? 1 - (1 - passChance) ** 2 : passChance;
  const canActivate = board.state.actions.some(action => action.sourcePlayerId === catcher.id && ['select', 'stand'].includes(action.kind));
  const scoringThreat = canActivate && Math.abs(board.endX - catcher.x) <= (catcher.ma ?? 6) ? 65 : 0;
  return (38 + advance * 5 + safer * 8 + scoringThreat) * catchReroll * throwReroll - (1 - catchReroll * throwReroll) * 55;
}

function promptDecision(state, actions, board, plan) {
  const regular = new Set(['select', 'stand', 'blitz', 'selectBlock', 'declareFoul', 'declarePass', 'declareHandOff', 'secureBall', 'move', 'jump', 'block', 'blitzTarget', 'foul', 'foulChainsaw', 'pass', 'handOff', 'endAction', 'endTurn', 'forgo', 'jumpMode']);
  if (actions.some(action => regular.has(action.kind))) return null;
  const attacker = board.players.find(player => player.id === state.activePlayerId);
  const defender = (plan && attacker && plan.playerId === attacker.id ? board.players.find(player => player.id === plan.targetPlayerId) : null)
    ?? board.players.find(player => attacker && player.role !== attacker.role && distance(player, attacker) === 1);
  const activeSkill = (player, skill) => hasSkill(player, skill) && !/distracted/i.test(player?.status ?? '');
  const faces = actions.filter(action => action.kind === 'blockDie');
  if (faces.length) {
    const faceScore = action => {
      const label = action.label.toUpperCase();
      let score = label.includes('POW/PUSH') ? (activeSkill(defender, 'Dodge') && !activeSkill(attacker, 'Tackle') ? 25 : 65)
        : /POW|DEFENDER DOWN/.test(label) ? 80 : /BOTH.DOWN/.test(label) ? (activeSkill(attacker, 'Block') ? 40 : -80)
          : /SKULL|ATTACKER DOWN/.test(label) ? -100 : 20;
      if (attacker?.role !== state.callerRole) score = -score;
      return score;
    };
    faces.sort((a, b) => faceScore(b) - faceScore(a));
    if (faceScore(faces[0]) >= 0) return faces[0];
    return actions.find(action => action.kind === 'reroll' && !/none|keep|do not/i.test(action.label)) ?? faces[0];
  }
  const rank = action => {
    const label = action.label.toLowerCase();
    if (action.kind === 'reroll' || action.kind === 'proTestReroll') return /do not|keep|none/.test(label) ? 0
      : /pro|mascot/.test(label) ? 50 : /team/.test(label) ? 70 : 90;
    if (['skill', 'reactiveSkill', 'kickSkill'].includes(action.kind)) return /do not|decline|don't|not use|without/.test(label) ? 0 : 20;
    if (action.kind === 'followUp') return action.target ? 20 - board.marks(action.target, state.callerRole).length * 10 + (attacker && board.carrier?.id === attacker.id ? board.progress(attacker, action.target) * 5 : 0) : 1;
    if (action.kind === 'push') return action.target ? (action.target.y < 0 || action.target.y > 14 || action.target.x < 0 || action.target.x > 25 ? 100 : -board.marks(action.target, state.callerRole).length * 3 + (attacker ? board.progress(attacker, action.target) : 0)) : 0;
    if (action.kind === 'touchback') {
      const player = board.own.find(item => item.id === action.target?.playerId);
      return player ? 50 - (player.ag ?? 4) * 5 + (hasSkill(player, 'Sure Hands') ? 8 : 0) + (player.ma ?? 6) : 0;
    }
    if (action.kind === 'kickoffMove' || action.kind === 'reactionMove' || action.kind === 'reactiveSquare') {
      const player = board.players.find(item => item.id === action.sourcePlayerId);
      return player && action.target && 'x' in action.target ? board.positionScore(player, action.target) : 0;
    }
    if (action.kind === 'kickoffChoice') return /confirm|finish|decline/i.test(label) ? 10 : 5;
    if (action.kind === 'apothecary') return /accept all|decline|do not|old/i.test(label) ? 0 : 15;
    return 0;
  };
  return [...actions].sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id))[0];
}

function setup(state, variant) {
  const role = state.callerRole;
  const eligible = state.players.filter(player => player.role === role && (player.offPitch === 'reserve' || player.offPitch === 'pitch'
    || !player.offPitch && !/knocked out|casualty|dead|killed|injur|hurt|banned|sent off|prevented|missing|stunned/i.test(player.state)))
    .sort((a, b) => playerValue(b) - playerValue(a) || a.id.localeCompare(b.id));
  let chosen = eligible.slice(0, 11);
  if (variant > 0) {
    const replacement = Math.floor((variant - 1) / 11) + 11;
    if (replacement >= eligible.length) return null;
    chosen[10 - (variant - 1) % 11] = eligible[replacement];
  }
  // Three inexpensive players on the line; valuable runners/throwers stay deeper. Open lanes are intentional.
  chosen = chosen.sort((a, b) => playerValue(a) - playerValue(b) || a.id.localeCompare(b.id));
  const mirror = policyRandom(state.computer.seed, `${state.half}:${state.drive}:setup`) < 0.5;
  const positions = [{ x: 12, y: 4 }, { x: 12, y: 7 }, { x: 12, y: 10 },
    { x: 10, y: 2 }, { x: 10, y: 5 }, { x: 10, y: 9 }, { x: 10, y: 12 },
    { x: 8, y: 4 }, { x: 8, y: 10 }, { x: 6, y: 6 }, { x: 5, y: 9 }];
  const desired = new Map(chosen.map((player, index) => {
    const point = positions[index];
    return [player.id, { x: state.computer.attackDirection > 0 ? point.x : 25 - point.x, y: mirror ? 14 - point.y : point.y }];
  }));
  const misplaced = state.players.find(player => player.role === role && onPitch(player)
    && (!desired.has(player.id) || distance(player, desired.get(player.id)) !== 0));
  if (misplaced) return { operation: 'place', playerId: misplaced.id, to: null };
  const missing = chosen.find(player => !onPitch(player));
  if (missing) return { operation: 'place', playerId: missing.id, to: desired.get(missing.id) };
  return { operation: 'confirm' };
}
