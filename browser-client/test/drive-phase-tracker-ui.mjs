import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

// UI evidence uses authoritative-shaped projections; it does not submit game commands.
const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const tracker = { version: 1, receivingRole: 'away', phase: 'KICKING_SETUP', secretWeapons: false,
  knockouts: false, event: null, eventComplete: false };
const state = { ...base, phase: 'SETUP', turnMode: 'SETUP', activePlayerId: null, actions: [], homeTurn: 0, awayTurn: 0,
  homeRerolls: 2, awayRerolls: 2, driveTracker: tracker };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const evidence = fileURLToPath(new URL('../../test-output/game-phase-tracker/', import.meta.url));
await mkdir(evidence, { recursive: true });
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, state);
  await page.route('**/drive-tracker-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  const url = `http://127.0.0.1:${server.httpServer.address().port}/drive-tracker-test`;
  await page.goto(url);
  await page.locator('.coach-match').waitFor(); await page.evaluate(() => document.fonts.ready);
  const list = page.getByRole('list', { name: 'Start of drive', exact: true });
  const publish = async view => {
    await page.evaluate(view => window.publishHud(view), view);
    await page.waitForFunction(view => document.querySelector('.drive-phase-tracker')?.classList.contains(view.driveTracker.receivingRole), view);
  };
  for (const [width, height] of [[1920,1080],[1280,720],[640,330],[375,300]]) {
    await page.setViewportSize({ width, height });
    for (const side of ['home','away']) {
      const view = { ...state, actor: side === 'home' ? 'away' : 'home',
        driveTracker: { ...tracker, receivingRole: side, secretWeapons: true, knockouts: true } };
      await publish(view);
      await list.getByText('Kicking team setup.', { exact: true }).waitFor();
      assert.equal(await list.locator('li').count(), 7);
      assert.equal(await list.locator('[aria-current=step]').textContent(), 'Kicking team setup.');
      const resource = await page.locator(`.live-resources.${side}`).boundingBox();
      const box = await list.boundingBox();
      const menu = await page.locator('.match-menu-triggers').boundingBox();
      assert.ok(box.y >= resource.y + resource.height, `${width}: ${side} tracker sits below its resource box`);
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= height, `${width}: tracker stays inside viewport`);
      assert.equal(overlaps(box, menu), false, `${width}: tracker does not overlap the menu`);
      const dugout = await page.locator(`.live-dugout.${side}`).boundingBox();
      assert.equal(overlaps(box, dugout), false, `${width}: tracker does not overlap the dugout`);
      const activeBox = await list.locator('[aria-current=step]').boundingBox();
      assert.ok(activeBox.y >= box.y && activeBox.y + activeBox.height <= box.y + box.height + 1,
        `${width}: current phase remains visible when the stack scrolls: ${JSON.stringify({ box, activeBox, side })}`);
      const banner = await page.locator('.match-game-step').boundingBox();
      if (banner) assert.equal(overlaps(box, banner), false, `${width}: tracker does not obscure the setup instruction`);
      const style = await list.locator('li').first().evaluate(element => ({ opacity: getComputedStyle(element).opacity,
        family: getComputedStyle(element).fontFamily, border: getComputedStyle(element).borderColor }));
      assert.equal(Number(style.opacity), .18);
      assert.match(style.family, /MUTP/);
      await page.screenshot({ path: `${evidence}/${side}-${width}x${height}.png` });
      await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
      await page.getByRole('dialog', { name: 'Game Menu', exact: true }).waitFor();
      await page.keyboard.press('Escape');
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const receivingRole of ['home','away']) for (const callerRole of ['home','away','spectator'])
    for (const [event, label] of [['HIGH_KICK','High Kick'],['SOLID_DEFENCE','Solid Defense'],['QUICK_SNAP','Quick Snap'],['CHARGE','Charge!']]) {
      const view = { ...state, callerRole, phase: 'PLAY', turnMode: event === 'CHARGE' ? 'BLITZ' : event,
        kickoff: { version: 1, event, actor: event === 'QUICK_SNAP' || event === 'HIGH_KICK' ? receivingRole
          : receivingRole === 'home' ? 'away' : 'home', stage: 'movement', allowed: 3, completed: 0, selected: 3 },
        driveTracker: { ...tracker, receivingRole, phase: 'KICKOFF', event } };
      await publish(view);
      assert.equal(await list.locator('[aria-current=step]').textContent(), label);
      assert.equal(await list.locator('[data-phase=KICKOFF]').getAttribute('class'), 'past');
      const parent = await list.boundingBox();
      const child = await list.locator('.kickoff-event').boundingBox();
      assert.ok(receivingRole === 'home' ? child.x > parent.x : child.x + child.width < parent.x + parent.width,
        'Decision row is indented toward the pitch center');
      if (callerRole === 'home') await page.screenshot({ path: `${evidence}/${receivingRole}-${event.toLowerCase()}.png` });
      await publish({ ...view, kickoff: undefined, turnMode: 'REGULAR', driveTracker: { ...view.driveTracker, eventComplete: true } });
      assert.equal(await list.locator('.kickoff-event').getAttribute('aria-current'), null);
      assert.equal(await list.locator('.kickoff-event').getAttribute('class'), 'past kickoff-event');
    }
  // A refreshed client receives the whole tracker in the snapshot, without accumulated UI history.
  await page.reload(); await list.waitFor();
  assert.equal(await list.locator('li').count(), 5);
  const { driveTracker, ...ordinary } = state;
  await page.evaluate(view => window.publishHud(view), { ...ordinary, phase: 'PLAY', turnMode: 'REGULAR' });
  await list.waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Tracker never submits a game command');
  assert.deepEqual(errors, []);
  console.log('Drive tracker: both sides, four layouts, all four events and viewer roles, refresh and ordinary-play handoff passed.');
} finally { await browser.close(); await server.close(); }
