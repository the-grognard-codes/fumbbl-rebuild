import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { setCameraAngle } from './camera-controls.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';

const base = JSON.parse(await readFile(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = fileURLToPath(new URL('../../.tools/camera-perspective/', import.meta.url));
await mkdir(evidence, { recursive: true });
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
async function open(role, kind = 'live', options = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ...options });
  page.on('pageerror', error => errors.push(error.message));
  const state = { ...base, callerRole: role, matchId: `camera-${kind}-${role}`, prompt: null,
    homeRerolls: 2, awayRerolls: 2, homeResources: { apothecaries: 1 }, awayResources: { bribes: 1 } };
  await page.addInitScript(state => {
    window.hudState = state; window.hudIntents = []; window.hudMessages = [];
    window.initial = state; window.intents = []; window.reactionReplayState = state;
  }, state);
  const harness = kind === 'live' ? 'coach-hud' : kind === 'replay' ? 'reactive-replay' : 'projected-pitch';
  await page.route('**/camera-test', route => route.fulfill({ contentType: 'text/html', body:
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime ${kind === 'live' ? 'live-match-page' : ''}"></main><script type="module" src="/test/${harness}-harness.tsx"></script>` }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/camera-test`);
  await page.getByRole('button', { name: /^Cycle camera angle:/ }).waitFor();
  return { page, state };
}
const end = page => page.locator('.live-pitch-scene').getAttribute('data-end');
const flip = page => page.getByRole('button', { name: /^Flip perspective:/ });
const notice = page => page.getByRole('status', { name: 'Camera status', exact: true });
async function assertMenuSizedButtons(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const menu = document.querySelector('.game-menu-trigger')?.getBoundingClientRect();
    return menu && [...document.querySelectorAll('.camera-button')].every(button => {
      const bounds = button.getBoundingClientRect();
      return Math.abs(bounds.height - menu.height) < .5 && Math.abs(bounds.width - bounds.height) < .5;
    });
  });
  const menu = await page.locator('.game-menu-trigger').boundingBox();
  for (const button of await page.locator('.camera-button').all()) {
    const bounds = await button.boundingBox();
    assert.ok(Math.abs(bounds.height - menu.height) < .5, 'Camera buttons match the Game Menu height');
    assert.ok(Math.abs(bounds.width - bounds.height) < .5, 'Camera buttons remain square');
  }
}
async function geometry(page) {
  return page.locator('.live-pitch-scene').evaluate(scene => ({
    end: scene.dataset.end, focus: scene.dataset.focus, transverse: scene.dataset.transverseFocus,
    cells: [...scene.querySelectorAll('[data-cell-x]')].map(cell => cell.getAttribute('points')),
    markers: [...scene.querySelectorAll('.live-marker')].map(marker => marker.getAttribute('style')),
    scenery: scene.querySelector('.pitch-stadium-world')?.getAttribute('style'),
  }));
}
try {
  for (const role of ['home', 'away', 'spectator']) {
    const { page, state } = await open(role);
    await assertMenuSizedButtons(page);
    const originalEnd = role === 'away' ? 'away' : 'home';
    assert.equal(await end(page), originalEnd);
    assert.equal(await page.locator('.camera-angle').innerText(), '40°');
    await flip(page).press('Enter');
    assert.equal(await end(page), originalEnd === 'home' ? 'away' : 'home');
    assert.match(await notice(page).innerText(), /^(Home|Away) perspective$/);
    assert.equal(await page.locator('.camera-angle').innerText(), '40°');
    const debugBefore = await page.getByRole('button', { name: 'Debug', exact: true }).boundingBox();
    await setCameraAngle(page, 90);
    assert.equal(await notice(page).innerText(), 'Overhead view');
    const before = await geometry(page), icon = await flip(page).locator('svg').getAttribute('style');
    await flip(page).click();
    assert.deepEqual(await geometry(page), before, 'Overhead flip changes no rendered coordinates or orientation');
    assert.notEqual(await flip(page).locator('svg').getAttribute('style'), icon);
    assert.match(await notice(page).innerText(), /perspective selected; applies in angled view$/);
    await page.reload();
    await page.locator('.camera-angle').filter({ hasText: '90°' }).waitFor();
    assert.deepEqual(await geometry(page), before, 'Overhead orientation and pending end survive reload/recovery');
    await page.locator('.camera-angle').click();
    assert.equal(await page.locator('.camera-angle').innerText(), '30°');
    assert.equal(await end(page), originalEnd, 'Leaving overhead applies the remembered perspective');
    await setCameraAngle(page, 50);
    await page.reload();
    await page.locator('.camera-angle').filter({ hasText: '50°' }).waitFor();
    assert.equal(await end(page), originalEnd);
    assert.deepEqual(await page.getByRole('button', { name: 'Debug', exact: true }).boundingBox(), debugBefore, 'Camera changes leave HUD anchored');
    await page.evaluate(state => window.publishHud({ ...state, revision: state.revision + 1 }), state);
    assert.equal(await page.locator('.camera-angle').innerText(), '50°', 'Server revision updates retain camera choice');
    await page.evaluate(state => window.publishHud({ ...state, matchId: `${state.matchId}-new` }), state);
    await page.locator('.camera-angle').filter({ hasText: '40°' }).waitFor();
    assert.equal(await end(page), originalEnd, 'Another match starts with defaults');
    assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Camera sends no gameplay mutation for any role');
    if (role === 'home') await page.screenshot({ path: `${evidence}/live-desktop.png` });
    await page.close();
  }
  for (const role of ['home', 'away']) {
    const { page } = await open(role, 'pitch');
    const before = await squarePosition(page, 13, 7);
    await flip(page).click();
    const after = await squarePosition(page, 13, 7);
    assert.notDeepEqual(after, before, 'Canonical square moves with end change');
    await page.locator('.live-pitch-scene').click({ position: after });
    assert.deepEqual((await page.evaluate(() => window.intents)).at(-1), { x: 13, y: 7 }, 'Flipped hit testing still emits canonical coordinates');
    await page.close();
  }
  const { page: replay } = await open('spectator', 'replay');
  await assertMenuSizedButtons(replay);
  assert.equal(await replay.locator('.replay-board .live-camera-buttons .camera-buttons').count(), 1);
  await flip(replay).click();
  assert.equal(await end(replay), 'away');
  for (const angle of [30, 40, 50, 90]) await setCameraAngle(replay, angle);
  await replay.screenshot({ path: `${evidence}/replay.png`, fullPage: true });
  await replay.close();
  const { page: mobile } = await open('home', 'live', { viewport: { width: 375, height: 660 }, hasTouch: true, isMobile: true });
  await assertMenuSizedButtons(mobile);
  const debug = await mobile.getByRole('button', { name: 'Debug', exact: true }).boundingBox();
  const buttons = await mobile.getByRole('group', { name: 'Camera perspective controls', exact: true }).boundingBox();
  const menu = await mobile.getByRole('button', { name: 'Game Menu', exact: true }).boundingBox();
  assert.ok(debug.x + debug.width < buttons.x && menu.x + menu.width <= 375 && Math.abs(debug.y - buttons.y) < 2);
  for (const track of await mobile.locator('.live-turn-track').all()) {
    const bounds = await track.boundingBox();
    const overlaps = bounds.x < buttons.x + buttons.width && bounds.x + bounds.width > buttons.x
      && bounds.y < buttons.y + buttons.height && bounds.y + bounds.height > buttons.y;
    assert.equal(overlaps, false, `Touch camera row leaves turn counters unobscured: ${JSON.stringify({ bounds, buttons })}`);
  }
  for (const button of await mobile.locator('.camera-button').all()) {
    const bounds = await button.boundingBox();
    assert.ok(Math.abs(bounds.height - menu.height) < .5 && Math.abs(bounds.width - bounds.height) < .5,
      'Mobile camera buttons match Game Menu height and remain square');
    assert.match(await button.evaluate(element => getComputedStyle(element).fontFamily), /MUTP/);
  }
  await flip(mobile).tap();
  await mobile.locator('.camera-angle').tap();
  assert.equal(await end(mobile), 'away');
  await mobile.screenshot({ path: `${evidence}/live-mobile.png` });
  await mobile.setViewportSize({ width: 375, height: 300 });
  await mobile.evaluate(() => window.publishHud({ ...window.hudState, driveTracker: {
    version: 1, receivingRole: 'home', phase: 'KICKING_SETUP', secretWeapons: false,
    knockouts: false, event: null, eventComplete: false,
  } }));
  const homeDugout = mobile.locator('.live-dugout.home');
  await homeDugout.getByRole('button', { name: /^Expand .* dugout$/ }).click();
  await mobile.locator('.live-dugout.home.expanded').waitFor();
  assert.ok((await homeDugout.boundingBox()).height > 20, 'Short-window phase tracker keeps explicit dugout expansion available');
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('PASS camera controls: both coaches/spectators, overhead invariance, icons/messages, recovery/match isolation, canonical hit testing, replay, mobile touch/layout and MUTP.');
} finally { await browser.close(); await server.close(); }
