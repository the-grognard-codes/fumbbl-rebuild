import assert from 'node:assert/strict';
import test from 'node:test';
import { kickoffChoice, kickoffDraft, toggleKickoffPlayer } from '../src/kickoff-choice.ts';
import type { SetupAction, SetupState } from '../src/setup-protocol.ts';

const action = (id: string, label: string, actor: 'home' | 'away', playerId?: string): SetupAction => ({
  id, label, actor, kind: 'kickoffChoice', target: playerId ? { playerId } : null, sourcePlayerId: null
});

test('revision-bound kickoff actions provide one-click selected state and separate confirmation', () => {
  const offered = [action('19:event-pick:p1', 'Deselect Alice', 'home', 'p1'),
    action('19:event-pick:p2', 'Select Bob', 'home', 'p2'), action('19:event-confirm', 'Confirm CHARGE', 'home'),
    action('19:decline-event', 'Decline CHARGE', 'home'), action('19:event-pick:p3', 'Select Carol', 'away', 'p3')];
  const choice = kickoffChoice(offered, 'home');
  assert.deepEqual(choice?.players.map(player => [player.action.id, player.selected]),
    [['19:event-pick:p1', true], ['19:event-pick:p2', false]]);
  assert.equal(choice?.selectedCount, 1);
  assert.equal(choice?.confirm?.id, '19:event-confirm');
  assert.equal(choice?.decline?.id, '19:decline-event');
  assert.equal(kickoffChoice(offered, 'spectator'), null);
  assert.equal(kickoffChoice(offered, 'away')?.players.length, 1);
  assert.equal(kickoffChoice([action('20:event-pick:p1', 'Reposition Alice', 'home', 'p1')], 'home'), null);
});

import { readFileSync } from 'node:fs';
const initial: SetupState = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;

test('draft toggles locally, respects the cap and sends only confirmed participants', () => {
  const state: SetupState = { ...initial, kickoff: { version: 1, event: 'QUICK_SNAP', actor: 'home', stage: 'selection', allowed: 1, completed: 0, selected: 0 },
    actions: [action('1:event-pick:home1', 'Select Alice', 'home', 'home1'), action('1:event-pick:p2', 'Select Bob', 'home', 'p2'), action('1:event-confirm', 'Confirm QUICK_SNAP', 'home')] };
  const before = JSON.stringify(state);
  const selected = toggleKickoffPlayer([], 'home1', 1);
  assert.deepEqual(toggleKickoffPlayer(selected, 'p2', 1), ['home1']);
  assert.deepEqual(toggleKickoffPlayer(selected, 'home1', 1), []);
  assert.deepEqual(kickoffDraft(state, selected)?.selected, ['home1']);
  assert.equal(kickoffDraft(state, selected)?.batch, true);
  assert.deepEqual(kickoffDraft(state, [])?.selected, [], 'Reconnect begins with an empty draft');
  assert.equal(JSON.stringify(state), before, 'No server-state mutation before confirmation');
  assert.equal(kickoffDraft({ ...state, callerRole: 'spectator' }, selected), null);
});

test('High Kick and touchback select one recipient and confirm the offered action', () => {
  for (const turnMode of ['HIGH_KICK', 'TOUCHBACK']) {
    const offered: SetupAction = { id: '3:recipient', label: 'Choose recipient', actor: 'home',
      kind: turnMode === 'HIGH_KICK' ? 'kickoffMove' : 'touchback', sourcePlayerId: turnMode === 'HIGH_KICK' ? 'home1' : null,
      target: turnMode === 'HIGH_KICK' ? { x: 8, y: 7 } : { playerId: 'home1' } };
    const state = { ...initial, turnMode, actions: [offered] };
    assert.equal(kickoffDraft(state, [])?.confirm, null);
    assert.equal(kickoffDraft(state, ['home1'])?.confirm?.id, offered.id);
    assert.equal(kickoffDraft(state, ['home1'])?.batch, false);
    assert.equal(kickoffDraft(state, ['home1'])?.maximum, 1);
  }
  assert.equal(kickoffDraft({ ...initial, turnMode: 'TOUCHBACK', actions: [{ id: '3:square', label: 'Place ball', actor: 'home', kind: 'touchback', target: { x: 8, y: 7 } }] }, []), null);
});
