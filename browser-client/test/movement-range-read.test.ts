import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MovementRangeQueue, MovementRangeRead, matchesMovementRange } from '../src/movement-range-read.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import type { MovementRange } from '../src/movement-protocol.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/movement-interaction-projections.json', import.meta.url), 'utf8'));
const view = decodeSetupStateValue(fixture.readyState);
const player = view.players.find(player => player.id === fixture.movePlan.plan.route.playerId)!;
const range: MovementRange = { rangeVersion: 2, playerId: player.id, from: { x: player.x!, y: player.y! },
  remaining: 2, normalRemaining: 1, normal: [], full: [], revision: view.revision };
const response = (requestId: string) => ({ requestId, matchId: view.matchId, range });

test('only the latest selected-player read can populate a matching authoritative origin', () => {
  const read = new MovementRangeRead();
  read.begin('first', view, player.id); read.begin('second', view, player.id);
  assert.equal(read.accept(response('first'), view), null);
  assert.equal(read.expects('second'), true);
  assert.equal(read.accept(response('second'), view), range);
  assert.equal(read.accept(response('second'), view), null);
  assert.equal(matchesMovementRange(range, view, player.id), true);
  assert.equal(matchesMovementRange(range, view, 'other-player'), false);
  const moved = { ...view, players: view.players.map(p => p.id === player.id ? { ...p, x: p.x! + 1 } : p) };
  read.begin('moved', view, player.id);
  assert.equal(read.accept(response('moved'), moved), null);
});

test('committed revisions, match changes and disconnect invalidate reads including same-revision reconnects', () => {
  const read = new MovementRangeRead();
  for (const next of [{ ...view, revision: view.revision + 1 }, { ...view, matchId: 'different-match' }]) {
    read.begin('old', view, player.id); read.invalidate(next);
    assert.equal(read.accept(response('old'), next), null);
    assert.equal(matchesMovementRange(range, next, player.id), next.revision === view.revision);
  }
  read.begin('old', view, player.id); read.clear(); read.begin('reconnected', view, player.id);
  assert.equal(read.accept(response('old'), view), null);
  assert.equal(read.accept(response('reconnected'), view), range);
});

test('range responses cannot cross player, revision or match bindings', () => {
  const read = new MovementRangeRead();
  for (const invalid of [
    { ...response('read'), range: { ...range, playerId: 'other-player' } },
    { ...response('read'), range: { ...range, revision: view.revision + 1 } },
    { ...response('read'), matchId: 'other-match' },
  ]) {
    read.begin('read', view, player.id);
    assert.equal(read.accept(invalid, view), null);
  }
});

test('late errors are recognized as disposable reads without clearing a newer request', () => {
  const read = new MovementRangeRead();
  read.begin('old', view, player.id); read.clear(); read.begin('new', view, player.id);
  assert.equal(read.isRead('old'), true);
  read.finish('old');
  assert.equal(read.expects('new'), true);
  assert.equal(read.isRead('old'), false);
  read.reset();
  assert.equal(read.isRead('new'), false);
});

test('queued guidance follows only the latest authoritative revision after a slow read settles', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let current = view;
  const sent: { id: string; revision: number; playerId: string }[] = [];
  const queue = new MovementRangeQueue(() => current, (state, playerId) => {
    const id = `read-${sent.length}`;
    sent.push({ id, revision: state.revision, playerId }); return id;
  });
  queue.select(view, player.id); context.mock.timers.tick(0);
  for (let revision = view.revision + 1; revision <= view.revision + 3; revision++) {
    current = { ...view, revision };
    queue.invalidate(current); queue.select(current, player.id); context.mock.timers.tick(0);
  }
  assert.equal(sent.length, 1);
  queue.finish('unrelated'); context.mock.timers.tick(0);
  assert.equal(sent.length, 1);
  queue.finish('read-0'); context.mock.timers.tick(0);
  assert.deepEqual(sent.map(request => request.revision), [view.revision, view.revision + 3]);
  queue.reset();
});

test('pending actions, cleared selections, newer snapshots and disconnect cancel unsent guidance', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let current: typeof view | null = view;
  const sent: string[] = [];
  const queue = new MovementRangeQueue(() => current, (_state, playerId) => { sent.push(playerId); return `${sent.length}`; });
  queue.select(view, player.id); queue.select(view, null); context.mock.timers.tick(0);
  assert.deepEqual(sent, []);
  queue.select(view, player.id); current = null; context.mock.timers.tick(0);
  assert.deepEqual(sent, []);
  queue.select(view, player.id); current = { ...view, revision: view.revision + 1 }; context.mock.timers.tick(0);
  assert.deepEqual(sent, []);
  current = view;
  queue.select(view, player.id); queue.reset(); context.mock.timers.tick(0);
  assert.deepEqual(sent, []);
  queue.select(view, player.id); context.mock.timers.tick(0);
  queue.select(view, player.id); queue.finish('1'); context.mock.timers.tick(0);
  assert.deepEqual(sent, [player.id], 'Reselecting the in-flight player needs no duplicate read');
  queue.reset();
});
