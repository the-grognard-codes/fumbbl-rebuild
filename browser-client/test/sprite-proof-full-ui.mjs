import assert from 'node:assert/strict';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { platform, release, cpus } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
const evidence = new URL('../../assets/game/proofs/shared-sprite-v1/qa/full-proof/', import.meta.url);
await mkdir(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: fileURLToPath(evidence), size: { width: 1440, height: 1000 } } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(server.resolvedUrls.local[0] + 'test/sprite-proof.html');
  await page.waitForFunction(() => document.querySelector('.proof-pixi')?.dataset.metrics);
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  const metrics = () => page.locator('.proof-pixi').evaluate(node => JSON.parse(node.dataset.metrics));
  for (const design of ['lineman', 'halfling', 'ogre']) {
    await page.getByLabel('Animation design').selectOption(design);
    for (const direction of design === 'lineman' ? ['front45', 'back45'] : ['front45']) {
      await page.getByLabel('Animation view').selectOption(direction);
      for (const clip of ['idle', 'move', 'fall']) {
        await page.getByLabel('Animation clip').selectOption(clip);
        for (let frame = 0; frame < 4; frame++) {
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.locator('#animation-proof > .proof-green').screenshot({ path: fileURLToPath(new URL(`${design}-${direction}-${clip}-${frame}-3x.png`, evidence)) });
          await page.getByRole('button', { name: 'Next frame', exact: true }).click();
        }
      }
    }
    await page.getByLabel('Animation view').selectOption('front45');
    await page.getByLabel('Animation clip').selectOption('move');
    await page.getByLabel('Enlargement').selectOption('1');
    await page.locator('#animation-proof > .proof-green').screenshot({ path: fileURLToPath(new URL(`${design}-native.png`, evidence)) });
    await page.getByLabel('Enlargement').selectOption('3');
    await page.getByLabel('Bust design').selectOption(design);
    const urls = await Promise.all(['Player card bust', 'Builder bust', 'Interception bust', 'Dugout bust'].map(alt => page.getByAltText(alt).getAttribute('src')));
    assert.ok(urls[0]?.startsWith('data:image/png')); assert.equal(new Set(urls).size, 1);
    await page.locator('.proof-consumers').screenshot({ path: fileURLToPath(new URL(`${design}-bust-consumers.png`, evidence)) });
    await page.locator('.proof-comparisons').screenshot({ path: fileURLToPath(new URL(`${design}-materials.png`, evidence)) });
  }
  for (const end of ['home', 'away']) for (const mode of ['perspective', 'top-down']) {
    await page.getByLabel('Coach end').selectOption(end); await page.getByLabel('Proof projection').selectOption(mode);
    await page.getByLabel('22-player synthetic scene').check();
    for (const mirror of [false, true]) {
      await page.getByLabel('Mirror pitch sprite').setChecked(mirror);
      await page.waitForTimeout(150);
      await page.locator('.proof-pitch-stage').screenshot({ path: fileURLToPath(new URL(`pitch-${end}-${mode}-${mirror}.png`, evidence)) });
      assert.equal((await metrics()).count, 22);
    }
  }
  await page.getByLabel('Coach end').selectOption('home'); await page.getByLabel('Proof projection').selectOption('perspective');
  await page.getByLabel('Mirror pitch sprite').uncheck(); await page.getByLabel('Animation view').selectOption('side');
  await page.waitForTimeout(100); assert.equal((await metrics()).fallbacks, 22);
  await page.getByLabel('Animation view').selectOption('front45');
  const primary = page.getByRole('group', { name: 'Primary color', exact: true }), secondary = page.getByRole('group', { name: 'Secondary color', exact: true });
  for (const [name, p, s] of [['light', 'White', 'White'], ['dark', 'Black', 'Black'], ['contrast', 'Red', 'Gold'], ['similar', 'Navy', 'Slate']]) {
    await primary.getByRole('radio', { name: p, exact: true }).check(); await secondary.getByRole('radio', { name: s, exact: true }).check();
    await page.getByLabel('Identical opposing kits').check(); await page.waitForTimeout(120);
    await page.locator('.proof-pitch-stage').screenshot({ path: fileURLToPath(new URL(`pitch-${name}-kits.png`, evidence)) });
  }
  await page.getByRole('button', { name: 'Reset', exact: true }).click(); await page.getByLabel('Identical opposing kits').uncheck();
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await page.locator('.proof-pitch-stage').scrollIntoViewIfNeeded();
  await page.waitForTimeout(10000); const animated = await metrics();
  assert.ok(animated.textures <= 96); assert.equal(animated.fallbacks, 0);
  await page.getByLabel('Accepted static baseline').check(); await page.waitForTimeout(10000); const baseline = await metrics();
  assert.equal(baseline.fallbacks, 22); assert.equal(baseline.textures, 0);
  await page.getByLabel('Accepted static baseline').uncheck();
  for (let i = 0; i < 32; i++) {
    await primary.getByRole('radio').nth(i % 16).check(); await page.waitForTimeout(20);
    assert.ok((await metrics()).textures <= 96);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByLabel('Animation clip').selectOption('fall');
  assert.equal(await page.locator('[data-animation-frame]').getAttribute('data-animation-frame'), '3');
  await page.getByLabel('Animation clip').selectOption('idle');
  assert.equal(await page.locator('[data-animation-frame]').getAttribute('data-animation-frame'), '0');
  // Produce reusable native-size all-pair sheets through the exact runtime recolorer.
  const sheets = await page.evaluate(async () => {
    const { recolorProofImage } = await import('/src/sprite-proof-format.ts');
    const [staticPack, animation] = await Promise.all(['pack', 'animation'].map(name => fetch(`/assets/game/proofs/shared-sprite-v1/${name}.json`).then(response => response.json())));
    const images = [...staticPack.images.filter(image => image.kind === 'bust'), ...animation.palettePack.images.filter(image => image.id.endsWith('front45-idle-0'))];
    return images.map(image => {
      const cell = image.width + 8, sheet = document.createElement('canvas'); sheet.width = cell * 16; sheet.height = cell * 16;
      const context = sheet.getContext('2d'); context.fillStyle = '#355b35'; context.fillRect(0, 0, sheet.width, sheet.height);
      const tile = document.createElement('canvas'); tile.width = image.width; tile.height = image.height;
      staticPack.ramps.forEach((p, row) => staticPack.ramps.forEach((s, column) => {
        tile.getContext('2d').putImageData(new ImageData(recolorProofImage(image, p, s), image.width, image.height), 0, 0);
        context.drawImage(tile, column * cell + 4, row * cell + 4);
      }));
      return { id: image.id, data: sheet.toDataURL().split(',')[1] };
    });
  });
  for (const sheet of sheets) await writeFile(new URL(`${sheet.id}-256-pairs.png`, evidence), Buffer.from(sheet.data, 'base64'));
  assert.deepEqual(errors, []);
  const result = { browser: await browser.version(), os: `${platform()} ${release()}`, cpu: cpus()[0].model, headless: true,
    renderer: 'Pixi WebGL', animated, baseline, cacheChurnPairs: 32, errors,
    animationJsonBytes: (await stat(new URL('../../assets/game/proofs/shared-sprite-v1/delivery/animation.json', import.meta.url))).size,
    staticJsonBytes: (await stat(new URL('../../assets/game/proofs/shared-sprite-v1/delivery/pack.json', import.meta.url))).size };
  await writeFile(new URL('results.json', evidence), JSON.stringify(result, null, 2));
  const video = page.video(); await context.close();
  await video.saveAs(fileURLToPath(new URL('playback.webm', evidence)));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser?.close(); await server.close(); }
