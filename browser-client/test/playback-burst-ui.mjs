import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const state = revision => ({ ...initial, revision, actor: 'away', actions: [], prompt: null,
  players: initial.players.map((player, index) => index ? player : { ...player, x: 7 + revision % 10 }) });
const records = Array.from({ length: 31 }, (_, revision) => ({ index: revision, revision, kind: 'action', actor: 'away',
  at: revision, decision: null, state: state(revision), native: revision ? [{ commandNr: revision,
    modelChangeList: { modelChangeArray: [{ modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: initial.players[0].id,
      modelChangeValue: { x: 7 + revision % 10, y: initial.players[0].y } }] },
    ...(revision % 2 === 0 ? { reportList: { reports: [{ reportId: 'blockRoll', blockRoll: [1, 3, 6], defenderId: 'away1' }] } } : {}),
    ...([10, 20, 30].includes(revision) ? { matchAnnouncements: { version: 1, events: [{
      kind: revision === 10 ? 'turnover' : revision === 20 ? 'touchdown' : 'turnStart', team: 'away', turn: 2, half: 1, reason: null
    }] } } : {}) }] : [] }));
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const evidence = [];
const maximumLagMs = 15000;
const kinds = ['turnover', 'touchdown', 'turnStart'];
const expectedPositions = Array.from({ length: 30 }, (_, index) => 7 + (index + 1) % 10);
const assertOrdered = (frames, lastRevision) => {
  const revisions = new Set(frames.map(frame => frame.revision));
  for (let revision = 1; revision <= lastRevision; revision++) assert.ok(revisions.has(revision), `Revision ${revision} must be presented`);
  const dice = [...new Set(frames.filter(frame => frame.faces.length && frame.diceRevision).map(frame => frame.diceRevision))];
  assert.deepEqual(dice, Array.from({ length: 15 }, (_, index) => (index + 1) * 2));
  const positions = frames.map(frame => frame.x).filter((x, index, all) => !index || all[index - 1] !== x);
  assert.deepEqual(positions.slice(-30), expectedPositions);
  return dice.length;
};
try {
  for (const reduced of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(input => { window.playbackInput = input; window.playbackFrames = []; },
      { view: state(0), records: [records[0]], enabled: true, mode: 'live' });
    await page.route('**/burst-test', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/burst-test`);
    await page.locator('#playback-state').waitFor({ state: 'attached' });
    const publish = input => page.evaluate(input => window.publishPlayback(input), input);
    const reset = async hold => {
      await publish({ view: state(0), records: [records[0]], enabled: false, mode: 'live' });
      await page.waitForFunction(() => document.querySelector('#playback-state').dataset.revision === '0');
      await page.evaluate(hold => window.holdPlaybackAnnouncements(hold), hold);
      await page.evaluate(() => { window.playbackFrames = []; });
    };
    const started = await page.evaluate(input => { window.playbackFrames = []; const started = performance.now(); window.publishPlayback(input); return started; },
      { view: state(30), records, enabled: true, mode: 'live' });
    await page.waitForFunction(() => document.querySelector('#playback-state').dataset.revision === '30', undefined, { timeout: maximumLagMs });
    await page.waitForFunction(() => document.querySelector('#playback-state').dataset.active === 'false', undefined, { timeout: maximumLagMs });
    const frames = await page.evaluate(() => window.playbackFrames);
    const finalBoard = frames.find(frame => frame.revision === 30);
    const drained = frames.find(frame => frame.revision === 30 && !frame.active);
    const boardLagMs = finalBoard.monotonicMs - started;
    const drainMs = drained.monotonicMs - started;
    const rolls = assertOrdered(frames, 30);
    const announcements = frames.filter(frame => frame.announcement).map(frame => frame.announcement).filter((kind, index, all) => !index || kind !== all[index - 1]);
    assert.deepEqual(announcements, kinds);
    const readings = kinds.map((kind, index) => {
      const shown = frames.find(frame => frame.announcement === kind && !frame.announcementExiting);
      const exitIndex = frames.findIndex(frame => frame.announcement === kind && frame.announcementExiting);
      assert.notEqual(exitIndex, -1, `${kind} has a visible exit`);
      const fadeEnd = frames.slice(exitIndex + 1).find(frame => !frame.announcement && frame.announcementExiting);
      assert.ok(fadeEnd, `${kind} clears before the next card or input`);
      const next = index === kinds.length - 1 ? drained : frames.find(frame => frame.announcement === kinds[index + 1]);
      assert.equal(shown.announcementRate, 1, 'Catch-up must never change splash speed');
      const durationMs = frames[exitIndex].monotonicMs - shown.monotonicMs;
      const fadeMs = fadeEnd.monotonicMs - frames[exitIndex].monotonicMs;
      const clearGapMs = next.monotonicMs - fadeEnd.monotonicMs;
      assert.ok(durationMs >= (kind === 'turnStart' ? 1450 : 2950), `${kind} keeps its full reading duration: ${durationMs}`);
      assert.ok(fadeMs >= 180, `${kind} keeps its animated fade within one frame: ${fadeMs}`);
      assert.ok(clearGapMs >= 330, `${kind} keeps its clear gap within one frame: ${clearGapMs}`);
      return { kind, durationMs, fadeMs, clearGapMs };
    });
    assert.ok(boardLagMs <= maximumLagMs && drainMs <= maximumLagMs, 'The fixed burst keeps the stated 15-second maximum lag and drain bounds');
    if (reduced) assert.ok(frames.every(frame => frame.duration <= 16));
    console.log(`PASS burst reduced=${reduced} boardLagMs=${boardLagMs.toFixed(1)} drainMs=${drainMs.toFixed(1)} revisions=30 rolls=${rolls} fullSplashes=3`);

    await reset(true);
    await publish({ view: state(30), records, enabled: true, mode: 'live' });
    await page.locator('.match-splash-shade').waitFor();
    const heldAt = await page.evaluate(() => performance.now());
    const urgent = { ...state(30), revision: 31, prompt: { id: 'urgent', actor: 'home', kind: 'coin', options: ['heads', 'tails'] } };
    await publish({ view: urgent, records: [...records, { ...records[30], index: 31, revision: 31, state: urgent, native: [] }], enabled: true, mode: 'live' });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#required-choice').count(), 0, 'A required choice must not interrupt the held splash');
    await page.waitForFunction(() => document.querySelector('#playback-state').dataset.revision === '31', undefined, { timeout: maximumLagMs });
    assert.equal(await page.locator('#playback-state').getAttribute('data-announcement'), 'turnover', 'Moves and dice drain behind the still-held first splash');
    const heldFrames = await page.evaluate(() => window.playbackFrames);
    assertOrdered(heldFrames, 31);
    const heldRemaining = await page.evaluate(heldAt => Math.max(0, 3000 - (performance.now() - heldAt)), heldAt);
    if (heldRemaining) await page.waitForTimeout(heldRemaining);
    for (const kind of kinds) {
      await page.waitForFunction(kind => document.querySelector('#playback-state').dataset.announcement === kind, kind);
      assert.equal(await page.locator('#required-choice').count(), 0);
      await page.getByRole('button', { name: 'Dismiss announcement' }).click();
    }
    await page.locator('#required-choice').waitFor();
    const heldAll = await page.evaluate(() => window.playbackFrames);
    assert.deepEqual(heldAll.filter(frame => frame.announcement).map(frame => frame.announcement).filter((kind, index, all) => !index || kind !== all[index - 1]), kinds);
    console.log(`PASS held choice reduced=${reduced} all31Revisions=true all15Rolls=true splashesBeforeChoice=3`);

    await reset(false);
    const scoring = { ...state(0), revision: 1, awayScore: initial.awayScore + 1,
      actions: [{ id: 'star-of-the-show', kind: 'skill', label: 'Use Star of the Show', actor: 'home' }] };
    const scoringRecord = { ...records[1], index: 1, revision: 1, state: scoring,
      native: [{ commandNr: 1, matchAnnouncements: { version: 1, events: [{ kind: 'touchdown', team: 'away', turn: 2, half: 1, reason: null }] } }] };
    const scoringAt = Date.now();
    await publish({ view: scoring, records: [records[0], scoringRecord], enabled: true, mode: 'live' });
    await page.locator('.match-splash-shade').waitFor();
    assert.equal(await page.locator('#required-choice').count(), 0);
    await page.locator('#required-choice').waitFor({ timeout: 6000 });
    assert.ok(Date.now() - scoringAt >= 2950, 'A touchdown and cleanup choice in one update present the full splash first');
    assert.deepEqual(errors, []);
    evidence.push({ reduced, boardLagMs, drainMs, readings, revisions: 30, rolls, announcements: 3, heldRevisions: 31, heldRolls: 15, sameUpdateCleanupChoice: true });
    await page.close();
  }
  if (process.env.PLAYBACK_BURST_EVIDENCE) writeFileSync(process.env.PLAYBACK_BURST_EVIDENCE, JSON.stringify({ version: 1, maximumLagMs, browser: browser.version(), evidence }, null, 2));
} finally { await browser.close(); await server.close(); }
