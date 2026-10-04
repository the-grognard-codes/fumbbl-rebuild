// Run from any directory: node docs/adr/references/0003-angled-pitch-v3/render.mjs
// Uses the browser-client's existing Playwright installation and local Chrome.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(new URL('../../../../browser-client/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('.', import.meta.url));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = pathToFileURL(path.join(root, 'viewer.html'));
await page.goto(`${url}?capture=1`);
await page.evaluate(() => window.pitchReferenceReady);
const scene = await page.evaluate(() => window.pitchReferenceScene);
assert.equal(scene.length, 26);
assert.equal(scene.width, 15);
assert.equal(scene.players.length, 22);
assert.equal(new Set(scene.players.map(p => p.id)).size, 22);
assert.equal(new Set(scene.players.map(p => `${p.x},${p.y}`)).size, 22);
for (const team of ['home', 'away']) {
  const players = scene.players.filter(p => p.team === team);
  assert.equal(players.length, 11);
  assert.equal(new Set(players.map(p => p.number)).size, 11);
}
const captures = [];
const panChecks = [];
await mkdir(path.join(root, 'full-pitch'), { recursive: true });

try {
  for (const view of scene.views) for (const framing of ['play', 'full']) {
    await page.goto(`${url}?capture=1&view=${view.id}&framing=${framing}`);
    await page.evaluate(() => window.pitchReferenceReady);
    const checks = await page.evaluate(() => {
      const api = window.pitchReference;
      const cells = [...document.querySelectorAll('.square')];
      const problems = [];
      let maximumAnchorError = 0;
      const spriteExtents = [];
      // Independent screen-space check: feet must meet the actual polygon's diagonal intersection.
      function diagonalIntersection(points) {
        const [a, b, c, d] = points;
        const rx = c.x - a.x, ry = c.y - a.y, sx = d.x - b.x, sy = d.y - b.y;
        const t = ((b.x - a.x) * sy - (b.y - a.y) * sx) / (rx * sy - ry * sx);
        return { x: a.x + t * rx, y: a.y + t * ry };
      }
      for (const actor of api.anchors) {
        const cell = cells.find(c => Number(c.dataset.x) === actor.square.x && Number(c.dataset.y) === actor.square.y);
        const center = diagonalIntersection([...cell.points].map(p => ({ x: p.x, y: p.y })));
        const node = [...document.querySelectorAll('#occupants > g')].find(g => g.dataset.id === actor.id);
        const img = node.querySelector('image');
        const footX = Number(img.getAttribute('x')) + Number(img.dataset.anchorX) * Number(img.dataset.spriteScale);
        const footY = Number(img.getAttribute('y')) + Number(img.dataset.anchorY) * Number(img.dataset.spriteScale);
        const error = Math.hypot(footX - center.x, footY - center.y);
        const asset = window.pitchReferenceSprites.players.find(a => a.id === actor.asset);
        const scale = Number(img.dataset.spriteScale);
        spriteExtents.push({ top: Number(img.getAttribute('y')) + asset.bounds.y * scale,
          bottom: footY, left: Number(img.getAttribute('x')) + asset.bounds.x * scale,
          right: Number(img.getAttribute('x')) + (asset.bounds.x + asset.bounds.width) * scale });
        maximumAnchorError = Math.max(maximumAnchorError, error);
        // SVGPointList stores float32, while DOM image attributes preserve doubles.
        if (error > 0.001) problems.push(`${actor.id}: anchor error ${error}`);
      }
      const coordinates = cells.map(c => `${c.dataset.x},${c.dataset.y}`);
      const zones = { 'end-zone': 0, wide: 0, central: 0 };
      for (const cell of cells) zones[cell.dataset.zone]++;
      const allPoints = cells.flatMap(c => [...c.points].map(p => ({ x: p.x, y: p.y })));
      const extent = { left: Math.min(...allPoints.map(p => p.x)), right: Math.max(...allPoints.map(p => p.x)),
        top: Math.min(...allPoints.map(p => p.y)), bottom: Math.max(...allPoints.map(p => p.y)) };
      let maximumRoundTripError = 0;
      // Both coach ends and pan extremes, including every square center and all pitch corners.
      for (const end of ['home', 'away']) for (const focus of [0, 6.5, 13, 19.5, 26]) {
        const camera = api.cameraFor({ ...api.camera, end }, 'play', focus);
        const worldPoints = [[0, 0], [26, 0], [26, 15], [0, 15]];
        for (let x = 0; x < 26; x++) for (let y = 0; y < 15; y++) worldPoints.push([x + 0.5, y + 0.5]);
        for (const [x, y] of worldPoints) {
          const screen = api.projectWith(x, y, camera);
          const world = api.unprojectWith(screen.x, screen.y, camera);
          maximumRoundTripError = Math.max(maximumRoundTripError, Math.hypot(x - world.x, y - world.y));
        }
      }
      const home = api.cameraFor({ ...api.camera, end: 'home' }, 'play', 13);
      const away = api.cameraFor({ ...api.camera, end: 'away' }, 'play', 13);
      const firstHome = api.projectWith(0.5, 0.5, home), lastHome = api.projectWith(25.5, 14.5, home);
      const firstAway = api.projectWith(0.5, 0.5, away), lastAway = api.projectWith(25.5, 14.5, away);
      const scaleRatios = [];
      for (const x of [0.5, 13, 25.5]) {
        const p = api.projectWith(x, 7, home), q = api.projectWith(x, 8, home);
        scaleRatios.push(Math.hypot(q.x - p.x, q.y - p.y));
      }
      return { problems, count: cells.length, coordinates, zones, extent, spriteExtents, maximumAnchorError, maximumRoundTripError,
        orientation: { firstHome, lastHome, firstAway, lastAway }, scaleRatios, exported: api.export() };
    });
    assert.equal(checks.count, 390, `${view.id}: cell count`);
    assert.equal(new Set(checks.coordinates).size, 390);
    for (let x = 0; x < 26; x++) for (let y = 0; y < 15; y++) assert.ok(checks.coordinates.includes(`${x},${y}`));
    assert.deepEqual(checks.zones, { 'end-zone': 30, wide: 192, central: 168 });
    assert.deepEqual(checks.problems, []);
    assert.ok(checks.maximumRoundTripError < 1e-10);
    if (view.yaw === 0) {
      const { firstHome, lastHome, firstAway, lastAway } = checks.orientation;
      assert.ok(firstHome.x < lastHome.x && firstHome.y > lastHome.y);
      assert.ok(firstAway.x > lastAway.x && firstAway.y < lastAway.y);
    }
    if (!view.perspective) assert.ok(Math.max(...checks.scaleRatios) - Math.min(...checks.scaleRatios) < 1e-10);
    if (framing === 'full') {
      assert.ok(checks.extent.top >= 140 && checks.extent.bottom <= 745);
      assert.ok(checks.extent.left >= 0 && checks.extent.right <= 1672);
    }
    for (const bounds of checks.spriteExtents) {
      assert.ok(bounds.top >= 115 && bounds.bottom <= 750, `${view.id}: standing player under the HUD`);
      assert.ok(bounds.left >= 0 && bounds.right <= 1672, `${view.id}: standing player cropped horizontally`);
    }
    const image = `${framing === 'full' ? 'full-pitch/' : ''}${view.id}.png`;
    await page.locator('#stage').screenshot({ path: path.join(root, image) });
    captures.push({ ...checks.exported, image, validation: { cells: checks.count, zones: checks.zones,
      maximumAnchorErrorPixels: checks.maximumAnchorError, maximumRoundTripErrorSquares: checks.maximumRoundTripError,
      extent: checks.extent } });
    console.log(`${image}: 390 cells, 22 centered players`);
  }
  await mkdir(path.join(root, 'pan'), { recursive: true });
  for (const end of ['home', 'away']) {
    await page.goto(`${url}?capture=1&view=parallel-40-${end}`);
    await page.evaluate(() => window.pitchReferenceReady);
    const inspect = () => page.evaluate(() => {
      const moving = ['#terrain > rect', '#ground', '[data-world-scenery="stand-blue-12"]', '[data-id="home-3"] > image'];
      const transforms = moving.map(selector => {
        const node = document.querySelector(selector), m = node.getScreenCTM();
        return { selector, x: m.e, y: m.f, inWorld: document.getElementById('world').contains(node) };
      });
      const hud = document.getElementById('hud').getBoundingClientRect();
      const boundary = [...document.querySelector('[data-marking="boundary"]').points];
      const feet = window.pitchReference.anchors.map(actor => {
        const group = [...document.querySelectorAll('#occupants > g')].find(g => g.dataset.id === actor.id);
        const img = group.querySelector('image'), p = document.getElementById('pitch').createSVGPoint();
        p.x = Number(img.getAttribute('x')) + Number(img.dataset.anchorX) * Number(img.dataset.spriteScale);
        p.y = Number(img.getAttribute('y')) + Number(img.dataset.anchorY) * Number(img.dataset.spriteScale);
        const displayed = p.matrixTransform(img.getCTM());
        return Math.hypot(displayed.x - actor.screenFeet.x, displayed.y - actor.screenFeet.y);
      });
      return { transforms, hud: { x: hud.x, y: hud.y, width: hud.width, height: hud.height },
        touchlineX: [boundary[0].x, boundary[1].x, boundary[2].x, boundary[3].x],
        footError: Math.max(...feet), focus: window.pitchReference.camera.focus,
        panY: Number(document.getElementById('world').dataset.panY) };
    });
    const baseline = await inspect();
    assert.equal(baseline.touchlineX[0], baseline.touchlineX[1]);
    assert.equal(baseline.touchlineX[2], baseline.touchlineX[3]);
    for (const focus of [0, 6.5, 19.5, 26]) {
      await page.locator('#pan').evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); }, focus);
      const current = await inspect();
      assert.deepEqual(current.hud, baseline.hud);
      assert.ok(current.footError < 0.001);
      for (let i = 0; i < baseline.transforms.length; i++) {
        assert.ok(current.transforms[i].inWorld);
        assert.equal(current.transforms[i].x, baseline.transforms[i].x);
        // SVG's screen matrices use float32, as do its polygon point lists.
        assert.ok(Math.abs(current.transforms[i].y - baseline.transforms[i].y - current.panY) < 0.001);
      }
      if (focus === 0 || focus === 26) {
        const ownEnd = end === 'home' ? 0 : 26;
        const image = `pan/parallel-40-${end}-${focus === ownEnd ? 'near' : 'far'}.png`;
        await page.locator('#stage').screenshot({ path: path.join(root, image) });
      }
      panChecks.push({ end, focus, worldShiftPixels: current.panY, turfRailsStandsPlayersMoveTogether: true,
        hudFixed: true, footErrorPixels: current.footError });
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(root, 'geometry.json'), `${JSON.stringify({
    pitch: { length: 26, width: 15, squares: 390, endZoneRows: [0, 25], midfieldBoundary: 13, wideZoneBoundaries: [4, 11] },
    fixture: scene.players, captures, panChecks
  }, null, 2)}\n`);
} finally {
  await browser.close();
}
