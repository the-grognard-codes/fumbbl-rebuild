import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeRoutePreview } from '../src/route-protocol.ts';

const envelope = { version: 2, type: 'routePreview', requestId: 'route-1', code: 'ACCEPTED',
  matchId: '12345678-1234-1234-1234-123456789abc', route: { routeVersion: 1, playerId: 'home1',
    from: { x: 7, y: 7 }, remaining: 8,
    steps: [{ x: 7, y: 6, dodge: 3, rush: 0, reactions: ['Diving Tackle'] }], revision: 4, actor: 'home' } };

test('the route decoder accepts native checks and fails closed on private or nonadjacent data', () => {
  assert.equal(decodeRoutePreview(JSON.stringify(envelope)).route.steps[0].dodge, 3);
  assert.throws(() => decodeRoutePreview(JSON.stringify({ ...envelope, privatePlayer: 'secret' })));
  assert.throws(() => decodeRoutePreview(JSON.stringify({ ...envelope, route: { ...envelope.route,
    steps: [{ ...envelope.route.steps[0], y: 4 }] } })));
  assert.throws(() => decodeRoutePreview(JSON.stringify({ ...envelope, route: { ...envelope.route,
    steps: [{ ...envelope.route.steps[0], reactions: ['unknown skill'] }] } })));
});
