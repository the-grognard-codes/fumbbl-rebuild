import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canPlaceReserve, decodeSetupState, decodeSetupStateValue } from '../src/setup-protocol.ts';

const state = { matchId: '12345678-1234-1234-1234-123456789abc', revision: 2, callerRole: 'home', phase: 'SETUP', actor: 'home', prompt: null, players: [{ id: 'p1', name: 'Captain', slot: 1, role: 'home', x: 3, y: 4, state: 'standing' }, { id: 'p2', name: 'Reserve', slot: 2, role: 'home', x: null, y: null, state: 'reserve' }], weather: 'Nice', homeRerolls: 2, awayRerolls: 1, actions: [], turn: 0, turnMode: 'setup', ball: null, activePlayerId: null, half: 1, homeTurn: 0, awayTurn: 0, homeScore: 0, awayScore: 0, drive: 1 };
const response = { version: 1, type: 'setupState', requestId: 'load', code: 'ACCEPTED', duplicate: false, state };
test('decodes a complete authoritative setup snapshot', () => assert.equal(decodeSetupState(JSON.stringify(response)).state?.players[1].x, null));
test('versioned public art identity accepts known values and null fallback, but rejects malformed fields', () => {
  const versioned = { ...state, projectionVersion: 2, players: state.players.map((player, index) => ({ ...player, art: index === 0 ? { rosterId: 'human', positionId: 'lineman' } : null })) };
  assert.deepEqual(decodeSetupStateValue(versioned).players[0].art, { rosterId: 'human', positionId: 'lineman' });
  assert.equal(decodeSetupStateValue({ ...versioned, callerRole: 'spectator' }, true).players[1].art, null);
  assert.throws(() => decodeSetupStateValue({ ...versioned, projectionVersion: 4 }));
  assert.throws(() => decodeSetupStateValue({ ...versioned, players: [{ ...versioned.players[0], art: { rosterId: 'human', positionId: 'lineman', owner: 'private' } }, versioned.players[1]] }));
  assert.throws(() => decodeSetupStateValue({ ...versioned, players: [{ ...versioned.players[0], art: { rosterId: 'human' } }, versioned.players[1]] }));
  assert.throws(() => decodeSetupStateValue({ ...state, players: [{ ...state.players[0], art: null }, state.players[1]] }));
});
test('version-three actions require bounded server target metadata', () => {
  const players = state.players.map(player => ({ ...player, art: null }));
  const versioned = { ...state, projectionVersion: 3, players, actions: [
    { id: '2:select-p1', label: 'Move Captain', actor: 'home', kind: 'select', target: { playerId: 'p1' } },
    { id: '2:move-4-4', label: 'Move to 4, 4', actor: 'home', kind: 'move', target: { x: 4, y: 4 } },
    { id: '2:end-turn', label: 'End turn', actor: 'home', kind: 'endTurn', target: null }
  ] };
  assert.deepEqual(decodeSetupStateValue(versioned).actions[1].target, { x: 4, y: 4 });
  assert.throws(() => decodeSetupStateValue({ ...versioned, actions: [{ ...versioned.actions[0], target: { playerId: 'secret' } }] }));
  assert.throws(() => decodeSetupStateValue({ ...versioned, actions: [{ ...versioned.actions[1], target: { x: 26, y: 4 } }] }));
  assert.throws(() => decodeSetupStateValue({ ...versioned, actions: [{ ...versioned.actions[2], target: { x: 4, y: 4, odds: 99 } }] }));
  assert.throws(() => decodeSetupStateValue({ ...versioned, actions: [{ id: '2:end-turn', label: 'End turn', actor: 'home', kind: 'endTurn' }] }));
});
test('decodes the versioned save/resume status and rejects malformed proposal data', () => {
  const saveResume = { status: 'SAVE_PENDING', proposalId: '12345678-1234-1234-1234-123456789abc', proposer: 'away', expiresAt: 1_700_000_000_000 };
  assert.equal(decodeSetupState(JSON.stringify({ ...response, state: { ...state, saveResume } })).state?.saveResume?.status, 'SAVE_PENDING');
  assert.throws(() => decodeSetupState(JSON.stringify({ ...response, state: { ...state, saveResume: { ...saveResume, proposer: 'spectator' } } })));
  assert.throws(() => decodeSetupState(JSON.stringify({ ...response, state: { ...state, saveResume: { status: 'SUSPENDED', proposalId: saveResume.proposalId, proposer: 'away', expiresAt: null } } })));
});
test('decodes server-issued play actions and board state', () => {
  const play = { ...state, phase: 'PLAY', turn: 3, turnMode: 'home', ball: { x: 12, y: 7 }, activePlayerId: 'p1', actions: [{ id: 'kick:12,7', label: 'Kick to 12, 7', actor: 'home', kind: 'kickoff' }, { id: 'end', label: 'End turn', actor: 'home', kind: 'endTurn' }] };
  const decoded = decodeSetupState(JSON.stringify({ ...response, state: play })).state!;
  assert.equal(decoded.actions[0].kind, 'kickoff'); assert.deepEqual(decoded.ball, { x: 12, y: 7 }); assert.equal(decoded.players[0].state, 'standing');
});
test('accepts broadcasts and validates prompt option shape', () => { const broadcast = { ...response, requestId: null, state: { ...state, prompt: { id: 'coin-1', actor: 'away', kind: 'coin', options: ['heads','tails'] } } }; assert.equal(decodeSetupState(JSON.stringify(broadcast)).state?.prompt?.kind, 'coin'); assert.throws(() => decodeSetupState(JSON.stringify({ ...broadcast, state: { ...broadcast.state, prompt: { ...broadcast.state.prompt, options: ['heads','kick'] } } }))); });
test('fails closed for unknown fields, illegal coordinates, and rejected state payloads', () => { assert.throws(() => decodeSetupState(JSON.stringify({ ...response, extra: true }))); assert.throws(() => decodeSetupState(JSON.stringify({ ...response, state: { ...state, players: [{ ...state.players[0], x: 26 }] } }))); assert.throws(() => decodeSetupState(JSON.stringify({ ...response, code: 'STALE_REVISION' }))); });
test('rejects malformed server action and gameplay fields', () => {
  assert.throws(() => decodeSetupState(JSON.stringify({ ...response, state: { ...state, actions: [{ id: '', label: 'End turn', actor: 'home', kind: 'endTurn' }] } })));
  assert.throws(() => decodeSetupState(JSON.stringify({ ...response, state: { ...state, actions: [{ id: 'a', label: 'End turn', actor: 'spectator', kind: 'endTurn' }] } })));
  assert.throws(() => decodeSetupState(JSON.stringify({ ...response, state: { ...state, actions: Array.from({ length: 8193 }, (_, index) => ({ id: String(index), label: 'Action', actor: 'home', kind: 'move' })) } })));
  assert.throws(() => decodeSetupState(JSON.stringify({ ...response, state: { ...state, ball: { x: 26, y: 7 } } })));
  assert.throws(() => decodeSetupState(JSON.stringify({ ...response, state: { ...state, half: 0 } })));
  assert.throws(() => decodeSetupState(JSON.stringify({ ...response, state: { ...state, drive: 0 } })));
});
test('only enables placement for a caller-owned player on an empty own-half square', () => { const decoded = decodeSetupState(JSON.stringify(response)).state!; assert.equal(canPlaceReserve(decoded, 'p2', 8, 7), true); assert.equal(canPlaceReserve(decoded, 'p1', 8, 7), true); assert.equal(canPlaceReserve(decoded, 'p2', 3, 4), false); assert.equal(canPlaceReserve(decoded, 'p2', 13, 7), false); });

test('phase and persisted decision owner gate placement even for an owned player', () => {
  const decoded = decodeSetupState(JSON.stringify(response)).state!;
  assert.equal(canPlaceReserve({ ...decoded, actor: 'away' }, 'p2', 8, 7), false);
  assert.equal(canPlaceReserve({ ...decoded, phase: 'PRE_MATCH' }, 'p2', 8, 7), false);
  assert.equal(canPlaceReserve({ ...decoded, phase: 'READY_FOR_KICKOFF' }, 'p2', 8, 7), false);
  assert.equal(canPlaceReserve(decoded, 'p1', 3, 4), false);
});
test('illegal formation replies and retries preserve their authoritative correction snapshot', () => {
  assert.equal(decodeSetupState(JSON.stringify({ ...response, code: 'ILLEGAL_SETUP' })).state?.revision, 2);
  assert.equal(decodeSetupState(JSON.stringify({ ...response, code: 'ILLEGAL_SETUP', duplicate: true })).duplicate, true);
  assert.equal(decodeSetupState(JSON.stringify({ ...response, code: 'SESSION_UNAVAILABLE', state: null })).state, null);
  assert.throws(() => decodeSetupState(JSON.stringify({ ...response, code: 'SESSION_UNAVAILABLE' })));
});
test('accepts bounded recovery error codes without accepting unknown codes', () => {
  for (const code of ['RECOVERY_UNSUPPORTED', 'RECOVERY_CORRUPT', 'RECOVERY_CONFLICT', 'RECOVERY_LIMIT', 'ACTIVATION_LIMIT']) {
    assert.equal(decodeSetupState(JSON.stringify({ ...response, code, state: null })).code, code);
  }
  assert.throws(() => decodeSetupState(JSON.stringify({ ...response, code: 'RECOVERY_UNKNOWN', state: null })));
});
