// Visual evidence capture for this throwaway prototype, not a gameplay test suite.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('./review/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1120 }, reducedMotion: 'reduce' });
const errors = [], checks = [];
const captureStyle = '.variant-switcher{position:static;transform:none;margin:20px auto 0;width:max-content;max-width:100%}';
page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
const expect = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
async function ready() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
    await Promise.all([...new Set([...document.querySelectorAll('svg image')].map(image => image.getAttribute('href')))].map(url => {
      const image = new Image(); image.src = url; return image.decode();
    }));
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
await page.goto('http://127.0.0.1:5182/pitch-preview?variant=gold');
await ready();
expect(await page.locator('.player-art').count() === 22, 'Busy scene loads all 22 player poses');
expect(await page.locator('.pitch-stage [data-action-marker]').count() === 4, 'Four consumed-action badges appear on the pitch');
expect(await page.locator('.catalog article').count() === 9, 'All nine actions appear in the catalog');
for (const variant of ['gold', 'gold-circle', 'gold-fade', 'ice']) {
  await page.locator(`[data-variant-choice="${variant}"]`).click();
  await ready();
  await page.screenshot({ path: `${output}${variant}-desktop.png`, fullPage: true, style: captureStyle });
  await page.locator('.match-frame').screenshot({ path: `${output}${variant}-pitch.png` });
  await page.getByLabel('Pitch snapshot').selectOption('statuses');
  await ready();
  expect(await page.locator('[data-player="H2"][data-status="is prone"] [data-action-marker="blitz"]').count() === 1, `${variant}: prone player retains badge`);
  expect(await page.locator('[data-player="H6"][data-status="has been stunned"] [data-action-marker="handOff"]').count() === 1, `${variant}: stunned player retains badge`);
  expect(await page.locator('[data-player="H8"][data-status="is distracted"] [data-action-marker="foul"]').count() === 1, `${variant}: distracted player retains badge`);
  await page.locator('.match-frame').screenshot({ path: `${output}${variant}-statuses.png` });
  await page.getByLabel('Pitch snapshot').selectOption('busy');
  if (variant === 'gold-circle' || variant === 'gold-fade') {
    const badge = page.locator('[data-player="H4"] .head-action .action-badge');
    const before = await badge.boundingBox();
    await page.getByLabel('Existing skill badges').uncheck(); await ready();
    const after = await badge.boundingBox();
    expect(Math.abs(before.x+before.width/2-after.x-after.width/2) < .1, `${variant}: action stays horizontally centered when skill badges are toggled`);
    await page.locator('.match-frame').screenshot({ path: `${output}${variant}-no-skills.png` });
    await page.getByLabel('Existing skill badges').check();
    await page.getByLabel('Pitch snapshot').selectOption('adjacent');
    await page.getByLabel('Playing scale').selectOption('1.9'); await ready();
    await page.locator('.match-frame').screenshot({ path: `${output}${variant}-adjacent-close.png` });
    await page.getByLabel('Playing scale').selectOption('1.35');
    await page.getByLabel('Pitch snapshot').selectOption('busy');
  }
}
await page.getByLabel('Pitch snapshot').selectOption('adjacent');
await page.getByLabel('Camera').selectOption('top-down');
await page.getByLabel('View from').selectOption('away');
await page.getByLabel('Playing scale').selectOption('1');
await ready();
await page.locator('.match-frame').screenshot({ path: `${output}ice-adjacent-away-top-down.png` });
await page.getByLabel('Pitch snapshot').selectOption('removed');
await ready();
expect(await page.locator('.pitch-stage [data-action-marker]').count() === 3, 'Off-pitch player and associated badge are hidden');
await page.getByLabel('Limited action tags', { exact: true }).uncheck();
expect(await page.locator('.pitch-stage [data-action-marker]').count() === 0, 'Visibility toggle hides all action badges');
await page.getByLabel('Limited action tags', { exact: true }).check();
expect(await page.locator('.pitch-stage [data-action-marker]').count() === 3, 'Visibility toggle restores remaining badges');
await page.getByLabel('Pitch snapshot').selectOption('adjacent');
await page.getByLabel('Camera').selectOption('perspective');
await page.getByLabel('View from').selectOption('home');
await page.getByLabel('Playing scale').selectOption('1.9');
await ready();
await page.locator('.match-frame').screenshot({ path: `${output}ice-adjacent-close.png` });
await page.getByLabel('Playing scale').selectOption('1.35');
await page.locator('[data-variant-choice="gold-fade"]').click();
for (const [name, width, height] of [['mobile-portrait',390,844], ['mobile-landscape',844,390]]) {
  await page.setViewportSize({ width, height });
  await ready();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal page overflow`);
  await page.screenshot({ path: `${output}${name}.png`, fullPage: true, style: captureStyle });
}
await page.setViewportSize({ width: 1440, height: 1120 });
await page.getByLabel('Pitch snapshot').selectOption('busy');
await page.locator('[data-variant-choice="gold-circle"]').click();
await page.getByLabel('Pitch snapshot').focus();
await page.keyboard.press('ArrowLeft');
expect(await page.locator('main').getAttribute('data-variant') === 'gold-circle', 'Arrow keys in select controls do not switch treatment');
await page.locator('h1').click();
await page.keyboard.press('ArrowLeft');
expect(await page.locator('main').getAttribute('data-variant') === 'gold', 'Arrow keys outside controls switch palette');
expect(new URL(page.url()).searchParams.get('variant') === 'gold', 'Palette choice is reflected in the URL');
await page.reload(); await ready();
expect(await page.locator('main').getAttribute('data-variant') === 'gold', 'Palette survives a page reload');
expect(errors.length === 0, `No browser, image, font, or HTTP errors: ${JSON.stringify(errors)}`);
await writeFile(`${output}checks.json`, JSON.stringify({ scope: 'Visual prototype only; no live-play/replay/recovery validation', checks, errors }, null, 2));
console.log(JSON.stringify({ output, checks: checks.length, errors }, null, 2));
await browser.close();
