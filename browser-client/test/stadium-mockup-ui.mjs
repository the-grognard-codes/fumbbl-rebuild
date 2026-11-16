import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { PitchProjection } from '../src/pitch-projection.ts';
import { MOCKUP_PLAYERS } from '../src/stadium-mockup.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const round = process.env.STADIUM_REVIEW_ROUND ?? 'round-2';
if (!/^round-[1-9][0-9]*$/.test(round)) throw Error('Invalid review round');
const output = fileURLToPath(new URL(`../../assets/game/references/stadiums/old-world-classic-mockup/${round}/`, import.meta.url));
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const errors = [], cases = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/stadium-mockup`);
  await page.locator('[data-player-id]').first().waitFor();
  const settle = async () => { await page.locator('[data-colors-ready=true]').waitFor(); await page.locator('[data-cloth-ready=true]').waitFor(); await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0)); await page.waitForTimeout(150); };
  for (const end of ['home', 'away']) for (const angle of [30, 40, 50, 90]) for (const focus of [0, 26]) {
    await page.getByLabel('Coach end', { exact: true }).selectOption(end);
    await page.getByLabel('Camera', { exact: true }).selectOption(String(angle));
    await page.getByLabel('Travel', { exact: true }).selectOption(String(focus));
    await settle();
    const geometry = await page.locator('.mockup-stage').evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
      cells: [...element.querySelectorAll('[data-cell-x]')].map(cell => ({ x: +cell.dataset.cellX, y: +cell.dataset.cellY, points: cell.getAttribute('points') })),
      players: [...element.querySelectorAll('[data-player-id]')].map(player => ({ id: player.dataset.playerId, x: +player.dataset.centerX, y: +player.dataset.centerY })) }));
    const camera = new PitchProjection({ width: geometry.width, height: geometry.height, end, focus, zoom: .75, mode: angle === 90 ? 'top-down' : 'perspective', perspectiveElevation: angle === 90 ? 40 : angle });
    assert.equal(geometry.cells.length, 390);
    for (const cell of geometry.cells) assert.equal(cell.points, camera.square(cell, 0, true).map(p => `${p.x},${p.y}`).join(' '));
    for (const player of geometry.players) { const model = MOCKUP_PLAYERS.find(candidate => candidate.id === player.id); const point = camera.project({ x: model.x + .5, y: model.y + .5 }); assert.ok(Math.abs(player.x - point.x) < .001 && Math.abs(player.y - point.y) < .001); }
    const name = `${end}-${angle}-${focus}`;
    await page.locator('.mockup-stage').screenshot({ path: `${output}${name}.png` });
    cases.push(name);
  }
  await page.getByLabel('Travel', { exact: true }).selectOption('13');
  await page.getByLabel('Coach end', { exact: true }).selectOption('home');
  for (const end of ['home', 'away']) for (const angle of [30, 40, 50, 90]) for (const zoom of [.5, 1, 2]) {
    await page.getByLabel('Coach end', { exact: true }).selectOption(end);
    await page.getByLabel('Camera', { exact: true }).selectOption(String(angle));
    await page.getByLabel('Zoom', { exact: true }).fill(String(zoom)); await settle();
    assert.equal(await page.locator('[data-mockup-turf] canvas').count(), 1);
    assert.equal(await page.locator('[data-cell-x]').count(), 390);
    assert.ok(await page.locator('[data-player-id]').count() > 0);
    assert.equal(await page.locator('.mockup-stage').evaluate(element => [...element.querySelectorAll('[style], polygon, path')].some(node => /NaN|Infinity/.test(`${node.getAttribute('style')} ${node.getAttribute('points')} ${node.getAttribute('d')}`))), false);
  }
  await page.getByLabel('Zoom', { exact: true }).fill('0.75');
  await page.getByLabel('Coach end', { exact: true }).selectOption('home');
  for (const angle of [30, 90]) for (const detail of ['calm', 'balanced', 'textured']) {
    await page.getByLabel('Camera', { exact: true }).selectOption(String(angle));
    await page.getByLabel('Pitch detail', { exact: true }).selectOption(detail); await settle();
    await page.locator('.mockup-stage').screenshot({ path: `${output}turf-${angle}-${detail}.png` });
  }
  await page.getByLabel('Camera', { exact: true }).selectOption('40');
  await page.getByLabel('Pitch detail', { exact: true }).selectOption('calm');
  for (const [index, preset] of ['identical', 'white / black', 'yellow / purple', 'similar blues', 'random'].entries()) {
    await page.getByLabel('Colour pair', { exact: true }).selectOption(preset); await settle();
    await page.locator('.mockup-stage').screenshot({ path: `${output}colours-${index}.png` });
  }
  await page.getByLabel('Colour pair', { exact: true }).selectOption('defaults'); await settle();
  await page.getByLabel('Visiting team', { exact: true }).selectOption('human'); await settle();
  await page.locator('.mockup-stage').screenshot({ path: `${output}human-mirror.png` });
  await page.getByLabel('Visiting team', { exact: true }).selectOption('orc');
  for (const layer of ['architecture', 'crowd', 'props', 'cloth', 'gestures', 'players']) {
    await page.getByLabel(layer, { exact: true }).uncheck();
    if (layer === 'crowd') assert.equal(await page.locator('[data-stadium-role=crowd]').count(), 0);
    if (layer === 'cloth') assert.equal(await page.locator('.mockup-cloth').count(), 0);
    if (layer === 'players') assert.equal(await page.locator('[data-player-id]').count(), 0);
    await page.getByLabel(layer, { exact: true }).check();
  }
  await settle();
  await page.getByLabel('Concept beside render').check(); await settle();
  await page.screenshot({ path: `${output}concept-comparison.png`, fullPage: true });
  await page.getByLabel('Concept beside render').uncheck();
  await page.setViewportSize({ width: 390, height: 844 }); await settle();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${output}android.png`, fullPage: true });
  // Explicit app and OS motion preferences both freeze the decorative layer.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByLabel('Reduced motion', { exact: true }).uncheck();
  await page.waitForFunction(() => document.querySelector('.mockup-stage').dataset.motion === 'true');
  assert.ok(await page.locator('[data-motion=torch]').count() > 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('.mockup-stage').dataset.motion === 'false');
  assert.equal(await page.locator('[data-motion=torch]').count(), 0);
  assert.equal(await page.locator('[data-motion=section-gesture]').count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(`${output}checks.json`, JSON.stringify({ cases, cellsPerCase: 390, playerAnchorParity: true, errors }, null, 2) + '\n');
  const sheets = { 'contact-home': cases.filter(name => name.startsWith('home')), 'contact-away': cases.filter(name => name.startsWith('away')),
    'contact-turf': [30, 90].flatMap(angle => ['calm', 'balanced', 'textured'].map(detail => `turf-${angle}-${detail}`)),
    'contact-colours': ['colours-0', 'colours-1', 'colours-2', 'colours-3', 'colours-4', 'human-mirror'] };
  const contact = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  for (const [name, files] of Object.entries(sheets)) {
    const figures = await Promise.all(files.map(async file => `<figure><img src="data:image/png;base64,${(await readFile(`${output}${file}.png`)).toString('base64')}"/><figcaption>${file}</figcaption></figure>`));
    await contact.setContent(`<style>body{margin:0;background:#151d23;color:#eee;font:16px sans-serif}main{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}figure{margin:0}img{width:100%;display:block}figcaption{padding:6px}</style><main>${figures.join('')}</main>`);
    await contact.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await contact.screenshot({ path: `${output}${name}.png`, fullPage: true });
  }
  await contact.close();
  console.log(`PASS: ${cases.length} gallery cameras, 390-cell and player-anchor parity, turf specimens, desktop and Android captures.`);
} finally { await browser.close(); await server.close(); }
