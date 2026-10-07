import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { squarePosition } from './projected-pitch-helper.mjs';

// Presentation/intent contract evidence; no synthetic fixture establishes live playability.
const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const state = { ...base, activePlayerId: null, homeTeamName: 'Ironbank Rovers of the Underground Championship', awayTeamName: 'Cinderclaw Crew',
  homeTurn: 4, awayTurn: 3, homeRerolls: 3, awayRerolls: 0,
  homeResources: { apothecaries: 1, assistantCoaches: 0, cheerleaders: 0 }, awayResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 },
  clock: { activeRole: 'home', turnElapsedMs: 28_000, homeReserveMs: 465_000, awayReserveMs: 370_000 },
  players: [ { ...base.players[0], id: 'human', role: 'home', state: 'is standing', name: 'Human Blitzer', x: 12, y: 3, number: 7, skills: ['Block', 'Tackle'], art: { rosterId: 'human', positionId: 'blitzer' } },
    { ...base.players[1], id: 'orc', role: 'away', state: 'is standing', name: 'Orc Blitzer', x: 14, y: 10, number: 9, art: { rosterId: 'orc', positionId: 'orc-blitzer' } },
    { ...base.players[0], id: 'other', name: 'Missing in action', x: null, y: null, offPitch: 'other', state: 'unknown' } ],
  actions: [{ id: '0:select-human', kind: 'select', label: 'Move Human Blitzer', actor: 'home', sourcePlayerId: 'human', target: null },
    { id: '0:end', kind: 'endTurn', label: 'End Turn', actor: 'home', sourcePlayerId: null, target: null }] };
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 660 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const evidence = process.env.PITCH_HUD_EVIDENCE_DIR;
try {
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, state);
  await page.route('**/hud-test', route => route.fulfill({ contentType: 'text/html', body: '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/hud-test`);
  await page.locator('.coach-match').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  assert.equal(await page.getByRole('region', { name: 'Match debug' }).isVisible(), true);
  const offered = page.getByLabel('Server action', { exact: true });
  assert.deepEqual(await offered.locator('option').evaluateAll(options => options.map(option => option.value)), ['', '0:select-human', '0:end']);
  await offered.selectOption('0:select-human');
  assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isEnabled(), true, 'The hosted text fallback stages a real offered proposal');
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Choosing the fallback proposal does not mutate');
  await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  assert.equal(await page.getByLabel('Message the match').count(), 0, 'Enter activates native disclosures without opening chat');
  // Cancel closes the additional row as well as clearing its proposal.
  assert.equal(await page.locator('.live-resources.home .live-resource').count(), 2);
  assert.equal(await page.locator('.live-resources.away').count(), 0);
  const resource = page.getByRole('button', { name: 'Rerolls: 3 available', exact: true });
  await resource.focus();
  assert.equal(await resource.evaluate(element => getComputedStyle(element).cursor), 'help');
  assert.equal(await page.locator('.live-resource-tooltip').first().isVisible(), true);
  assert.match(await page.locator('.live-chess-clock.home').textContent(), /^BANK\s*7:45TURN\s*1:/);
  assert.equal(await page.locator('.live-turn-track.home li').count(), 8);
  assert.equal(await page.locator('.live-turn-track.home [aria-current="step"]').textContent(), '4');
  assert.equal(await page.locator('.live-turn-track.home .past').count(), 3);
  assert.equal(await page.locator('.coach-weather-slot').textContent(), 'Nice');
  for (const selector of ['.live-resources.home', '.live-chess-clock.home', '.match-history-chat', '.match-history-log'])
    assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(9, 23, 38, 0.3)');
  const human = page.locator('[data-player-id="human"]'), orc = page.locator('[data-player-id="orc"]');
  await human.focus();
  assert.equal(await page.locator('.live-pitch-scene').evaluate(element => element.scrollTop), 0, 'Focus cannot scroll the world independently of its camera');
  await human.click(); await orc.hover();
  const card = page.getByRole('tooltip', { name: 'Orc Blitzer player card' }); await card.waitFor();
  assert.equal(await card.getAttribute('class').then(value => value.includes('dock-right')), true);
  assert.equal(await page.locator('.live-player-hover').count(), 1);
  assert.doesNotMatch(await card.textContent(), /Human Blitzer/);
  await orc.click(); await human.hover();
  const ownCard = page.getByRole('tooltip', { name: 'Human Blitzer player card' }); await ownCard.waitFor();
  assert.match(await ownCard.textContent(), /MA.*ST.*AG.*PA.*AV.*Block, Tackle/s);
  assert.deepEqual(await page.evaluate(() => window.hudIntents), []);
  await human.click();
  await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), []);
  assert.match(await page.locator('.command-preview').textContent(), /Unactivated players remain/);
  await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [{ operation: 'action', fields: { actionId: '0:end' } }]);
  assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isDisabled(), true);
  await page.evaluate(state => window.publishHud({ ...state, half: 2, homeTurn: 3, awayTurn: 0 }), state);
  assert.equal(await page.locator('.live-turn-track.home [aria-current="step"]').textContent(), '11');
  assert.equal(await page.locator('.live-turn-track.away [aria-current]').count(), 0);
  const chat = page.getByLabel('Message the match');
  assert.equal(await chat.count(), 0);
  await page.locator('.match-chat').focus(); await page.keyboard.press('Enter');
  await chat.fill('Draft <script> stays literal');
  const focus = await page.locator('.live-pitch-scene').getAttribute('data-focus');
  await chat.press('ArrowUp');
  assert.equal(await page.locator('.live-pitch-scene').getAttribute('data-focus'), focus);
  await chat.press('Escape'); assert.equal(await chat.count(), 0);
  await page.locator('.match-chat').focus(); await page.keyboard.press('Enter');
  assert.equal(await chat.inputValue(), 'Draft <script> stays literal');
  await chat.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.hudMessages), ['Draft <script> stays literal']);
  await chat.press('Escape');
  for (const [size, pixels] of [['Small', 12], ['Medium', 14], ['Large', 18]]) {
    await page.getByRole('button', { name: `${size} log text` }).click();
    assert.equal(await page.locator('.match-event-scroll').evaluate(element => parseFloat(getComputedStyle(element).fontSize)), pixels);
  }
  await page.getByRole('button', { name: /Other: 1; expand dugout/ }).click();
  await page.getByRole('button', { name: 'Missing in action, number 1, Other' }).focus();
  await page.getByRole('tooltip', { name: 'Missing in action player card' }).waitFor();
  await page.getByRole('button', { name: /Minimize Ironbank/ }).click();
  if (evidence) await mkdir(evidence, { recursive: true });
  for (const [width, height] of [[1280,660],[1920,1080],[1920,900],[1920,820],[375,660],[640,330],[375,300]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => Math.abs(document.querySelector('.live-pitch-scene').clientHeight - innerHeight) < 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
    assert.equal(await page.locator('.live-team-nameplate strong').evaluateAll(elements => elements.every(element => { const rect = element.getBoundingClientRect(), plate = element.parentElement.getBoundingClientRect(); return element.scrollWidth <= element.clientWidth + 1 && rect.top >= plate.top && rect.bottom <= plate.bottom; })), true, 'Names fit inside their fixed score plates');
    assert.equal(await page.locator('.game-menu-trigger').evaluate(element => element.getBoundingClientRect().width < 130), true, 'Game Menu cannot cover camera and exit controls');
    assert.equal(await page.locator('.live-dugouts').evaluate(element => getComputedStyle(element).display), 'flex');
    if (height <= 330) {
      assert.equal(await page.evaluate(() => document.querySelector('.live-dugouts').getBoundingClientRect().bottom <= document.querySelector('.match-history-chat').getBoundingClientRect().top), true, 'At 200% desktop zoom the compact dugouts cannot cover chat or log');
      await page.locator('.live-marker[data-player-id="human"]').focus();
      const inspector = page.getByRole('tooltip', { name: 'Human Blitzer player card' });
      await inspector.waitFor();
      assert.ok(await inspector.evaluate(element => element.getBoundingClientRect().height) >= 128, 'Short viewport leaves a readable player inspector');
      await page.getByRole('button', { name: /^Game Menu$/ }).click();
      await page.getByRole('tab', { name: 'Game Log', exact: true }).click();
      await page.getByRole('button', { name: 'Close Game Menu', exact: true }).click();
      await page.getByRole('button', { name: 'Click chat or press Enter to write', exact: true }).click();
      await chat.fill('Short viewport chat stays editable'); await chat.press('Escape');
      if (!await page.getByRole('region', { name: 'Match debug' }).isVisible()) await page.getByRole('button', { name: 'Debug', exact: true }).click();
      await offered.selectOption('0:select-human');
      assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isEnabled(), true);
      await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
      await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
    }
    if (evidence) await page.screenshot({ path: `${evidence}/hud-${width}-${height}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: authoritative HUD resources/clocks/turns, one opposite-side inspector, reviewed End Turn, editable chat draft, three log sizes, Other dugout access and responsive full-window layout.');
} finally { if (errors.length) console.error(errors); await browser.close(); await server.close(); }
