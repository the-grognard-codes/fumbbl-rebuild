import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = new URL('../../assets/game/references/stadiums/scale-studies/', import.meta.url);
const output = resolve(process.env.STADIUM_SCALE_STUDIES_OUTPUT ||
  fileURLToPath(new URL('../../.tools/stadium-scale-studies/', import.meta.url)));
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;

async function cropDigest(canvas, { x, y, width, height }) {
  const pixels = canvas.getContext('2d').getImageData(x, y, width, height).data;
  const hash = await crypto.subtle.digest('SHA-256', pixels);
  return Array.from(new Uint8Array(hash));
}

try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());
  });
  const galleryUrl = `http://127.0.0.1:${server.httpServer.address().port}/stadium-mockup`;
  await page.goto(galleryUrl);
  const inwardStudy = page.locator('#inward-bowl');
  const inwardCrop = inwardStudy.locator('.scale-study-crop[data-ready="true"]');
  const inwardCanvas = inwardCrop.locator('canvas');
  const bowlView = inwardStudy.getByLabel('Bowl view');
  await inwardCrop.waitFor();
  assert.equal(await page.locator('canvas').count(), 1);
  if (process.argv.includes('--capture-layout')) {
    const directory = resolve(process.env.STADIUM_MOCKUP_OUTPUT ||
      fileURLToPath(new URL('../../.tools/stadium-mockup/', import.meta.url)));
    await mkdir(directory, { recursive: true });
    await inwardCanvas.screenshot({ path: resolve(directory, 'layout-base.png'), style: '.scale-study-player { visibility: hidden; }' });
  }
  const fringe = await inwardCanvas.evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const sides = [[156,169,0,1,-1,0,832], [635,169,0,1,1,0,832],
      [156,169,1,0,0,-1,480], [156,1000,1,0,0,1,480]];
    return sides.map(([x,y,alongX,alongY,outX,outY,length]) => {
      const depths = [];
      for (let i = 1; i < length - 1; i++) {
        let depth = 0;
        for (let step = 1; step <= 48; step++) {
          const offset = 4 * ((y + i * alongY + step * outY) * canvas.width + x + i * alongX + step * outX);
          if (pixels[offset + 1] <= pixels[offset]) break;
          depth++;
        }
        depths.push(depth);
      }
      return [Math.min(...depths), Math.max(...depths)];
    });
  });
  for (const [min, max] of fringe) assert.ok(min >= 2 && max <= 7 && max - min >= 3);

  const foregroundSource = (await readFile(new URL('gatehouse-inward.webp', assets))).toString('base64');
  const inwardPixels = await inwardCanvas.evaluate(async (canvas, source) => {
    const image = new Image();
    image.src = `data:image/webp;base64,${source}`;
    await image.decode();
    const { width, height } = canvas;
    const buffer = document.createElement('canvas');
    buffer.width = width;
    buffer.height = height;
    const context = buffer.getContext('2d');
    context.drawImage(image, 0, 0);
    const read = target => new Uint32Array(target.getContext('2d').getImageData(0, 0, width, height).data.buffer);
    const foreground = new Uint32Array(context.getImageData(0, 0, width, height).data.buffer);
    const rendered = read(canvas);

    const result = { opaque: 0, opaqueChanged: 0, exposedGround: 0, opaqueInOpening: 0,
      transparentRendered: 0 };
    for (let i = 0; i < rendered.length; i++) {
      const x = i % width;
      const y = Math.floor(i / width);
      const inOpening = x >= 108 && x < 684 && y >= 121 && y < 1049;
      const alpha = foreground[i] >>> 24;
      if (rendered[i] >>> 24 !== 255) result.transparentRendered++;
      if (alpha === 255) {
        result.opaque++;
        if (inOpening) result.opaqueInOpening++;
        if (foreground[i] !== rendered[i]) result.opaqueChanged++;
      } else if (alpha === 0 && inOpening) {
        result.exposedGround++;

      }
    }
    return result;
  }, foregroundSource);
  assert.ok(inwardPixels.opaque > 300_000);
  assert.ok(inwardPixels.exposedGround >= 480 * 832);
  assert.ok(inwardPixels.opaqueInOpening > 0);
  assert.equal(inwardPixels.opaqueChanged, 0);

  assert.equal(inwardPixels.transparentRendered, 0);

  const inwardViews = {
    full: { x: 0, y: 0, width: 790, height: 1188 },
    south: { x: 80, y: 888, width: 630, height: 300 },
    east: { x: 490, y: 198, width: 300, height: 714 },
    north: { x: 60, y: 0, width: 670, height: 270 },
    west: { x: 0, y: 361, width: 416, height: 352 },
  };
  const expectedCrops = {};
  for (const [view, frame] of Object.entries(inwardViews)) {
    expectedCrops[view] = await inwardCanvas.evaluate(cropDigest, frame);
  }
  const inwardPlayers = {};
  for (const [view, frame] of Object.entries(inwardViews)) {
    await bowlView.selectOption(view);
    assert.equal(await inwardCrop.getAttribute('data-view'), view);
    assert.deepEqual(await inwardCanvas.evaluate(canvas => [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight]),
      [frame.width, frame.height, frame.width, frame.height]);
    assert.deepEqual(await inwardCanvas.evaluate(cropDigest, { ...frame, x: 0, y: 0 }), expectedCrops[view]);
    await inwardCrop.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    inwardPlayers[view] = await inwardCrop.locator('img').evaluateAll((images, { x, y }) => images.map(image => {
      const frameBounds = image.parentElement.getBoundingClientRect();
      const sprite = image.getBoundingClientRect();
      const { playerId, footX, footY, anchorX, anchorY } = image.dataset;
      return {
        id: playerId, width: sprite.width,
        foot: [Number(footX) + x, Number(footY) + y],
        drawnFoot: [x + sprite.x - frameBounds.x + sprite.width * Number(anchorX) / image.naturalWidth,
          y + sprite.y - frameBounds.y + sprite.height * Number(anchorY) / image.naturalHeight],
      };
    }), frame);
    await inwardCrop.screenshot({ path: resolve(output, `inward-bowl-${view}.png`) });
  }
  assert.equal(inwardPlayers.full.length, 7);
  assert.equal(inwardPlayers.west.length, 7);
  for (const view of ['south', 'east', 'north']) assert.equal(inwardPlayers[view].length, 0);
  const pitchFeet = [[172, 441], [172, 569], [204, 569], [236, 569], [172, 601], [204, 601], [236, 601]];
  for (const view of ['full', 'west']) {
    assert.deepEqual(inwardPlayers[view].map(player => player.foot), pitchFeet);
    for (const { foot, drawnFoot } of inwardPlayers[view]) {
      assert.ok(foot.every((point, axis) => Math.abs(point - drawnFoot[axis]) < .05));
    }
  }
  await bowlView.selectOption('full');
  await page.goto(galleryUrl + '?view=scale#inward-bowl');
  await inwardCrop.waitFor();
  assert.equal(await page.locator('canvas').count(), 1);
  await page.getByLabel('Kit colours').selectOption('white / black');
  await page.setViewportSize({ width: 412, height: 915 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'checks.json'), JSON.stringify({ inwardPixels, inwardPlayers }, null, 2));
  console.log('Gatehouse gallery passed.');
} finally {
  await browser?.close();
  await server.close();
}
