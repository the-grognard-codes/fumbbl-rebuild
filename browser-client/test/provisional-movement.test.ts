import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { provisionalMoves, remainingConfirmedBeats, movementBeatMillis } from '../src/provisional-movement.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import type { RoutePreview } from '../src/route-protocol.ts';
import type { PlaybackBeat } from '../src/pitch-playback.ts';
import { playbackBeats } from '../src/pitch-playback.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const view = { ...decodeSetupStateValue(fixture[0].actor), activePlayerId: 'home1' };
const route: RoutePreview = { routeVersion: 3, playerId: 'home1', from: { x: 7, y: 7 }, remaining: 8,
  revision: view.revision, actor: 'home', steps: [8, 9, 10].map(x => ({ x, y: 7, dodge: 0, rush: 0, reactions: [], checks: [] })) };

test('prediction stops before any check or reaction and never resumes past it', () => {
  const openView = { ...view, players: view.players.filter(player => player.id === 'home1') };
  assert.equal(provisionalMoves(openView, route).length, 3);
  for (const risk of [{ dodge: 3 }, { rush: 2 }, { reactions: ['Shadowing'] },
    { checks: [{ name: 'Pickup' as const, target: 3, condition: 'entry' as const }] }, { checks: undefined }]) {
    const risky = { ...route, steps: route.steps.map((step, index) => index === 1 ? { ...step, ...risk } : step) };
    assert.deepEqual(provisionalMoves(openView, risky).map(move => move.x), [8]);
  }
});

test('stale, foreign, incomplete forecasts and occupied squares cannot predict movement', () => {
  assert.deepEqual(provisionalMoves({ ...view, activePlayerId: null }, route), [], 'Activation rolls are not forecast by square-entry checks');
  assert.deepEqual(provisionalMoves(view, { ...route, revision: view.revision + 1 }), []);
  assert.deepEqual(provisionalMoves(view, { ...route, routeVersion: 2 }), []);
  assert.deepEqual(provisionalMoves({ ...view, callerRole: 'spectator' }, route), []);
  assert.deepEqual(provisionalMoves(view, { ...route, from: { x: 6, y: 7 } }), []);
  const occupied = { ...view, players: [...view.players, { ...view.players[0], id: 'occupied', x: 8, y: 7 }] };
  assert.deepEqual(provisionalMoves(occupied, route), []);
});

test('accepted movement consumes only the shown prefix and preserves later moves and dice', () => {
  const moves = [8, 9, 10].map(x => ({ playerId: 'home1', x, y: 7 }));
  const block: PlaybackBeat = { kind: 'block', context: null };
  const beats: PlaybackBeat[] = [block, ...moves.map(move => ({ kind: 'move' as const, move }))];
  assert.deepEqual(remainingConfirmedBeats(beats, moves.slice(0, 2)), [block, beats[3]]);
  assert.equal(remainingConfirmedBeats(beats, [{ ...moves[0], x: 11 }]), null);
  assert.equal(remainingConfirmedBeats(beats.slice(0, 2), moves.slice(0, 2)), null);
  const ballChanges = { moving: true, coordinate: { x: 8, y: 7 } };
  assert.deepEqual(remainingConfirmedBeats([{ kind: 'move', move: moves[0], ballChanges }], [moves[0]]),
    [{ kind: 'ball', ballChanges }], 'Accepted movement must retain accompanying native ball outcomes');
  assert.deepEqual(remainingConfirmedBeats(moves.slice(0, 2).map(move => ({ kind: 'move', move,
    ballChanges: { coordinate: { x: move.x, y: move.y }, moving: false } })), moves.slice(0, 2)),
    [{ kind: 'ball', ballChanges: { coordinate: { x: 9, y: 7 }, moving: false } }],
    'The carried ball reconciles at the shown endpoint without replaying the prefix');
});

test('live cadence is fixed while replay speed and reduced motion remain explicit', () => {
  assert.equal(movementBeatMillis(1, 'live', false), 200);
  assert.equal(movementBeatMillis(4, 'live', false), 200, 'Live has no speed selector');
  assert.equal(movementBeatMillis(2, 'replay', false), 100);
  assert.equal(movementBeatMillis(.5, 'replay', false), 400);
  assert.equal(movementBeatMillis(NaN, 'replay', false), 200);
  assert.equal(movementBeatMillis(0, 'replay', false), 200);
  assert.equal(movementBeatMillis(1, 'live', true), 16);
});

test('actual V2 route transcript reconciles its safe prefix and preserves the pickup outcome', () => {
  const sample = JSON.parse(readFileSync(new URL('./fixtures/smooth-gameplay-route.json', import.meta.url), 'utf8'));
  const beats = playbackBeats(sample.records[0]);
  const shown = sample.route.steps.slice(0, 2).map((step: { x: number; y: number }) => ({ playerId: sample.route.playerId, ...step }));
  const remaining = remainingConfirmedBeats(beats, shown);
  assert.ok(remaining);
  assert.equal(remaining.filter(beat => beat.kind === 'move').length, 1);
  assert.equal(remaining.filter(beat => beat.kind === 'dice').length, 1);
});
