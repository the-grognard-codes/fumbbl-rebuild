import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const conditions = ['distracted', 'chomped', 'rooted', 'dodgySnack', 'greasyCleats', 'eyeGouged'];
const { limitedAction: unusedAction, ...base } = initial.players[0];
const players = conditions.map((kind, index) => ({ ...base, id: `condition${index}`, name: `Condition ${kind}`,
  slot: index + 1, number: index + 1, x: 9 + Math.floor(index / 3) * 3, y: 4 + index % 3 * 3,
  state: 'is standing', status: 'Standing', conditions: [kind], art: { rosterId: 'human', positionId: 'lineman' } }));
players.push({ ...players[0], id: 'crowded', name: 'Crowded player', slot: 7, number: 7, x: 15, y: 7,
  state: 'is prone', status: 'Distracted', conditions, limitedAction: 'blitz' });
const state = { ...initial, players };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const evidence = fileURLToPath(new URL('../../.tools/negative-condition-review/borderless/', import.meta.url));
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000); page.setDefaultNavigationTimeout(30000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(view => { window.markerInput = { view, replay: false }; window.markerIntents = []; }, state);
  await page.route('**/negative-conditions-test', route => route.fulfill({ contentType: 'text/html', body:
    '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/skill-markers-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/negative-conditions-test`);
  await page.locator('.coach-match').waitFor();
  const tags = page.locator('.live-condition-marker');
  const limited = page.locator('.live-limited-action');
  const crowded = page.locator('[data-player-id="crowded"]');
  const publish = (view, replay = false) => page.evaluate(input => window.publishMarkerState(input), { view, replay });
  const openSettings = async () => {
    await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
    await page.getByRole('tab', { name: 'Interface', exact: true }).click();
  };
  const toggle = page.getByRole('checkbox', { name: 'Show negative condition markers', exact: true });
  const limitedToggle = page.getByRole('checkbox', { name: 'Show limited action tags', exact: true });
  const cardStatus = page.locator('.live-player-card-detail').filter({ has: page.locator('strong', { hasText: /^Status:$/ }) });
  assert.equal(await tags.count(), 12);
  assert.equal(await limited.count(), 1);
  assert.deepEqual(await crowded.locator('[data-condition]').evaluateAll(items => items.map(item => item.dataset.condition)), conditions);
  await crowded.focus();
  await cardStatus.waitFor();
  assert.equal(await cardStatus.locator('p').innerText(), 'Prone, Distracted, Chomped, Rooted, Dodgy Snack, Greasy Cleats, Eye Gouged');
  assert.equal(await cardStatus.locator('.live-negative-status').count(), 7);
  assert.ok(await cardStatus.locator('.live-negative-status').evaluateAll(items => items.every(item => getComputedStyle(item).color === 'rgb(255, 123, 136)')));
  await page.screenshot({ path: `${evidence}/all-conditions-status.png` });
  await openSettings();
  assert.equal(await toggle.isChecked(), true);
  await page.screenshot({ path: `${evidence}/interface-setting.png` });
  await toggle.uncheck(); assert.equal(await tags.count(), 0); assert.equal(await limited.count(), 1);
  await page.keyboard.press('Escape'); await crowded.focus(); await cardStatus.waitFor();
  assert.equal(await cardStatus.locator('.live-negative-status').count(), 7);
  await page.reload(); await openSettings(); assert.equal(await toggle.isChecked(), false);
  await toggle.check(); await limitedToggle.uncheck();
  assert.equal(await tags.count(), 12); assert.equal(await limited.count(), 0);
  await limitedToggle.check(); await page.keyboard.press('Escape');
  for (const callerRole of ['home', 'away', 'spectator']) {
    await publish({ ...state, callerRole }); assert.equal(await tags.count(), 12);
  }
  await publish(state, true); assert.equal(await tags.count(), 12);
  const cleared = { ...state, revision: state.revision + 1, players: state.players.map(player => ({ ...player, conditions: [] })) };
  await publish(cleared, true); assert.equal(await tags.count(), 0);
  await publish(state, true); assert.equal(await tags.count(), 12);
  // Reloaded recovery snapshots can restore conditions without another activation.
  await publish(state); await page.reload(); assert.equal(await tags.count(), 12);
  for (const posture of ['is prone', 'has been stunned']) {
    await publish({ ...state, players: state.players.map(player => ({ ...player, state: posture })) });
    assert.equal(await tags.count(), 12);
  }
  await publish({ ...state, players: state.players.map(player => player.id === 'crowded'
    ? { ...player, x: null, y: null, offPitch: 'reserve', state: 'is in reserve' } : player) });
  assert.equal(await tags.count(), 6); assert.equal(await limited.count(), 0);
  await publish(state);
  const before = await crowded.locator('.live-condition-marker').first().boundingBox();
  await publish({ ...state, players: state.players.map(player => player.id === 'crowded' ? { ...player, x: 18 } : player) });
  const after = await crowded.locator('.live-condition-marker').first().boundingBox();
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 10);
  await publish(state);
  const layout = await crowded.locator('.live-condition-marker, .live-limited-action').evaluateAll(items => items.map(item => ({
    left: parseFloat(item.style.left), top: parseFloat(item.style.top), width: item.getBoundingClientRect().width,
  })));
  const rows = Map.groupBy(layout, item => item.top);
  assert.deepEqual([...rows.values()].map(row => row.length), [3, 3, 1]);
  const centers = [...rows.values()].map(row => row.reduce((sum, item) => sum + item.left, 0) / row.length);
  assert.ok(centers.every(center => Math.abs(center - centers[0]) < .01));
  const limitedFade = await limited.evaluate(item => getComputedStyle(item, '::before').backgroundImage);
  assert.ok(await tags.evaluateAll(items => items.every(item => getComputedStyle(item).pointerEvents === 'none'
    && getComputedStyle(item, '::before').backgroundImage.includes('radial-gradient') && !item.querySelector('title') && !item.hasAttribute('title'))));
  assert.ok(await tags.evaluateAll((items, fade) => items.every(item =>
    getComputedStyle(item, '::before').backgroundImage === fade && !item.querySelector('svg > circle')), limitedFade));
  for (const size of [{ width: 1440, height: 1000 }, { width: 915, height: 412 }]) {
    await page.setViewportSize(size); await crowded.focus(); await cardStatus.waitFor();
    assert.equal(await cardStatus.locator('.live-negative-status').count(), 7);
    await page.screenshot({ path: `${evidence}/pitch-${size.width}.png` });
    await openSettings(); await toggle.scrollIntoViewIfNeeded();
    const menu = page.getByRole('dialog', { name: 'Game Menu', exact: true });
    assert.ok(await menu.evaluate(item => item.scrollWidth <= item.clientWidth));
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.markerIntents), []);
  console.log('Negative condition markers UI PASS: six symbols, red additive Status list, independent persisted toggle, both coaches/spectators, replay seeks/recovery snapshots, prone/stunned, movement, off-pitch hiding, centered 3/3/1 rows and mobile viewport.');
} finally { await browser.close(); await server.close(); }
