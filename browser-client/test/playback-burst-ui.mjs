import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    const started = Date.now();
    await page.evaluate(input => { window.playbackFrames = []; window.publishPlayback(input); },
      { view: state(30), records, enabled: true, mode: 'live' });
    await page.waitForFunction(() => { const out = document.querySelector('#playback-state');
      return out.dataset.revision === '30' && out.dataset.active === 'false'; }, undefined, { timeout: 15000 });
    const elapsed = Date.now() - started;
    const frames = await page.evaluate(() => window.playbackFrames);
    const diceOrder = [...new Set(frames.filter(frame => frame.faces.length && frame.diceRevision).map(frame => frame.diceRevision))];
    assert.deepEqual(diceOrder, Array.from({ length: 15 }, (_, index) => (index + 1) * 2), 'Every native block roll is revealed in order');
    const announcements = frames.filter(frame => frame.announcement).map(frame => frame.announcement)
      .filter((kind, index, all) => !index || all[index - 1] !== kind);
    assert.deepEqual(announcements, ['turnover', 'touchdown', 'turnStart']);
    const required = { ...state(30), prompt: { id: 'required', actor: 'home', kind: 'coin', options: ['heads', 'tails'] } };
    await page.evaluate(input => window.publishPlayback(input), { view: required, records, enabled: true, mode: 'live' });
    await page.locator('#required-choice').waitFor();
    const positions = frames.map(frame => frame.x).filter((x, index, all) => !index || all[index - 1] !== x);
    assert.deepEqual(positions.slice(-30), Array.from({ length: 30 }, (_, index) => 7 + (index + 1) % 10), 'Every confirmed movement commits in order');
    assert.ok(elapsed <= 15000, `Thirty-revision burst must drain in 15 seconds: ${elapsed}`);
    if (reduced) assert.ok(frames.every(frame => frame.duration <= 16), 'Reduced motion preserves discrete updates without movement animation');
    assert.deepEqual(errors, []);
    console.log(`PASS 30-revision burst reduced=${reduced} drainMs=${elapsed} rolls=${diceOrder.length} announcements=${announcements.join(',')}`);
    // Established choice priority also applies to a held banner during accelerated playback.
    await page.evaluate(input => window.publishPlayback(input), { view: state(0), records: [records[0]], enabled: false, mode: 'live' });
    await page.evaluate(() => window.holdPlaybackAnnouncements(true));
    await page.evaluate(input => window.publishPlayback(input), { view: state(30), records, enabled: true, mode: 'live' });
    await page.locator('.match-splash-shade').waitFor();
    const choiceStarted = Date.now();
    const urgent = { ...state(31), prompt: { id: 'urgent', actor: 'home', kind: 'coin', options: ['heads', 'tails'] } };
    await page.evaluate(input => window.publishPlayback(input), { view: urgent, records: [...records, { ...records[30], index: 31, revision: 31, state: urgent, native: [] }], enabled: true, mode: 'live' });
    await page.locator('#required-choice').waitFor({ timeout: 1000 });
    assert.ok(Date.now() - choiceStarted < 1000, 'A held catch-up announcement cannot trap an offered mandatory choice');
    console.log(`PASS mandatory choice interrupts held catch-up reduced=${reduced}`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
