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
  await page.getByRole('link', { name: 'Compare player scales' }).click();
  await page.waitForURL(galleryUrl + '?view=scale');
  const comparisons = page.locator('.scale-study-comparisons[data-ready="true"]');
  const inspector = page.locator('.scale-study-stand[data-ready="true"]');
  const sprites = comparisons.locator('.scale-study-player');
  const kit = page.getByLabel('Kit colours');
  const background = page.getByLabel('Background');
  const artwork = page.getByLabel('Artwork');
  await comparisons.waitFor();

  async function settleSprites() {
    await page.waitForFunction(() => {
      const sprites = [...document.querySelectorAll('.scale-study-comparisons .scale-study-player')];
      return sprites.length === 28 && sprites.every(sprite => sprite.src.startsWith('data:') && sprite.complete);
    });
    await sprites.evaluateAll(images => Promise.all(images.map(image => image.decode())));
  }

  await settleSprites();
  const inwardStudy = page.locator('#inward-bowl');
  const inwardCrop = inwardStudy.locator('.scale-study-crop[data-ready="true"]');
  const inwardCanvas = inwardCrop.locator('canvas');
  const bowlView = inwardStudy.getByLabel('Bowl view');
  const steppedStudy = page.locator('#stepped-bowl');
  assert.ok(await inwardStudy.evaluate(section =>
    Boolean(section.compareDocumentPosition(document.querySelector('#stepped-bowl')) & Node.DOCUMENT_POSITION_FOLLOWING)));
  assert.equal(await bowlView.inputValue(), 'full');
  await steppedStudy.locator('summary').click();
  const fullBowl = steppedStudy.locator('details canvas');
  assert.deepEqual(await fullBowl.evaluate(c => [c.width, c.height]), [790, 1188]);
  const fringe = await fullBowl.evaluate(canvas => {
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
    const stepped = read(document.querySelector('#stepped-bowl details canvas'));
    const result = { opaque: 0, opaqueChanged: 0, exposedGround: 0, groundChanged: 0, opaqueInOpening: 0,
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
        if (stepped[i] !== rendered[i]) result.groundChanged++;
      }
    }
    return result;
  }, foregroundSource);
  assert.ok(inwardPixels.opaque > 300_000);
  assert.ok(inwardPixels.exposedGround >= 480 * 832);
  assert.ok(inwardPixels.opaqueInOpening > 0);
  assert.equal(inwardPixels.opaqueChanged, 0);
  assert.equal(inwardPixels.groundChanged, 0);
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
  await steppedStudy.screenshot({ path: resolve(output, 'stepped-bowl.png') });
  await steppedStudy.locator('.bowl-detail').screenshot({ path: resolve(output, 'stepped-bowl-detail.png') });
  await steppedStudy.locator('summary').click();
  const geometry = await comparisons.locator('figure').evaluateAll(figures => figures.map(figure => {
    const crop = figure.querySelector('.scale-study-crop').getBoundingClientRect();
    return {
      id: figure.dataset.variant,
      dimensions: [crop.width, crop.height],
      origin: [crop.x, crop.y],
      players: [...figure.querySelectorAll('img')].map(sprite => {
        const bounds = sprite.getBoundingClientRect();
        const { playerId, roster, footX, footY, anchorX, anchorY } = sprite.dataset;
        const foot = [Number(footX), Number(footY)];
        const drawnFoot = [bounds.x - crop.x + bounds.width * Number(anchorX) / sprite.naturalWidth,
          bounds.y - crop.y + bounds.height * Number(anchorY) / sprite.naturalHeight];
        return { id: playerId, roster, foot, drawnFoot, width: bounds.width, filtering: getComputedStyle(sprite).imageRendering };
      }),
    };
  }));
  assert.deepEqual(geometry.map(variant => variant.id), ['a', 'b', 'c', 'd']);
  const [[ax, ay], [bx, by], [cx, cy], [dx, dy]] = geometry.map(variant => variant.origin);
  assert.ok(ax < bx && ax === cx && bx === dx && ay < cy && ay === by && cy === dy);
  for (const { dimensions, players } of geometry) {
    assert.deepEqual(dimensions, [416, 352]);
    assert.deepEqual(players.map(player => player.roster), ['human', 'orc', 'orc', 'orc', 'human', 'human', 'human']);
    assert.deepEqual(players.map(player => player.foot), [[288, 80], [288, 208], [320, 208], [352, 208],
      [288, 240], [320, 240], [352, 240]]);
    for (const { foot, drawnFoot, filtering } of players) {
      assert.equal(filtering, 'pixelated');
      assert.ok(foot.every((point, axis) => Math.abs(point - drawnFoot[axis]) < .05));
    }
  }
  for (let i = 0; i < geometry[0].players.length; i++) {
    assert.ok(Math.abs(geometry[0].players[i].width * 1.25 - geometry[1].players[i].width) < .05);
    assert.equal(geometry[1].players[i].width, geometry[2].players[i].width);
    assert.equal(geometry[1].players[i].width, geometry[3].players[i].width);
    for (const view of ['full', 'west']) {
      assert.ok(Math.abs(geometry[1].players[i].width - inwardPlayers[view][i].width) < .05);
    }
  }

  const backgroundChanges = await comparisons.locator('canvas').evaluateAll(([a, b, c, d]) => {
    const pixels = canvas => new Uint32Array(canvas.getContext('2d')
      .getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    const [first, second, third, fourth] = [a, b, c, d].map(pixels);
    return first.reduce((result, pixel, i) => {
      if (pixel !== second[i]) result.sameGatehouse++;
      if (i % a.width >= 272) {
        if (pixel !== third[i] || pixel !== fourth[i]) result.pitch++;
      } else {
        if (pixel !== third[i]) result.sideline++;
        if (pixel !== fourth[i]) result.painted++;
      }
      return result;
    }, { sameGatehouse: 0, pitch: 0, sideline: 0, painted: 0 });
  });
  assert.equal(backgroundChanges.sameGatehouse, 0);
  assert.equal(backgroundChanges.pitch, 0);
  assert.ok(backgroundChanges.sideline > 40_000);
  await comparisons.screenshot({ path: resolve(output, 'desktop-default-kits.png') });

  const originalSprites = await sprites.evaluateAll(images => images.map(image => image.src));
  const paintedScene = comparisons.locator('[data-variant="d"] canvas');
  const paintedOriginal = await paintedScene.evaluate(canvas => canvas.toDataURL());
  await kit.selectOption('white / black');
  await settleSprites();
  assert.ok((await sprites.evaluateAll(images => images.map(image => image.src))).every((src, i) => src !== originalSprites[i]));
  const paintedKitIndependent = await paintedScene.evaluate(canvas => canvas.toDataURL()) === paintedOriginal;
  await comparisons.screenshot({ path: resolve(output, 'desktop-white-black-kits.png') });

  async function inspectLayer(layer) {
    const file = layer === 'cutout' ? 'mask-first-sideline.cutout' : 'mask-first-sideline';
    const [source, mask] = await Promise.all(['.png', '.materials.png'].map(async suffix =>
      (await readFile(new URL(file + suffix, assets))).toString('base64')));
    return inspector.locator('canvas').evaluate(async (canvas, { source, mask }) => {
      async function readAsset(base64) {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const buffer = document.createElement('canvas');
        buffer.width = canvas.width;
        buffer.height = canvas.height;
        const context = buffer.getContext('2d');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      const [original, materials] = await Promise.all([readAsset(source), readAsset(mask)]);
      const painted = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const result = { transparent: 0, alphaChanged: 0, fixedRgbChanged: 0, primaryRgbChanged: 0, secondaryRgbChanged: 0 };
      for (let i = 0; i < painted.length; i += 4) {
        if (painted[i + 3] === 0) result.transparent++;
        if (original[i + 3] !== painted[i + 3]) result.alphaChanged++;
        if (original[i] === painted[i] && original[i + 1] === painted[i + 1] && original[i + 2] === painted[i + 2]) continue;
        if (materials[i] === 1) result.primaryRgbChanged++;
        else if (materials[i] === 2) result.secondaryRgbChanged++;
        else result.fixedRgbChanged++;
      }
      return result;
    }, { source, mask });
  }

  const edgeChecks = {};
  for (const layer of ['stand', 'cutout']) {
    await artwork.selectOption(layer);
    const profile = await inspectLayer(layer);
    assert.ok(profile.transparent > 0);
    assert.equal(profile.alphaChanged, 0);
    assert.equal(profile.fixedRgbChanged, 0);
    assert.ok(profile.primaryRgbChanged > 0);
    assert.ok(profile.secondaryRgbChanged > 0);
    const before = await inspector.locator('canvas').evaluate(canvas => canvas.toDataURL());
    const backdrops = new Set();
    for (const mode of ['Checkerboard', 'Light', 'Dark']) {
      await background.selectOption(mode);
      assert.equal(await inspector.getAttribute('data-background'), mode);
      assert.equal(await inspector.locator('canvas').evaluate(canvas => canvas.toDataURL()), before);
      backdrops.add(await inspector.evaluate(element => getComputedStyle(element).background));
      await inspector.screenshot({ path: resolve(output, `${layer}-${mode.toLowerCase()}.png`) });
    }
    assert.equal(backdrops.size, 3);
    edgeChecks[layer] = profile;
  }
  assert.ok(edgeChecks.cutout.transparent > edgeChecks.stand.transparent);

  await page.setViewportSize({ width: 412, height: 915 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const alignment = await comparisons.locator('figure').evaluateAll(variants =>
    variants.map(variant => [variant.getBoundingClientRect().x, variant.getBoundingClientRect().y]));
  assert.ok(alignment.every(([x], _, rows) => x === rows[0][0]));
  assert.ok(alignment[0][1] < alignment[1][1] && alignment[1][1] < alignment[2][1]);
  await page.screenshot({ path: resolve(output, 'mobile-comparison.png'), fullPage: true });
  await page.getByRole('link', { name: 'Back to Gatehouse gallery' }).click();
  await page.getByRole('link', { name: 'Compare player scales' }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'checks.json'), JSON.stringify({ inwardPixels, inwardViews, inwardPlayers, geometry,
    backgroundChanges, paintedKitIndependent, edgeChecks }, null, 2));
  assert.ok(backgroundChanges.painted > 40_000);
  assert.equal(paintedKitIndependent, true);
  console.log('Stadium scale studies passed. Evidence in ' + output);
} finally {
  await browser?.close();
  await server.close();
}
