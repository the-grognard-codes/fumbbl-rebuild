import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { currentGameStep } from '../src/match-status.ts';
const journey = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const live = journey[0].actor;
const kickoff = { version: 1, event: 'QUICK_SNAP', actor: 'away', stage: 'movement', allowed: 5, completed: 2, selected: 0 };
test('kickoff progress remains public and bounded for either coach and spectators', () => {
  for (const callerRole of ['home', 'away', 'spectator']) {
    const state = decodeSetupStateValue({ ...live, callerRole, actions: callerRole === 'spectator' ? [] : live.actions, kickoff }, callerRole === 'spectator');
    assert.deepEqual(state.kickoff, kickoff);
    assert.match(currentGameStep(state)!.progress!, /2 moved.*5.*3 remaining/);
  }
  for (const invalid of [{ allowed: -1 }, { completed: 6 }, { selected: 6 }, { actor: 'spectator' }, { event: 'private' }, { stage: 'roll' }, { version: 2 }, { privatePlayers: [] }])
    assert.throws(() => decodeSetupStateValue({ ...live, kickoff: { ...kickoff, ...invalid } }));
  assert.equal(decodeSetupStateValue(live).kickoff, undefined);
});
test('Charge identifies the kicking team and ongoing native Blitz remains a Charge event', () => {
  const state = decodeSetupStateValue({ ...live, kickoff: { ...kickoff, event: 'CHARGE', stage: 'selection', selected: 2 } });
  assert.match(currentGameStep(state)!.instruction, /Kicking team.*up to 5.*Blitz, Throw teammate.*Kick Teammate/);
  assert.equal(currentGameStep(decodeSetupStateValue({ ...live, turnMode: 'BLITZ' }))!.title, 'Charge!');
});
test('touchback and High Kick give their current required placement instruction', () => {
  assert.match(currentGameStep(decodeSetupStateValue({ ...live, turnMode: 'TOUCHBACK', actions: [] }))!.instruction, /assign the ball/);
  assert.match(currentGameStep(decodeSetupStateValue({ ...live, turnMode: 'HIGH_KICK', actions: [] }))!.instruction, /one open player.*ball’s square/);
});
test('required decisions temporarily suppress kickoff broadcasts for both coaches and spectators', () => {
  for (const callerRole of ['home', 'away', 'spectator']) {
    for (const kind of ['followUp', 'blockDie', 'reroll', 'skill', 'push', 'apothecary', 'interception', 'argueTheCall']) {
      const state = decodeSetupStateValue({ ...live, callerRole, kickoff,
        actions: [{ id: 'required', actor: 'home', kind, label: 'Required choice', sourcePlayerId: null, target: null }] }, callerRole === 'spectator');
      assert.equal(currentGameStep(state), null, kind);
      assert.equal(currentGameStep({ ...state, actions: [] })?.title, 'Quick Snap!', 'The event resumes after the interruption');
    }
  }
});

test('saved and finished matches do not broadcast even with retained kickoff state', () => {
  const state = decodeSetupStateValue({ ...live, kickoff, actions: [] });
  for (const status of ['SUSPENDED', 'RESUME_PENDING'] as const)
    assert.equal(currentGameStep({ ...state, saveResume: { status, proposalId: null, proposer: null, expiresAt: null } }), null);
  assert.equal(currentGameStep({ ...state, phase: 'FULL_TIME' }), null);
});

test('routine activation, target selection, movement and required action decisions do not broadcast', () => {
  const state = decodeSetupStateValue(live);
  assert.equal(currentGameStep(state), null);
  assert.equal(currentGameStep({ ...state, activePlayerId: state.players[0].id }), null);
  for (const checkpoint of journey)
    for (const role of ['actor', 'otherCoach', 'spectator'])
      assert.equal(currentGameStep(decodeSetupStateValue(checkpoint[role], role === 'spectator')), null, checkpoint.checkpoint);
  assert.equal(currentGameStep({ ...state, turnMode: 'FUTURE_MODE' }), null, 'New game modes require an explicit broadcast decision');
});

test('drive setup and kick placement broadcast while pre-match choices use their dedicated prompt', () => {
  for (const callerRole of ['home', 'away', 'spectator']) {
    const state = decodeSetupStateValue({ ...live, callerRole, actions: [] }, callerRole === 'spectator');
    assert.equal(currentGameStep({ ...state, phase: 'SETUP' })?.title, 'Team setup');
    assert.equal(currentGameStep({ ...state, phase: 'READY_FOR_KICKOFF' })?.title, 'Kickoff!');
    assert.equal(currentGameStep({ ...state, phase: 'PRE_MATCH' }), null);
    for (const kind of ['coin', 'receive'] as const)
      assert.equal(currentGameStep({ ...state, phase: 'PRE_MATCH', prompt: { id: 'pre-match', actor: 'home', kind, options: [] } }), null);
  }
});
