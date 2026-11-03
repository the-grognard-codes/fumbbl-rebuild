import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const evidence = new URL('../../.tools/sprite-proof/review-helmet/', import.meta.url);
await mkdir(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(server.resolvedUrls.local[0] + 'test/sprite-proof.html');
  await page.getByRole('heading', { name: 'Shared sprite format', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#animation-proof canvas');
    return canvas && canvas.getContext('2d').getImageData(0, 0, 64, 64).data.some((value, index) => index % 4 === 3 && value > 0);
  });
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await page.getByRole('button', { name: 'Restart animation', exact: true }).click();
  assert.equal(await page.locator('[data-animation-frame]').getAttribute('data-animation-frame'), '0');
  await page.getByRole('button', { name: 'Next frame', exact: true }).click();
  assert.equal(await page.locator('[data-animation-frame]').getAttribute('data-animation-frame'), '1');
  for (const direction of ['front45', 'back45']) {
    await page.getByLabel('Animation view').selectOption(direction);
    await page.locator('#animation-proof').screenshot({ path: fileURLToPath(new URL(`animation-${direction}.png`, evidence)) });
  }
  await page.getByLabel('Animation clip').selectOption('fall');
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-animation-frame]').dataset.animationFrame === '3');
  await page.waitForTimeout(900);
  assert.equal(await page.locator('[data-animation-frame]').getAttribute('data-animation-frame'), '3');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByLabel('Animation clip').selectOption('move');
  assert.equal(await page.locator('[data-animation-frame]').getAttribute('data-animation-frame'), '0');
  assert.equal(await page.getByRole('button', { name: 'Next frame', exact: true }).isDisabled(), true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
  for (const mode of ['perspective', 'top-down']) {
    await page.getByLabel('Anchor mode').selectOption(mode);
    for (const mirrored of [false, true]) {
      await page.getByLabel('Mirror pitch sprite').setChecked(mirrored);
      assert.equal(await page.locator('.proof-placement').evaluate(stage => {
        const viewport = stage.getBoundingClientRect(), image = stage.querySelector('img').getBoundingClientRect();
        return image.left >= viewport.left && image.right <= viewport.right && image.top >= viewport.top && image.bottom <= viewport.bottom;
      }), true, `entire ${mode} sprite canvas fits with mirror=${mirrored}`);
    }
  }
  await page.getByLabel('Anchor mode').selectOption('perspective');
  await page.getByLabel('Mirror pitch sprite').uncheck();
  await page.locator('.proof-comparisons').screenshot({ path: fileURLToPath(new URL('lineman-original-and-materials.png', evidence)) });
  const original = await page.getByAltText('body Original').getAttribute('src');
  const initial = await page.getByAltText('body Recolored').getAttribute('src');
  const initialHelmet = await page.getByAltText('helmet Recolored').getAttribute('src');
  const primary = page.getByRole('group', { name: 'Primary color', exact: true });
  const secondary = page.getByRole('group', { name: 'Secondary color', exact: true });
  assert.equal(await primary.getByRole('radio').count(), 16);
  assert.equal(await secondary.getByRole('radio').count(), 16);
  assert.equal(await primary.locator('select').count(), 0);
  assert.equal(await secondary.locator('select').count(), 0);
  await primary.getByRole('radio', { name: 'Navy', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await primary.getByRole('radio', { name: 'Ivory', exact: true }).isChecked(), true);
  await primary.getByText('Red', { exact: true }).click();
  await secondary.getByText('Gold', { exact: true }).click();
  assert.equal(await primary.getByRole('radio', { name: 'Red', exact: true }).isChecked(), true);
  assert.equal(await secondary.getByRole('radio', { name: 'Gold', exact: true }).isChecked(), true);
  assert.notEqual(await page.getByAltText('body Recolored').getAttribute('src'), initial);
  assert.equal(await page.getByAltText('body Original').getAttribute('src'), original);
  const busts = await page.locator('.proof-consumers img').evaluateAll(images => images.map(image => image.src));
  assert.equal(busts.length, 4); assert.equal(new Set(busts).size, 1);
  const helmetUrl = await page.getByAltText('helmet Recolored').getAttribute('src');
  assert.notEqual(helmetUrl, initialHelmet);
  assert.equal(await page.getByAltText('Team name helmet').getAttribute('src'), helmetUrl);
  assert.deepEqual(await page.locator('.proof-splash-previews img').evaluateAll(images => images.map(image => image.getAttribute('src'))), Array(3).fill(helmetUrl));
  for (const headline of ['START OF TURN 3', 'TURNOVER', 'TOUCHDOWN']) assert.equal(await page.getByRole('heading', { name: headline, exact: true }).count(), 1);
  await page.locator('.proof-helmet-images').screenshot({ path: fileURLToPath(new URL('helmet-original-and-materials.png', evidence)) });
  await page.locator('.proof-splash-previews').screenshot({ path: fileURLToPath(new URL('helmet-splashes.png', evidence)) });
  await page.getByLabel('Enlargement').selectOption('1');
  await page.screenshot({ path: fileURLToPath(new URL('palette-review.png', evidence)), fullPage: true });
  await page.getByLabel('Mirror pitch sprite').check();
  assert.equal(await page.getByAltText('body Recolored').evaluate(image => getComputedStyle(image).transform), 'matrix(-1, 0, 0, 1, 0, 0)');
  await page.getByLabel('Anchor mode').selectOption('top-down');
  assert.equal(await page.locator('.proof-placement').getAttribute('data-anchor'), 'body-center');
  await page.getByRole('button', { name: 'Light / light', exact: true }).click();
  assert.equal(await primary.getByRole('radio', { name: 'White', exact: true }).isChecked(), true);
  assert.equal(await secondary.getByRole('radio', { name: 'White', exact: true }).isChecked(), true);
  await page.locator('.proof-comparisons').screenshot({ path: fileURLToPath(new URL('light-light.png', evidence)) });
  await page.getByRole('button', { name: 'Dark / dark', exact: true }).click();
  await page.locator('.proof-comparisons').screenshot({ path: fileURLToPath(new URL('dark-dark.png', evidence)) });
  for (const kind of ['body', 'bust', 'helmet']) {
    await page.getByLabel('Sheet artwork').selectOption(kind);
    await page.waitForFunction(expected => document.querySelector('.proof-sheet canvas').width === expected, kind === 'body' ? 1152 : kind === 'bust' ? 2688 : 5504);
    // Wait for React's passive effect to paint the sheet before exporting.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const data = await page.locator('.proof-sheet canvas').evaluate(canvas => canvas.toDataURL().split(',')[1]);
    await writeFile(new URL(`${kind}-256-pairs.png`, evidence), Buffer.from(data, 'base64'));
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await secondary.getByText('Red', { exact: true }).click();
  assert.equal(await secondary.getByRole('radio', { name: 'Red', exact: true }).isChecked(), true);
  await page.screenshot({ path: fileURLToPath(new URL('mobile-static.png', evidence)), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile overflow stays inside scrollable sheets');
  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-results.json', evidence), JSON.stringify({ browser: await browser.version(), platform: process.platform,
    cases: ['two 16-color radio grids', 'keyboard selection', 'independent palette changes', 'original unchanged', 'four shared bust consumers', 'mirror', 'anchor modes', 'equal-color pairs', 'both 256-pair sheets', 'mobile selection/reduced-motion static'], errors }, null, 2));
  console.log('Sprite proof browser checks passed; evidence: ' + fileURLToPath(evidence));
} finally { await browser?.close(); await server.close(); }
