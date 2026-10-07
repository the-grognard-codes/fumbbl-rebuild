import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { squarePosition } from './projected-pitch-helper.mjs';
const native = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const players = [
  { ...native.players[0], id: 'p1', name: 'Alice', role: 'home', state: 'is standing', x: 12, y: 5, offPitch: 'pitch' },
  { ...native.players[0], id: 'p2', name: 'Bob', role: 'home', state: 'is standing', x: 14, y: 8, offPitch: 'pitch' },
  { ...native.players[1], id: 'p3', name: 'Carol', role: 'away', state: 'is standing', x: 17, y: 9, offPitch: 'pitch' }
];
const base = { ...native, players, activePlayerId: null, actions: [], revision: 1 };
const action = (id, kind, sourcePlayerId, target, label = id) => ({ id: '1:' + id, kind, actor: 'home', sourcePlayerId, target, label });
const record = { index: 0, revision: 0, kind: 'START', actor: 'system', at: 1700000000000, decision: null,
  native: [{ reportId: 'quickSnapRoll', roll: 3, players: 6 }], state: { ...base, revision: 0 } };
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const errors = [], failures = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(4000);
page.on('pageerror', error => errors.push(error.message));
async function open(state, records = []) {
  await page.addInitScript(({ state, records }) => {
    window.adjustmentState = state; window.adjustmentRecords = records; window.adjustmentIntents = [];
  }, { state, records });
  await page.route('**/adjustments-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/match-adjustments-harness.tsx"></script>' }));
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/adjustments-test');
  await page.locator('.coach-match').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function run(name, callback) {
  if (process.env.MATCH_ADJUSTMENT_CASE && process.env.MATCH_ADJUSTMENT_CASE !== name) return;
  try { await callback(); console.log('PASS ' + name);
    if (process.env.MATCH_ADJUSTMENT_EVIDENCE_DIR) {
      await mkdir(process.env.MATCH_ADJUSTMENT_EVIDENCE_DIR, { recursive: true });
      await page.screenshot({ path: process.env.MATCH_ADJUSTMENT_EVIDENCE_DIR + '/' + name + '.png' });
    }
  }
  catch (error) { failures.push(name + ': ' + error.message); console.error('FAIL ' + name + ': ' + error.message); }
}
try {
  await run('log', async () => {
    await open(base, [record]);
    for (const [size, pixels] of [['Small', 12], ['Medium', 14], ['Large', 18]]) {
      await page.getByRole('button', { name: size + ' log text' }).click();
      assert.equal(await page.locator('.match-event-scroll p').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize)), pixels,
        'The actual entry text must follow the selected size');
    }
    await page.reload();
    assert.equal(await page.getByRole('button', { name: 'Large log text' }).getAttribute('aria-pressed'), 'true');
  });
  await run('kick', async () => {
    await open({ ...base, phase: 'READY_FOR_KICKOFF', turnMode: 'KICKOFF',
      actions: [action('kick-15-7', 'kickoff', null, { x: 15, y: 7 }, 'Kick to 15, 7')] });
    await page.locator('[data-player-id="p1"]').focus(); await page.keyboard.press('Enter');
    const square = await squarePosition(page, 15, 7), rect = await page.locator('.live-pitch-scene').boundingBox();
    await page.mouse.click(rect.x + square.x, rect.y + square.y);
    assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isEnabled(), true,
      'A kick target is selectable even after inspecting a player');
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.adjustmentIntents), [{ operation: 'action', fields: { actionId: '1:kick-15-7' } }]);
  });
  await run('quick-snap', async () => {
    const move = action('event-p1-13-5', 'kickoffMove', 'p1', { x: 13, y: 5 }, 'Alice to 13, 5');
    await open({ ...base, turnMode: 'QUICK_SNAP', kickoff: { version: 1, event: 'QUICK_SNAP', actor: 'home', stage: 'movement', allowed: 5, completed: 2, selected: 0 },
      actions: [move, action('event-p2-15-8', 'kickoffMove', 'p2', { x: 15, y: 8 }), action('end-event', 'kickoffChoice', null, null, 'Finish QUICK_SNAP')] });
    await page.locator('[data-player-id="p1"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.live-target-square').count(), 1, 'Only the selected player has move highlights');
    const square = await squarePosition(page, 13, 5), rect = await page.locator('.live-pitch-scene').boundingBox();
    await page.mouse.click(rect.x + square.x, rect.y + square.y);
    assert.deepEqual(await page.evaluate(() => window.adjustmentIntents), [{ operation: 'action', fields: { actionId: move.id } }],
      'The one-square choice submits only the selected offered move');
    assert.match(await page.getByRole('status', { name: 'Current game step' }).textContent(), /Quick Snap!.*5.*2.*3/s);
  });
  await run('status', async () => {
    await open({ ...base, turnMode: 'TOUCHBACK', actor: 'away', actions: [ { ...action('touch-p3', 'touchback', null, { playerId: 'p3' }, 'Give ball to Carol'), actor: 'away' }] });
    const banner = page.getByRole('status', { name: 'Current game step' });
    assert.match(await banner.textContent(), /Touchback!.*assign the ball/i);
    const bannerBox = await banner.boundingBox(), turnBox = await page.locator('.live-turn-track.home').boundingBox();
    assert.ok(bannerBox.y >= turnBox.y + turnBox.height, 'Game-step text appears below the turn counter');
    await page.evaluate(state => window.publishAdjustment({ ...state, turnMode: 'CHARGE',
      kickoff: { version: 1, event: 'CHARGE', actor: 'home', stage: 'selection', allowed: 4, completed: 0, selected: 1 } }), base);
    assert.match(await banner.textContent(), /Charge!.*4.*Blitz.*Throw teammate.*Kick Teammate/s);
  });
  await run('debug', async () => {
    await open(base);
    assert.equal(await page.getByLabel('Perspective angle', { exact: true }).count(), 0);
    const toggle = page.getByRole('button', { name: 'Debug', exact: true });
    await toggle.click();
    assert.equal(await page.getByLabel('Perspective angle', { exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('region', { name: 'Match debug' }).isVisible(), true);
    assert.match(await page.getByRole('region', { name: 'Match debug' }).textContent(), /Movement plan/);
    assert.deepEqual(await page.evaluate(() => window.adjustmentIntents), []);
    await toggle.click();
    assert.equal(await page.getByLabel('Perspective angle', { exact: true }).count(), 0);
  });
  if (process.env.MATCH_ADJUSTMENT_EVIDENCE_DIR) {
    await mkdir(process.env.MATCH_ADJUSTMENT_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: process.env.MATCH_ADJUSTMENT_EVIDENCE_DIR + '/match-adjustments.png' });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
} finally { await browser.close(); await server.close(); }
