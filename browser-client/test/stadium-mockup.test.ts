import assert from 'node:assert/strict';
import test from 'node:test';
import { mockupCamera, mockupColorPair, mockupPaintingFrame, mockupPlayers, MOCKUP_COLOR_PRESETS, STILL_LAYOUT } from '../src/stadium-mockup.ts';
import { resolvePlayerArt } from '../src/player-art.ts';

test('native overhead capture registers the 26 by 15 pitch at 32 pixels per square', () => {
  const camera = mockupCamera('home');
  const offset = STILL_LAYOUT.height / 2 - camera.center.y;
  const near = camera.project({ x: 0, y: 0 })!;
  const far = camera.project({ x: 26, y: 15 })!;
  assert.equal(camera.scale, 32);
  assert.deepEqual({ x: near.x, y: far.y + offset, width: far.x - near.x, height: near.y - far.y }, STILL_LAYOUT.pitch);
});

test('both coach ends retain integer square density across zoom and both pan axes', () => {
  for (const end of ['home', 'away'] as const) for (const zoom of [.5, 1, 2]) {
    for (const focus of [0, 13, 26]) for (const transverse of [0, 7.5, 15]) {
      const camera = mockupCamera(end, zoom, focus, transverse);
      const point = { x: 9, y: 4 };
      const screen = camera.project(point)!;
      assert.equal(screen.pixelsPerSquare, 32 * zoom);
      const frame = mockupPaintingFrame(camera)!;
      const first = camera.project({ x: 0, y: 0 })!;
      const last = camera.project({ x: 26, y: 15 })!;
      assert.equal(frame.scale, zoom);
      assert.ok(Math.abs(frame.left + STILL_LAYOUT.pitch.x * zoom - Math.min(first.x, last.x)) < 1e-10);
      assert.ok(Math.abs(frame.top + STILL_LAYOUT.pitch.y * zoom - Math.min(first.y, last.y)) < 1e-10);
      const restored = camera.unproject(screen)!;
      assert.ok(Math.abs(restored.x - point.x) < 1e-10 && Math.abs(restored.y - point.y) < 1e-10);
    }
  }
  for (const angle of [30, 40, 50] as const) assert.equal(mockupPaintingFrame(mockupCamera('home', 1, 13, 7.5, angle)), null);
});

test('each visiting roster resolves all 22 upright players in every colour preset', () => {
  for (const visitor of ['orc', 'human'] as const) {
    const players = mockupPlayers(visitor);
    assert.equal(players.length, 22);
    assert.equal(new Set(players.map(p => `${p.x},${p.y}`)).size, 22);
    for (const preset of MOCKUP_COLOR_PRESETS) {
      const pair = mockupColorPair(preset);
      for (const end of ['home', 'away'] as const) for (const player of players) {
        const art = resolvePlayerArt(player, { end, topDown: true, colors: pair[player.role] });
        assert.ok(art, `${visitor} ${player.id}`);
        assert.ok(['front', 'back'].includes(art.body.pose));
      }
    }
  }
});
