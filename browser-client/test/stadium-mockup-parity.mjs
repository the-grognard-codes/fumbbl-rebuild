import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { setCameraAngle } from './camera-controls.mjs';
import { travelToFocus } from './projected-pitch-helper.mjs';
import { PitchProjection } from '../src/pitch-projection.ts';
import { MOCKUP_PLAYERS } from '../src/stadium-mockup.ts';

const initial = JSON.parse(await readFile(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
try {
  const gallery = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await gallery.goto(base + '/stadium-mockup');
  await gallery.locator('[data-colors-ready=true]').waitFor();
  for (const end of ['home', 'away']) {
    const live = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await live.addInitScript(view => { window.initial = view; window.intents = []; }, { ...initial, players: MOCKUP_PLAYERS, callerRole: end });
    await live.route('**/scene-test', route => route.fulfill({ contentType: 'text/html', body: `<style>html,body{margin:0;height:100%}.play-runtime{height:100%}#app .live-pitch{height:100%;display:flex;flex-direction:column}#app .live-pitch-viewport{flex:1;max-height:none;min-height:0;aspect-ratio:auto}</style><div id="app" class="play-runtime"></div><script type="module" src="/test/projected-pitch-harness.tsx"></script>` }));
    await live.goto(base + '/scene-test');
    await live.locator('[data-player-id]').first().waitFor();
    for (const angle of [30, 40, 50, 90]) for (const focus of [0, 13, 26]) {
      await setCameraAngle(live, angle); await travelToFocus(live, focus);
      const rendered = await live.locator('.live-pitch-scene').evaluate(scene => {
        const grid = scene.querySelector('.live-pitch-grid'), matrix = grid.computedStyleMap().get('transform').toMatrix();
        return { options: { width: parseFloat(scene.style.width), height: parseFloat(scene.style.height), focus: +scene.dataset.focus, transverseFocus: +scene.dataset.transverseFocus, zoom: +scene.dataset.zoom, end: scene.dataset.end, mode: scene.dataset.projection, perspectiveElevation: +(scene.dataset.elevation === '90' ? '40' : scene.dataset.elevation) },
          cells: [...grid.querySelectorAll('[data-cell-x]')].map(cell => ({ x: +cell.dataset.cellX, y: +cell.dataset.cellY, points: [...cell.points].map(point => { const p = matrix.transformPoint(new DOMPoint(point.x, point.y)); return { x: p.x / p.w, y: p.y / p.w }; }) })),
          players: [...scene.querySelectorAll('[data-player-id]')].map(player => ({ id: player.dataset.playerId, x: +player.dataset.centerX, y: +player.dataset.centerY })), chalk: scene.querySelector('.pitch-chalk').getAttribute('d') };
      });
      const camera = new PitchProjection(rendered.options);
      await gallery.locator('.mockup-stage').evaluate((stage, size) => { stage.style.width = `${size.width}px`; stage.style.height = `${size.height}px`; }, rendered.options);
      await gallery.getByLabel('Coach end', { exact: true }).selectOption(end);
      await gallery.getByLabel('Camera', { exact: true }).selectOption(String(angle));
      await gallery.getByLabel('Travel', { exact: true }).evaluate((select, value) => { select.add(new Option('Parity camera', String(value))); }, camera.focus);
      await gallery.getByLabel('Travel', { exact: true }).selectOption(String(camera.focus));
      await gallery.getByLabel('Zoom', { exact: true }).fill(String(camera.zoom));
      await gallery.waitForTimeout(50);
      const actual = await gallery.locator('.mockup-stage').evaluate(stage => ({
        cells: [...stage.querySelectorAll('[data-cell-x]')].map(cell => ({ x: +cell.dataset.cellX, y: +cell.dataset.cellY, points: [...cell.points].map(p => ({ x: p.x, y: p.y })) })),
        players: [...stage.querySelectorAll('[data-player-id]')].map(player => ({ id: player.dataset.playerId, x: +player.dataset.centerX, y: +player.dataset.centerY })), chalk: stage.querySelector('[data-pitch-lines]').getAttribute('d') }));
      assert.equal(rendered.cells.length, 390); assert.equal(actual.cells.length, 390);
      for (const cell of rendered.cells) {
        const world = [{ x: cell.x, y: cell.y }, { x: cell.x + 1, y: cell.y }, { x: cell.x + 1, y: cell.y + 1 }, { x: cell.x, y: cell.y + 1 }];
        const expected = world.map(point => camera.project(point));
        expected.forEach((point, index) => { if (point && point.x >= 0 && point.x <= camera.width && point.y >= 0 && point.y <= camera.height) assert.ok(Math.hypot(point.x - cell.points[index].x, point.y - cell.points[index].y) < .5, `live grid homography agrees with projection: ${JSON.stringify({ point, actual: cell.points[index], options: rendered.options })}`); });
        const target = actual.cells.find(candidate => candidate.x === cell.x && candidate.y === cell.y);
        const clipped = camera.square(cell, 0, true);
        assert.equal(target.points.length, clipped.length);
        clipped.forEach((point, index) => assert.ok(Math.hypot(point.x - target.points[index].x, point.y - target.points[index].y) < .02, 'gallery cell matches the live grid within subpixel precision'));
      }
      for (const player of actual.players) { const other = rendered.players.find(candidate => candidate.id === player.id); assert.ok(other && Math.hypot(player.x - other.x, player.y - other.y) < .02); }
      // End-zone boundaries and scrimmage line: both actual SVG paths must include their projected endpoints.
      for (const x of [0, 1, 13, 25, 26]) for (const y of [0, 15]) {
        const point = camera.project({ x, y });
        if (point && point.x >= 0 && point.x <= camera.width && point.y >= 0 && point.y <= camera.height) {
          const coordinate = `${point.x},${point.y}`;
          assert.ok(rendered.chalk.includes(coordinate) && actual.chalk.includes(coordinate), 'goal/scrimmage coordinates match the actual live chalk path');
        }
      }
    }
    await live.close();
  }
  console.log('PASS: 24 live/gallery cameras; 390 cell homographies, player anchors, goal and scrimmage endpoints agree (0.5px CSS serialization tolerance; anchors 0.02px).');
} finally { await browser.close(); await server.close(); }
