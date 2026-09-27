import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';

test('real-engine dodge and rush interruptions decode consistently for both coaches and spectator', () => {
  const frames = JSON.parse(readFileSync(new URL('./fixtures/m5-route-interruption-projections.json', import.meta.url), 'utf8'));
  assert.deepEqual(frames.map((frame: { checkpoint: string }) => frame.checkpoint),
    ['dodge-ready', 'dodge-selected', 'dodge-reroll', 'rush-ready', 'rush-reroll']);
  assert.deepEqual(frames.map((frame: { actor: { revision: number } }) => frame.actor.revision), [0, 1, 2, 0, 1]);

  for (const frame of frames) {
    const actor = decodeSetupStateValue(frame.actor);
    const otherCoach = decodeSetupStateValue(frame.otherCoach);
    const spectator = decodeSetupStateValue(frame.spectator, true);
    assert.equal(actor.projectionVersion, 4);
    assert.equal(actor.callerRole, 'home');
    assert.equal(otherCoach.callerRole, 'away');
    assert.equal(spectator.callerRole, 'spectator');
    for (const viewer of [otherCoach, spectator]) {
      assert.equal(viewer.revision, actor.revision);
      assert.deepEqual(viewer.players, actor.players);
      assert.deepEqual(viewer.actions, actor.actions);
      assert.deepEqual(viewer.prompt, actor.prompt);
    }
  }

  for (const frame of [frames[2], frames[4]]) {
    assert.ok(frame.actor.actions.some((action: { id: string; kind: string }) =>
      action.kind === 'reroll' && action.id.endsWith('reroll:team')));
  }
  assert.ok(frames[1].actor.actions.some((action: { kind: string; label: string }) =>
    action.kind === 'move' && action.label.includes('dodge')));
  assert.ok(frames[3].actor.actions.some((action: { kind: string; label: string }) =>
    action.kind === 'move' && action.label.includes('rush')));
});
