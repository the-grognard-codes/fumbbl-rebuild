import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { squarePosition } from './projected-pitch-helper.mjs';

// Presentation/intent evidence; this fixture does not establish live playability.
const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const state = { ...base, homeTeamName: 'Tusk Love', awayTeamName: "Bugman's Best", homeTurn: 2, awayTurn: 2,
  homeRerolls: 3, awayRerolls: 4, homeResources: { apothecaries: 1, assistantCoaches: 2, cheerleaders: 1 },
  awayResources: { apothecaries: 1, assistantCoaches: 2, cheerleaders: 1 },
  clock: { activeRole: 'home', turnElapsedMs: 0, homeReserveMs: 600000, awayReserveMs: 600000 },
  players: [ { ...base.players[0], id: 'home1', name: 'Coach choice one', x: 12, y: 5 },
    { ...base.players[0], id: 'home2', name: 'Coach choice two', x: 12, y: 9 },
    { ...base.players[1], x: 14, y: 7 } ],
  actions: ['home1', 'home2'].map(id => ({ id: `0:select-${id}`, kind: 'select', label: `Move ${id}`,
    actor: 'home', sourcePlayerId: id, target: { playerId: id } }))
    .concat([{ id: '0:end', kind: 'endTurn', label: 'End Turn', actor: 'home', sourcePlayerId: null, target: null }]) };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const evidence = process.env.HUD_COMMENTS_EVIDENCE_DIR;
try {
  const page = await browser.newPage({ viewport: { width: 1224, height: 604 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, state);
  await page.route('**/hud-comments', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/hud-comments`);
  await page.locator('.coach-match').waitFor(); await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.getByRole('status', { name: 'Current game step' }).count(), 0, 'Regular turns have no broadcast banner');
  assert.equal(await page.getByLabel('Match window controls', { exact: true }).count(), 0, 'Window-controls overlay is removed');
  assert.equal(await page.getByRole('button', { name: 'Fullscreen', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Exit match', exact: true }).count(), 0);
  assert.equal(await page.locator('.live-chess-clock').evaluateAll(elements => elements.every(element => {
    const box = element.getBoundingClientRect();
    return [...element.children].every(child => { const r = child.getBoundingClientRect(); return r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom; });
  })), true, 'Clock lines remain inside their aligned boxes');
  const confirm = page.getByRole('button', { name: 'Confirmed!', exact: true });
  const player = id => page.locator(`.live-marker[data-player-id="${id}"]`);
  const empty = async () => page.locator('.live-pitch-scene').click({ position: await squarePosition(page, 13, 7) });
  await player('home1').click(); await page.getByRole('button', { name: 'Move', exact: true }).click();
  assert.equal(await confirm.isEnabled(), true);
  await player('home2').click();
  assert.equal(await confirm.isDisabled(), true);
  assert.equal(await player('home2').evaluate(element => element.classList.contains('selected')), true);
  await page.getByRole('button', { name: 'Move', exact: true }).click(); await empty();
  assert.equal(await confirm.isDisabled(), true);
  assert.equal(await page.locator('.live-marker.selected').count(), 0);
  assert.equal(await page.locator('.cancel-proposal').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Cancellation sends no action');
  await player('home1').click(); await empty();
  assert.equal(await confirm.isEnabled(), true, 'The first empty-square click still prepares movement');
  await empty();
  assert.equal(await confirm.isDisabled(), true, 'A second empty-square click cancels that prepared movement');
  assert.equal(await page.locator('.live-marker.selected').count(), 0);
  await player('home1').click(); await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  await empty();
  assert.equal(await confirm.isDisabled(), true, 'Cancellation clears End Turn confirmation');
  assert.deepEqual(await page.evaluate(() => window.hudIntents), []);
  await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
  for (const [weather, sprite, label] of [['NICE', 'nice', 'Nice'], ['VERY_SUNNY', 'sunny', 'Sunny'], ['SWELTERING_HEAT', 'heat', 'Heat'], ['POURING_RAIN', 'rain', 'Rain'], ['BLIZZARD', 'blizzard', 'Blizzard']]) {
    await page.evaluate(state => window.publishHud(state), { ...state, weather });
    await page.waitForFunction(sprite => {
      const image = document.querySelector('.coach-weather-slot img');
      return image?.src.endsWith(`weather_${sprite}.png`) && image.complete && image.naturalWidth > 0;
    }, sprite);
    assert.equal(await page.locator('.coach-weather-slot').textContent(), label);
    assert.deepEqual(await page.locator('.coach-weather-slot').evaluate(element => {
      const css = getComputedStyle(element);
      return [css.outlineStyle, css.borderTopWidth, css.backgroundColor, css.boxShadow];
    }), ['none', '0px', 'rgba(0, 0, 0, 0)', 'none'], 'Weather has no enclosing box');
  }
  await page.evaluate(state => window.publishHud({ ...state, activePlayerId: 'home1' }), state);
  assert.equal(await page.getByRole('status', { name: 'Current game step' }).count(), 0, 'Routine active-player movement stays quiet');
  await page.evaluate(state => window.publishHud({ ...state, turnMode: 'TOUCHBACK' }), state);
  const banner = page.getByRole('status', { name: 'Current game step' });
  assert.match(await banner.textContent(), /Touchback!.*assign the ball/i);
  const bannerBox = await banner.boundingBox();
  assert.ok(bannerBox.width <= 420 && Math.abs(bannerBox.x + bannerBox.width / 2 - 612) < 1, 'Touchback banner is narrower and centered');
  await page.evaluate(state => window.publishHud({ ...state, turnMode: 'CHARGE',
    kickoff: { version: 1, event: 'CHARGE', actor: 'home', stage: 'selection', allowed: 4, completed: 0, selected: 1 } }), state);
  assert.match(await banner.textContent(), /Charge!.*Blitz.*Throw teammate.*Kick Teammate/s);
  assert.equal(await banner.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'Long required instructions wrap within the narrower banner');
  if (evidence) await mkdir(evidence, { recursive: true });
  for (const [width, height] of [[1224,604],[1920,1080],[640,330],[375,660],[375,300]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => document.querySelector('.live-pitch-scene').clientWidth === innerWidth);
    const layout = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right, height: r.height }; };
      return { center: rect('.coach-score-center'), clocks: ['home','away'].map(role => rect(`.live-chess-clock.${role}`)),
        resources: ['home','away'].map(role => rect(`.live-resources.${role}`)), menu: rect('.game-menu-trigger'),
        dugouts: ['home','away'].map(role => rect(`.live-dugout.${role}`)), histories: ['chat','log'].map(kind => rect(`.match-history-${kind}`)),
        command: rect('.command-buttons'), confirm: rect('.commit-action'), padding: parseFloat(getComputedStyle(document.querySelector('.match-history-log')).paddingTop) };
    });
    for (const resource of layout.resources) {
      assert.equal(resource.top, layout.center.top, 'Resources align to score bar');
      if (width > 900) assert.equal(resource.height, layout.center.height, 'Resource boxes share timer and team-name height');
    }
    for (const clock of layout.clocks) {
      assert.equal(clock.height, layout.center.height, 'Clocks have team bar height');
      if (width > 900) assert.equal(clock.top, layout.center.top, 'Desktop clocks align to score bar');
    }
    assert.ok(layout.menu.top >= layout.resources[1].bottom && layout.menu.top <= layout.resources[1].bottom + 9, 'Menu directly below away resources');
    assert.ok(layout.menu.right <= width - 10);
    for (let i = 0; i < 2; i++) assert.ok(Math.abs(layout.dugouts[i].bottom - layout.histories[i].top + 8) < 1, 'Dugouts dock above corresponding history');
    assert.ok(layout.command.height <= 54 && layout.confirm.height < 38, 'Command and confirmation controls are shorter');
    assert.ok(layout.padding <= 5, 'Game log has reduced top padding');
    if (evidence) await page.screenshot({ path: `${evidence}/hud-comments-${width}-${height}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: selection cancellation, compact equal-height resources, absent window controls, short unboxed weather, quiet regular turns and narrower required instructions.');
} finally { await browser.close(); await server.close(); }
