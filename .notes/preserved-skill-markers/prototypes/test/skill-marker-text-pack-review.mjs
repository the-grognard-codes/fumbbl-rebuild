// Export and validate the approved text artwork; no game state or mechanics are changed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { readRgbaPng } from '../../assets/game/scripts/png-art.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const output = join(repo, '.notes/player-skill-markers/text-full');
const manifest = JSON.parse(await readFile(join(output, '../manifest.json'), 'utf8'));
const markers = JSON.parse(await readFile(join(output, 'markers.json'), 'utf8'));
assert.equal(markers.length, 108);
assert.deepEqual(markers.map(row => [row.id, row.name, row.category, row.label]),
  manifest.entries.map(row => [row.id, row.name, row.category, row.shorthand]));
assert.equal(new Set(markers.map(row => row.label)).size, 108);
assert.ok(markers.every(row => /^[A-Z]{1,3}$/.test(row.label)));
assert.deepEqual((await readdir(join(output, 'icons'))).sort(), markers.map(row => row.id + '.svg').sort());
const previous = JSON.parse(await readFile(join(output, '../text-round-2/samples.json'), 'utf8'));
for (const marker of previous) {
  assert.equal(await readFile(join(output, 'icons', marker.id + '.svg'), 'utf8'),
    await readFile(join(output, '../text-round-2/icons', marker.id + '.svg'), 'utf8'),
    `${marker.id}: approved artwork is byte-for-byte unchanged`);
}
const serve = process.argv.includes('--serve');
const fontPath = join(repo, 'browser-client/public/assets/game/ui/fonts/ChakraPetch-Bold.ttf');
const server = createServer(async (request, response) => {
  const path = resolve(repo, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!(path.startsWith(output + sep) || path === fontPath)) { response.writeHead(404).end(); return; }
  try {
    const content = await readFile(path);
    const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done, reject) => { server.once('error', reject); server.listen(serve ? 5179 : 0, '127.0.0.1', done); });
const url = `http://127.0.0.1:${server.address().port}/.notes/player-skill-markers/text-full/review.html`;
console.log('Full text marker review:', url);
if (serve) await new Promise(() => {});
else {
  let browser;
  try {
    console.log('Launching artwork browser.');
    browser = await chromium.launch({ headless: true, timeout: 20000, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
    console.log('Opening artwork gallery.');
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(20000);
    const errors = [], missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('Gallery document loaded.');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    assert.equal(await page.locator('article').count(), 108);
    assert.equal(await page.locator('section').count(), 7);
    console.log('Loaded all 108 gallery markers; capturing review sheets.');
    const screenshots = [];
    await page.locator('main').screenshot({ path: join(output, 'all-text-markers.png') });
    screenshots.push('all-text-markers.png');
    for (const category of [...new Set(markers.map(row => row.category))]) {
      const section = page.locator(`section[data-category="${category}"]`);
      const count = category === 'TRAIT' ? 36 : 12;
      assert.equal(await section.locator('article').count(), count);
      const filename = category.toLowerCase() + '-text-markers.png';
      await section.screenshot({ path: join(output, filename) }); screenshots.push(filename);
    }
    const images = await page.evaluate(rows => {
      const exports = [];
      for (const row of rows) {
        const image = document.querySelector(`[data-marker-id="${row.id}"] .master img`);
        const sizes = [['master', row.masterWidth, 96], ...[['small', 16], ['medium', 20], ['large', 24]].map(([name, base]) => {
          const height = Math.max(base, row.label.length === 3 ? 20 : 14);
          return [name, Math.round(height * row.masterWidth / 96), height];
        })];
        for (const [size, width, height] of sizes) {
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(image, 0, 0, width, height);
          exports.push({ id: row.id, size, width, height, data: canvas.toDataURL('image/png').split(',')[1] });
        }
      }
      return exports;
    }, markers);
    const files = [];
    for (const marker of markers) {
      const svg = await readFile(join(output, marker.svg));
      assert.ok(svg.includes(Buffer.from(`viewBox="0 0 ${marker.masterWidth} 96"`)));
      assert.ok(!/<text\b|<image\b|<script\b|href=/.test(svg.toString()), 'font-independent, self-contained paths');
      files.push({ path: marker.svg, sha256: createHash('sha256').update(svg).digest('hex') });
    }
    for (const item of images) {
      const path = `png/${item.size}/${item.id}.png`;
      await mkdir(join(output, 'png', item.size), { recursive: true });
      const buffer = Buffer.from(item.data, 'base64'); await writeFile(join(output, path), buffer);
      const png = await readRgbaPng(join(output, path));
      assert.deepEqual([png.width, png.height], [item.width, item.height]);
      assert.ok(png.rgba[3] < 128, 'transparent outside corner');
      assert.ok(png.rgba.some((value, index) => index % 4 === 3 && value === 255), 'nonempty artwork');
      // The frame and lettering must not touch the outermost image edge at master size.
      if (item.size === 'master') {
        for (let x = 0; x < png.width; x++) {
          assert.equal(png.rgba[x * 4 + 3], 0);
          assert.equal(png.rgba[((png.height - 1) * png.width + x) * 4 + 3], 0);
        }
      }
      files.push({ path, width: item.width, height: item.height, sha256: createHash('sha256').update(buffer).digest('hex') });
    }
    await page.getByRole('searchbox', { name: 'Find marker' }).fill('SPH');
    assert.equal(await page.locator('article:visible').count(), 1);
    assert.equal(await page.locator('article:visible').getAttribute('data-marker-id'), 'safe-pair-of-hands');
    await page.getByRole('searchbox', { name: 'Find marker' }).fill('');
    await page.getByLabel('Category', { exact: true }).selectOption('TRAIT');
    assert.equal(await page.locator('article:visible').count(), 36);
    await page.getByLabel('Category', { exact: true }).selectOption('');
    for (const width of [915, 390]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const clipped = await page.locator('article').evaluateAll(cards => cards.some(card => card.scrollWidth > card.clientWidth));
      assert.equal(clipped, false, 'no clipped text at narrow viewport');
    }
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    await writeFile(join(output, 'export-index.json'), JSON.stringify(files, null, 2) + '\n');
    await writeFile(join(output, 'validation-report.json'), JSON.stringify({
      status: 'passed', identities: markers.length, categorySkills: 72, coreTraits: 36,
      svgCount: markers.length, pngCount: images.length, screenshots,
      approvedSamplesUnchanged: previous.length, manifestExactMatch: true, letterOnlyUniqueLabels: true,
      transparentPngs: true, searchAndCategoryFilters: true, responsiveWidths: [1600, 915, 390],
      browserErrors: errors, failedResponses: missing,
      scope: 'Artwork exports and review gallery only; no live-play, replay or recovery code changed.',
    }, null, 2) + '\n');
    console.log(`PASS: ${markers.length} SVGs, ${images.length} transparent PNGs, ${screenshots.length} sheets; ${previous.length} approved samples unchanged; all 108 match manifest.`);
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}
