import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MovementRangeRead, matchesMovementRange } from '../src/movement-range-read.ts';
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
