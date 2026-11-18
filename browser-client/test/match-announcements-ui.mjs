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
  await page.clock.runFor(duration - 200 / (duration === 1500 && transition === 275 ? 2 : 1));
  await page.locator('.match-splash-shade[data-exiting=true]').waitFor({ state: 'attached' });
  await page.clock.runFor(transition);
  await active(false);
};
const splash = kind => page.locator(`.match-splash-${kind}`);
const shade = page.locator('.match-splash-shade');
const finishShadeEntrance = () => shade.evaluate(node => {
  for (const transition of node.getAnimations()) transition.finish();
});
const verifyHeldShade = async () => {
  assert.deepEqual(await shade.evaluate(node => {
    const box = node.getBoundingClientRect();
    return [node === window.chainedShade, getComputedStyle(node).opacity, document.elementFromPoint(box.left + 4, box.top + 4) === node];
  }), [true, '1', true], 'The same fully dimmed shade still intercepts pitch input');
};
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
  assert.equal(await splash('turnover').getByRole('button').count(), 1, 'Timed announcements have an explicit dismiss button');
  assert.equal(await splash('turnover').getByRole('checkbox').count(), 0);
  assert.equal(await splash('turnover').locator('h2').evaluate(node => node.getAnimations()[0]?.animationName), 'splash-impact');
  await finishShadeEntrance();
  await shade.evaluate(node => { window.chainedShade = node; });
  await page.keyboard.press('Escape');
  await page.locator('.match-splash-shade[data-exiting=true]').waitFor({ state: 'attached' });
  await page.clock.runFor(100);
  await verifyHeldShade();
  await page.clock.runFor(100);
  await page.locator('.match-splash').waitFor({ state: 'detached' });
  await active(true);
  await verifyHeldShade();
  await shade.click({ position: { x: 4, y: 4 } });
  await page.clock.runFor(124);
  assert.equal(await page.locator('.match-splash').count(), 0, 'Queued banner waits for the clear interval');
  await page.clock.runFor(1);
  await splash('turnStart').waitFor();
  await verifyHeldShade();
  assert.match(await splash('turnStart').textContent(), /Blackwater Green Giants.*START OF TURN 3/s);
  await splash('turnStart').evaluate(node => {
    // Let the mocked timer own the end of the full fade/gap in this timing assertion.
    node.addEventListener('animationend', event => event.stopPropagation());
  });
  await page.keyboard.press('Escape');
  const fadingOpacity = await shade.evaluate(node => {
    // CSS uses the document timeline independently of the mocked JS clock.
    const fade = node.getAnimations().find(transition => transition.transitionProperty === 'opacity');
    fade.pause(); fade.currentTime = 100;
    return Number(getComputedStyle(node).opacity);
  });
  assert.ok(fadingOpacity > 0 && fadingOpacity < 1, 'The last announcement fades the shade with the card');
  await page.clock.runFor(549); await active(true);
  await page.clock.runFor(1); await active(false);
  assert.equal(await page.evaluate(() => window.pitchClicks), 0, 'Dismissal never clicks through');
  await advance([event('turnover'), event('turnStart', 'away')]);
  assert.equal(await page.locator('.match-splash').count(), 0, 'Duplicate delivery is not replayed');

  await reset(); await advance([event('touchdown', 'away')]); await splash('touchdown').waitFor();
  await finishTimed(3000);
  await reset(); await advance([event('turnStart')]); await splash('turnStart').waitFor();
  await finishTimed(1500);

  const longTurnover = { ...event('turnover'), reason: 'Pippin was knocked down by a thrown teammate while carrying the ball, and the ball bounced out of bounds.' };
  for (const speed of [1, 4]) {
    await reset(); await advance([longTurnover], { mode: 'replay', speed });
    await splash('turnover').waitFor();
    const reason = splash('turnover').locator('.match-splash-reason');
    assert.equal(await reason.textContent(), longTurnover.reason);
    assert.deepEqual(await reason.evaluate((node, rate) => {
      const fade = node.getAnimations().find(animation => animation.animationName === 'match-splash-dim-in');
      fade.pause(); fade.currentTime = 700 / rate;
      return [getComputedStyle(node).opacity, node.scrollWidth <= node.clientWidth];
    }, speed), ['1', true]);
    await page.clock.runFor(150);
    await advance([longTurnover], { mode: 'replay', speed: speed === 4 ? 1 : 4 });
    assert.equal(await shade.evaluate(node => node.style.getPropertyValue('--splash-rate')), String(speed));
    await page.clock.runFor(1800 / speed - 151);
    assert.equal(await shade.getAttribute('data-exiting'), 'false', 'Changing speed does not restart the current card timer');
    await page.clock.runFor(1);
    await page.locator('.match-splash-shade[data-exiting=true]').waitFor({ state: 'attached' });
    await page.clock.runFor(550 / speed); await active(false);
  }

  // Holding never prevents a mandatory response from becoming available.
  await setHold(true);
  await reset();
  const scored = record(1, [{ ...event('touchdown'), scorer: { name: 'Lineman2', number: 8 }, reason: 'Skill-Test Humans 1 1 – 0 Bogruk\'s Almost Best' }]);
  scored.state.homeScore = start.state.homeScore + 1;
  scored.state.homeTeamName = 'Skill-Test Humans 1';
  scored.state.awayTeamName = "Bogruk's Almost Best";
  scored.state.prompt = { kind: 'setup', message: 'Prepare the next drive' };
  await publish({ view: scored.state, records: [start, scored] });
  await splash('touchdown').waitFor();
  assert.equal(await splash('touchdown').locator('.match-splash-scorer').textContent(), 'Lineman2 #8');
  assert.deepEqual(await splash('touchdown').locator('.match-splash-score dt').allTextContents(), ['Skill-Test Humans 1', "Bogruk's Almost Best"]);
  assert.deepEqual(await splash('touchdown').locator('.match-splash-score dd').allTextContents(), ['1', '0']);
  await publish({ view: { ...scored.state }, records: [start, scored] });
  await page.clock.runFor(10000);
  assert.equal(await splash('touchdown').count(), 1, 'Held scoring announcement survives same-revision next-drive prompt refresh');
  await page.keyboard.press('Escape'); await page.clock.runFor(550); await active(false);
  await reset(); await advance([event('turnover')]); await splash('turnover').waitFor();
  await page.clock.runFor(10000); await splash('turnover').waitFor();
  await page.getByRole('button', { name: 'Dismiss announcement' }).waitFor();
  await finishShadeEntrance();
  const choice = { ...state(2), actions: [{ id: 'reroll', kind: 'reroll', label: 'Reroll', actor: 'home' }] };
  await publish({ view: choice, records: [start, record(1, [event('turnover')]), record(2)] });
  await page.locator('#required-choice').waitFor(); await active(false);
  assert.equal(await splash('turnover').evaluate(node => node.getAnimations().some(animation => animation.animationName === 'match-splash-exit')), true,
    'A required choice keeps the card mounted for its exit');
  assert.deepEqual(await shade.evaluate(node => [node.dataset.interrupted, getComputedStyle(node).pointerEvents]), ['true', 'none']);
  await page.locator('#required-choice').click();
  const interruptedOpacity = await shade.evaluate(node => {
    window.interruptedShade = node;
    const fade = node.getAnimations()[0];
    fade.pause(); fade.currentTime = 100;
    return Number(getComputedStyle(node).opacity);
  });
  assert.ok(interruptedOpacity > 0 && interruptedOpacity < 1);
  const afterChoice = record(3, [event('turnStart', 'away')]);
  await publish({ view: afterChoice.state, records: [start, record(1), record(2), afterChoice] });
  await splash('turnStart').waitFor();
  assert.ok(await shade.evaluate((node, opacity) => node === window.interruptedShade && Number(getComputedStyle(node).opacity) >= opacity - 0.01, interruptedOpacity),
    'The incoming card reuses the shade and reverses its fade from the current opacity');
  await page.clock.runFor(200);
  await splash('turnStart').waitFor();

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

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setHold(false);
  await reset();
  const adjacent = [start, record(1, [event('turnover')]), record(2, [event('turnStart', 'away')])];
  await publish({ view: state(2), records: adjacent });
  await splash('turnover').waitFor();
  await finishShadeEntrance();
  await shade.evaluate(node => { window.chainedShade = node; });
  await page.clock.runFor(1800);
  assert.deepEqual(await splash('turnover').evaluate(node => node.getAnimations()
    .map(animation => animation.animationName)), ['match-splash-dim-out']);
  await verifyHeldShade();
  await page.clock.runFor(200);
  await page.locator('.match-splash').waitFor({ state: 'detached' });
  await verifyHeldShade();
  await page.clock.runFor(125);
  await splash('turnStart').waitFor();
  assert.deepEqual(await splash('turnStart').evaluate(node => node.getAnimations()
    .map(animation => animation.animationName)), ['match-splash-dim-in']);
  await verifyHeldShade();
  await page.keyboard.press('Escape'); await page.clock.runFor(550); await active(false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await setHold(true);

  // A card skipped by the actual queue must release the same shade smoothly.
  await reset();
  const scoringWithChoice = record(1, [event('touchdown')]);
  scoringWithChoice.state.homeScore += 1;
  const deferredChoice = record(2, [event('turnStart', 'away')]);
  deferredChoice.state.homeScore = scoringWithChoice.state.homeScore;
  deferredChoice.state.actions = choice.actions;
  await publish({ view: deferredChoice.state, records: [start, scoringWithChoice, deferredChoice] });
  await splash('touchdown').waitFor();
  await finishShadeEntrance();
  await shade.evaluate(node => { window.chainedShade = node; });
  await page.keyboard.press('Escape');
  assert.ok(await shade.evaluate(node => node === window.chainedShade && node.dataset.shadeHeld === 'false'
    && node.getAnimations().some(transition => transition.transitionProperty === 'opacity')),
    'A suppressed turn-start is not treated as a visible card');
  await page.clock.runFor(550);
  await page.locator('#required-choice').waitFor();
  assert.equal(await splash('turnStart').count(), 0);
  await shade.waitFor({ state: 'detached' });

  await reset(); await advance([event('turnover'), event('turnStart')]); await splash('turnover').waitFor();
  await page.keyboard.press('Escape'); await page.clock.runFor(200);
  await page.locator('.match-splash').waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await splash('turnStart').waitFor({ timeout: 1500 }); // Still on the paused clock, before the gap timer fires.
  await page.keyboard.press('Escape'); await page.clock.runFor(550); await active(false);

  await reset(); await advance([event('turnover'), event('turnStart')]); await splash('turnover').waitFor();
  await finishShadeEntrance();
  await shade.evaluate(node => { window.chainedShade = node; });
  await page.keyboard.press('Escape'); await page.clock.runFor(200);
  await page.locator('.match-splash').waitFor({ state: 'detached' });
  await verifyHeldShade();
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await page.getByRole('tab', { name: 'Game Settings', exact: true }).click();
  const turnStartSetting = page.getByRole('checkbox', { name: 'Start of turn', exact: true });
  await turnStartSetting.uncheck();
  await page.keyboard.press('Escape');
  await page.clock.runFor(125);
  const emptyFade = page.locator('.match-splash-shade[data-interrupted=true]');
  assert.ok(await emptyFade.evaluate(node => node === window.chainedShade
    && node.getAnimations().some(transition => transition.transitionProperty === 'opacity')),
    'A card hidden during the gap releases the held shade with a fade');
  assert.equal(await splash('turnStart').count(), 0);
  await page.clock.runFor(200); await shade.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await page.getByRole('tab', { name: 'Game Settings', exact: true }).click();
  await turnStartSetting.check();
  await page.keyboard.press('Escape');

  // A choice or reconnect arriving in either transition phase cancels its timers.
  for (const elapsed of [100, 300]) {
    await reset(); await advance([event('turnover'), event('turnStart')]); await splash('turnover').waitFor();
    await page.keyboard.press('Escape'); await page.clock.runFor(elapsed);
    await publish({ view: choice, records: [start, record(1), record(2)] });
    await active(false); await page.locator('#required-choice').waitFor();
    assert.deepEqual(await shade.evaluate(node => [node.dataset.interrupted, getComputedStyle(node).pointerEvents]), ['true', 'none']);
    await page.clock.runFor(1000);
    assert.equal(await page.locator('.match-splash').count(), 0, 'Choice cancels fade and gap callbacks');
    await reset(); await advance([event('turnover'), event('turnStart')]); await splash('turnover').waitFor();
    await page.keyboard.press('Escape'); await page.clock.runFor(elapsed);
    await publish({ view: state(2), records: [start, record(1), record(2)], enabled: false });
    await active(false); await page.clock.runFor(1000);
    assert.equal(await page.locator('.match-splash').count(), 0, 'Reconnect cancels fade and gap callbacks');
  }

  await reset();
  await shade.waitFor({ state: 'detached' });
  const pitchNodes = page.locator('.live-pitch-viewport *');
  const baseline = await pitchNodes.count();
  for (let index = 0; index < 50; index++) {
    await reset(); await advance([event('touchdown')]); await splash('touchdown').waitFor();
    await page.keyboard.press('Escape'); await page.clock.runFor(550); await active(false);
    await shade.waitFor({ state: 'detached' });
  }
  await reset();
  await shade.waitFor({ state: 'detached' });
  assert.ok(await pitchNodes.count() <= baseline, '50 splashes retain no pitch DOM');
  await reset(); await advance([event('touchdown')]); await splash('touchdown').waitFor();
  await finishShadeEntrance();
  await page.keyboard.press('Escape');
  assert.equal(await shade.evaluate(node => node.getAnimations().some(transition => transition.transitionProperty === 'opacity')), true);
  await splash('touchdown').evaluate(node => node.dispatchEvent(new AnimationEvent('animationend', { bubbles: true, animationName: 'match-splash-exit' })));
  await page.locator('.match-splash').waitFor({ state: 'detached' });
  await page.clock.runFor(350); await active(false);
  const facts = JSON.parse(readFileSync(new URL('./fixtures/match-splash-events.json', import.meta.url), 'utf8'));
  const changingWeather = facts.find(fact => fact.code === 'WEATHER_CHANGE');
  const rain = facts.find(fact => fact.code === 'POURING_RAIN');
  const weatherKickoff = record(1, []);
  weatherKickoff.state.weather = rain.code;
  weatherKickoff.native = [{ commandNr: 11, matchAnnouncements: { version: 1,
    events: [changingWeather, rain, event('turnStart', 'away')] } }];
  await reset();
  await publish({ view: weatherKickoff.state, records: [start, weatherKickoff] });
  await splash('kickoff').waitFor();
  assert.equal(await splash('kickoff').getByRole('heading').textContent(), 'CHANGING WEATHER');
  assert.equal(await splash('kickoff').locator('.match-splash-weather-condition').textContent(), rain.headline);
  assert.match(await splash('kickoff').locator('img').getAttribute('src'), /weather_rain\.png$/);
  await page.keyboard.press('Escape'); await page.clock.runFor(550);
  await splash('turnStart').waitFor({ timeout: 1500 });
  await page.keyboard.press('Escape'); await page.clock.runFor(550); await active(false);

  await reset();
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await page.getByRole('tab', { name: 'Game Settings', exact: true }).click();
  const showKickoffs = page.getByRole('checkbox', { name: 'Kick-off events', exact: true });
  await showKickoffs.uncheck();
  await page.keyboard.press('Escape');
  await publish({ view: weatherKickoff.state, records: [start, weatherKickoff] });
  await splash('weather').waitFor(); // The standalone weather card still respects its own visibility setting.
  assert.equal(await splash('weather').getByRole('heading').textContent(), rain.headline.toUpperCase());
  await page.keyboard.press('Escape'); await page.clock.runFor(550);
  await splash('turnStart').waitFor();
  await page.keyboard.press('Escape'); await page.clock.runFor(550); await active(false);
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await page.getByRole('tab', { name: 'Game Settings', exact: true }).click();
  await showKickoffs.check();
  await page.keyboard.press('Escape');

  for (const fact of [...facts, { ...event('halfTime'), reason: 'Badgers 1 – 1 Giants' },
    { ...event('fullTime'), headline: 'END OF MATCH', code: 'WIN', reason: 'Badgers 1 – 0 Giants — Badgers wins' },
    { ...event('fullTime'), headline: 'MATCH CONCEDED', code: 'CONCEDED', reason: 'Badgers 1 – 0 Giants — Giants wins' }]) {
    await reset();
    const next = record(1, [fact]);
    next.state.callerRole = 'spectator';
    if (fact.kind === 'fullTime') next.state.phase = 'FULL_TIME';
    await publish({ view: next.state, records: [start, next] });
    await splash(fact.kind).waitFor();
    const title = fact.code === 'WEATHER_CHANGE' ? 'CHANGING WEATHER'
      : (fact.headline ?? 'HALF-TIME').toUpperCase();
    assert.equal(await splash(fact.kind).getByRole('heading').textContent(), title);
    if (fact.kind === 'halfTime' || fact.kind === 'fullTime') {
      assert.deepEqual(await splash(fact.kind).locator('.match-splash-score dt').allTextContents(), ['Altdorf Blue Badgers', 'Blackwater Green Giants']);
      assert.deepEqual(await splash(fact.kind).locator('.match-splash-score dd').allTextContents(), [String(next.state.homeScore), String(next.state.awayScore)]);
    }
    await page.keyboard.press('Escape'); await page.clock.runFor(550); await active(false);
  }
  await reset();
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await page.getByRole('tab', { name: 'Game Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Start of turn', exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await advance([event('turnStart')]); await page.clock.runFor(1000); await active(false);
  assert.equal(await splash('turnStart').count(), 0, 'Hidden kind never blocks play');
  assert.equal(await page.evaluate(() => localStorage.getItem('ffb.match.announcements.hidden')), '["turnStart"]');
  await reset(); await advance([event('touchdown')]); await splash('touchdown').waitFor();
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await page.getByRole('tab', { name: 'Game Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Touchdowns', exact: true }).uncheck();
  await page.locator('.match-splash-shade[data-exiting=true]').waitFor();
  await page.clock.runFor(550); await active(false);
  await page.getByRole('checkbox', { name: 'Touchdowns', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Start of turn', exact: true }).check();
  await page.keyboard.press('Escape');
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
  await page.getByRole('button', { name: 'Dismiss announcement' }).click(); await page.clock.runFor(550); await active(false);
  assert.deepEqual(errors, []);
  console.log('PASS match announcements: ordering, duration, dismissal, choice priority, deduplication, catch-up, replay, rapid turns and responsive previews');
} finally { await browser.close(); await server.close(); }
