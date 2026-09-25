import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';

test('real-engine Blitz checkpoints decode for actor and spectator', () => {
  const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
  assert.deepEqual(frames.map((frame: { checkpoint: string }) => frame.checkpoint),
    ['ready', 'declared', 'target-selected', 'moved-8', 'moved-9', 'moved-10', 'block-dice', 'push-choice']);
  for (const [index, frame] of frames.entries()) {
    const actor = decodeSetupStateValue(frame.actor);
    const spectator = decodeSetupStateValue(frame.spectator, true);
    assert.equal(actor.revision, index);
    assert.equal(spectator.revision, index);
    assert.deepEqual(spectator.players, actor.players);
    assert.deepEqual(spectator.ball, actor.ball);
    assert.equal(spectator.actions.length, 0);
    assert.equal(spectator.prompt, null);
  }
  assert.ok(frames[5].actor.actions.some((action: { kind: string }) => action.kind === 'block'));
  assert.ok(frames[6].actor.actions.some((action: { kind: string }) => action.kind === 'blockDie'));
});
