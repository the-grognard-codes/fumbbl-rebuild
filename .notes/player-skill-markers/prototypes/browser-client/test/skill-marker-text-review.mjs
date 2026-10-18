// Reproducible art-review captures; this does not run or mutate a game server.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { readRgbaPng } from '../../assets/game/scripts/png-art.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('../../.notes/player-skill-markers/text-round-1/', import.meta.url));
const samples = JSON.parse(await readFile(join(output, 'samples.json'), 'utf8'));
const serve = process.argv.includes('--serve');
const server = await createServer({ root, configFile: false,
  cacheDir: join(process.env.TEMP ?? '/tmp', 'fumbbl-skill-marker-vite'),
  server: { host: '127.0.0.1', port: serve ? 5177 : 0, strictPort: serve, fs: { allow: [repo] } },
});
await server.listen();
const url = server.resolvedUrls.local[0] + 'skill-markers-text-prototype.html';
console.log('Text marker review:', url);
if (serve) await new Promise(() => {});
else {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const errors = [], missing = [], captures = [], measurements = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
    const settle = async () => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
      await page.waitForTimeout(250);
    };
    const capture = async name => {
      await page.locator('.marker-text-prototype').screenshot({ path: join(output, name + '.png') });
      captures.push(name + '.png');
    };
    await page.goto(url + '?view=icons');
    await page.locator('.specimen').first().waitFor();
    await settle();
    assert.equal(await page.locator('.specimen').count(), 14);
    await capture('text-markers-contact-sheet');
    const exports = await page.evaluate(async rows => {
      const images = [];
      for (const sample of rows) {
        const image = document.querySelector(`[data-sample-id="${sample.id}"] .specimen-master img`);
        for (const [size, width, height] of [['master', 72, 96], ['small', 12, 16], ['medium', 15, 20], ['large', 18, 24]]) {
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(image, 0, 0, width, height);
          images.push({ id: sample.id, size, width, height, png: canvas.toDataURL('image/png').split(',')[1] });
        }
      }
      return images;
    }, samples);
    for (const item of exports) {
      const directory = join(output, 'png', item.size); await mkdir(directory, { recursive: true });
      const target = join(directory, item.id + '.png');
      await writeFile(target, Buffer.from(item.png, 'base64'));
      const png = await readRgbaPng(target);
      assert.deepEqual([png.width, png.height], [item.width, item.height]);
      assert.ok(png.rgba[3] < 128, 'corner retains alpha; native-size edge can be antialiased');
      assert.ok(png.rgba.some((value, index) => index % 4 === 3 && value === 255), 'badge is not blank');
    }
    await page.getByRole('button', { name: 'On the pitch', exact: true }).click();
    await page.locator('.sample-marker-anchor').first().waitFor();
    await settle();
    assert.equal(await page.locator('.live-marker > img').count(), 12, 'real player sprites render');
    assert.equal(await page.locator('.sample-marker-anchor').count(), 12);
    assert.equal(await page.locator('.live-marker .sample-overflow').count(), 1);
    for (const size of ['Small', 'Medium', 'Large']) {
      await page.getByRole('button', { name: size, exact: true }).click(); await settle();
      await page.mouse.move(4, 4);
      await capture('pitch-' + size.toLowerCase());
      measurements.push(await page.locator('.live-pitch-scene').evaluate(scene => ({
        size: document.querySelector('main').dataset.size, players: scene.querySelectorAll('.live-marker').length,
        cards: scene.querySelectorAll('.sample-marker-icon').length,
        width: scene.getBoundingClientRect().width, height: scene.getBoundingClientRect().height,
      })));
    }
    await page.getByRole('button', { name: 'Medium', exact: true }).click();
    await page.getByRole('button', { name: 'Detail', exact: true }).click(); await settle();
    await page.mouse.move(4, 4); await capture('pitch-detail-medium');
    await page.getByRole('button', { name: 'Crowded', exact: true }).click(); await settle();
    await page.mouse.move(4, 4); await capture('pitch-crowded-medium');
    await page.getByRole('button', { name: 'Open spacing', exact: true }).click(); await settle();
    const ogre = page.locator('[data-player-id="h-ogre"]'); await ogre.hover();
    await page.getByRole('tooltip', { name: 'Borr player card' }).waitFor();
    await capture('pitch-hover-full-list');
    const hoverText = await page.getByRole('tooltip', { name: 'Borr player card' }).innerText();
    assert.ok(hoverText.includes('Bone Head, Loner, Mighty Blow, Guard'));
    await page.mouse.move(4, 4);
    const mobile = await browser.newContext({ viewport: { width: 915, height: 610 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const touch = await mobile.newPage();
    touch.on('pageerror', error => errors.push(error.message));
    await touch.goto(url + '?size=medium');
    await touch.locator('.sample-marker-anchor').first().waitFor();
    await touch.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    await touch.locator('.marker-text-prototype').screenshot({ path: join(output, 'pitch-android-landscape.png') });
    captures.push('pitch-android-landscape.png');
    assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal page overflow');
    const touchAnchors = await touch.locator('.live-marker').evaluateAll(hosts => hosts.map(host => {
      const row = host.querySelector('.sample-marker-row').getBoundingClientRect();
      const box = host.getBoundingClientRect();
      return Math.abs((row.left + row.right) / 2 - (box.left + box.right) / 2);
    }));
    assert.ok(touchAnchors.every(delta => delta <= 1), 'touch badges remain centered after responsive projection updates');
    await touch.locator('[data-player-id="h-ogre"]').tap();
    await touch.getByRole('tooltip', { name: 'Borr player card' }).waitFor();
    await touch.locator('.marker-text-prototype').screenshot({ path: join(output, 'pitch-android-player-card.png') });
    captures.push('pitch-android-player-card.png');
    await mobile.close();
    assert.deepEqual(errors, [], 'no browser runtime errors');
    assert.deepEqual(missing, [], 'no missing asset responses');
    await writeFile(join(output, 'capture-report.json'), JSON.stringify({ status: 'passed',
      renderer: 'Existing LivePitch and existing human/orc sprites; isolated art-review fixture',
      sampleCount: samples.length, svgCount: samples.length, pngCount: exports.length, captures, measurements,
      hoverFullList: true, touchLandscape: true, touchPlayerCard: true, errors, missing,
      limitations: ['Windows Chrome and Android touch emulation; no native Android or Linux run.',
        'Mutation and Animosity specimens use orc art as a visual stand-in, not a legal roster assertion.',
        'No game-server, replay, or recovery behavior is changed or validated by this preview.'],
    }, null, 2) + '\n');
    console.log('PASS:', samples.length, 'SVGs;', exports.length, 'transparent PNGs;', captures.length, 'review captures.');
    console.log('PASS: current player art, overflow and full hover list; Android touch layout; no asset/runtime errors.');
    console.log('Saved:', output);
  } finally { await browser.close(); await server.close(); }
}
