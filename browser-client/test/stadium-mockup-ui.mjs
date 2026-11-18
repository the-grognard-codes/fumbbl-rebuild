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
  const pitchPreset = page.getByLabel('Pitch preset', { exact: true });
  const grid = page.getByLabel('Grid', { exact: true });
  const players = page.getByLabel('Players', { exact: true });
  const painting = page.locator('.mockup-painted-canvas[data-painting-ready=true]');
  const readPoints = async locator =>
    (await locator.getAttribute('points')).split(' ').map(point => point.split(',').map(Number));

  async function comparePixels(referenceUrl) {
    return painting.evaluate(async (canvas, source) => {
      const { width, height } = canvas;
      const context = canvas.getContext('2d');
      const rendered = context.getImageData(0, 0, width, height).data;
      let reference = window.previousPainting;
      if (source) {
        const image = new Image();
        image.src = source;
        await image.decode();
        const expected = document.createElement('canvas');
        expected.width = width;
        expected.height = height;
        const expectedContext = expected.getContext('2d');
        expectedContext.drawImage(image, 0, 0);
        reference = expectedContext.getImageData(0, 0, width, height).data;
      }
      const actualPixels = new Uint32Array(rendered.buffer);
      const referencePixels = new Uint32Array(reference.buffer);
      const counts = { pitch: 0, outside: 0 };
      const bounds = { left: width, right: -1, top: height, bottom: -1 };
      let unmasked = 0;
      let maxChannelDelta = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        if (actualPixels[pixel] === referencePixels[pixel]) continue;
        const offset = pixel * 4;
        for (let channel = 0; channel < 4; channel++) {
          maxChannelDelta = Math.max(maxChannelDelta, Math.abs(rendered[offset + channel] - reference[offset + channel]));
        }
        if (window.paintingClothMask && !window.paintingClothMask[pixel]) unmasked++;
        if (x >= 272 && x < 752 && y >= 352 && y < 1184) counts.pitch++;
        else counts.outside++;
        bounds.left = Math.min(bounds.left, x);
        bounds.right = Math.max(bounds.right, x);
        bounds.top = Math.min(bounds.top, y);
        bounds.bottom = Math.max(bounds.bottom, y);
      }
      return { ...counts, bounds, unmasked, maxChannelDelta };
    }, referenceUrl);
  }

  async function loadClothMask(approvedUrl) {
    await painting.evaluate(async (canvas, source) => {
      const directory = new URL('layers/', new URL(source, location.href));
      const { layers } = await (await fetch(new URL('manifest.json', directory))).json();
      const sample = document.createElement('canvas');
      const { width, height } = canvas;
      sample.width = width;
      sample.height = height;
      const context = sample.getContext('2d', { willReadFrequently: true });
      const coverage = new Uint8Array(width * height);
      for (const layer of layers.filter(layer => layer.team && (layer.home.mask || layer.mask))) {
        const { x, y, mask } = layer.home;
        const image = new Image();
        image.src = new URL(mask ?? layer.mask, directory).href;
        await image.decode();
        context.clearRect(0, 0, width, height);
        context.drawImage(image, x, y);
        const pixels = context.getImageData(0, 0, width, height).data;
        for (let i = 0; i < coverage.length; i++) if (pixels[i * 4] > 0) coverage[i] = 1;
      }
      window.paintingClothMask = coverage;
    }, approvedUrl);
  }

  async function rememberPainting() {
    await painting.evaluate(canvas => {
      window.previousPainting = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    });
  }

  async function verifyIntegerZoom() {
    await page.setViewportSize({ width: 1440, height: 1800 });
    await zoom.fill('2');
    await stage.scrollIntoViewIfNeeded();
    const bounds = await stage.boundingBox();
    const screenshot = await page.screenshot({
      clip: { x: Math.round(bounds.x) + 80, y: Math.round(bounds.y) + 80, width: 64, height: 64 },
    });
    const differences = await painting.evaluate(async (native, png) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + png;
      await image.decode();
      const scratch = document.createElement('canvas');
      scratch.width = scratch.height = 64;
      const context = scratch.getContext('2d');
      context.drawImage(image, 0, 0);
      const screen = new Uint32Array(context.getImageData(0, 0, 64, 64).data.buffer);
      const source = new Uint32Array(native.getContext('2d').getImageData(296, 424, 32, 32).data.buffer);
      let mismatches = 0;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        if (screen[y * 64 + x] !== source[Math.floor(y / 2) * 32 + Math.floor(x / 2)]) mismatches++;
      }
      return mismatches;
    }, screenshot.toString('base64'));
    assert.equal(differences, 0);
    await zoom.fill('1');
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

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

    await page.getByRole('heading', { name: 'Painted candidates' }).waitFor();
    const candidateCount = await page.locator('.mockup-candidates img').count();
    assert.ok(candidateCount >= 3 && candidateCount <= 5);
    const stillPicker = page.getByLabel('Painted still', { exact: true });
    const compareSubject = page.getByLabel('Compare', { exact: true });
    const compareReference = page.getByLabel('Reference', { exact: true });
    const candidateFrame = page.locator('.mockup-concept-frame');
    const candidateStill = page.locator('.mockup-compared-still');
    const concept = page.locator('.mockup-concept');
    const stillLink = page.getByRole('link', { name: 'Candidate 02', exact: true });
    const approvedUrl = await stillLink.getAttribute('href');
    assert.equal(await comparison.inputValue(), 'render');
    await painting.waitFor();
    await players.uncheck();
    await grid.uncheck();
    const nativeHome = await comparePixels(approvedUrl);
    await stage.screenshot({ path: resolve(output, 'gatehouse-home-native.png') });
    await verifyIntegerZoom();

    const visitingSection = page.getByLabel('Visiting section', { exact: true });
    await rememberPainting();
    await visitingSection.uncheck();
    const homeVisitor = await comparePixels();
    assert.ok(homeVisitor.outside > 0 && homeVisitor.pitch === 0);
    assert.ok(homeVisitor.bounds.left > 512 && homeVisitor.bounds.bottom < 768);
    await visitingSection.check();

    for (const label of ['Side stands', 'End walls']) {
      await rememberPainting();
      await page.getByLabel(label, { exact: true }).uncheck();
      const hidden = await comparePixels();
      assert.ok(hidden.outside > 0 && hidden.pitch === 0);
      await page.getByLabel(label, { exact: true }).check();
    }
    await rememberPainting();
    await page.getByLabel('Turf', { exact: true }).uncheck();
    const hiddenTurf = await comparePixels();
    assert.deepEqual([hiddenTurf.pitch, hiddenTurf.outside], [480 * 832, 0]);
    await page.getByLabel('Turf', { exact: true }).check();

    await endSelect.selectOption('away');
    assert.equal(await painting.evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let alpha = 3; alpha < pixels.length; alpha += 4) if (pixels[alpha] < 255) return false;
      return true;
    }), true);
    await stage.screenshot({ path: resolve(output, 'gatehouse-away-native.png') });
    await rememberPainting();
    await visitingSection.uncheck();
    const awayVisitor = await comparePixels();
    assert.ok(awayVisitor.outside > 0 && awayVisitor.pitch === 0);
    assert.ok(awayVisitor.bounds.right < 512 && awayVisitor.bounds.top > 768);
    await visitingSection.check();
    await endSelect.selectOption('home');

    await rememberPainting();
    await pitchPreset.selectOption('calm');
    const calmDiff = await comparePixels();
    assert.ok(calmDiff.pitch > 0 && calmDiff.outside === 0);
    await players.check();
    await grid.check();
    await settlePlayers();
    await stage.screenshot({ path: resolve(output, 'gatehouse-calm-players.png') });
    await pitchPreset.selectOption('balanced');
    await stage.screenshot({ path: resolve(output, 'gatehouse-balanced-players.png') });

    await comparison.selectOption('side-by-side');
    await painting.waitFor();
    assert.equal(await compareSubject.inputValue(), 'rendered');
    assert.equal(await compareReference.inputValue(), 'approved');
    assert.equal(await concept.getAttribute('src'), approvedUrl);
    assert.deepEqual(await comparePixels(approvedUrl), nativeHome);
    await concept.evaluate(image => image.decode());
    await page.setViewportSize({ width: 2120, height: 1000 });
    const nativeComparisonBounds = await candidateFrame.boundingBox();
    assert.deepEqual([nativeComparisonBounds.width, nativeComparisonBounds.height], [1024, 1536]);
    await page.locator('.mockup-comparison').screenshot({ path: resolve(output, 'gatehouse-render-vs-approved.png') });
    await compareReference.selectOption('concept');
    await concept.evaluate(image => image.decode());
    await page.locator('.mockup-comparison').screenshot({ path: resolve(output, 'gatehouse-render-vs-concept.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await compareSubject.selectOption('candidate');
    assert.match(await stillPicker.inputValue(), /candidate-02\.png/);
    assert.match(await candidateStill.getAttribute('src'), /candidate-02\.png/);
    assert.match(await concept.getAttribute('src'), /01-old-world-classic-human-home\.webp/);
    await Promise.all([candidateStill.evaluate(image => image.decode()), concept.evaluate(image => image.decode())]);
    assert.deepEqual(await candidateStill.evaluate(image => [image.naturalWidth, image.naturalHeight]), [1024, 1536]);
    assert.equal(approvedUrl, await candidateStill.getAttribute('src'));
    const compareBounds = await candidateFrame.boundingBox();
    const conceptBounds = await concept.boundingBox();
    assert.ok(Math.abs(compareBounds.width - conceptBounds.width) < 1);
    assert.ok(Math.abs(compareBounds.height - conceptBounds.height) < 1);
    assert.equal(await stage.count(), 0);
    await page.locator('.mockup-comparison').screenshot({ path: resolve(output, 'candidate-02-vs-concept.png') });

    await comparison.selectOption('render');
    await settlePlayers();
    await painting.waitFor();
    await loadClothMask(approvedUrl);
    const homeSprite = page.locator('[data-player-id="home-0"]');
    const awaySprite = page.locator('[data-player-id="away-0"]');
    const getSources = () => Promise.all([homeSprite.getAttribute('src'), awaySprite.getAttribute('src')]);
    const awaySpeciesSources = new Map();
    for (const visitor of ['orc', 'human']) {
      await roster.selectOption(visitor);
      await colors.selectOption('defaults');
      await settlePlayers();
      assert.equal(await page.locator('[data-player-id^="away-"][data-roster="' + visitor + '"]').count(), 11);
      if (visitor === 'human') {
        const humanVisitor = await comparePixels(approvedUrl);
        assert.ok(humanVisitor.outside > 0 && humanVisitor.pitch === 0);
        assert.ok(humanVisitor.bounds.left > 512 && humanVisitor.bounds.bottom < 768);
      }
      const original = await getSources();
      awaySpeciesSources.set(visitor, original[1]);
      await rememberPainting();
      for (const preset of ['identical', 'white / black', 'yellow / purple', 'similar blues']) {
        await colors.selectOption(preset);
        await settlePlayers();
        const [home, away] = await getSources();
        assert.notEqual(home, original[0]);
        assert.notEqual(away, original[1]);
        const cloth = await comparePixels();
        assert.ok(cloth.outside > 0 && cloth.pitch === 0);
        if (visitor === 'orc') assert.equal(cloth.unmasked, 0);
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
        const box = await page.locator('.mockup-painting').boundingBox();
        const scale = Number(magnification);
        assert.equal(Math.round(box.width), 1024 * scale);
        assert.equal(Math.round(box.height), 1536 * scale);
        const cameraBox = await page.locator('.mockup-camera').boundingBox();
        const [nearEdge, farEdge] = await Promise.all([0, 4].map(index =>
          readPoints(page.locator('.mockup-ground polyline').nth(index))));
        const pitchLeft = Math.min(nearEdge[0][0], farEdge[1][0]) + cameraBox.x;
        const pitchTop = Math.min(nearEdge[0][1], farEdge[0][1]) + cameraBox.y;
        assert.ok(Math.abs(box.x + 272 * scale - pitchLeft) < .05);
        assert.ok(Math.abs(box.y + 352 * scale - pitchTop) < .05);
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
      assert.equal(await painting.count(), 0);
      assert.equal(await page.locator('.pitch-stadium-turf-world').count(), 1);
      assert.equal(await page.locator('.pitch-stadium-structure').count(), 0);
    }

    await comparison.selectOption('side-by-side');
    await concept.waitFor();
    assert.equal(await camera.count(), 0);
    await comparison.selectOption('crossfade');
    const overlay = page.locator('.mockup-overlay');
    await compareSubject.selectOption('rendered');
    await compareReference.selectOption('approved');
    assert.equal(await overlay.getAttribute('src'), approvedUrl);
    assert.deepEqual(await comparePixels(approvedUrl), nativeHome);
    const opacity = page.getByLabel('Reference opacity', { exact: true });
    for (const blend of ['0', '50', '100']) {
      await opacity.fill(blend);
      assert.equal(await overlay.evaluate(image => getComputedStyle(image).opacity), String(Number(blend) / 100));
    }
    assert.deepEqual(await overlay.boundingBox(), await candidateFrame.boundingBox());
    await opacity.fill('50');
    const nativeCrossfadeBounds = await candidateFrame.boundingBox();
    assert.deepEqual([nativeCrossfadeBounds.width, nativeCrossfadeBounds.height], [1024, 1536]);
    await page.locator('.mockup-comparison').screenshot({ path: resolve(output, 'gatehouse-approved-crossfade.png') });
    await compareReference.selectOption('concept');
    assert.match(await overlay.getAttribute('src'), /01-old-world-classic-human-home\.webp/);
    assert.deepEqual(await overlay.boundingBox(), await painting.boundingBox());
    await compareSubject.selectOption('candidate');
    await stillPicker.selectOption({ label: 'Candidate 01' });
    await candidateStill.evaluate(image => image.decode());
    assert.match(await candidateStill.getAttribute('src'), /candidate-01\.png/);
    assert.deepEqual(await candidateStill.boundingBox(), await overlay.boundingBox());
    await stillPicker.selectOption({ label: 'Candidate 02' });

    await comparison.selectOption('render');
    assert.equal(await camera.isEnabled(), true);
    assert.equal(await stage.getAttribute('data-angle'), '50');
    await camera.selectOption('90');
    await grid.uncheck();
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
    await fallback.getByLabel('Comparison', { exact: true }).selectOption('render');
    await fallback.getByRole('status').filter({ hasText: 'Turf failed to load' }).waitFor();
    await fallback.close();

    await writeFile(resolve(output, 'checks.json'), JSON.stringify({
      players: 22, rosters: ['human', 'orc'], colors: 5, zoom: [.5, 1, 2], candidateCount,
      nativeHome, homeVisitor, awayVisitor, calmDiff, errors,
    }, null, 2));
    assert.deepEqual([nativeHome.pitch, nativeHome.outside], [0, 0], JSON.stringify(nativeHome));
  }

  assert.deepEqual(errors, []);
  console.log((captureOnly ? 'Native stadium layout captured. ' : 'Stadium approval gallery passed. ') + 'Evidence in ' + output);
} finally {
  await browser?.close();
  await server.close();
}
