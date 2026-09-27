import assert from 'node:assert/strict';
import test from 'node:test';
import { kickoffChoice } from '../src/kickoff-choice.ts';
import type { SetupAction } from '../src/setup-protocol.ts';

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
