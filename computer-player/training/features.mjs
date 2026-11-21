import { BogrukBoard, standing, prone, onPitch } from '../src/bogruk-board.mjs';

export const FEATURE_SCHEMA = Object.freeze({ version: 1, board: [26, 15, 26], globals: 16, candidate: 12 });
const kinds = ['select', 'stand', 'blitz', 'selectBlock', 'declareFoul', 'declarePass', 'declareHandOff', 'secureBall', 'move', 'jump', 'block', 'blitzTarget', 'foul', 'foulChainsaw', 'pass', 'handOff', 'endAction', 'endTurn', 'forgo', 'kickoff'];
// Only the caller's projection enters the encoder; coordinates always attack right.
export function encode(state, candidates) {
  const board = new BogrukBoard(state), planes = new Float32Array(26 * 15 * 26);
  const x = value => board.direction > 0 ? value : 25 - value;
  const put = (plane, px, py, value) => { if (px >= 0 && px < 26 && py >= 0 && py < 15) planes[plane * 390 + py * 26 + x(px)] = value; };
  for (const player of state.players.filter(onPitch)) {
    const offset = player.role === state.callerRole ? 0 : 10;
    const values = [1, player.ma / 10, player.st / 10, player.ag / 6, player.pa / 6, player.av / 12,
      Number(standing(player)), Number(prone(player)), Number(/stunned/i.test(player.state)), Number(/used|exhausted/i.test(player.status ?? player.state))];
    values.forEach((value, i) => put(offset + i, player.x, player.y, value));
    if (player.id === state.activePlayerId) put(20, player.x, player.y, 1);
    if (standing(player)) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (dx || dy) put(player.role === state.callerRole ? 21 : 22, player.x + dx, player.y + dy, 1);
    }
  }
  for (let y = 0; y < 15; y++) { put(24, board.direction > 0 ? 0 : 25, y, 1); put(25, board.direction > 0 ? 25 : 0, y, 1); }
  if (state.ball && state.ballState?.inPlay !== false) put(23, state.ball.x, state.ball.y, 1);
  const home = state.callerRole === 'home';
  const globals = [state.half / 2, (home ? state.homeTurn : state.awayTurn) / 8, (home ? state.awayTurn : state.homeTurn) / 8, (home ? 1 : -1) * (state.homeScore - state.awayScore) / 8,
    (state[home ? 'homeRerolls' : 'awayRerolls'] ?? 0) / 8, (state[home ? 'awayRerolls' : 'homeRerolls'] ?? 0) / 8,
    ...['NICE', 'VERY_SUNNY', 'POURING_RAIN', 'BLIZZARD', 'SWELTERING_HEAT'].map(weather => Number(state.weather === weather)),
    Number(!!state.kickoff), Number(state.phase === 'SETUP'), Number(state.actor === state.callerRole), Number(!!state.reaction), Number(!!board.carrier)];
  const features = candidates.map(candidate => {
    const action = candidate.action ?? {}, target = action.target ?? candidate.plan?.target;
    const player = board.players.find(p => p.id === (action.sourcePlayerId ?? state.activePlayerId));
    const node = player && target && Number.isInteger(target.x) ? board.paths(player).get(`${target.x},${target.y}`) : null;
    return [(kinds.indexOf(action.kind) + 1) / kinds.length, Number(!!target), target?.x == null ? 0 : x(target.x) / 25,
      (target?.y ?? 0) / 14, (node?.steps.length ?? 0) / 12, node?.success ?? 1, Math.tanh((candidate.score ?? 0) / 100),
      Number(!!candidate.safeScore), Number(!!candidate.plan), Number(action.kind === 'endTurn'), Number(action.kind === 'endAction'), Number(candidate.decision?.operation === 'choice')];
  });
  return { schemaVersion: 1, board: Array.from(planes), globals, candidates: features };
}

export function offeredCandidates(state, outcome, scored) {
  if (outcome.decision?.operation !== 'action') return [{ decision: outcome.decision, score: 0 }];
  const byId = new Map();
  for (const candidate of scored) {
    if (!byId.has(candidate.action.id) || byId.get(candidate.action.id).score < candidate.score) byId.set(candidate.action.id, candidate);
  }
  // Include all server-offered options. Tactical plans are annotations, not additional actions.
  return state.actions.filter(a => a.actor === state.callerRole).map(action => ({ score: 0, ...byId.get(action.id), action,
    decision: { operation: 'action', actionId: action.id } }));
}
