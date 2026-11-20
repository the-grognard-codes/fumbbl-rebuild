import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { teamColorManifest } from '../src/generated-team-colors.ts';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = new URL('../../assets/game/references/stadiums/scale-studies/', import.meta.url);
const output = resolve(process.env.STADIUM_SCALE_STUDIES_OUTPUT ||
  fileURLToPath(new URL('../../.tools/stadium-scale-studies/', import.meta.url)));
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;

const kits = {
  defaults: ['navy', 'gold', 'red', 'ivory'],
  identical: ['navy', 'navy', 'navy', 'navy'],
  'white / black': ['white', 'black', 'black', 'white'],
  'yellow / purple': ['lemon', 'violet', 'violet', 'lemon'],
  'similar blues': ['navy', 'sky', 'sky', 'navy'],
};

const sceneSamples = {
  'north banner cloth': { x: 395, y: 125, material: 13 },
  'north banner crest': { x: 395, y: 115, material: 27 },
  'east banner cloth': { x: 672, y: 248, material: 45 },
  'east banner crest': { x: 677, y: 262, material: 60 },
  'north tankard': { x: 95, y: 17, material: 0, color: '#af602d' },
  'north pie': { x: 384, y: 26, material: 0, color: '#af602d' },
  'east bottle': { x: 741, y: 234, material: 0, color: '#7c8721' },
  'east silver mug': { x: 743, y: 547, material: 0, color: '#a3908d' },
  'south drumstick': { x: 88, y: 1082, material: 0, color: '#af602d' },
};

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

  const inwardViews = {
    full: { x: 0, y: 0, width: 790, height: 1188 },
    south: { x: 80, y: 888, width: 630, height: 300 },
    east: { x: 490, y: 198, width: 300, height: 714 },
    north: { x: 60, y: 0, width: 670, height: 270 },
    west: { x: 0, y: 361, width: 416, height: 352 },
  };
  const assetUrls = await Promise.all(['gatehouse-inward.webp', 'gatehouse-materials.png'].map(async file =>
    `data:image/${file.split('.').at(-1)};base64,${(await readFile(new URL(file, assets))).toString('base64')}`));
  const layers = await page.evaluateHandle(async ([foregroundUrl, materialsUrl]) => {
    const { drawBowlGround } = await import('/src/stadium-bowl-study.ts');
    const { loadGatehouseArtwork } = await import('/src/gatehouse-artwork.ts');
    const load = async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const [foreground, materials, artwork] = await Promise.all([
      load(foregroundUrl), load(materialsUrl), loadGatehouseArtwork(foregroundUrl, materialsUrl),
    ]);
    const { naturalWidth: width, naturalHeight: height } = foreground;
    const makeContext = options => {
      const buffer = document.createElement('canvas');
      buffer.width = width;
      buffer.height = height;
      return buffer.getContext('2d', options);
    };
    const source = makeContext({ willReadFrequently: true });
    source.drawImage(foreground, 0, 0);
    const original = source.getImageData(0, 0, width, height).data;
    source.clearRect(0, 0, width, height);
    source.drawImage(materials, 0, 0);
    const mask = source.getImageData(0, 0, width, height).data;
    const originalComposite = makeContext();
    drawBowlGround(originalComposite, true);
    originalComposite.drawImage(foreground, 0, 0);
    return { width, height, maskWidth: materials.naturalWidth, maskHeight: materials.naturalHeight, mask, original, artwork,
      originalComposite: new Uint32Array(originalComposite.getImageData(0, 0, width, height).data.buffer) };
  }, assetUrls);

  const kitSelect = inwardStudy.getByLabel('Kit colours');
  const inwardPixels = {};
  const inwardPlayers = {};
  const kitCrops = {};
  for (const [kit, identities] of Object.entries(kits)) {
    await bowlView.selectOption('full');
    await kitSelect.selectOption(kit);
    const ramps = identities.flatMap(id => teamColorManifest.ramps.find(ramp => ramp.id === id).colors);
    inwardPixels[kit] = await inwardCanvas.evaluate(async (canvas, { layers, ramps, identities, sceneSamples }) => {
      const { width, height, maskWidth, maskHeight, mask, original, originalComposite, artwork } = layers;
      const { gatehouseClothOverlay } = await import('/src/gatehouse-artwork.ts');
      const [homePrimary, homeSecondary, awayPrimary, awaySecondary] = identities;
      const overlay = gatehouseClothOverlay(artwork, {
        home: { version: 1, primary: homePrimary, secondary: homeSecondary },
        away: { version: 1, primary: awayPrimary, secondary: awaySecondary },
      });
      const overlayPixels = overlay.getContext('2d').getImageData(0, 0, width, height).data;
      const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      const rendered = new Uint32Array(pixels.buffer);
      const palette = ramps.map(hex => Number.parseInt(hex.slice(1), 16));
      const samples = Object.fromEntries(Object.entries(sceneSamples).map(([name, { x, y }]) => {
        const offset = (y * width + x) * 4;
        return [name, { material: mask[offset], color: '#' + Array.from(pixels.subarray(offset, offset + 3),
          channel => channel.toString(16).padStart(2, '0')).join('') }];
      }));
      const result = { invalidMask: 0, shadeCounts: Array(65).fill(0), opaque: 0, exposedGround: 0, opaqueInOpening: 0,
        wrongColor: 0, fixedChanged: 0, badOverlayAlpha: 0, transparentRendered: 0, clothChanged: 0,
        gateLaneForeground: 0, dimensions: [width, height, maskWidth, maskHeight], samples };
      for (let pixel = 0; pixel < width * height; pixel++) {
        const offset = pixel * 4;
        const index = mask[offset];
        const alpha = original[offset + 3];
        const x = pixel % width, y = Math.floor(pixel / width);
        const inOpening = x >= 108 && x < 684 && y >= 121 && y < 1049;
        if (alpha && x >= 380 && x <= 410 && y >= 1008) result.gateLaneForeground++;
        if (alpha === 255) {
          result.opaque++;
          if (inOpening) result.opaqueInOpening++;
        } else if (alpha === 0 && inOpening) result.exposedGround++;
        if (index > 64 || mask[offset + 1] !== index || mask[offset + 2] !== index || mask[offset + 3] !== 255 || (index && alpha !== 255)) {
          result.invalidMask++;
          continue;
        }
        result.shadeCounts[index]++;
        if (overlayPixels[offset + 3] !== (index ? 255 : 0)) result.badOverlayAlpha++;
        if (pixels[offset + 3] !== 255) result.transparentRendered++;
        if (index) {
          const color = (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2];
          if (color !== palette[index - 1]) result.wrongColor++;
          if (rendered[pixel] !== originalComposite[pixel]) result.clothChanged++;
        } else if (rendered[pixel] !== originalComposite[pixel]) result.fixedChanged++;
      }
      return result;
    }, { layers, ramps, identities, sceneSamples });
    const pixels = inwardPixels[kit];
    assert.deepEqual(pixels.dimensions, [790, 1188, 790, 1188]);
    assert.ok(pixels.opaque > 300_000);
    assert.ok(pixels.exposedGround >= 480 * 832);
    assert.ok(pixels.opaqueInOpening > 0);
    for (const check of ['invalidMask', 'wrongColor', 'fixedChanged', 'badOverlayAlpha', 'transparentRendered', 'gateLaneForeground']) {
      assert.equal(pixels[check], 0, `${kit} ${check}`);
    }
    if (kit === 'defaults') assert.equal(pixels.clothChanged, 0);
    else assert.ok(pixels.clothChanged > 0);
    for (const [name, { material, color }] of Object.entries(sceneSamples)) {
      assert.deepEqual(pixels.samples[name], { material, color: color ?? ramps[material - 1] }, `${kit} ${name}`);
    }
    for (let start = 1; start <= 64; start += 16) {
      assert.ok(pixels.shadeCounts.slice(start, start + 16).filter(Boolean).length > 1, `Missing shades in ${kit} ${start}`);
    }

    const expectedCrops = {};
    for (const [view, frame] of Object.entries(inwardViews)) expectedCrops[view] = await inwardCanvas.evaluate(cropDigest, frame);
    kitCrops[kit] = expectedCrops;
    for (const [view, frame] of Object.entries(inwardViews)) {
      await bowlView.selectOption(view);
      assert.equal(await inwardCrop.getAttribute('data-view'), view);
      assert.deepEqual(await inwardCanvas.evaluate(canvas => [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight]),
        [frame.width, frame.height, frame.width, frame.height]);
      assert.deepEqual(await inwardCanvas.evaluate(cropDigest, { ...frame, x: 0, y: 0 }), expectedCrops[view], `${kit} ${view}`);
      if (kit !== 'defaults') continue;
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
  }
  await layers.dispose();
  for (const [view, frame] of Object.entries(inwardViews)) {
    await bowlView.selectOption(view);
    await kitSelect.selectOption('white / black');
    const origin = { ...frame, x: 0, y: 0 };
    assert.deepEqual(await inwardCanvas.evaluate(cropDigest, origin), kitCrops['white / black'][view]);
    await kitSelect.selectOption('defaults');
    assert.deepEqual(await inwardCanvas.evaluate(cropDigest, origin), kitCrops.defaults[view]);
    assert.notDeepEqual(kitCrops['white / black'][view], kitCrops.defaults[view]);
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
