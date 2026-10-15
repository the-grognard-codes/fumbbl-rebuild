import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
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
    await page.mouse.move(rect.x + square.x, rect.y + square.y);
    const ball = page.locator('.live-ball-marker[data-ball-x="15"][data-ball-y="7"]');
    await ball.waitFor({ state: 'attached' });
    await ball.locator('.live-ball-football').waitFor();
    assert.equal(await ball.locator('.live-ball-football').count(), 1);
    assert.equal(await ball.locator('.live-ball-highlight').count(), 1);
    assert.equal(await page.locator('.live-target-square').count(), 0);
    await page.mouse.move(rect.x + square.x + 1, rect.y + square.y + 1);
    await ball.waitFor({ state: 'attached' });
    await ball.locator('.live-ball-football').waitFor();
    const centerBefore = await ball.evaluate(element => [element.style.left, element.style.top]);
    await page.mouse.move(rect.x + square.x, rect.y + square.y);
    assert.deepEqual(await ball.evaluate(element => [element.style.left, element.style.top]), centerBefore,
      'Movement inside one square keeps the ball snapped to its center');
    await page.mouse.click(rect.x + square.x, rect.y + square.y);
    assert.deepEqual(await page.evaluate(() => window.adjustmentIntents), [{ operation: 'action', fields: { actionId: '1:kick-15-7' } }],
      'A single click submits the exact offered kick without confirmation');
    await page.mouse.click(rect.x + square.x, rect.y + square.y);
    assert.equal(await page.evaluate(() => window.adjustmentIntents.length), 1, 'Pending kicks cannot submit twice');
    await open({ ...base, phase: 'READY_FOR_KICKOFF', turnMode: 'KICKOFF',
      actions: [action('kick-17-9', 'kickoff', null, { x: 17, y: 9 }, 'Kick to 17, 9')] });
    await page.locator('[data-player-id="p3"]').click();
    assert.deepEqual(await page.evaluate(() => window.adjustmentIntents), [{ operation: 'action', fields: { actionId: '1:kick-17-9' } }],
      'Clicking an occupying player places the kick on that square');
  });
  await run('kick-preview', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open({ ...base, phase: 'READY_FOR_KICKOFF', ball: null, actions: [] });
    const preview = { deviation: { x: 15, y: 7 }, withKick: { x: 13, y: 7 } };
    await page.evaluate(state => window.publishAdjustment(state), { ...base, revision: 2, phase: 'PLAY', turnMode: 'KICKOFF',
      ball: null, ballState: { version: 1, inPlay: false, moving: false, carrierPlayerId: null }, kickPreview: preview,
      actions: [action('kick-skill:true', 'kickSkill', 'p1', null, 'Yes'), action('kick-skill:false', 'kickSkill', 'p1', null, 'No')] });
    await page.getByRole('heading', { name: 'Use the Kick skill?', exact: true }).waitFor();
    await page.locator('.live-ball-marker[data-ball-x="15"][data-ball-y="7"] .live-ball-football').waitFor({ timeout: 500 });
    await page.locator('.live-ball-kick-preview[data-ball-x="13"][data-ball-y="7"] .live-ball-football').waitFor();
    assert.equal(await page.locator('[data-kick-arrow]').count(), 1);
    const rotation = await page.locator('.live-ball-outer, .live-ball-inner').evaluateAll(groups => groups.map(group => group.transform.animVal.numberOfItems ? group.transform.animVal.getItem(0).matrix.b : 0));
    await page.waitForFunction(previous => Array.from(document.querySelectorAll('.live-ball-outer, .live-ball-inner'))
      .every((group, index) => Math.abs((group.transform.animVal.numberOfItems ? group.transform.animVal.getItem(0).matrix.b : 0) - previous[index]) > .01), rotation);
    assert.equal(rotation.length, 4, 'Both ball markers rotate their outer arcs and inner arrows');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelectorAll('.live-ball-highlight animateTransform').length === 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelectorAll('.live-ball-highlight animateTransform').length === 4);
    const scene = page.locator('.live-pitch-scene'), viewport = page.locator('.live-pitch-viewport');
    const focus = Number(await scene.getAttribute('data-focus'));
    const area = await viewport.boundingBox();
    await page.mouse.move(area.x + area.width * .5, area.y + area.height * .5);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(area.x + area.width * .5, area.y + area.height * .5 + 70, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(focus => Number(document.querySelector('.live-pitch-scene').dataset.focus) !== focus, focus,
      { timeout: 1500 });
    assert.equal(await page.getByRole('heading', { name: 'Use the Kick skill?', exact: true }).isVisible(), true);
    assert.deepEqual(await page.evaluate(() => window.adjustmentIntents), []);
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.adjustmentIntents), [{ operation: 'action', fields: { actionId: '1:kick-skill:true' } }]);
    await open({ ...base, phase: 'PLAY', turnMode: 'KICKOFF', ball: { x: 15, y: 7 },
      ballState: { version: 1, inPlay: false, moving: false, carrierPlayerId: null },
      actions: [action('skill:true', 'kickSkill', 'p1', null, 'Yes'), action('skill:false', 'kickSkill', 'p1', null, 'No')] });
    await page.getByRole('heading', { name: 'Use the Kick skill?', exact: true }).waitFor();
    await page.locator('.live-ball-marker[data-ball-x="15"][data-ball-y="7"] .live-ball-football').waitFor();
    assert.equal(await page.locator('.live-ball-kick-preview').count(), 0, 'No alternate square is invented before deviation');
  });
  await run('kick-edge-preview', async () => {
    for (const role of ['home', 'away']) for (const [deviation, withKick, display] of [
      [{ x: 18, y: -2 }, { x: 18, y: 0 }, { x: 18, y: -1 }],
      [{ x: 28, y: 7 }, { x: 25, y: 7 }, { x: 26, y: 7 }],
      [{ x: -3, y: 7 }, { x: 0, y: 7 }, { x: -1, y: 7 }],
      [{ x: 8, y: 18 }, { x: 8, y: 14 }, { x: 8, y: 15 }],
    ]) {
      await open({ ...base, callerRole: role, actor: role, phase: 'PLAY', turnMode: 'KICKOFF', ball: null,
        ballState: { version: 1, inPlay: false, moving: false, carrierPlayerId: null },
        kickPreview: { deviation, withKick }, actions: [
          { ...action('kick-skill:true', 'kickSkill', 'p1', null, 'Yes'), actor: role },
          { ...action('kick-skill:false', 'kickSkill', 'p1', null, 'No'), actor: role }] });
      await page.getByRole('heading', { name: 'Use the Kick skill?', exact: true }).waitFor();
      await page.locator('.live-ball-kick-preview .live-ball-football').waitFor();
      const normal = page.locator('.live-ball-marker:not(.live-ball-kick-preview)');
      await normal.locator('.live-ball-football').waitFor();
      assert.equal(await normal.getAttribute('data-ball-x'), String(display.x));
      assert.equal(await normal.getAttribute('data-ball-y'), String(display.y));
      assert.equal(await page.locator('[data-kick-arrow]').count(), 1);
    }
  });
  await run('kick-camera-recovery', async () => {
    for (const role of ['home', 'away']) {
      await open({ ...base, callerRole: role, actor: role });
      await page.waitForFunction(() => document.querySelector('.live-pitch-scene').clientWidth === innerWidth);
      const scene = page.locator('.live-pitch-scene');
      const before = await scene.getAttribute('data-transverse-focus');
      await page.evaluate(state => window.publishAdjustment(state), { ...base, revision: 2, callerRole: role, actor: role,
        turnMode: 'KICKOFF', kickPreview: { deviation: { x: -5, y: 19 }, withKick: { x: -2, y: 16 } },
        actions: [action('kick-skill:true', 'kickSkill', 'p1', null, 'Yes'), action('kick-skill:false', 'kickSkill', 'p1', null, 'No')]
          .map(item => ({ ...item, actor: role })) });
      await page.waitForFunction(() => document.querySelector('.live-pitch-scene').dataset.transverseFocus === '15');
      await page.mouse.move(600, 300); await page.mouse.down({ button: 'right' });
      await page.mouse.move(600, 370, { steps: 5 }); await page.mouse.up({ button: 'right' });
      const focus = await scene.getAttribute('data-focus');
      await page.evaluate(state => window.publishAdjustment(state), { ...base, revision: 3, callerRole: role, actor: role });
      await page.locator('.live-ball-kick-preview').waitFor({ state: 'detached' });
      assert.equal(await scene.getAttribute('data-transverse-focus'), before,
        'Finishing an off-pitch Kick preview restores the full-width pitch instead of leaving it shifted sideways');
      assert.equal(await scene.getAttribute('data-focus'), focus, 'Lengthwise panning during Kick remains intact');
      assert.deepEqual(await page.evaluate(() => window.adjustmentIntents), []);
    }
  });
  await run('quick-snap', async () => {
    const move = action('event-p1-13-5', 'kickoffMove', 'p1', { x: 13, y: 5 }, 'Alice to 13, 5');
    await open({ ...base, turnMode: 'QUICK_SNAP', kickoff: { version: 1, event: 'QUICK_SNAP', actor: 'home', stage: 'movement', allowed: 5, completed: 2, selected: 0 },
      actions: [move, action('event-p2-15-8', 'kickoffMove', 'p2', { x: 15, y: 8 }), action('end-event', 'kickoffChoice', null, null, 'Finish QUICK_SNAP')] });
    await page.locator('[data-player-id="p1"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.live-target-square').count(), 1, 'Only the selected player has move highlights');
    await page.locator('[data-player-id="p3"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.live-selection-square').getAttribute('data-selection'), 'p1', 'An opponent without an offered kickoff move cannot replace the selected player');
    assert.deepEqual(await page.evaluate(() => window.adjustmentIntents), []);
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
