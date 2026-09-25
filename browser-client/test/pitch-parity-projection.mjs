import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Read-only contract inventory from existing server-generated fixtures. These
// independent capability cases are not represented as one live Blitz sequence.
const source = 'test/fixtures/supported-actions-v1.json';
const cases = JSON.parse(await readFile(source, 'utf8'));
const start = cases.find(item => item.capability === 'selectBlock' && item.before.state.actions.some(action => action.kind === 'blitz'));
const pending = cases.find(item => item.capability === 'block' && item.after.state.actions.some(action => action.kind === 'blockDie'));
assert.ok(start && pending, 'server-generated cases must include Blitz availability and a pending block die');
const summarize = (state) => ({
  matchId: state.matchId,
  revision: state.revision,
  callerRole: state.callerRole,
  phase: state.phase,
  actor: state.actor,
  activePlayerId: state.activePlayerId,
  playerCount: state.players.length,
  placedPlayers: state.players.filter(player => player.x !== null && player.y !== null).length,
  playerFields: Object.keys(state.players[0] ?? {}).sort(),
  actionKinds: [...new Set(state.actions.map(action => action.kind))].sort(),
  hasBall: state.ball !== null,
  hasScoreAndResources: ['homeScore', 'awayScore', 'homeRerolls', 'awayRerolls'].every(key => Number.isInteger(state[key]))
});
const report = {
  source,
  sourceKind: 'server-generated independent capability cases, not a contiguous Blitz flow',
  available: {
    beforeBlockSelection: summarize(start.before.state),
    pendingBlockDie: summarize(pending.after.state)
  },
  presentationGaps: [
    'No position/sprite/large-player or skill-badge fields in SetupPlayer; integrate a reviewed frozen-roster asset mapping.',
    'No renderer-ready path or square-risk descriptors in these projections; do not infer legal moves or odds in the renderer.',
    'No saved acting-player plus spectator projections from the same movement-then-block Blitz.',
    'No saved continuous movement-then-block Blitz with pending block choice.'
  ]
};
assert.equal(report.available.pendingBlockDie.actionKinds.includes('blockDie'), true);
assert.equal(report.available.beforeBlockSelection.actionKinds.includes('blitz'), true);
await mkdir('test-output/pitch-parity', { recursive: true });
await writeFile('test-output/pitch-parity/projection-mapping.json', JSON.stringify(report, null, 2));
console.log('PASS read-only projection inventory; full Blitz/spectator snapshot capture remains open');
