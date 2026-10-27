import { setCameraMode } from './camera-controls.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const player = { ...base.players[0], id: 'carrier', role: 'home', name: 'Carrier', x: 12, y: 7 };
const friend = { ...player, id: 'friend', name: 'Receiver', x: 13, y: 7 };
const enemy = { ...player, id: 'enemy', role: 'away', name: 'Opponent', x: 12, y: 8 };
const action = (kind, source = 'carrier', target = null) => ({ id: `${kind}-${source}`, kind, label: kind,
  actor: 'home', sourcePlayerId: source, target });
const ready = { ...base, revision: 1, activePlayerId: null, actor: 'home', callerRole: 'home', phase: 'PLAY',
  players: [player, friend, enemy], actions: [action('select'), action('selectBlock'), action('blitz'),
    action('declarePass'), action('endTurn', null)] };
let server, browser;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
    server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
});
after(async () => { await browser?.close(); await server?.close(); });

async function journey(t, state) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(30000);
  t.after(() => page.close());
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, state);
  await page.route('**/rollup-test', route => route.fulfill({ contentType: 'text/html', body:
    '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/rollup-test`);
  await page.getByLabel('Live match pitch').waitFor();
  return page;
}
const select = (page, id) => page.locator(`.live-marker[data-player-id="${id}"]`).click();
const intents = page => page.evaluate(() => window.hudIntents);

test('Space confirms a Pass declaration while its action menu button owns focus', async t => {
  const page = await journey(t, ready);
  await select(page, 'carrier');
  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  assert.equal(await page.locator('.commit-action').isEnabled(), true);
  await page.keyboard.press('Space');
  assert.deepEqual((await intents(page)).map(intent => intent.fields.actionId), ['declarePass-carrier']);
});

test('Space confirms a proposed Block while the opponent marker owns focus', async t => {
  const page = await journey(t, ready);
  await select(page, 'carrier'); await select(page, 'enemy');
  await page.keyboard.press('Space');
  assert.deepEqual((await intents(page)).map(intent => intent.fields.actionId), ['selectBlock-carrier']);
});

test('Space accepts the warning about unactivated players when ending a turn', async t => {
  const page = await journey(t, ready);
  await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  assert.match(await page.locator('.command-preview').textContent(), /Unactivated/);
  await page.keyboard.press('Space');
  assert.deepEqual((await intents(page)).map(intent => intent.fields.actionId), ['endTurn-null']);
});

test('Space ignores editable chat, modified keys and repeated keydowns', async t => {
  const page = await journey(t, ready);
  await select(page, 'carrier'); await page.getByRole('button', { name: 'Pass', exact: true }).click();
  await page.evaluate(() => {
    const input = document.createElement('input'); document.body.append(input); input.focus();
  });
  await page.keyboard.press('Space');
  await page.locator('.live-pitch-viewport').focus();
  await page.keyboard.press('Shift+Space');
  await page.locator('.live-pitch-viewport').dispatchEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true });
  assert.deepEqual(await intents(page), []);
});

test('Space waits for an action-target menu choice instead of committing the previous proposal', async t => {
  const first = { ...action('block', 'carrier', { playerId: 'enemy' }), id: 'block-first', label: 'Block first' };
  const second = { ...action('block', 'carrier', { playerId: 'enemy2' }), id: 'block-second', label: 'Block second' };
  const page = await journey(t, { ...ready, activePlayerId: 'carrier', activePlayerAction: 'blitzMove',
    players: [player, enemy, { ...enemy, id: 'enemy2', x: 11, y: 8 }],
    actions: [action('move', 'carrier', { x: 11, y: 7 }), first, second] });
  await select(page, 'carrier'); await clickSquare(page, { x: 11, y: 7 });
  await page.getByRole('button', { name: 'Block', exact: true }).click();
  const choices = page.getByRole('group', { name: 'Action targets', exact: true });
  await choices.waitFor();
  assert.equal(await page.locator('.commit-action').isDisabled(), true);
  await page.keyboard.press('Space');
  assert.deepEqual(await intents(page), [], 'An unfinished target choice must not confirm the earlier Move');
  await choices.getByRole('button', { name: 'Block first', exact: true }).click();
  await page.keyboard.press('Space');
  assert.deepEqual((await intents(page)).map(intent => intent.fields.actionId), [first.id]);
});

test('an active Hand Off reviews the clicked friendly receiver and confirms its native action', async t => {
  const handoff = action('handOff', 'carrier', { playerId: 'friend' });
  const page = await journey(t, { ...ready, activePlayerId: 'carrier', activePlayerAction: 'handOverMove',
    actions: [handoff, action('move', 'carrier', { x: 11, y: 7 })] });
  await select(page, 'carrier'); await select(page, 'friend');
  assert.equal(await page.locator('.live-selection-square[data-selection]').getAttribute('data-selection'), 'carrier');
  assert.equal(await page.locator('.commit-action').isEnabled(), true);
  await page.locator('.commit-action').click();
  assert.deepEqual((await intents(page)).map(intent => intent.fields.actionId), [handoff.id]);
});

test('a Block declaration never connects the previous active teammate to the selected blocker', async t => {
  const page = await journey(t, { ...ready, activePlayerId: 'friend',
    actions: [action('selectBlock', 'carrier', { playerId: 'carrier' })] });
  await select(page, 'carrier'); await select(page, 'enemy');
  assert.equal(await page.locator('.live-target-line').count(), 0);
});

async function waypointJourney(t, state = {}) {
  const view = { ...ready, ...state, players: [player, { ...enemy, x: 16, y: 7 }] };
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5000); t.after(() => page.close());
  page.setDefaultNavigationTimeout(30000);
  await page.addInitScript(state => { window.waypointState = state; window.waypointRequests = []; window.waypointMutations = []; }, view);
  await page.route('**/waypoint-test', route => route.fulfill({ contentType: 'text/html', body:
    '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/waypoint-regression-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/waypoint-test`);
  await page.getByLabel('Live match pitch').waitFor();
  return page;
}
const clickSquare = async (page, square, button = 'left') => page.locator('.live-pitch-scene').click({
  position: await squarePosition(page, square.x, square.y), button });
const latestPlan = page => page.evaluate(() => window.waypointRequests.filter(Boolean).at(-1));

test('selecting a Blitz target retains manual waypoints and appends the reviewed approach', async t => {
  const page = await waypointJourney(t);
  await select(page, 'carrier');
  await clickSquare(page, { x: 13, y: 8 });
  await clickSquare(page, { x: 14, y: 8 });
  await select(page, 'enemy');
  assert.deepEqual((await latestPlan(page)).waypoints, [{ x: 13, y: 8 }, { x: 14, y: 8 }]);
  assert.equal(await page.locator('.commit-action').isEnabled(), true, 'The canonical approach may extend the requested prefix');
  await page.locator('.commit-action').click();
  const sent = await page.evaluate(() => window.waypointMutations);
  assert.equal(sent[0].fields.kind, 'blitz');
  assert.deepEqual(sent[0].fields.waypoints, [{ x: 13, y: 8 }, { x: 14, y: 8 }, { x: 15, y: 7 }]);
});

test('manual waypoints during an explicitly declared Blitz remain previews until its target is chosen', async t => {
  const page = await waypointJourney(t, { activePlayerId: 'carrier', activePlayerAction: 'blitzSelect', turnMode: 'SELECT_BLITZ_TARGET',
    actions: [action('blitzTarget', 'carrier', { playerId: 'enemy' })] });
  await select(page, 'carrier'); await clickSquare(page, { x: 13, y: 8 });
  assert.deepEqual((await latestPlan(page))?.waypoints, [{ x: 13, y: 8 }]);
  assert.equal(await page.locator('.commit-action').isDisabled(), true, 'Targetless Blitz movement cannot commit');
  await select(page, 'enemy');
  assert.equal((await latestPlan(page)).kind, 'blitz');
  assert.deepEqual((await latestPlan(page)).waypoints, [{ x: 13, y: 8 }]);
  assert.equal(await page.locator('.commit-action').isEnabled(), true);
});

test('waypoint range follows the planned endpoint and updates after undo', async t => {
  const page = await waypointJourney(t);
  await select(page, 'carrier'); await clickSquare(page, { x: 13, y: 8 });
  assert.equal(await page.locator('.live-movement-range').getAttribute('data-range-from'), '13,8');
  await clickSquare(page, { x: 14, y: 8 });
  assert.equal(await page.locator('.live-movement-range').getAttribute('data-range-from'), '14,8');
  await clickSquare(page, { x: 14, y: 8 }, 'right');
  assert.equal(await page.locator('.live-movement-range').getAttribute('data-range-from'), '13,8');
});

test('a planned movement can return to the player\'s starting square', async t => {
  const page = await waypointJourney(t);
  await select(page, 'carrier'); await clickSquare(page, { x: 13, y: 8 }); await select(page, 'carrier');
  assert.deepEqual((await latestPlan(page)).waypoints, [{ x: 13, y: 8 }, { x: 12, y: 7 }]);
  assert.equal(await page.locator('.commit-action').isEnabled(), true);
});

test('selecting a prone player and its own square reviews native stand-up', async t => {
  const page = await journey(t, { ...ready, players: [{ ...player, state: 'Prone' }, friend, enemy], actions: [action('stand')] });
  await select(page, 'carrier'); await select(page, 'carrier');
  assert.equal(await page.locator('.commit-action').isEnabled(), true);
  await page.locator('.commit-action').click();
  assert.deepEqual((await intents(page)).map(intent => intent.fields.actionId), ['stand-carrier']);
});

test('both native Get the Ref bribe totals appear in live resources', async t => {
  const resources = { ...base.homeResources, bribes: 1 };
  const page = await journey(t, { ...ready, homeResources: resources, awayResources: resources });
  assert.equal(await page.locator('.live-resources.home .live-resource.bribe').getAttribute('aria-label'), 'Bribes: 1 available');
  assert.equal(await page.locator('.live-resources.away .live-resource.bribe').getAttribute('aria-label'), 'Bribes: 1 available');
});

test('Hit and Run uses push-style destination arrows and a Decline Hit and Run option', async t => {
  const move = action('hitAndRun', 'carrier', { x: 11, y: 7 });
  const decline = { ...action('hitAndRunDecline'), label: 'Decline Hit and Run' };
  const page = await journey(t, { ...ready, activePlayerId: 'carrier', turnMode: 'HIT_AND_RUN', actions: [move, decline] });
  const arrow = page.locator('.live-hit-and-run-choice');
  await arrow.waitFor();
  assert.equal(await arrow.locator('.live-push-shaft').count(), 1);
  assert.equal(await arrow.getAttribute('data-x'), '11');
  assert.equal(await arrow.getAttribute('data-y'), '7');
  assert.equal(await page.getByRole('button', { name: 'Decline Hit and Run', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'Hit and Run', exact: true }).count(), 0,
    'Destination selection must not include a separate skill-use choice');
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await setCameraMode(page, 'top-down');
  assert.equal(await arrow.count(), 1, 'The same square remains selectable in top-down');
  await setCameraMode(page, 'perspective');
  await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  if (process.env.ROLLUP_EVIDENCE) await page.screenshot({ path: process.env.ROLLUP_EVIDENCE });
  await arrow.click();
  assert.deepEqual((await intents(page)).map(intent => intent.fields.actionId), [move.id]);
  assert.equal(await page.locator('.live-hit-and-run-choice').count(), 0, 'Pending input removes the destination arrows');
});

test('Hit and Run centers its non-modal reminder and decline decision without covering destinations', async t => {
  const decline = { ...action('hitAndRunDecline'), label: 'Decline Hit and Run' };
  const moves = [[11, 6], [12, 6], [13, 6], [11, 7], [13, 7], [11, 8], [12, 8], [13, 8]]
    .map(([x, y]) => ({ ...action('hitAndRun', 'carrier', { x, y }), id: `hit-and-run:${x}:${y}` }));
  const page = await journey(t, { ...ready, players: [player], activePlayerId: 'carrier', turnMode: 'HIT_AND_RUN',
    actions: [...moves, decline] });
  await page.addStyleTag({ content: readFileSync(new URL('../../site/src/assets/play.css', import.meta.url), 'utf8') });
  await page.evaluate(() => document.body.classList.add('game-match'));
  const dialog = page.getByRole('dialog', { name: 'Match decision', exact: true });
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /Select an arrow to move/);
  assert.equal(await dialog.evaluate(element => element.matches(':modal')), false);
  assert.equal(await dialog.getAttribute('aria-modal'), 'false');
  assert.equal(await page.locator('.match-command-bar').getByRole('button', { name: 'Decline Hit and Run', exact: true }).count(), 0);
  // Exercise the tight landscape fit even when a fallback font makes the prompt shorter.
  await page.addStyleTag({ content: '@media (max-width: 700px) { .match-decision-dialog { min-height: 128px; } }' });
  for (const [width, height] of [[1440, 900], [640, 330]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => {
      const prompt = document.querySelector('.match-decision-dialog').getBoundingClientRect();
      return Math.abs(prompt.x + prompt.width / 2 - innerWidth / 2) < 2 && prompt.top >= 0 && prompt.bottom <= innerHeight
        && [...document.querySelectorAll('.live-marker.active, .live-hit-and-run-choice')].every(element => {
          const box = element.getBoundingClientRect();
          return prompt.right <= box.left || prompt.left >= box.right || prompt.bottom <= box.top || prompt.top >= box.bottom;
        });
    });
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), true, 'Escape cannot dismiss the skill decision');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const scene = page.locator('.live-pitch-scene');
  const previousFocus = await scene.getAttribute('data-focus');
  const point = await page.locator('.live-pitch-viewport').evaluate(element => {
    const box = element.getBoundingClientRect();
    for (const column of [.25, .75]) for (const row of [.35, .6]) {
      const x = box.x + box.width * column, y = box.y + box.height * row;
      if (document.elementFromPoint(x, y)?.closest('.live-pitch-viewport') === element) return { x, y };
    }
    throw Error('No unobstructed pitch point for panning');
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(point.x, point.y + 60, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(before => document.querySelector('.live-pitch-scene').dataset.focus !== before, previousFocus);
  assert.equal(await dialog.isVisible(), true, 'Panning leaves the reminder and decline available');
  if (process.env.HIT_AND_RUN_CENTER_EVIDENCE) await page.screenshot({ path: process.env.HIT_AND_RUN_CENTER_EVIDENCE });
  await dialog.getByRole('button', { name: 'Decline Hit and Run', exact: true }).click();
  assert.deepEqual((await intents(page)).map(intent => intent.fields.actionId), [decline.id]);
});

test('Hit and Run arrows stay hidden for spectators and the waiting coach', async t => {
  for (const callerRole of ['spectator', 'away']) {
    const page = await journey(t, { ...ready, callerRole, activePlayerId: 'carrier', turnMode: 'HIT_AND_RUN',
      actions: [action('hitAndRun', 'carrier', { x: 11, y: 7 })] });
    assert.equal(await page.locator('.live-hit-and-run-choice').count(), 0);
    assert.equal(await page.getByRole('dialog', { name: 'Match decision', exact: true }).count(), 0);
    assert.deepEqual(await intents(page), []);
  }
});

test('Decline Hit and Run sends only its offered native decline command', async t => {
  const decline = { ...action('hitAndRunDecline'), label: 'Decline Hit and Run' };
  const page = await journey(t, { ...ready, activePlayerId: 'carrier', turnMode: 'HIT_AND_RUN',
    actions: [action('hitAndRun', 'carrier', { x: 11, y: 7 }), decline] });
  await page.getByRole('button', { name: 'Decline Hit and Run', exact: true }).click();
  assert.deepEqual((await intents(page)).map(intent => intent.fields.actionId), [decline.id]);
});
