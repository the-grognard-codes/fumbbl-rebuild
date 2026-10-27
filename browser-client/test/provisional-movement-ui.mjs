import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const state = (revision, x = 7) => ({ ...initial, revision, actions: [], prompt: null, activePlayerId: initial.players[0].id,
  players: [{ ...initial.players[0], x, y: 7 }] });
const record = (revision, xs = []) => ({ index: revision, revision, kind: 'action', actor: 'home', at: revision,
  decision: null, state: state(revision, xs.at(-1) ?? 7), native: xs.map(x => ({ modelChangeList: { modelChangeArray: [{
    modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: initial.players[0].id, modelChangeValue: { x, y: 7 }
  }] } })) });
const route = { routeVersion: 3, revision: 0, actor: 'home', playerId: initial.players[0].id,
  from: { x: 7, y: 7 }, remaining: 8,
  steps: [8, 9, 10].map(x => ({ x, y: 7, dodge: 0, rush: 0, reactions: [], checks: [] })) };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.clock.install();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const publish = input => page.evaluate(input => window.publishPlayback(input), { enabled: true, mode: 'live', ...input });
const at = (x, active) => page.waitForFunction(({ x, active }) => {
  const out = document.querySelector('#playback-state');
  return Number(out.dataset.x) === x && out.dataset.active === String(active);
}, { x, active });
const reset = async () => {
  await publish({ view: state(0), records: [record(0)], enabled: false }); await at(7, false);
  await publish({ view: state(0), records: [record(0)], requestPending: 'move' });
  await page.evaluate(() => { window.playbackFrames = []; });
};
const start = plan => page.evaluate(plan => window.beginProvisional(plan), plan);
try {
  await page.addInitScript(input => { window.playbackInput = input; window.playbackFrames = []; },
    { view: state(0), records: [record(0)], enabled: true, mode: 'live' });
  await page.route('**/provisional-test', route => route.fulfill({ contentType: 'text/html',
    body: '<div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/provisional-test`);
  await at(7, false);

  await reset();
  await start({ ...route, steps: route.steps.map((step, index) => index === 1 ? { ...step, dodge: 3 } : step) });
  await at(8, true); await page.waitForTimeout(350); await at(8, true);
  assert.equal(await page.locator('.live-dice-overlay').count(), 0, 'Provisional motion never invents a die');
  await publish({ view: state(1, 10), records: [record(0), record(1, [8, 9, 10])] }); await at(10, false);
  const squares = await page.evaluate(() => window.playbackFrames.map(frame => frame.x).filter((x, i, all) => !i || x !== all[i - 1]));
  assert.deepEqual(squares, [8, 9, 10], 'Accepted prefix is not replayed');
  await publish({ view: state(1, 10), records: [record(0), record(1, [8, 9, 10])] }); await at(10, false);
  assert.deepEqual(await page.evaluate(() => window.playbackFrames.map(frame => frame.x).filter((x, i, all) => !i || x !== all[i - 1])), squares,
    'Duplicate authoritative delivery does not restart motion');

  await reset(); await start(route); await at(8, true);
  await publish({ view: state(0), records: [record(0)] }); await at(7, false);
  await page.waitForTimeout(400); await at(7, false);

  await reset(); await start(route); await at(8, true);
  await publish({ view: state(0), records: [record(0)], enabled: false }); await at(7, false);
  await page.waitForTimeout(400); await at(7, false);

  await reset(); await start(route); await at(8, true);
  await publish({ view: state(1, 6), records: [record(0), record(1, [6])] }); await at(6, false);
  await page.waitForTimeout(400); await at(6, false);

  await reset(); await start({ ...route, steps: route.steps.slice(0, 1) }); await at(8, true);
  await publish({ view: state(1, 9), records: [record(0)] });
  await page.waitForFunction(() => document.querySelector('#playback-state').dataset.synchronizing === 'true');
  await at(9, false);
  assert.equal(await page.locator('#playback-state').getAttribute('data-synchronizing'), 'false');

  // A carried prefix must not briefly restore the ball to an earlier square.
  await reset();
  const carrier = x => ({ ...state(x === 7 ? 0 : 1, x), ball: { x, y: 7 },
    ballState: { version: 1, inPlay: true, moving: false, carrierPlayerId: initial.players[0].id } });
  await publish({ view: carrier(7), records: [record(0)], enabled: false }); await at(7, false);
  await publish({ view: carrier(7), records: [record(0)], requestPending: 'move' });
  await start({ ...route, steps: route.steps.slice(0, 2) }); await at(9, true);
  await page.evaluate(() => { window.playbackFrames = []; });
  const carried = record(1, [8, 9]);
  carried.state = carrier(9);
  carried.native.forEach((sync, index) => sync.modelChangeList.modelChangeArray.unshift({
    modelChangeId: 'fieldModelSetBallCoordinate', modelChangeValue: { x: 8 + index, y: 7 }
  }));
  await publish({ view: carrier(9), records: [record(0), carried] }); await at(9, false);
  assert.ok(await page.evaluate(id => window.playbackFrames.every(frame => frame.ballX === frame.x && frame.carrier === id), initial.players[0].id),
    'Every confirmation frame keeps the ball with the already shown carrier');

  await reset();
  await publish({ view: state(1), records: [record(0)] });
  await page.waitForFunction(() => document.querySelector('#playback-state').dataset.synchronizing === 'true');
  await publish({ view: { ...state(2), phase: 'FULL_TIME' }, records: [record(0)] }); await at(7, false);
  assert.equal(await page.locator('#playback-state').getAttribute('data-synchronizing'), 'false', 'Full time cancels pending synchronization');

  await reset();
  const pickup = JSON.parse(readFileSync(new URL('./fixtures/adr0003-dice.json', import.meta.url), 'utf8'))[0].reports[0];
  await page.evaluate(() => {
    window.responseRollKeys = [];
    const out = document.querySelector('#playback-state');
    window.responseRollObserver = new MutationObserver(() => {
      if (out.dataset.rollKey) window.responseRollKeys.push(out.dataset.rollKey);
    });
    window.responseRollObserver.observe(out, { attributes: true, attributeFilter: ['data-roll-key'] });
  });
  const failedPickup = record(1, [8]);
  failedPickup.native.push({ reportList: { reports: [pickup] } });
  await publish({ view: { ...state(1, 8), actions: [{ id: 'reroll', kind: 'reroll', actor: 'home',
    label: 'Use team re-roll for Pick Up', sourcePlayerId: initial.players[0].id, target: null }] },
    records: [record(0), failedPickup] }); await at(8, false);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => new Set(window.responseRollKeys).size), 1, 'A failed roll after movement animates exactly once and remains pinned');
  await page.evaluate(() => window.responseRollObserver.disconnect());

  // A roll follows its preceding square and finishes before the next square.
  await reset();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const movingRoll = record(1, [8, 9]);
  movingRoll.native.splice(1, 0, { blockContext: null }, { reportList: { reports: [pickup] } });
  await publish({ view: state(1, 9), records: [record(0), movingRoll] });
  await at(8, true);
  assert.equal(await page.locator('.live-dice-overlay .match-die').count(), 0);
  await page.clock.runFor(199); await at(8, true);
  await page.clock.runFor(1);
  await page.locator('.live-dice-overlay .match-die').waitFor();
  await page.clock.runFor(499); await at(8, true);
  await page.clock.runFor(1); await at(9, true);
  await page.clock.runFor(200); await at(9, false);
  assert.equal(await page.locator('.live-dice-overlay .match-die').count(), 1, 'Committed roll is not replayed by the movement timer');

  await reset();
  await publish({ view: state(1, 9), records: [record(0), movingRoll], mode: 'replay' });
  await at(8, true);
  assert.equal(await page.locator('.live-dice-overlay .match-die').count(), 0, 'Replay preserves its ordered animation timing');
  await page.clock.runFor(200); await at(8, true);
  await page.locator('.live-dice-overlay .match-die').waitFor();
  await page.clock.runFor(500); await at(9, true);
  await page.clock.runFor(200); await at(9, false);

  await reset();
  const finalMovingRoll = record(1, [8]);
  finalMovingRoll.native.push({ blockContext: null }, { reportList: { reports: [pickup] } });
  await publish({ view: state(1, 8), records: [record(0), finalMovingRoll] });
  await at(8, true); await page.clock.runFor(200); await page.locator('.live-dice-overlay .match-die').waitFor();
  await page.clock.runFor(499); await at(8, true);
  await page.clock.runFor(1); await at(8, false);

  await reset();
  await publish({ view: state(1, 9), records: [record(0), movingRoll] });
  await at(8, true); await page.clock.runFor(200); await page.locator('.live-dice-overlay .match-die').waitFor();
  await publish({ view: state(0), records: [record(0)], enabled: false }); await at(7, false);
  await page.clock.runFor(500); await at(7, false);
  assert.equal(await page.locator('.live-dice-overlay .match-die').count(), 0, 'Recovery cancels the early roll and remaining movement');
  await page.clock.resume();

  // An uphill chooser can be the other coach; the current viewer already has
  // authoritative faces in the state and must not wait for its transcript.
  await reset();
  const offered = { ...state(1), actions: ['BOTH DOWN', 'POW'].map((face, index) => ({
    id: `block:${index}`, kind: 'blockDie', actor: 'away', label: `Choose ${face} (die ${index + 1})`,
    sourcePlayerId: initial.players[0].id, target: null
  })) };
  await publish({ view: offered, records: [record(0)] }); await at(7, false);
  assert.deepEqual(await page.locator('.live-dice-overlay .match-die').evaluateAll(nodes => nodes.map(node => node.dataset.face)), ['BOTH DOWN', 'POW']);
  const offeredKey = await page.locator('#playback-state').getAttribute('data-roll-key');
  const authoritativeBlock = record(1);
  authoritativeBlock.native = [{ reportList: { reports: [{ reportId: 'blockRoll', blockRoll: [2, 6] }] } }];
  await publish({ view: offered, records: [record(0), authoritativeBlock] });
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#playback-state').getAttribute('data-roll-key'), offeredKey, 'Late matching history does not restart the state-derived roll');
  assert.equal(await page.locator('.live-dice-overlay .match-die').count(), 2);
  await publish({ view: { ...offered, callerRole: 'spectator' }, records: [record(0)], enabled: false });
  await publish({ view: { ...offered, callerRole: 'spectator' }, records: [record(0)] }); await at(7, false);
  assert.equal(await page.locator('.live-dice-overlay .match-die').count(), 2, 'Spectator reconnect restores available authoritative faces');
  assert.equal(await page.locator('#playback-state').getAttribute('data-roll-key'), '', 'Snapshot faces do not replay the roll animation');

  await reset();
  await start({ ...route, revision: 1 }); await page.waitForTimeout(200); await at(7, false);
  await publish({ view: state(0), records: [record(0)], mode: 'replay', requestPending: 'move' });
  await start(route); await page.waitForTimeout(200); await at(7, false);
  assert.deepEqual(errors, []);
  console.log('PASS: provisional prefix, acceptance without replay, duplicate, rejection, disconnect, divergence, missing-history/full-time recovery, carried ball, single response roll, prompt live dice with ordered motion, stale forecast and replay isolation.');
} finally { await browser.close(); await server.close(); }
