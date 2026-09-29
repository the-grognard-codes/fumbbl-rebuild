/** A policy returns a protocol operation, never an engine command. Replace this module to train a player. */
export function chooseDecision(state, random = Math.random, actionsThisTurn = 0, setupVariant = 0) {
  const role = state.callerRole;
  if (role !== 'home' && role !== 'away') return null;
  if (state.saveResume) {
    const saved = state.saveResume;
    if (saved.status === 'SAVE_PENDING') return saved.proposer !== role
      ? { operation: 'saveReject', proposalId: saved.proposalId } : null;
    if (saved.status === 'SUSPENDED') return { operation: 'resumeRequest' };
    if (saved.status === 'RESUME_PENDING') return saved.proposer !== role
      ? { operation: 'resumeAccept', proposalId: saved.proposalId } : null;
    if (saved.status !== 'ACTIVE') return null;
  }
  if (state.prompt && state.prompt.actor === role) {
    return { operation: 'choice', promptId: state.prompt.id, optionId: pick(state.prompt.options, random) };
  }
  if (state.actor !== role || state.phase === 'FULL_TIME') return null;
  if (state.phase === 'SETUP') return setupDecision(state, setupVariant);

  const actions = state.actions.filter(action => action.actor === role);
  if (!actions.length) return null;
  const endTurn = actions.find(action => action.kind === 'endTurn');
  if (actionsThisTurn >= 30 && endTurn) return { operation: 'action', actionId: endTurn.id };
  if (actionsThisTurn >= 30) {
    const exit = actions.find(action => ['endAction', 'forgo'].includes(action.kind));
    if (exit) return { operation: 'action', actionId: exit.id };
  }
  const candidates = actions.filter(action => !['endTurn', 'endAction', 'forgo', 'jumpMode'].includes(action.kind));
  const selected = pick(candidates.length ? candidates : actions, random);
  return { operation: 'action', actionId: selected.id };
}

function pick(items, random) {
  return items[Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)))];
}

function setupDecision(state, setupVariant) {
  const role = state.callerRole;
  const available = state.players.filter(player => player.role === role && !/knocked out|casualty|dead|sent off/i.test(player.state));
  const eligible = available.slice(0, 11);
  if (setupVariant > 0) {
    const reserveIndex = Math.floor((setupVariant - 1) / 11) + 11;
    if (reserveIndex >= available.length) return null;
    eligible[10 - ((setupVariant - 1) % 11)] = available[reserveIndex];
  }
  const desired = new Map(eligible.map((player, index) => {
    const x = index < 3 ? 12 : 10;
    return [player.id, { x: role === 'home' ? x : 25 - x, y: index < 3 ? 6 + index : 1 + index }];
  }));
  const misplaced = state.players.find(player => player.role === role && player.x !== null &&
    (!desired.has(player.id) || player.x !== desired.get(player.id).x || player.y !== desired.get(player.id).y));
  if (misplaced) return { operation: 'place', playerId: misplaced.id, to: null };
  const missing = eligible.find(player => player.x === null);
  if (missing) return { operation: 'place', playerId: missing.id, to: desired.get(missing.id) };
  return { operation: 'confirm' };
}
