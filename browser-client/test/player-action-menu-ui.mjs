import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const actor = base.players.find(player => player.role === 'home');
const kinds = ['select', 'selectBlock', 'blitz', 'declareFoul', 'declareHandOff', 'declarePass', 'declareChainsaw', 'declareBomb',
  'declareThrowTeamMate', 'declareKickTeamMate', 'declareTreacherous'];
const action = (kind, role = 'home', sourcePlayerId = actor.id) =>
  ({ id: `${role}:${kind}`, kind, label: kind, actor: role, sourcePlayerId, target: kind === 'select' ? { playerId: sourcePlayerId } : null });
const state = { ...base, activePlayerId: null, clock: { activeRole: 'home', turnElapsedMs: 0, homeReserveMs: 600000, awayReserveMs: 600000 },
  actions: [...kinds.filter(kind => kind !== 'blitz').map(kind => action(kind)), action('endTurn', 'home', null)],
  playerActionMenu: kinds.map(kind => ({ playerId: actor.id, kind, spent: kind === 'blitz' })) };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1600 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, state);
  await page.route('**/action-menu-review', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/action-menu-review`);
  await page.evaluate(() => document.fonts.ready);
  const pitchPosition = () => page.locator('.live-pitch-viewport').evaluate(viewport => {
    const scene = viewport.querySelector('.live-pitch-scene');
    const bounds = scene.getBoundingClientRect();
    return { focus: scene.dataset.focus, transverse: scene.dataset.transverseFocus,
      zoom: scene.dataset.zoom, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height,
      scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop,
      playerX: viewport.querySelector('.live-marker').getAttribute('data-center-x') };
  });
  await page.locator('.live-pitch-viewport').waitFor();
  await page.waitForFunction(() => document.querySelector('.live-pitch-scene').clientWidth === innerWidth);
  await page.mouse.move(600, 300); await page.mouse.down({ button: 'right' });
  await page.mouse.move(500, 370, { steps: 5 }); await page.mouse.up({ button: 'right' });
  const pitchBeforeMenu = await pitchPosition();
  await page.locator('.live-marker[data-player-id="' + actor.id + '"]').click();
  assert.deepEqual(await pitchPosition(), pitchBeforeMenu, 'Showing and centering the action menu must preserve the panned pitch');
  const icons = page.getByRole('group', { name: 'Player actions', exact: true });
  assert.equal(await icons.getByRole('button').count(), kinds.length);
  assert.equal(await icons.textContent(), '', 'Action menu has icons only');
  assert.equal(await icons.locator('.action-glyph image').count(), kinds.length, 'All menu icons use the sprite atlas');
  await page.evaluate(async () => {
    const image = new Image(); image.src = document.querySelector('.action-glyph image').getAttribute('href');
    await image.decode();
  });
  for (const name of ['Throw Teammate', 'Kick Teammate', 'Throw Bomb', 'Chainsaw']) {
    const button = icons.getByRole('button', { name, exact: true });
    await button.hover();
    assert.equal(await button.getAttribute('title'), name, 'Hover retains the full action name');
  }
  assert.equal(await icons.getByRole('button', { name: 'Blitz', exact: true }).isDisabled(), true);
  assert.equal(await icons.getByRole('button', { name: 'Blitz', exact: true }).evaluate(button => getComputedStyle(button).opacity), '0.18');
  assert.equal(await page.getByRole('button', { name: 'Other action', exact: true }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'Server actions', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'End Turn', exact: true }).count(), 1);
  await icons.getByRole('button', { name: 'Pass', exact: true }).click();
  assert.deepEqual(await pitchPosition(), pitchBeforeMenu, 'Selecting an action must preserve the pitch position');
  await page.waitForTimeout(220);
  const selected = await icons.getByRole('button', { name: 'Pass', exact: true }).evaluate(button => {
    const css = getComputedStyle(button); return { color: css.color, transform: css.transform, glow: css.boxShadow };
  });
  assert.equal(selected.color, 'rgb(255, 225, 123)');
  assert.notEqual(selected.transform, 'none'); assert.notEqual(selected.glow, 'none');
  assert.notEqual(await icons.getByRole('button', { name: 'Pass', exact: true }).locator('.action-glyph').evaluate(icon => getComputedStyle(icon).filter), 'none',
    'Selected raster artwork receives the yellow tint');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await icons.getByRole('button', { name: 'Pass', exact: true }).evaluate(button => getComputedStyle(button).transitionDuration), '0s');
  await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), []);
  await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Backspace');
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Repeated end turn still requires explicit confirmation');
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Space cannot bypass the explicit end-turn confirmation');
  await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [{ operation: 'action', fields: { actionId: 'home:endTurn' } }]);
  for (const role of ['home', 'away']) {
    const id = base.players.find(player => player.role === role).id;
    const exhausted = { ...state, revision: state.revision + 1, callerRole: role, actor: role,
      clock: { ...state.clock, activeRole: role }, actions: [action('endTurn', role, null)], playerActionMenu: [] };
    for (const method of ['button', 'shortcut']) {
      await page.evaluate(state => { window.hudIntents = []; window.publishHud(state); }, exhausted);
      await page.getByRole('button', { name: 'End Turn', exact: true }).waitFor();
      await page.getByRole('button', { name: 'End Turn', exact: true }).click({ trial: true });
      assert.equal(await page.locator(`.live-chess-clock.${role} .clock-end-turn`).count(), 1);
      if (method === 'button') await page.getByRole('button', { name: 'End Turn', exact: true }).click();
      else { await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Backspace'); }
      assert.deepEqual(await page.evaluate(() => window.hudIntents), [{ operation: 'action', fields: { actionId: `${role}:endTurn` } }]);
    }
    await page.evaluate(state => { window.publishHud(state); }, { ...exhausted, callerRole: 'spectator' });
    assert.equal(await page.getByRole('button', { name: 'End Turn', exact: true }).count(), 0);
    await page.evaluate(state => { window.publishHud(state); }, { ...exhausted, actor: role === 'home' ? 'away' : 'home' });
    assert.equal(await page.getByRole('button', { name: 'End Turn', exact: true }).count(), 0);
  }
  const legacy = { ...state, revision: state.revision + 3, clock: undefined,
    actions: [action('endTurn', 'home', null)], playerActionMenu: [] };
  await page.evaluate(state => { window.hudIntents = []; window.publishHud(state); }, legacy);
  await page.getByRole('button', { name: 'End Turn', exact: true }).waitFor();
  await page.evaluate(() => {
    const input = document.createElement('textarea'); input.id = 'shortcut-typing-check';
    document.querySelector('.coach-match').append(input); input.value = 'draft'; input.focus();
  });
  await page.keyboard.press('Backspace');
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Typing must not end a turn');
  await page.evaluate(() => document.getElementById('shortcut-typing-check').remove());
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await page.keyboard.press('Backspace');
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'A dialog must not end a turn');
  await page.getByRole('button', { name: 'Close Game Menu', exact: true }).click();
  await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  assert.equal((await page.evaluate(() => window.hudIntents)).length, 1, 'Clockless legacy matches retain the button');
  await page.evaluate(state => { window.publishHud(state); }, { ...state, revision: state.revision + 2 });
  await page.locator('.live-marker[data-player-id="' + actor.id + '"]').click();
  await icons.getByRole('button', { name: 'Pass', exact: true }).click();
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await page.evaluate(state => window.publishHud(state), { ...state, revision: state.revision + 4,
    activePlayerId: actor.id, activePlayerAction: 'passMove',
    playerActionMenu: state.playerActionMenu.map(item => ({ ...item, spent: item.kind === 'declarePass' || item.spent })) });
  await page.waitForFunction(() => document.querySelector('[aria-label="Pass"]').getAttribute('aria-pressed') === 'true');
  assert.equal(await icons.getByRole('button', { name: 'Pass', exact: true }).evaluate(button => getComputedStyle(button).opacity), '1',
    'An already declared action keeps its selection highlight');
  await icons.getByRole('button', { name: 'Move', exact: true }).click({ trial: true });
  assert.equal(await page.getByRole('heading', { name: 'Server actions', exact: true }).count(), 1, 'Server actions remain in Debug');
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await mkdir(new URL('../../test-output/action-menu/', import.meta.url), { recursive: true });
  for (const width of [1224, 768, 390]) {
    await page.setViewportSize({ width, height: 700 });
    const layout = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
      return { menu: rect('.player-action-icons'), confirm: rect('.commit-action'), clock: rect('.live-chess-clock.home'), end: rect('.clock-end-turn') };
    });
    assert.ok(Math.abs(layout.menu.x + layout.menu.width / 2 - layout.confirm.x - layout.confirm.width / 2) < 1, 'Menu stays centered beneath confirmation');
    assert.ok(layout.menu.y > layout.confirm.bottom, 'Menu is below confirmation');
    assert.ok(layout.end.y > layout.clock.bottom && layout.end.y < layout.clock.bottom + 10, 'End Turn is immediately below own timer');
    assert.ok(Math.abs(layout.end.x + layout.end.width / 2 - layout.clock.x - layout.clock.width / 2) < 1);
    const track = await page.locator('.live-turn-track.home').boundingBox();
    assert.ok(layout.end.bottom <= track.y || layout.end.x + layout.end.width <= track.x || layout.end.x >= track.x + track.width,
      'End Turn does not overlap the turn counter');
    assert.ok(layout.menu.x >= 0 && layout.menu.x + layout.menu.width <= width);
    await page.screenshot({ path: fileURLToPath(new URL(`../../test-output/action-menu/menu-${width}.png`, import.meta.url)) });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: icon coverage, spent styling, selection motion, explicit confirmation, both team controls, shortcut, Debug access and responsive placement.');
} finally { await browser.close(); await server.close(); }
