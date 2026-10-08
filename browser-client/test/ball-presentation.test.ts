import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { playbackBeats, withConfirmedBallChanges, withConfirmedMove } from '../src/pitch-playback.ts';

const base = JSON.parse(readFileSync(new URL('./fixtures/manual-skill-rerolls.json', import.meta.url), 'utf8'))[0].frames[0].state;

test('versioned carrier metadata is exact, belongs to the ball square and remains optional for older snapshots', () => {
  assert.ok(decodeSetupStateValue(base));
  const carried = { ...base, ball: { x: 10, y: 7 }, ballState: { version: 1, carrierPlayerId: 'actor', inPlay: true, moving: false } };
  assert.equal(decodeSetupStateValue(carried).ballState?.carrierPlayerId, 'actor');
  assert.equal(decodeSetupStateValue({ ...carried, ballState: { version: 1, carrierPlayerId: null, inPlay: true, moving: true } }).ballState?.carrierPlayerId, null);
  for (const ballState of [{ version: 2, carrierPlayerId: 'actor', inPlay: true, moving: false }, { version: 1, carrierPlayerId: 'missing' },
    { version: 1, carrierPlayerId: 'opponent' }, { version: 1, carrierPlayerId: 'actor', extra: true }])
    assert.throws(() => decodeSetupStateValue({ ...carried, ballState }));
  assert.throws(() => decodeSetupStateValue({ ...carried, ball: null }));
});

test('native single-route pickup and carrier fall preserve ordered ball transitions, including array coordinates', () => {
  const journeys = JSON.parse(readFileSync(new URL('./fixtures/ball-route-presentation.json', import.meta.url), 'utf8'));
  for (const journey of journeys) {
    let shown = decodeSetupStateValue(journey.frames[0].state);
    const final = journey.frames[1];
    const visited: { x: number | null; ballX: number | null; carrier: string | null }[] = [];
    for (const beat of playbackBeats(final.records.at(-1))) {
      if (beat.kind === 'dice') continue;
      if (beat.kind === 'move') shown = withConfirmedMove(shown, beat.move);
      if (beat.ballChanges) shown = withConfirmedBallChanges(shown, beat.ballChanges);
      decodeSetupStateValue(shown);
      visited.push({x:shown.players.find(player => player.id === 'actor')!.x,ballX:shown.ball?.x ?? null,carrier:shown.ballState?.carrierPlayerId ?? null});
    }
    assert.deepEqual(shown.ball,final.state.ball);
    assert.deepEqual(shown.ballState,final.state.ballState);
    if (!journey.drop) for (const x of [9,8,7]) assert.ok(visited.some(frame => frame.x === x && frame.ballX === x && frame.carrier === 'actor'));
    else assert.ok(visited.some(frame => frame.carrier === null));
  }
});

test('each confirmed carrier step moves the ball while an occupied loose ball stays put', () => {
  const initial = decodeSetupStateValue({ ...base, ball: { x: 10, y: 7 }, ballState: { version: 1, carrierPlayerId: 'actor', inPlay: true, moving: false } });
  let shown = initial;
  for (const x of [9, 8, 7, 6]) {
    shown = withConfirmedMove(shown, { playerId: 'actor', x, y: 7 });
    assert.deepEqual(shown.ball, { x, y: 7 });
    assert.deepEqual(decodeSetupStateValue(shown).ballState, initial.ballState);
  }
  assert.deepEqual(initial.ball, { x: 10, y: 7 });
  const loose = { ...initial, ballState: { version: 1 as const, carrierPlayerId: null, inPlay: true, moving: true } };
  assert.deepEqual(withConfirmedMove(loose, { playerId: 'actor', x: 9, y: 7 }).ball, loose.ball);
  assert.deepEqual(withConfirmedMove(initial, { playerId: 'opponent', x: 12, y: 7 }).ball, initial.ball);
  assert.equal(withConfirmedMove(initial, { playerId: 'missing', x: 12, y: 7 }), initial);
});
