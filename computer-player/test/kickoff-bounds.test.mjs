import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseComputerDecision } from '../src/computer-policy.mjs';

test('Solid Defence confirms within selected plus one decisions with no carried policy state', () => {
  const state = { revision: 174, phase: 'PLAY', turnMode: 'SOLID_DEFENCE', callerRole: 'away', actor: 'away',
    players: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, role: 'away', x: 13, y: 5 + i })),
    kickoff: { event: 'SOLID_DEFENCE', stage: 'movement', actor: 'away', allowed: 6, selected: 5, completed: 0 },
    computer: { opponentId: 'coach-bogruk-weak', policyVersion: 'bogruk-v1', seed: 42, attackDirection: -1,
      progress: { turnKey: '2:2:7', stalledTurns: 0 }, policyState: null } };
  const moved = new Set();
  for (let decision = 0; decision <= state.kickoff.selected; decision++) {
    state.actions = state.players.flatMap(player => [-1, 1].map(delta => ({
      id: `${state.revision}:solid-place:${player.id}:13:${player.y + delta}`, kind: 'kickoffMove', label: 'Place player',
      actor: 'away', sourcePlayerId: player.id, target: { x: 13, y: player.y + delta },
    }))).concat({ id: `${state.revision}:confirm-solid-defence`, kind: 'kickoffChoice', label: 'Confirm Solid Defence', actor: 'away' });
    const chosen = chooseComputerDecision(state, { recklessness: false }).decision;
    if (chosen.actionId.endsWith('confirm-solid-defence')) return;
    const move = state.actions.find(action => action.id === chosen.actionId);
    assert.equal(moved.has(move.sourcePlayerId), false, 'A selected player may redeploy at most once');
    moved.add(move.sourcePlayerId);
    Object.assign(state.players.find(player => player.id === move.sourcePlayerId), move.target);
    state.revision++;
  }
  assert.fail('Solid Defence kept placing players instead of confirming within six decisions');
});

test('Charge ends an activation after movement even without a carried plan', () => {
  const state = { revision: 37, phase: 'PLAY', turnMode: 'BLITZ', actor: 'away', callerRole: 'away',
    activePlayerId: 'p1', players: [{ id: 'p1', role: 'away', x: 15, y: 7, ma: 6 }],
    kickoff: { event: 'CHARGE', stage: 'movement', allowed: 1, selected: 1, completed: 0 },
    computer: { opponentId: 'coach-bogruk-weak', policyVersion: 'bogruk-v1', seed: 42, attackDirection: -1,
      progress: { turnKey: '1:1:0', stalledTurns: 0 }, policyState: null, movement: { normalRemaining: 5, remaining: 7 } },
    actions: [{ id: '37:move', kind: 'move', actor: 'away', target: { x: 14, y: 7 } },
      { id: '37:end', kind: 'endAction', actor: 'away' }] };
  assert.equal(chooseComputerDecision(state).decision.actionId, '37:end');
});
