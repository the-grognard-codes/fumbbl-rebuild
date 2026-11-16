import assert from 'node:assert/strict';
import test from 'node:test';
import { PitchProjection } from '../src/pitch-projection.ts';
import { mockupModules, MOCKUP_PLAYERS, VISITOR_SECTION } from '../src/stadium-mockup.ts';

test('visitor ownership stays in one fixed section through all cameras and travel', () => {
  for (const end of ['home', 'away'] as const) for (const elevation of [30, 40, 50, 90]) for (const focus of [0, 13, 26]) {
    const camera = new PitchProjection({ width: 1280, height: 720, end, focus, mode: elevation === 90 ? 'top-down' : 'perspective', perspectiveElevation: elevation === 30 ? 30 : elevation === 50 ? 50 : 40 });
    for (const visitor of ['human', 'orc'] as const) {
      const modules = mockupModules(camera, visitor);
      const visitorIds = new Set(modules.filter(module => module.role === 'crowd' && module.team === 'away').map(module => module.piece));
      assert.deepEqual([...visitorIds], [VISITOR_SECTION]);
      assert.ok(modules.filter(module => module.role === 'wall').every(module => module.profile.id === 'old-world-classic'));
      assert.equal(new Set(modules.map(module => module.id)).size, modules.length);
    }
  }
});

test('kickoff readability fixture has 22 unique legal squares and three on each line', () => {
  assert.equal(MOCKUP_PLAYERS.length, 22);
  assert.equal(new Set(MOCKUP_PLAYERS.map(player => `${player.x},${player.y}`)).size, 22);
  assert.equal(MOCKUP_PLAYERS.filter(player => player.x === 12).length, 3);
  assert.equal(MOCKUP_PLAYERS.filter(player => player.x === 13).length, 3);
});
