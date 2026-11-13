// Transient artwork export/capture only. Leaves the managed debug environment stopped.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { readRgbaPng } from '../../assets/game/scripts/png-art.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const root = join(repo, 'browser-client');
const full = process.argv.includes('--full');
const round = full || process.argv.includes('--round=2') ? 2 : 1;
assert.ok(process.argv.slice(2).every(value => ['--round=2', '--full'].includes(value)), 'Only --round=2 and --full are supported');
const output = join(repo, full ? '.notes/player-skill-markers/illustrated-full' : `.notes/player-skill-markers/illustrated-round-${round}`);
const exportSizes = [['master', 216, 288], ['small', round === 2 ? 15 : 12, round === 2 ? 20 : 16], ['medium', 15, 20], ['large', 18, 24]];
const samples = JSON.parse(await readFile(join(output, full ? 'markers.json' : 'samples.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(output, '../manifest.json'), 'utf8'));
assert.equal(samples.length, full ? 108 : 9);
assert.equal(new Set(samples.map(row => row.category)).size, 7);
for (const row of samples) {
  const entry = manifest.entries.find(entry => entry.id === row.id);
  assert.deepEqual([row.name, row.category, row.label], [entry.name, entry.category, entry.shorthand]);
  await readFile(join(output, row.source));
}
if (full) {
  assert.deepEqual(samples.map(row => row.id), manifest.entries.map(row => row.id));
  for (const id of ['block', 'mighty-blow', 'pass', 'dirty-player', 'bone-head', 'loner']) {
    const metadata = JSON.parse(await readFile(join(output, 'prompts', id + '.json'), 'utf8'));
    const bytes = await readFile(join(output, metadata.source));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256, 'approved source preserved: ' + id);
  }
}
const errors = [], missing = [], captures = [];
const browser = await chromium.launch({ headless: true, timeout: 20000,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
let vite;
const rawServer = createHttpServer(async (request, response) => {
  const path = resolve(output, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!path.startsWith(output + sep)) { response.writeHead(404).end(); return; }
  try { const content = await readFile(path); response.writeHead(200, { 'Content-Type': path.endsWith('.png') ? 'image/png' : 'text/html' }); response.end(content); }
  catch { response.writeHead(404).end(); }
});
try {
  const sourceHtml = '<!doctype html><html><body>' + samples.map(row => `<img id="${row.id}" src="${row.source}" alt="${row.name}">`).join('') + '</body></html>';
  await writeFile(join(output, 'source-review.html'), sourceHtml);
  await new Promise(done => rawServer.listen(0, '127.0.0.1', done));
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
  await page.goto(`http://127.0.0.1:${rawServer.address().port}/source-review.html`);
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  const exports = await page.evaluate(({ rows, sizes }) => {
    const result = [];
    const boundsFor = image => {
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] >= 250) {
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      return [left, top, right - left + 1, bottom - top + 1];
    };
    const block = document.getElementById('block');
    const referenceBounds = boundsFor(block).map((value, i) => value / (i % 2 === 0 ? block.naturalWidth : block.naturalHeight));
    for (const row of rows) {
      const image = document.getElementById(row.id);
      // Opaque generation masters avoid extraction artifacts; use the reference frame bounds.
      const bounds = row.opaqueMaster ? referenceBounds.map((value, i) => value * (i % 2 === 0 ? image.naturalWidth : image.naturalHeight)) : boundsFor(image);
      for (const [size, width, height] of sizes) {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
        ctx.scale(width / 72, height / 96);
        ctx.beginPath(); ctx.moveTo(8, 1); ctx.lineTo(64, 1); ctx.lineTo(71, 8); ctx.lineTo(71, 88);
        ctx.lineTo(64, 95); ctx.lineTo(8, 95); ctx.lineTo(1, 88); ctx.lineTo(1, 8); ctx.closePath(); ctx.clip();
        ctx.drawImage(image, ...bounds, 1, 1, 70, 94);
        result.push({ id: row.id, size, width, height, bounds, data: canvas.toDataURL('image/png').split(',')[1] });
      }
    }
    return result;
  }, { rows: samples, sizes: exportSizes });
  const exportIndex = [];
  for (const row of exports) {
    const directory = join(output, 'png', row.size); await mkdir(directory, { recursive: true });
    const path = join(directory, row.id + '.png'); await writeFile(path, Buffer.from(row.data, 'base64'));
    const png = await readRgbaPng(path);
    exportIndex.push({ path: `png/${row.size}/${row.id}.png`, id: row.id, size: row.size, width: row.width, height: row.height,
      sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
    assert.deepEqual([png.width, png.height], [row.width, row.height]);
    assert.ok(png.rgba[3] < 128, 'transparent clipped-corner exterior');
    assert.ok(png.rgba.some((value, index) => index % 4 === 3 && value >= 250), `${row.id} ${row.size}: nonblank badge`);
    // No accidental transparent panel holes in the normalized master.
    if (row.size === 'master') {
      let holes = 0;
      for (let y = 25; y < png.height - 25; y++) for (let x = 25; x < png.width - 25; x++) {
        if (png.rgba[(y * png.width + x) * 4 + 3] < 240) holes++;
      }
      assert.equal(holes, 0, `${row.id}: opaque category panel`);
    }
  }
  console.log(`PASS: ${samples.length} core identities across 7 colors, ${exports.length} normalized PNGs, alpha/dimensions/panel checks.`);
  if (full) {
    await writeFile(join(output, 'export-index.json'), JSON.stringify(exportIndex, null, 2) + '\n');
    await page.goto(`http://127.0.0.1:${rawServer.address().port}/review.html`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    assert.equal(await page.locator('article').count(), 108);
    assert.equal(await page.locator('section[data-category]').count(), 7);
    await page.locator('main').screenshot({ path: join(output, 'all-illustrated-markers.png') }); captures.push('all-illustrated-markers.png');
    await page.locator('.direction').screenshot({ path: join(output, 'art-direction-review.png') }); captures.push('art-direction-review.png');
    for (const category of [...new Set(samples.map(row => row.category))]) {
      const section = page.locator(`section[data-category="${category}"]`);
      assert.equal(await section.locator('article').count(), category === 'TRAIT' ? 36 : 12);
      const filename = category.toLowerCase() + '-illustrated-markers.png';
      await section.screenshot({ path: join(output, filename) }); captures.push(filename);
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
      assert.equal(await page.locator('article').evaluateAll(cards => cards.some(card => card.scrollWidth > card.clientWidth)), false);
    }
  } else {
  const font = (await readFile(join(root, 'public/assets/game/ui/fonts/ChakraPetch-Bold.ttf'))).toString('base64');
  const descriptions = {
    block: 'Crossed armored forearms', dodge: 'Boot slipping around an incoming arrow',
    'mighty-blow': 'Fist striking an impact burst', claws: 'Three oversized hooked talons',
    pass: 'Football and curved throwing arc', 'dirty-player': 'Studded boot stomping a prone helmet',
    'bone-head': 'Vacant ogre with an empty forehead', loner: round === 2 ? 'Lone helmet within an open ring' : 'Isolated player separated from teammates',
    'secret-weapon': 'Weapon concealed within a hooded cloak',
  };
  const previous = new Map();
  if (round === 2) for (const row of samples) {
    previous.set(row.id, 'data:image/png;base64,' + (await readFile(join(output, '../illustrated-round-1/png/master', row.id + '.png'))).toString('base64'));
  }
  const cards = samples.map(row => `<article>` + (round === 2
    ? `<div style="display:flex;justify-content:center;gap:28px"><div><img class="master" src="${previous.get(row.id)}" width="90" height="120" alt="${row.name} round 1"><small>Round 1</small></div><div><img class="master" src="png/master/${row.id}.png" width="90" height="120" alt="${row.name} round 2"><small>Round 2</small></div></div>`
    : `<img class="master" src="png/master/${row.id}.png" width="108" height="144" alt="${row.name} candidate">`) +
    `<h2>${row.name}</h2><p style="color:${row.fill === '#10141A' ? '#b4c7d5' : row.fill}">${row.category === 'TRAIT' ? 'Core trait' : row.category}</p><p class="description">${descriptions[row.id]}</p><div class="sizes">` +
    exportSizes.slice(1).map(([size, width, height]) => `<div><img src="png/${size}/${row.id}.png" width="${width}" height="${height}" alt="${row.name} ${size}"><small>${size[0].toUpperCase()} ${height}px</small></div>`).join('') + '</div>' +
    (round === 2 ? `<div class="sizes"><div><img src="${previous.get(row.id)}" width="15" height="20" alt="${row.name} before at 20px"><small>Before 20px</small></div><div><img src="png/medium/${row.id}.png" width="15" height="20" alt="${row.name} after at 20px"><small>After 20px</small></div></div>` : '') + '</article>').join('');
  const gallery = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Illustrated skill markers - first candidates</title><style>
@font-face{font-family:Chakra;src:url(data:font/ttf;base64,${font});font-weight:700}*{box-sizing:border-box}body{background:#091726;color:#d9e9f7;font:15px system-ui;margin:0}main{max-width:1350px;padding:28px;margin:auto}h1,h2{font-family:Chakra,system-ui}h1{margin:10px 0;font-size:28px}header>small{color:#49dfff;letter-spacing:.12em}header p{line-height:1.6;color:#b4c7d5}a{color:#49dfff}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:24px}article{background:#102335;border:1px solid #385064;border-radius:7px;padding:18px;text-align:center}img{display:block}.master{margin:auto}h2{font-size:18px;margin:10px 0 4px}article p{margin:4px 0;font-size:13px}.description{color:#b4c7d5;min-height:36px}.sizes{display:flex;align-items:end;justify-content:center;gap:30px;height:50px}.sizes div{display:flex;flex-direction:column;align-items:center;gap:5px}small{color:#b4c7d5;font-size:11px}footer{margin-top:24px;line-height:1.6;color:#b4c7d5}@media(max-width:700px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:14px}.sizes{gap:20px}}@media(max-width:390px){article{padding:12px 8px}.sizes{gap:14px}}</style></head><body><main><header><small>MOLES UNDER THE PITCH · ART REVIEW · ROUND 1</small><h1>Illustrated skill marker candidates</h1><p>Nine original candidates across all seven category colors. Large art and actual 16 / 20 / 24 px exports are shown together. No abbreviation or value is printed on an illustrated marker.</p><p><a href="pitch-medium.png">Medium pitch</a> · <a href="pitch-crowded.png">Crowded spacing</a> · <a href="pitch-android-landscape.png">Android layout</a> · <a href="README.md">Review notes</a></p></header><div class="grid">${cards}</div><footer>At 16 px, fine features soften; compare silhouettes and category recognition before choosing an illustrated minimum. Loner and Dirty Player may benefit from simpler shapes in the next round.<br>Artwork candidates only. Production marker integration and parameter variants are pending review.</footer></main></body></html>`;
  const finalGallery = round === 1 ? gallery : gallery.replace('ROUND 1', 'ROUND 2')
    .replace('repeat(2,minmax(0,1fr))', 'repeat(1,minmax(0,1fr))')
    .replace('Large art and actual 16 / 20 / 24 px exports are shown together.', 'Before/after artwork is shown at equal sizes. Small and Medium have a 20 px floor; Large starts at 24 px.')
    .replace('At 16 px, fine features soften; compare silhouettes and category recognition before choosing an illustrated minimum. Loner and Dirty Player may benefit from simpler shapes in the next round.', '20 px illustrated minimum, deeper colored panels, fewer internal details. Text-marker artwork and sizing are unchanged.');
  await writeFile(join(output, 'review.html'), finalGallery);
  await page.goto(`http://127.0.0.1:${rawServer.address().port}/review.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.locator('article').count(), 9);
  await page.locator('main').screenshot({ path: join(output, 'illustrated-candidate-board.png') }); captures.push('illustrated-candidate-board.png');
  await page.setViewportSize({ width: 390, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.close(); await new Promise(done => rawServer.close(done));

  vite = await createServer({ root, configFile: false, cacheDir: join(process.env.TEMP ?? '/tmp', 'fumbbl-illustrated-review-vite'),
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repo] } } });
  await vite.listen();
  const url = vite.resolvedUrls.local[0] + '@fs/' + output.replaceAll('\\', '/') + '/preview.html';
  const preview = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  preview.on('pageerror', error => errors.push(error.message));
  preview.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
  const settle = async target => {
    await target.evaluate(() => document.fonts.ready);
    await target.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    await target.waitForTimeout(200);
    if (round === 2) {
      const heights = await target.locator('.live-marker .sample-marker-icon').evaluateAll(icons => icons.map(icon => icon.getBoundingClientRect().height));
      assert.ok(heights.every(height => height >= 20 - .01), 'every illustrated pitch icon retains a 20px minimum');
    }
  };
  const capture = async name => {
    await preview.locator('.marker-text-prototype').screenshot({ path: join(output, name + '.png') }); captures.push(name + '.png');
  };
  await preview.goto(url + '?view=icons'); await preview.locator('.specimen').first().waitFor(); await settle(preview);
  assert.equal(await preview.locator('.specimen').count(), full ? 108 : 9); await capture('illustrated-contact-sheet');
  await preview.getByRole('button', { name: 'On the pitch', exact: true }).click();
  await preview.locator('.sample-marker-anchor').first().waitFor(); await settle(preview);
  assert.equal(await preview.locator('.live-marker > img').count(), 12);
  assert.equal(await preview.locator('.live-marker .sample-overflow').count(), 1);
  for (const size of ['Small', 'Medium', 'Large']) {
    await preview.getByRole('button', { name: size, exact: true }).click(); await settle(preview); await capture('pitch-' + size.toLowerCase());
  }
  await preview.getByRole('button', { name: 'Medium', exact: true }).click();
  await preview.getByRole('button', { name: 'Overview', exact: true }).click(); await settle(preview);
  const before = await preview.locator('[data-player-id="h-ogre"]').getByAltText('Loner', { exact: true }).boundingBox();
  await capture('pitch-overview');
  await preview.getByRole('button', { name: 'Detail', exact: true }).click(); await settle(preview);
  const after = await preview.locator('[data-player-id="h-ogre"]').getByAltText('Loner', { exact: true }).boundingBox();
  assert.ok(after.height > before.height + 1); await capture('pitch-detail');
  await preview.getByRole('button', { name: 'Crowded', exact: true }).click(); await settle(preview); await capture('pitch-crowded');
  await preview.locator('[data-player-id="h-ogre"]').hover();
  assert.ok((await preview.getByRole('tooltip', { name: 'Borr player card' }).innerText()).includes('Bone Head, Loner, Mighty Blow, Block'));
  await capture('pitch-player-card'); await preview.mouse.move(4, 4);
  const menu = preview.getByRole('dialog', { name: 'Game Menu', exact: true });
  await preview.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await menu.getByRole('tab', { name: 'Skills & Traits', exact: true }).click();
  await menu.getByRole('checkbox', { name: 'Show Big Guy negatraits and Secret Weapon', exact: true }).uncheck();
  await preview.keyboard.press('Escape'); await settle(preview);
  for (const name of ['Bone Head', 'Secret Weapon']) assert.equal(await preview.locator('.live-marker').getByAltText(name, { exact: true }).count(), 0);
  assert.ok(await preview.locator('.live-marker').getByAltText('Loner', { exact: true }).count() > 0);
  await capture('pitch-traits-filtered');
  const touchContext = await browser.newContext({ viewport: { width: 915, height: 610 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const touch = await touchContext.newPage();
  touch.on('pageerror', error => errors.push(error.message));
  await touch.goto(url); await touch.locator('.sample-marker-anchor').first().waitFor(); await settle(touch);
  assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await touch.locator('.marker-text-prototype').screenshot({ path: join(output, 'pitch-android-landscape.png') }); captures.push('pitch-android-landscape.png');
  await touch.locator('[data-player-id="h-ogre"]').tap();
  await touch.getByRole('tooltip', { name: 'Borr player card' }).waitFor();
  await touchContext.close();
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  await writeFile(join(output, 'capture-report.json'), JSON.stringify({ status: 'passed', round: full ? 'complete pack' : round, candidates: samples.length, paletteCategories: 7,
    approvedSourcesReused: full ? 6 : 0, gallerySearchAndCategoryFilters: full,
    minimumIllustratedHeight: round === 2 ? 20 : 14, nativeExportSizes: exportSizes,
    pngExports: exports.length, screenshots: captures, projectedZoomHeights: [before.height, after.height],
    opaquePanels: true, transparentFrameCorners: true, playerSprites: 12, overflow: true,
    fullPlayerCard: true, bigGuyFilterPreservesLoner: true, touchCard: true, browserErrors: errors, failedAssets: missing,
    environment: 'Transient Windows Chrome artwork capture; managed debug services remain stopped.',
  }, null, 2) + '\n');
  console.log(`PASS: ${captures.length} review images, zoom/filter/overflow/card/touch checks; no runtime or asset errors.`);
} finally {
  await browser.close();
  if (rawServer.listening) await new Promise(done => rawServer.close(done));
  await vite?.close();
}
