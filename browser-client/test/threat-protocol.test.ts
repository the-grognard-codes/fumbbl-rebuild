import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodeSetupStateValue, type SetupState } from '../src/setup-protocol.ts';

const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
function view(): SetupState {
  const state: SetupState = structuredClone(frames[0].actor);
  state.callerRole = state.actor; state.turnMode = 'REGULAR';
  state.threats = { version: 1, eligiblePlayerIds: [state.players.find(player => player.role === state.actor && player.x !== null)!.id],
    zonePlayerIds: state.players.filter(player => player.x !== null).map(player => player.id) };
  return state;
}
test('decodes optional live native threat flags and accepts older/replay states without them', () => {
  const state = view(); assert.deepEqual(decodeSetupStateValue(state).threats, state.threats);
  delete state.threats; assert.equal(decodeSetupStateValue(state).threats, undefined);
  state.threats = view().threats; state.turnMode = 'BLITZ'; assert.doesNotThrow(() => decodeSetupStateValue(state));
  state.turnMode = 'KICKOFF'; state.kickoff = { version: 1, event: 'CHARGE', actor: state.actor, stage: 'selection', allowed: 2, selected: 0, completed: 0 };
  assert.doesNotThrow(() => decodeSetupStateValue(state));
});
test('rejects malformed threat payloads, wrong roles/contexts, unknown/duplicate/off-pitch IDs and private fields', () => {
  const state = view(), valid = state.threats!;
  const opponent = state.players.find(player => player.role !== state.actor && player.x !== null)!.id;
  for (const threats of [{ ...valid, version: 2 }, { ...valid, privateDice: [] }, { ...valid, eligiblePlayerIds: [opponent] },
    { ...valid, eligiblePlayerIds: ['missing'] }, { ...valid, zonePlayerIds: ['missing'] }, { ...valid, zonePlayerIds: [opponent, opponent] },
    { ...valid, zonePlayerIds: null }, { ...valid, eligiblePlayerIds: Array(33).fill(valid.eligiblePlayerIds[0]) }])
    assert.throws(() => decodeSetupStateValue({ ...state, threats }));
  for (const patch of [{ phase: 'SETUP' }, { callerRole: 'spectator' }, { actor: state.actor === 'home' ? 'away' : 'home' },
    { turnMode: 'QUICK_SNAP' }, { projectionVersion: 3 }])
    assert.throws(() => decodeSetupStateValue({ ...state, ...patch }, true));
  const offPitch = structuredClone(state); const source = offPitch.players.find(player => player.id === valid.zonePlayerIds[0])!;
  source.x = null; source.y = null; source.offPitch = 'reserve';
  assert.throws(() => decodeSetupStateValue(offPitch));
});
