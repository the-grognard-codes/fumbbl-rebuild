import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';
import { modularStadiumVenues, modularStadiumTeams } from '../src/generated-stadium-modules.ts';

// These fixtures verify public presentation and intent routing; the native server owns skill legality and expiry.
const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const reaction = { id: 'diving-1', actor: 'away', title: 'Use Diving Tackle?', detail: 'Choose a player or decline.',
  serverNow: 1_800_000_000_000, expiresAt: 1_800_000_030_000 };
const action = (id, kind, label, target = null, sourcePlayerId = null) => ({ id, kind, label, actor: 'away', target, sourcePlayerId });
const use = action('use-away', 'reactiveSkill', 'Use Diving Tackle with away1', { playerId: 'away1' });
const decline = action('decline', 'reactiveSkill', 'Decline Diving Tackle');
const state = { ...base, callerRole: 'away', actor: 'home', reaction, actions: [use, decline] };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const publish = async next => {
  await page.evaluate(next => { window.hudIntents = []; window.publishHud(next); }, next);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const sent = id => [{ operation: 'action', fields: { actionId: id } }];
try {
  await page.clock.install();
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, state);
  await page.route('**/reaction-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/reaction-test`);
  await page.locator('.coach-match').waitFor();
  const timer = page.getByRole('timer', { name: 'Reaction time remaining' });
  assert.equal(await timer.textContent().then(text => text.trim()), '30s remaining');
  assert.equal(await page.getByText(reaction.detail, { exact: true }).isVisible(), true);
  await page.clock.runFor(2100);
  assert.match(await timer.textContent(), /28s remaining/);
  await publish({ ...state, revision: state.revision + 1 });
  assert.ok(parseInt(await timer.textContent()) <= 28, 'View revisions cannot restart the countdown');
  await publish({ ...state, callerRole: 'home' });
  assert.equal(await page.getByRole('button', { name: decline.label, exact: true }).count(), 0);
  await publish(state);
  assert.ok(parseInt(await timer.textContent()) <= 28, 'Remounting a coach decision retains its deadline');
  await page.clock.fastForward(35_000);
  assert.match(await timer.textContent(), /0s.*Awaiting server/);
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Expiry never sends a client decline');
  await page.getByRole('button', { name: decline.label, exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent('decline'));

  const nextReaction = { ...reaction, id: 'diving-2', serverNow: reaction.serverNow + 10_000, expiresAt: reaction.expiresAt + 10_000 };
  await publish({ ...state, reaction: nextReaction });
  const player = page.locator('[data-player-id="away1"]');
  assert.match(await player.getAttribute('class'), /target/);
  await player.click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent('use-away'), 'The inactive coach can select a reactive player on the pitch');

  const square = action('square-12-7', 'reactiveSquare', 'Use Side Step at 12, 7', { x: 12, y: 7 });
  const squareState = { ...state, revision: state.revision + 2, reaction: { ...nextReaction, id: 'square', title: 'Choose a Side Step square' }, actions: [square] };
  await publish(squareState);
  assert.equal(await page.locator('.live-target-square').count(), 1);
  const target = await squarePosition(page, 12, 7); await page.mouse.click(target.x, target.y);
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent(square.id));

  const committedPush = action('9:push:away1:12:7', 'push', 'Push to 12, 7', { x: 12, y: 7 });
  await publish({ ...squareState, reaction: { ...nextReaction, id: 'legacy-side-step', title: 'Side Step' }, actions: [committedPush] });
  const committedDialog = page.getByRole('dialog', { name: 'Match decision', exact: true });
  assert.equal(await committedDialog.getAttribute('aria-modal'), 'false');
  assert.match(await committedDialog.textContent(), /highlighted square/);
  assert.equal(await committedDialog.getByRole('timer').count(), 1);
  await page.getByRole('button', { name: committedPush.label, exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent(committedPush.id));

  const occupied = action('dump-off-home', 'reactiveSquare', 'Use Dump-Off at 7, 7', { x: 7, y: 7 });
  await publish({ ...squareState, reaction: { ...nextReaction, id: 'dump-off', title: 'Use Dump-Off?' }, actions: [occupied, decline] });
  const recipient = page.locator('[data-player-id="home1"]');
  assert.match(await recipient.getAttribute('class'), /target/);
  await recipient.click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent(occupied.id), 'An occupied atomic skill destination remains selectable by its player marker');

  const movement = { ...state, revision: state.revision + 3, reaction: { ...nextReaction, id: 'onball', title: 'On the Ball' },
    actions: [action('move-12-7', 'reactionMove', 'Move away1 to 12, 7', { x: 12, y: 7 }, 'away1'),
      action('finish', 'reactionEnd', 'Finish On the Ball movement')] };
  await publish(movement);
  await player.click();
  assert.equal(await page.locator('.live-target-square').count(), 1);
  const destination = await squarePosition(page, 12, 7); await page.mouse.click(destination.x, destination.y);
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent('move-12-7'));
  await publish(movement); await page.getByRole('button', { name: 'Finish On the Ball movement', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent('finish'));

  const rolls = { ...state, revision: state.revision + 4, reaction: { ...nextReaction, id: 'reroll', title: 'Diving Tackle reroll' },
    actions: [action('roll-keep', 'reroll', 'Keep the roll'), action('roll-use', 'reroll', 'Use team reroll')] };
  await publish(rolls);
  assert.equal(await page.locator('.pitch-decision-overlay').getByRole('timer').count(), 1);
  await page.getByRole('button', { name: 'Keep the roll', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent('roll-keep'));

  await publish({ ...state, callerRole: 'spectator' });
  assert.equal(await page.locator('dialog[open], .pitch-decision-overlay[role="dialog"]').count(), 0);
  assert.equal(await page.getByRole('button', { name: decline.label, exact: true }).count(), 0);
  assert.equal(await page.locator('.reaction-status').isVisible(), true);
  assert.equal(await page.getByRole('timer', { name: 'Reaction time remaining' }).count(), 0);
  const replay = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  replay.on('pageerror', error => errors.push(error.message));
  await replay.addInitScript(state => { window.reactionReplayState = state; }, state);
  await replay.route('**/reactive-replay-test', route => route.fulfill({ contentType: 'text/html', body:
    '<main id="app"></main><script type="module" src="/test/reactive-replay-harness.tsx"></script>' }));
  await replay.goto(`http://127.0.0.1:${server.httpServer.address().port}/reactive-replay-test`);
  await replay.getByRole('region', { name: 'Replay event', exact: true }).waitFor();
  assert.equal(await replay.locator('dialog[open], .pitch-decision-overlay[role="dialog"]').count(), 0);
  assert.equal(await replay.getByRole('button', { name: decline.label, exact: true }).count(), 0);
  assert.equal(await replay.getByRole('timer', { name: 'Reaction time remaining' }).count(), 0);
  await replay.close();
  const evidenceDir = new URL('../../.tools/reactive-review/', import.meta.url);
  await mkdir(evidenceDir, { recursive: true });
  const profiles = [
    { name: 'desktop-wide', viewport: { width: 1366, height: 768 } },
    { name: 'desktop-compact', viewport: { width: 1280, height: 800 } },
    { name: 'android-portrait', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    { name: 'android-landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }
  ];
  const playCss = readFileSync(new URL('../../site/src/assets/play.css', import.meta.url), 'utf8');
  for (const [league, theme] of Object.entries(modularStadiumVenues)) for (const profile of profiles) {
    const review = await browser.newPage({ viewport: profile.viewport, isMobile: profile.isMobile ?? false,
      hasTouch: profile.hasTouch ?? false, reducedMotion: 'reduce' });
    review.on('pageerror', error => errors.push(error.message));
    const rosterId = Object.keys(modularStadiumTeams).find(roster => modularStadiumTeams[roster] === theme);
    const themed = { ...state, homeTeamArt: { rosterId, league }, awayTeamArt: { rosterId: 'orc', league: 'Badlands Brawl' },
      reaction: { ...reaction, id: `review-${theme}-${profile.name}` } };
    await review.clock.install();
    await review.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, themed);
    await review.route('**/reactive-visual-test', route => route.fulfill({ contentType: 'text/html', body:
      '<meta name="viewport" content="width=device-width, initial-scale=1"><body class="game-match"><div id="game-root"><main id="app" class="play-runtime live-match-page"></main></div><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
    await review.goto(`http://127.0.0.1:${server.httpServer.address().port}/reactive-visual-test`);
    await review.addStyleTag({ content: playCss });
    await review.evaluate(() => document.fonts.ready);
    const dialog = review.getByRole('dialog', { name: 'Match decision', exact: true });
    await dialog.waitFor();
    const countdown = review.getByRole('timer', { name: 'Reaction time remaining' });
    const declineButton = review.getByRole('button', { name: decline.label, exact: true });
    assert.equal(await countdown.isVisible(), true, `${theme}/${profile.name}: countdown visible`);
    assert.equal(await declineButton.isEnabled(), true, `${theme}/${profile.name}: decline enabled`);
    await review.clock.runFor(1100);
    assert.ok(parseInt(await countdown.textContent()) <= 29, `${theme}/${profile.name}: countdown ticks`);
    const rect = await dialog.boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= profile.viewport.width + 1
      && rect.y + rect.height <= profile.viewport.height + 1, `${theme}/${profile.name}: dialog within viewport ${JSON.stringify(rect)}`);
    const reachable = await declineButton.evaluate(button => {
      const rect = button.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      return x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && button.contains(document.elementFromPoint(x, y));
    });
    assert.equal(reachable, true, `${theme}/${profile.name}: decline is reachable`);
    await review.screenshot({ path: fileURLToPath(new URL(`${theme}-${profile.name}.png`, evidenceDir)) });
    const scenery = review.locator('.pitch-stadium-world');
    if (profile.name === 'android-portrait' && await scenery.count() === 0)
      console.log(`${theme}/${profile.name}: reaction controls pass; existing perspective scenery is absent at this aspect ratio.`);
    else assert.ok(await scenery.locator('.pitch-stadium-turf').count() > 0, `${theme}/${profile.name}: existing turf remains`);
    assert.equal(await review.locator('.pitch-stadium-structure, [data-jigsaw-piece], [data-stadium-role], .stadium-gesture').count(), 0,
      `${theme}/${profile.name}: stadium and crowd graphics are absent`);
    if (profile.hasTouch) await declineButton.tap(); else await declineButton.click();
    assert.deepEqual(await review.evaluate(() => window.hudIntents), sent('decline'));
    await review.close();
  }
  assert.deepEqual(errors, []);
  console.log('Reactive skill choices, square and movement controls, native roll timing, monotonic expiry, observer isolation and both team themes without stadium graphics across desktop/Android viewports passed.');
} finally { await browser.close(); await server.close(); }
