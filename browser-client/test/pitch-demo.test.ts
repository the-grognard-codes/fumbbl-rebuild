import test from 'node:test';
import assert from 'node:assert/strict';
import { initialPlayers, routesFor, adjacent } from '../src/pitch-demo.ts';

test('sample routes respect bounds and occupancy and show adjacent steps', () => {
  const routes = routesFor(initialPlayers[0], initialPlayers);
  assert.equal(routes.has('10,7'), false);
  assert.equal(routes.has('25,14'), false);
  for (const route of routes.values()) {
    for (let i = 1; i < route.path.length; i++) {
      const p = route.path[i];
      assert.ok(p.x >= 0 && p.x < 26 && p.y >= 0 && p.y < 15);
      assert.ok(adjacent(route.path[i - 1], p));
      assert.equal(initialPlayers.some(player => player.x === p.x && player.y === p.y), false);
    }
  }
  assert.equal(routes.get('7,7')?.rush, false);
  assert.ok([...routes.values()].some(r => r.rush));
  assert.ok([...routes.values()].some(r => r.dodge));
});

test('spent movement reduces reach and requires rush checks', () => {
  const routes = routesFor({ ...initialPlayers[0], used: 6 }, initialPlayers);
  assert.ok([...routes.values()].every(r => r.rush && r.path.length <= 3));
  assert.equal(routesFor({ ...initialPlayers[0], used: 8 }, initialPlayers).size, 0);
});
