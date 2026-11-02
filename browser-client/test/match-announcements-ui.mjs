import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const state = revision => ({ ...initial, revision, actions: [], prompt: null, phase: 'PLAY', turnMode: 'REGULAR',
  homeTeamName: 'Altdorf Blue Badgers', awayTeamName: 'Blackwater Green Giants',
  homeTeamArt: { rosterId: 'human', league: null }, awayTeamArt: { rosterId: 'orc', league: null } });
const event = (kind, team = 'home', turn = 3) => ({ kind, team, turn, half: 1,
  reason: kind === 'turnover' ? 'Teammate Pippin knocked down by a thrown player.' : null });
const record = (revision, events = []) => ({ index: revision, revision, kind: 'ACTION', actor: 'home', at: revision,
  decision: null, state: state(revision), native: events.map((event, index) => ({ commandNr: revision * 10 + index + 1,
    matchAnnouncements: { version: 1, events: [event] } })) });
const start = record(0);
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.clock.install({ time: new Date('2026-11-02T12:00:00Z') });
await page.clock.pauseAt(new Date('2026-11-02T12:00:01Z'));
const errors = []; page.on('pageerror', error => errors.push(error.message));
const publish = input => page.evaluate(input => window.publishAnnouncements(input), { enabled: true, mode: 'live', ...input });
const active = value => page.locator(`#announcement-state[data-active="${value}"]`).waitFor({ state: 'attached' });
const finishTimed = async (duration, transition = 550) => {
  await page.clock.runFor(duration);
  await page.locator('.match-splash-shade[data-exiting=true]').waitFor({ state: 'attached' });
  await page.clock.runFor(transition);
  await active(false);
};
const splash = kind => page.locator(`.match-splash-${kind}`);
const setHold = async hold => {
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Game Menu', exact: true });
  await menu.getByRole('tab', { name: 'Interface', exact: true }).click();
  assert.equal(await menu.getByRole('checkbox', { name: 'Keep announcements until dismissed' }).count(), 0);
  await menu.getByRole('tab', { name: 'Game Settings', exact: true }).click();
  await menu.getByRole('checkbox', { name: 'Keep announcements until dismissed' }).setChecked(hold);
  // Escape closes the menu without dismissing any held splash behind it.
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
};
const reset = async () => {
  await publish({ view: state(0), records: [start], enabled: false });
  await page.locator('#announcement-state[data-revision="0"]').waitFor({ state: 'attached' });
  await active(false);
  await publish({ view: state(0), records: [start] });
};
const advance = async (events, options = {}) => {
  const next = record(1, events);
  await publish({ view: next.state, records: [start, next], ...options });
};
try {
  await page.addInitScript(input => { window.announcementInput = input; }, { view: state(0), records: [start], enabled: true, mode: 'live' });
  await page.route('**/announcement-test', route => route.fulfill({ contentType: 'text/html',
    body: '<div id="app"></div><script type="module" src="/test/announcement-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/announcement-test`);
  await active(false);
  assert.equal(await page.locator('.match-splash').count(), 0, 'No announcement on initial load');
  await page.locator('#focus-anchor').focus();
  await advance([event('turnover'), event('turnStart', 'away')]);
  await splash('turnover').waitFor(); await active(true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'focus-anchor', 'No focus theft');
  assert.match(await page.locator('[role=status]').last().textContent(), /TURNOVER.*Pippin/);
  assert.equal(await splash('turnover').getByRole('button').count(), 0, 'Timed announcements have no controls');
  assert.equal(await splash('turnover').getByRole('checkbox').count(), 0);
  await page.clock.runFor(1000);
  await page.keyboard.press('Escape');
  await page.locator('.match-splash-shade[data-exiting=true]').waitFor({ state: 'attached' });
  await page.clock.runFor(100);
  const fadingOpacity = await page.locator('.match-splash-shade').evaluate(node => {
    // CSS uses the document timeline rather than Playwright's mocked JS clock.
    for (const animation of node.getAnimations()) { animation.pause(); animation.currentTime = 100; }
    return Number(getComputedStyle(node).opacity);
  });
  assert.ok(fadingOpacity > 0 && fadingOpacity < 1, 'Pitch dimming fades out smoothly');
  await page.clock.runFor(100);
  assert.equal(await page.locator('.match-splash').count(), 0, 'Banner clears after the fade');
  await active(true);
  await page.clock.runFor(349);
  assert.equal(await page.locator('.match-splash').count(), 0, 'Queued banner waits for the clear interval');
  await page.clock.runFor(1);
  await splash('turnStart').waitFor();
  assert.match(await splash('turnStart').textContent(), /Blackwater Green Giants.*START OF TURN 3/s);
  await page.keyboard.press('Escape'); await page.clock.runFor(550); await active(false);
  assert.equal(await page.evaluate(() => window.pitchClicks), 0, 'Dismissal never clicks through');
  await advance([event('turnover'), event('turnStart', 'away')]);
  assert.equal(await page.locator('.match-splash').count(), 0, 'Duplicate delivery is not replayed');

  await reset(); await advance([event('touchdown', 'away')]); await splash('touchdown').waitFor();
  await finishTimed(3000);
  await reset(); await advance([event('turnStart')]); await splash('turnStart').waitFor();
  await finishTimed(1500);

  // Holding never prevents a mandatory response from becoming available.
  await setHold(true);
  await reset(); await advance([event('turnover')]); await splash('turnover').waitFor();
  await page.clock.runFor(10000); await splash('turnover').waitFor();
  await page.getByRole('button', { name: 'Dismiss announcement' }).waitFor();
  const choice = { ...state(2), actions: [{ id: 'reroll', kind: 'reroll', label: 'Reroll', actor: 'home' }] };
  await publish({ view: choice, records: [start, record(1, [event('turnover')]), record(2)] });
  await page.locator('#required-choice').waitFor(); await active(false);
  assert.equal(await page.locator('.match-splash').count(), 0);

  await reset(); await advance([event('turnover')]); await splash('turnover').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Dismiss announcement' }).isVisible(), true, 'Preference survives queue recovery');
  assert.equal(await page.evaluate(() => localStorage.getItem('ffb.match.announcements.hold')), 'true');
  await publish({ view: state(1), records: [start, record(1, [event('turnover')])], enabled: false }); await active(false);
  await publish({ view: state(1), records: [start, record(1, [event('turnover')])] });
  assert.equal(await page.locator('.match-splash').count(), 0, 'Reconnect never repeats the current event');

  await reset(); await advance([event('turnover')]); await splash('turnover').waitFor();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await active(false);
  await publish({ view: state(3), records: [start, record(1), record(2), record(3, [event('turnStart')])] });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await active(false); assert.equal(await page.locator('.match-splash').count(), 0, 'Hidden-tab catch-up discards historical events');

  await reset(); await advance([event('touchdown')], { mode: 'replay', speed: 2 }); await splash('touchdown').waitFor();
  await setHold(false); await finishTimed(1500, 275);
  await publish({ view: state(2), records: [start, record(1), record(2, [event('turnStart')])], mode: 'replay', snapshotKey: 1 });
  await active(false); assert.equal(await page.locator('.match-splash').count(), 0, 'Adjacent replay seek is also a snapshot');

  // A rapid computer backlog preserves every ordinary transition in order.
  await setHold(true);
  await reset();
  const backlog = [start, record(1, [event('turnover'), event('turnStart', 'away')]), record(2, [event('turnover', 'away'), event('turnStart')])];
  await publish({ view: state(2), records: backlog });
  for (const kind of ['turnover', 'turnStart', 'turnover', 'turnStart']) {
    await splash(kind).waitFor(); await page.clock.runFor(200);
    await page.getByRole('button', { name: 'Dismiss announcement' }).click();
    await page.keyboard.press('Escape'); // A second dismissal cannot skip a queued banner.
    await page.clock.runFor(200);
    assert.equal(await page.locator('.match-splash').count(), 0);
    await active(true);
    await page.clock.runFor(350);
  }
  await active(false);
  assert.equal(await page.evaluate(() => window.pitchClicks), 0, 'Close buttons never click through');

  // A choice or reconnect arriving in either transition phase cancels its timers.
  for (const elapsed of [100, 300]) {
    await reset(); await advance([event('turnover'), event('turnStart')]); await splash('turnover').waitFor();
    await page.keyboard.press('Escape'); await page.clock.runFor(elapsed);
    await publish({ view: choice, records: [start, record(1), record(2)] });
    await active(false); await page.locator('#required-choice').waitFor();
    await page.clock.runFor(1000);
    assert.equal(await page.locator('.match-splash').count(), 0, 'Choice cancels fade and gap callbacks');
    await reset(); await advance([event('turnover'), event('turnStart')]); await splash('turnover').waitFor();
    await page.keyboard.press('Escape'); await page.clock.runFor(elapsed);
    await publish({ view: state(2), records: [start, record(1), record(2)], enabled: false });
    await active(false); await page.clock.runFor(1000);
    assert.equal(await page.locator('.match-splash').count(), 0, 'Reconnect cancels fade and gap callbacks');
  }

  await page.clock.resume();
  const output = fileURLToPath(new URL('../../.notes/art-preview/match-announcements/', import.meta.url));
  mkdirSync(output, { recursive: true });
  for (const width of [1440, 390]) for (const kind of ['turnover', 'touchdown', 'turnStart']) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: width === 390 ? 'reduce' : 'no-preference' });
    // Start each visual example with a camera fitted to its viewport.
    await page.reload(); await active(false);
    await reset();
    const next = record(1, [event(kind, kind === 'touchdown' ? 'away' : 'home')]);
    next.state.homeTeamName = width === 390 ? 'The Extraordinarily Persistent Altdorf Blue Badgers' : 'Altdorf Blue Badgers';
    await publish({ view: next.state, records: [start, next], colors: width === 390 ? { accent: '#49beae', secondary: '#456bb5' } : undefined });
    await splash(kind).waitFor();
    if (width === 390) assert.equal(await splash(kind).evaluate(node => getComputedStyle(node).animationName), 'none');
    assert.equal(await splash(kind).evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Text fits banner width');
    const bounds = await splash(kind).boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Banner fits narrow viewport');
    await page.clock.runFor(200);
    // Freeze only the preview capture; timing and reduced-motion behavior were exercised above.
    await page.locator('.match-splash-shade, .match-splash').evaluateAll(nodes => nodes.forEach(node => { node.style.animation = 'none'; }));
    await page.screenshot({ path: `${output}/${kind}-${width}.png`, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 320, height: 480 }); await reset();
  const lengthy = { ...event('turnover'), reason: 'Teammate Bartholomew the Surprisingly Resilient was knocked down by a thrown player. '.repeat(6).trim() };
  await advance([lengthy]); await splash('turnover').waitFor();
  assert.equal(await splash('turnover').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  assert.ok((await splash('turnover').boundingBox()).y >= 0, 'Tall content starts within the scrollable overlay');
  await page.getByRole('button', { name: 'Dismiss announcement' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Dismiss announcement' }).click(); await page.clock.runFor(360); await active(false);
  assert.deepEqual(errors, []);
  console.log('PASS match announcements: ordering, duration, dismissal, choice priority, deduplication, catch-up, replay, rapid turns and responsive previews');
} finally { await browser.close(); await server.close(); }
