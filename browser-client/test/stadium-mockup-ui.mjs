import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.STADIUM_MOCKUP_OUTPUT || fileURLToPath(new URL('../../.tools/stadium-mockup/', import.meta.url)));
const captureOnly = process.argv.includes('--capture-layout');
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());
  });
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/stadium-mockup');
  const stage = page.locator('.mockup-stage');
  const emptyPitch = page.getByRole('button', { name: 'Frame empty pitch' });
  const camera = page.getByLabel('Camera', { exact: true });
  const endSelect = page.getByLabel('Coach end', { exact: true });
  const zoom = page.getByLabel('Zoom', { exact: true });
  const comparison = page.getByLabel('Comparison', { exact: true });
  const turf = page.locator('[data-mockup-turf]');
  const roster = page.getByLabel('Visiting team', { exact: true });
  const colors = page.getByLabel('Colour pair', { exact: true });
  const readPoints = async locator =>
    (await locator.getAttribute('points')).split(' ').map(point => point.split(',').map(Number));

  async function captureLayout() {
    await emptyPitch.click();
    await page.locator('.mockup-stage[data-ready=true]').waitFor();
    assert.equal(await page.locator('.mockup-player').count(), 0);
    assert.equal(await page.locator('[data-cell-x]').count(), 390);
    const bounds = await stage.boundingBox();
    const apron = await turf.boundingBox();
    assert.deepEqual([bounds.width, bounds.height], [1024, 1536]);
    assert.deepEqual(
      [Math.round(apron.x - bounds.x), Math.round(apron.y - bounds.y), Math.round(apron.width), Math.round(apron.height)],
      [208, 288, 608, 960],
    );
    const markings = page.locator('.mockup-ground polyline');
    const [[left, bottom], [right]] = await readPoints(markings.first());
    const [[, top]] = await readPoints(markings.nth(4));
    const cameraFrame = await page.locator('.mockup-camera').boundingBox();
    assert.deepEqual(
      [Math.round(left), Math.round(top + cameraFrame.y - bounds.y), Math.round(right - left), Math.round(bottom - top)],
      [272, 352, 480, 832],
    );
    const grassPixels = await turf.locator('canvas').evaluate(canvas => {
      const context = canvas.getContext('2d');
      const corners = [[0, 0], [0, canvas.height - 1], [canvas.width - 1, 0], [canvas.width - 1, canvas.height - 1]];
      return corners.map(([x, y]) => context.getImageData(x, y, 1, 1).data[3]);
    });
    assert.deepEqual(grassPixels, [255, 255, 255, 255]);
    const png = await stage.screenshot({ path: resolve(output, 'layout-base.png') });
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1024, 1536]);
  }

  if (captureOnly) {
    await captureLayout();
  } else {
    async function settlePlayers() {
      await page.waitForFunction(() => {
        const sprites = [...document.querySelectorAll('.mockup-player')];
        return sprites.length === 22 && sprites.every(image => image.complete && image.naturalWidth > 0 && image.src.startsWith('data:'));
      });
    }

    await settlePlayers();
    const homeSprite = page.locator('[data-player-id="home-0"]');
    const awaySprite = page.locator('[data-player-id="away-0"]');
    const getSources = () => Promise.all([homeSprite.getAttribute('src'), awaySprite.getAttribute('src')]);
    const awaySpeciesSources = new Map();
    for (const visitor of ['orc', 'human']) {
      await roster.selectOption(visitor);
      await colors.selectOption('defaults');
      await settlePlayers();
      assert.equal(await page.locator('[data-player-id^="away-"][data-roster="' + visitor + '"]').count(), 11);
      const original = await getSources();
      awaySpeciesSources.set(visitor, original[1]);
      for (const preset of ['identical', 'white / black', 'yellow / purple', 'similar blues']) {
        await colors.selectOption(preset);
        await settlePlayers();
        const [home, away] = await getSources();
        assert.notEqual(home, original[0]);
        assert.notEqual(away, original[1]);
      }
    }
    assert.notEqual(awaySpeciesSources.get('orc'), awaySpeciesSources.get('human'));

    for (const end of ['home', 'away']) {
      await endSelect.selectOption(end);
      await page.getByLabel('Longitudinal pan').fill('5');
      await page.getByLabel('Transverse pan').fill('10');
      for (const magnification of ['0.5', '1', '2']) {
        await zoom.fill(magnification);
        await settlePlayers();
        assert.equal(await stage.getAttribute('data-end'), end);
        const box = await turf.boundingBox();
        assert.equal(Math.round(box.width), 608 * Number(magnification));
        assert.equal(Math.round(box.height), 960 * Number(magnification));
        const firstCell = page.locator('[data-cell-x="12"][data-cell-y="6"]');
        const corners = await readPoints(firstCell);
        const center = [0, 1].map(axis => (corners[0][axis] + corners[2][axis]) / 2);
        const actual = await homeSprite.evaluate(sprite => [Number(sprite.dataset.centerX), Number(sprite.dataset.centerY)]);
        assert.ok(Math.abs(actual[0] - center[0]) < .001);
        assert.ok(Math.abs(actual[1] - center[1]) < .001);
      }
    }

    for (const angle of ['30', '40', '50']) {
      await camera.selectOption(angle);
      await settlePlayers();
      assert.equal(await stage.getAttribute('data-angle'), angle);
      assert.equal(await turf.count(), 0);
      assert.equal(await page.locator('.pitch-stadium-turf-world').count(), 1);
      assert.equal(await page.locator('.pitch-stadium-structure').count(), 0);
    }

    await comparison.selectOption('side-by-side');
    const reference = page.locator('.mockup-reference img');
    await reference.waitFor();
    await reference.evaluate(image => image.decode());
    const frame = page.locator('.mockup-viewport');
    const compareBounds = await frame.boundingBox();
    const referenceBounds = await reference.boundingBox();
    assert.ok(Math.abs(compareBounds.width - referenceBounds.width) < 1);
    assert.ok(Math.abs(compareBounds.height - referenceBounds.height) < 1);
    assert.equal(await camera.isDisabled(), true);
    assert.equal(await stage.getAttribute('data-angle'), '90');
    assert.equal(await stage.getAttribute('data-zoom'), '1');
    await comparison.selectOption('crossfade');
    const overlay = page.locator('.mockup-overlay');
    const opacity = page.getByLabel('Reference opacity', { exact: true });
    for (const blend of ['0', '50', '100']) {
      await opacity.fill(blend);
      assert.equal(await overlay.evaluate(image => getComputedStyle(image).opacity), String(Number(blend) / 100));
    }
    assert.deepEqual(await overlay.boundingBox(), await frame.boundingBox());

    const candidateCount = await page.locator('.mockup-candidates img').count();
    if (candidateCount > 0) {
      const referencePicker = page.getByLabel('Reference', { exact: true });
      await referencePicker.selectOption({ index: 1 });
      await overlay.evaluate(image => image.decode());
      assert.equal(await overlay.evaluate(image => image.naturalWidth / image.naturalHeight), 2 / 3);
      assert.deepEqual(await overlay.boundingBox(), await frame.boundingBox());
    }

    await comparison.selectOption('render');
    assert.equal(await camera.isEnabled(), true);
    assert.equal(await stage.getAttribute('data-angle'), '50');
    await camera.selectOption('90');
    await page.getByLabel('Grid', { exact: true }).uncheck();
    assert.equal(await page.locator('[data-cell-x]').count(), 0);
    await page.getByLabel('Turf', { exact: true }).uncheck();
    assert.equal(await turf.count(), 0);
    await captureLayout();

    await page.getByLabel('Players', { exact: true }).check();
    await settlePlayers();
    await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 412, height: 915 });
    await comparison.selectOption('side-by-side');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });

    const fallback = await browser.newPage();
    await fallback.route('**/pitch/stadium-v1.png', route => route.fulfill({ status: 404, body: '' }));
    await fallback.goto(page.url());
    await fallback.getByRole('status').filter({ hasText: 'Turf failed to load' }).waitFor();
    await fallback.close();

    await writeFile(resolve(output, 'checks.json'), JSON.stringify({
      players: 22, rosters: ['human', 'orc'], colors: 5, zoom: [.5, 1, 2], candidateCount, errors,
    }, null, 2));
  }

  assert.deepEqual(errors, []);
  console.log((captureOnly ? 'Native stadium layout captured. ' : 'Stadium approval gallery passed. ') + 'Evidence in ' + output);
} finally {
  await browser?.close();
  await server.close();
}
