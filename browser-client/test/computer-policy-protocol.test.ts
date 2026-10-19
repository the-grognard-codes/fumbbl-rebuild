import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeComputerPolicyContext } from '../src/computer-policy-protocol.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';

const context = () => ({ opponentId: 'coach-bogruk-weak', policyVersion: 'bogruk-v1', seed: 0xffffffff,
  policyState: { version: 1, turnKey: '1:2:3', actions: 7, mistakeUsed: true, plan: {
    playerId: 'carrier', kind: 'move', targetPlayerId: null, target: { x: 0, y: 7 } } },
  progress: { turnKey: '1:2:3', stalledTurns: 2 }, attackDirection: -1,
  movement: { normalRemaining: 3, remaining: 5 } });

test('accepts versioned persisted intent and movement budgets without admitting arbitrary private fields', () => {
  assert.deepEqual(decodeComputerPolicyContext(context()), context());
  assert.throws(() => decodeComputerPolicyContext({ ...context(), credential: 'forbidden' }));
  assert.throws(() => decodeComputerPolicyContext({ ...context(), policyVersion: 'future-policy' }));
  assert.throws(() => decodeComputerPolicyContext({ ...context(), seed: 0x100000000 }));
  assert.throws(() => decodeComputerPolicyContext({ ...context(), attackDirection: 0 }));
  assert.throws(() => decodeComputerPolicyContext({ ...context(), movement: { normalRemaining: 6, remaining: 5 } }));
  assert.throws(() => decodeComputerPolicyContext({ ...context(), policyState: { ...context().policyState, actions: 257 } }));
  assert.throws(() => decodeComputerPolicyContext({ ...context(), policyState: { ...context().policyState,
    plan: { ...context().policyState.plan, target: { x: 26, y: 7 } } } }));
});

test('Bugman identity remains selectable without Bogruk memory', () => {
  const bugman = { ...context(), opponentId: 'coach-bugman-random', policyVersion: 'random-v1', policyState: null };
  assert.deepEqual(decodeComputerPolicyContext(bugman), bugman);
  assert.throws(() => decodeComputerPolicyContext({ ...bugman, policyState: context().policyState }));
});

test('private computer state is unavailable in human and spectator projections', () => {
  const state = { projectionVersion: 4, matchId: '00000000-0000-0000-0000-000000000001', revision: 1,
    callerRole: 'away', actor: 'away', phase: 'PLAY', prompt: null, players: [], actions: [], weather: 'NICE',
    homeRerolls: 0, awayRerolls: 0, turn: 1, turnMode: 'REGULAR', ball: null, activePlayerId: null,
    half: 1, drive: 1, homeTurn: 0, awayTurn: 1, homeScore: 0, awayScore: 0,
    homeTeamName: 'Home', awayTeamName: 'Away',
    homeResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 },
    awayResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 } };
  assert.deepEqual(decodeSetupStateValue({ ...state, computer: context() }).computer, context());
  assert.throws(() => decodeSetupStateValue({ ...state, callerRole: 'home', computer: context() }));
  assert.throws(() => decodeSetupStateValue({ ...state, callerRole: 'spectator', computer: context() }, true));
});
