import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';

test('real-engine Blitz checkpoints decode for both coaches and spectator', () => {
  const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
  assert.deepEqual(frames.map((frame: { checkpoint: string }) => frame.checkpoint),
    ['ready', 'declared', 'target-selected', 'moved-8', 'moved-9', 'moved-10', 'block-dice', 'push-choice', 'pushed']);
  for (const [index, frame] of frames.entries()) {
    const actor = decodeSetupStateValue(frame.actor);
    const otherCoach = decodeSetupStateValue(frame.otherCoach);
    const spectator = decodeSetupStateValue(frame.spectator, true);
    assert.equal(actor.revision, index);
    assert.equal(otherCoach.revision, index);
    assert.equal(actor.projectionVersion, 3);
    assert.equal(otherCoach.projectionVersion, 3);
    assert.equal(spectator.revision, index);
    assert.equal(actor.callerRole, 'home');
    assert.equal(otherCoach.callerRole, 'away');
    assert.equal(spectator.callerRole, 'spectator');
    assert.ok(actor.players.every(player => player.art === null));
    assert.deepEqual(otherCoach.players, actor.players);
    assert.deepEqual(otherCoach.ball, actor.ball);
    assert.deepEqual(otherCoach.actions, actor.actions);
    assert.deepEqual(otherCoach.prompt, actor.prompt);
    assert.deepEqual(spectator.players, actor.players);
    assert.deepEqual(spectator.ball, actor.ball);
    assert.deepEqual(spectator.actions, actor.actions);
    assert.deepEqual(spectator.prompt, actor.prompt);
  }
  assert.ok(frames[5].actor.actions.some((action: { kind: string }) => action.kind === 'block'));
  assert.ok(frames[6].actor.actions.some((action: { kind: string }) => action.kind === 'blockDie'));
  assert.deepEqual(frames[0].actor.actions.find((action: { kind: string }) => action.kind === 'blitz').target, { playerId: 'home1' });
  assert.deepEqual(frames[2].actor.actions.find((action: { id: string }) => action.id === '2:move-8-7').target, { x: 8, y: 7 });
  assert.deepEqual(frames[5].actor.actions.find((action: { kind: string }) => action.kind === 'block').target, { playerId: 'away1' });
  assert.deepEqual(frames[7].actor.actions.find((action: { kind: string }) => action.kind === 'push').target, { x: 12, y: 6 });
});
