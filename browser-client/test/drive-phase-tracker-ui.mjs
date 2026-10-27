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
  const settle = () => page.evaluate(() => new Promise((resolve, reject) => {
    let prior = '', stable = 0, frames = 0;
    const check = () => {
      const bounds = JSON.stringify([...document.querySelectorAll('.drive-phase-tracker, .live-dugout, .match-history > section')]
        .map(element => element.getBoundingClientRect().toJSON()));
      stable = bounds === prior ? stable + 1 : 0;
      prior = bounds;
      if (stable >= 3) resolve();
      else if (++frames >= 20) reject(new Error('Side stack geometry did not settle'));
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }));
  const historySize = async (subject, target) => {
    const panel = page.locator(`.match-history-${subject}`);
    const sizes = ['minimized', 'default', 'maximized'];
    while (await panel.getAttribute('data-window-size') !== target) {
      const current = await panel.getAttribute('data-window-size');
      await panel.locator('.match-window-controls button').nth(
        sizes.indexOf(current) < sizes.indexOf(target) ? 0 : current === 'maximized' ? 0 : 1).click();
    }
    await settle();
  };
  for (const [width, height] of [[1680,1380],[1280,720],[375,660],[640,330]]) {
    await page.setViewportSize({ width, height });
    for (const side of ['home', 'away']) {
      await historySize('chat', 'default'); await historySize('log', 'default');
      await publish({ ...state, driveTracker: { ...tracker, receivingRole: side, secretWeapons: true, knockouts: true } });
      await settle();
      const subject = side === 'home' ? 'chat' : 'log';
      const otherSubject = side === 'home' ? 'log' : 'chat';
      const ownPanel = page.locator(`.match-history-${subject}`);
      const ownDugout = page.locator(`.live-dugout.${side}`);
      const before = [await list.boundingBox(), await ownPanel.boundingBox(), await ownDugout.boundingBox()];
      await historySize(otherSubject, 'maximized');
      assert.deepEqual([await list.boundingBox(), await ownPanel.boundingBox(), await ownDugout.boundingBox()], before,
        `${width}x${height}: opposite history expansion cannot move or shrink ${side} objects`);
      await historySize(otherSubject, 'minimized');
      assert.deepEqual([await list.boundingBox(), await ownPanel.boundingBox(), await ownDugout.boundingBox()], before,
        `${width}x${height}: opposite history minimization cannot move or shrink ${side} objects`);
      const otherDugout = page.locator(`.live-dugout.${side === 'home' ? 'away' : 'home'}`);
      await otherDugout.locator('.live-dugout-controls button').first().click(); await settle();
      assert.deepEqual([await list.boundingBox(), await ownPanel.boundingBox(), await ownDugout.boundingBox()], before,
        `${width}x${height}: opposite dugout expansion cannot affect ${side} objects`);
      await otherDugout.locator('.live-dugout-controls button').last().click(); await settle();
      await historySize(subject, 'maximized');
      const box = await list.boundingBox();
      assert.deepEqual(box, before[0], 'Maximizing history preserves the tracker view');
      assert.equal(overlaps(box, await ownDugout.boundingBox()), false,
        `${width}x${height}: maximized ${subject} keeps its dugout clear of the drive tracker`);
      assert.equal(overlaps(box, await ownPanel.boundingBox()), false,
        `${width}x${height}: maximized ${subject} clears the drive tracker`);
      const stable = [box, await ownPanel.boundingBox(), await ownDugout.boundingBox()];
      await settle();
      assert.deepEqual([await list.boundingBox(), await ownPanel.boundingBox(), await ownDugout.boundingBox()], stable,
        'Tracker and maximized history settle without a sizing feedback loop');
      // Expanded-dugout clearance at 640x330 was explicitly deferred by the
      // user to minimum-display requirements; keep its selected height intact.
      if (height > 330) {
        await ownDugout.locator('.live-dugout-controls button').first().click(); await settle();
        assert.equal(overlaps(await list.boundingBox(), await ownDugout.boundingBox()), false,
          `${width}x${height} ${side}: expanded dugout clears the tracker`);
        assert.equal(overlaps(await list.boundingBox(), await ownPanel.boundingBox()), false);
        await ownDugout.locator('.live-dugout-controls button').last().click(); await settle();
      }
      await page.screenshot({ path: `${evidence}/${side}-maximized-${width}x${height}.png` });
      await historySize(subject, 'default');
      await historySize(otherSubject, 'default');
    }
  }
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
      assert.equal(overlaps(box, dugout), false, `${width}: tracker does not overlap the dugout: ${JSON.stringify({ side, box, menu, dugout })}`);
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
