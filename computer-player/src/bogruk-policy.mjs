import { BogrukBoard, distance, hasSkill, onPitch, playerValue, probability, prone, standing } from './bogruk-board.mjs';
import { isComputerGameOperation } from './computer-operations.mjs';
import { BOGRUK_PARAMETERS, validateParameters } from './bogruk-parameters.mjs';
import { resourceDecision } from './resource-decision.mjs';

export const BOGRUK_SETTINGS = Object.freeze({ riskChances: Object.freeze([0.3, 0.5, 0.7]), maxActions: 192, maxPathExpansions: 1800 });

// Purpose-specific draws avoid a mutable RNG and remain identical across process restarts.
export function policyRandom(seed, key) {
  let value = (seed >>> 0) ^ 2166136261;
  for (const char of key) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}

export function chooseBogrukDecision(state, options = {}) {
  const settings = { ...BOGRUK_SETTINGS, ...BOGRUK_PARAMETERS, ...options.parameters, ...options };
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
  if (state.phase === 'SETUP') return result(setup(state, options.setupVariant ?? 0, settings), 'Spread the team and protect valuable players.', null);
  const actions = state.actions.filter(action => action.actor === role);
  if (!actions.length) return result(null, 'No offered decision.');
  const board = new BogrukBoard(state, { maxExpansions: settings.maxPathExpansions, parameters: settings });
  const actionResult = (action, reason, plan = null, mistake = false) => result({ operation: 'action', actionId: action.id }, reason, plan, mistake);
  const resource = resourceDecision(actions, () => true);
  if (resource) return actionResult(resource, 'Use the offered resource or keep the least harmful injury.', memory.plan);
  const event = kickoffDecision(state, actions, memory.plan);
  if (event) return actionResult(event.action, 'Participate in the kickoff with a simple legal choice.', event.plan);
  const kick = actions.filter(action => action.kind === 'kickoff');
  if (kick.length) {
    const depth = random('kick-depth') < settings.deepKickChance ? settings.shallowKick : settings.deepKick;
    const centre = { x: board.direction > 0 ? 13 + depth : 12 - depth, y: 3 + Math.floor(random('kick-width') * 9) };
    kick.sort((a, b) => distance(a.target, centre) - distance(b.target, centre) || a.id.localeCompare(b.id));
    return actionResult(kick[0], depth > 5 ? 'Try a deep kick.' : 'Try a shallow kick.');
  }
  const prompt = promptDecision(state, actions, board, memory.plan, memory.actions >= settings.maxActions, options.onCandidates);
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
            - (1 - node.success) * settings.contactRisk - node.steps.length * settings.contactStep;
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
          let score = safeScore ? settings.safeScore - node.steps.length : board.positionScore(player, node) * node.success - (1 - node.success) * settings.moveRisk - node.steps.length * settings.moveStep;
          if (board.carrier?.id === player.id && node.x === board.endX) score += settings.touchdown * node.success;
          if (action.kind === 'secureBall') score += (probability(player.ag || 4) < 5 / 6 ? settings.secureBonus : settings.securePenalty);
          add(action, score, safeScore ? 'Take the whole no-dice scoring route.' : board.carrier?.id === player.id ? 'Advance the ball.' : !board.carrier ? 'Pursue the loose ball.' : 'Move into useful support or defensive pressure.',
            planFor(player, action.kind === 'secureBall' ? 'secureBall' : 'move', node), node.risks ? 'movement gamble' : 'ordering', safeScore);
        }
        if (action.kind === 'stand') add(action, settings.standScore, 'Stand up an available player.');
      }
    } else if (action.kind === 'block' || action.kind === 'blitzTarget') {
      const defender = board.players.find(item => item.id === action.target?.playerId);
      if (!active || !defender) continue;
      const node = action.kind === 'blitzTarget' ? bestAdjacent(board.paths(active), defender) : active;
      if (!node) continue;
      const dice = board.blockDice(active, defender, node);
      const committedTarget = memory.plan?.playerId === active.id && memory.plan.targetPlayerId === defender.id;
      add(action, board.blockScore(active, defender, dice) + settings.blockCommit + (committedTarget ? settings.planCommit : 0) - (1 - (node.success ?? 1)) * settings.contactRisk,
        'Block the selected opponent.', planFor(active, 'blitz', node, defender.id), dice < 2 ? 'risky block' : 'ordering');
    } else if (action.kind === 'foul' || action.kind === 'foulChainsaw') {
      const defender = board.players.find(item => item.id === action.target?.playerId);
      if (active && defender) add(action, board.foulScore(active, defender)
        + (memory.plan?.playerId === active.id && memory.plan.targetPlayerId === defender.id ? settings.planCommit : 0),
      'Weigh removal against a sending off.', null, 'low-value foul');
    } else if (action.kind === 'pass' || action.kind === 'handOff') {
      const catcher = board.own.find(item => item.id === action.target?.playerId || action.target?.x === item.x && action.target?.y === item.y);
      if (!active || !catcher || catcher.id === active.id) continue;
      const range = state.passing?.ranges?.[catcher.x]?.[catcher.y];
      if (action.kind === 'pass' && !['Q', 'S'].includes(range)) continue;
      add(action, transferScore(board, active, catcher, action.kind === 'handOff', active) + settings.transferCommit, 'Transfer the ball to a useful teammate.', null, 'ordering');
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
      let score = safeScore ? settings.safeScore - node.steps.length : board.positionScore(active, node) * node.success - (1 - node.success) * settings.moveRisk - node.steps.length * settings.moveStep;
      if (board.carrier?.id === active.id && node.x === board.endX) score += settings.touchdown * node.success;
      let plan = planFor(active, 'move', node);
      if (remembered && distance(node, remembered.target) === 0 && ['blitz', 'foul', 'pass', 'handOff', 'secureBall'].includes(remembered.kind)) {
        const target = board.players.find(player => player.id === remembered.targetPlayerId);
        if (target && ['blitz', 'foul'].includes(remembered.kind)) score = remembered.kind === 'foul' ? board.foulScore(active, target, node) : board.blockScore(active, target, board.blockDice(active, target, node));
        if (target && ['pass', 'handOff'].includes(remembered.kind)) score = transferScore(board, active, target, remembered.kind === 'handOff', node);
        plan = remembered;
      }
      add(move, score + (remembered && distance(node, remembered.target) === 0 ? settings.routeCommit : 0), safeScore ? 'Finish the whole no-dice scoring route.' : 'Continue a purposeful activation.', plan, node.risks ? 'movement gamble' : 'ordering', safeScore);
    }
  }
  options.onCandidates?.(candidates);
  const sorted = candidates.filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score || a.action.id.localeCompare(b.action.id));
  if (sorted.length) {
    const best = sorted[0];
    if (!best.safeScore && memory.actions < settings.maxActions && !memory.mistakeUsed && state.actor === role && settings.recklessness !== false && settings.recklessnessWeight > 0) {
      const chance = (options.riskChances ?? [settings.riskChance0, settings.riskChance1, settings.riskChance2])[Math.min(2, computer.progress.stalledTurns)];
      const draw = options.random ? options.random('risk') : policyRandom(computer.seed, `${turnKey}:risk`);
      if (draw < chance) {
        const alternatives = sorted.filter(candidate => candidate.action.id !== best.action.id && candidate.category
          && candidate.score < best.score - 1 && candidate.score >= Math.max(1, best.score - settings.riskWindow));
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

function kickoffDecision(state, actions, plan) {
  const kickoff = state.kickoff;
  if (!kickoff || !['CHARGE', 'QUICK_SNAP', 'SOLID_DEFENCE'].includes(kickoff.event)) return null;
  const named = suffix => actions.find(action => action.id.endsWith(suffix));
  if (kickoff.stage === 'selection') {
    const select = actions.find(action => action.kind === 'kickoffChoice' && /^Select /i.test(action.label));
    const confirm = named('event-confirm');
    const action = select ?? confirm ?? named('decline-event');
    return action ? { action, plan: null } : null;
  }
  if (kickoff.event === 'QUICK_SNAP') {
    const action = actions.find(action => action.kind === 'kickoffMove') ?? named('end-event');
    return action ? { action, plan: null } : null;
  }
  const moved = plan && state.players.some(player => player.id === plan.playerId && distance(player, plan.target) === 0);
  if (kickoff.event === 'SOLID_DEFENCE') {
    const zone = y => y < 4 ? 0 : y > 10 ? 2 : 1;
    // Move odd rows towards the adjacent even row. The board itself records progress:
    // an empty-target move cannot be selected again after a reconnect loses the plan.
    const move = actions.find(action => {
      if (action.kind !== 'kickoffMove') return false;
      const player = state.players.find(item => item.id === action.sourcePlayerId);
      return player && player.y % 2 === 1 && action.target?.y === player.y + 1
        && action.target?.x === player.x && zone(action.target.y) === zone(player.y)
        && distance(player, action.target) === 1
        && !state.players.some(item => item.x === action.target.x && item.y === action.target.y);
    });
    const player = move && state.players.find(item => item.id === move.sourcePlayerId);
    const action = move ?? named('confirm-solid-defence');
    return action ? { action, plan: move ? planFor(player, 'move', move.target) : null } : null;
  }
  // Charge needs no tactical search: activate each offered player, move once, finish.
  const endAction = actions.find(action => action.kind === 'endAction');
  const active = state.players.find(player => player.id === state.activePlayerId);
  const spentMovement = active && state.computer.movement?.normalRemaining < active.ma;
  if ((moved || spentMovement) && endAction) return { action: endAction, plan: null };
  const move = actions.find(action => action.kind === 'move');
  if (move) {
    const player = state.players.find(item => item.id === state.activePlayerId);
    return { action: move, plan: planFor(player, 'move', move.target) };
  }
  const action = endAction ?? actions.find(action => action.kind === 'select') ?? actions.find(action => action.kind === 'endTurn');
  return action ? { action, plan: null } : null;
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
  const scoringThreat = canActivate && Math.abs(board.endX - catcher.x) <= (catcher.ma ?? 6) ? board.parameters.transferThreat : 0;
  return (board.parameters.transferBase + advance * board.parameters.transferAdvance + safer * board.parameters.transferSafety + scoringThreat) * catchReroll * throwReroll - (1 - catchReroll * throwReroll) * board.parameters.transferRisk;
}

function promptDecision(state, actions, board, plan, exhausted, observe) {
  const weights = board.parameters;
  const regular = new Set(['select', 'stand', 'blitz', 'selectBlock', 'declareFoul', 'declarePass', 'declareHandOff', 'secureBall', 'move', 'jump', 'block', 'blitzTarget', 'foul', 'foulChainsaw', 'pass', 'handOff', 'endAction', 'endTurn', 'forgo', 'jumpMode']);
  if (actions.some(action => regular.has(action.kind))) return null;
  if (exhausted) {
    const reactionEnd = actions.find(action => action.kind === 'reactionEnd');
    if (reactionEnd) return reactionEnd;
    const decline = actions.find(action => ['reroll', 'proTestReroll', 'skill', 'reactiveSkill', 'kickSkill'].includes(action.kind)
      && /do not|keep|none|decline|don't|not use|without/i.test(action.label));
    if (decline) return decline;
  }
  const attacker = board.players.find(player => player.id === state.activePlayerId);
  const defender = (plan && attacker && plan.playerId === attacker.id ? board.players.find(player => player.id === plan.targetPlayerId) : null)
    ?? board.players.find(player => attacker && player.role !== attacker.role && distance(player, attacker) === 1);
  const activeSkill = (player, skill) => hasSkill(player, skill) && !/distracted/i.test(player?.status ?? '');
  const faces = actions.filter(action => action.kind === 'blockDie');
  if (faces.length) {
    const faceScore = action => {
      const label = action.label.toUpperCase();
      let score = label.includes('POW/PUSH') ? (activeSkill(defender, 'Dodge') && !activeSkill(attacker, 'Tackle') ? weights.faceDodge : weights.facePushPow)
        : /POW|DEFENDER DOWN/.test(label) ? weights.facePow : /BOTH.DOWN/.test(label) ? (activeSkill(attacker, 'Block') ? weights.faceBothSafe : weights.faceBothRisk)
          : /SKULL|ATTACKER DOWN/.test(label) ? weights.faceSkull : weights.facePush;
      if (attacker?.role !== state.callerRole) score = -score;
      return score;
    };
    faces.sort((a, b) => faceScore(b) - faceScore(a));
    observe?.(faces.map(action => ({ action, score: faceScore(action) })));
    if (faceScore(faces[0]) >= 0) return faces[0];
    return actions.find(action => action.kind === 'reroll' && !/none|keep|do not/i.test(action.label)) ?? faces[0];
  }
  const rank = action => {
    const label = action.label.toLowerCase();
    if (action.kind === 'reroll' || action.kind === 'proTestReroll') return /do not|keep|none/.test(label) ? 0
      : /pro|mascot/.test(label) ? weights.rerollPro : /team/.test(label) ? weights.rerollTeam : weights.rerollOther;
    if (action.kind === 'reactionEndPlayer' || action.id.endsWith('reaction-end-player') || action.id.endsWith('reaction-jump-mode')) return -1;
    if (['skill', 'reactiveSkill', 'kickSkill', 'onTheBall'].includes(action.kind)) return /do not|decline|don't|not use|without/.test(label) ? 0 : weights.skillUse;
    if (action.kind === 'followUp') return action.target ? weights.followBase - board.marks(action.target, state.callerRole).length * weights.followMark + (attacker && board.carrier?.id === attacker.id ? board.progress(attacker, action.target) * weights.followProgress : 0) : weights.followDecline;
    if (action.kind === 'push') return action.target ? (action.target.y < 0 || action.target.y > 14 || action.target.x < 0 || action.target.x > 25 ? weights.pushSurf : -board.marks(action.target, state.callerRole).length * weights.pushMark + (attacker ? board.progress(attacker, action.target) : 0)) : 0;
    if (action.kind === 'touchback') {
      const player = board.own.find(item => item.id === action.target?.playerId);
      return player ? weights.touchbackBase - (player.ag ?? 4) * weights.touchbackAgility + (hasSkill(player, 'Sure Hands') ? weights.touchbackSureHands : 0) + (player.ma ?? 6) : 0;
    }
    if (action.kind === 'kickoffMove' || action.kind === 'reactionMove' || action.kind === 'reactiveSquare') {
      const player = board.players.find(item => item.id === action.sourcePlayerId);
      return player && action.target && 'x' in action.target ? board.positionScore(player, action.target) : 0;
    }
    if (action.kind === 'kickoffChoice') return /confirm|finish|decline/i.test(label) ? weights.eventFinish : weights.eventOther;
    if (action.kind === 'apothecary') return /accept all|decline|do not|old/i.test(label) ? 0 : weights.apothecaryUse;
    return 0;
  };
  observe?.(actions.map(action => ({ action, score: rank(action) })).filter(candidate => Number.isFinite(candidate.score)));
  return [...actions].sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id))[0];
}

function setup(state, variant, parameters) {
  if (state.savedFormations?.length && variant === 0) return { operation: 'confirm' };
  const role = state.callerRole;
  const eligible = state.players.filter(player => player.role === role && (player.offPitch === 'reserve' || player.offPitch === 'pitch'
    || !player.offPitch && !/knocked out|casualty|dead|killed|injur|hurt|banned|sent off|prevented|missing|stunned/i.test(player.state)))
    .sort((a, b) => playerValue(b, parameters) - playerValue(a, parameters) || a.id.localeCompare(b.id));
  let chosen = eligible.slice(0, 11);
  // First repair the positions of the surviving players in a rejected saved formation.
  const replacementVariant = variant - (state.savedFormations?.length ? 1 : 0);
  if (replacementVariant > 0) {
    const replacement = Math.floor((replacementVariant - 1) / 11) + 11;
    if (replacement >= eligible.length) return null;
    chosen[10 - (replacementVariant - 1) % 11] = eligible[replacement];
  }
  // Three inexpensive players on the line; valuable runners/throwers stay deeper. Open lanes are intentional.
  chosen = chosen.sort((a, b) => playerValue(a, parameters) - playerValue(b, parameters) || a.id.localeCompare(b.id));
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

export function createBogrukPolicy(parameters = {}) {
 const frozen = validateParameters(parameters);
 return (state, options = {}) => chooseBogrukDecision(state, { ...options, parameters: frozen });
}
