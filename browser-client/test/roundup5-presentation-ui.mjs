import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
// Captured from Roundup5NativeActionsTest; preserve native partial/full report ordering.
const nativeRerolls = readFileSync(new URL('./fixtures/roundup5-reroll-contracts.jsonl', import.meta.url), 'utf8')
  .trim().split(/\r?\n/).map(line => JSON.parse(line));
const state = (revision, x = 7) => ({ ...base, revision, actions: [], prompt: null,
  players: base.players.map((player, index) => index ? player : { ...player, x, y: 7 }) });
const record = (revision, native = [], view = state(revision)) => ({
  index: revision, revision, kind: 'action', actor: 'home', at: revision, decision: null, state: view, native
});
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const failures = [];
async function check(name, test) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(input => { window.playbackInput = input; window.playbackFrames = []; },
      { view: state(0), records: [record(0)], enabled: true, mode: 'live' });
    await page.route('**/roundup5-playback', route => route.fulfill({ contentType: 'text/html',
      body: '<div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/roundup5-playback`);
    await page.locator('#playback-state').waitFor({ state: 'attached' });
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
    await test(page);
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}`);
  } catch (error) { failures.push(error); console.error(`FAIL ${name}: ${error.message}`); }
  finally { await page.close(); }
}
try {
  for (const fixture of nativeRerolls) await check(`native ${fixture.kind} same-face reroll contract`, async page => {
    const target = base.players.find(player => player.role === 'away').id;
    const reports = fixture.reportList.reports.map(report => ({ ...report,
      ...(report.playerId ? { playerId: base.players[0].id } : {}),
      ...(report.defenderId ? { defenderId: target } : {}) }));
    const view = { ...state(1), activePlayerAction: fixture.kind === 'multiple' ? 'multipleBlock' : 'block',
      actions: [0, 1].map(index => ({ id: `1:block:${fixture.kind === 'multiple' ? 'multi:' : ''}${target}:${index}`,
        kind: 'blockDie', actor: 'home', label: `Choose BOTH DOWN (die ${index + 1})`, target: { playerId: target } })) };
    await page.evaluate(input => window.publishPlayback(input), { view, records: [record(0), record(1,
      [{ reportList: { reports } }], view)], enabled: true, mode: 'live', interactive: true });
    const dice = page.locator('.pitch-block-dice .polygon-die');
    await dice.first().waitFor();
    assert.deepEqual(await dice.evaluateAll(elements => elements.map(element => element.classList.contains('rolling'))),
      fixture.kind === 'multiple' ? [true, false] : [false, true]);
    const rollKey = await page.locator('#playback-state').getAttribute('data-roll-key');
    await page.clock.runFor(1100);
    assert.equal(await page.locator('#playback-state').getAttribute('data-roll-key'), rollKey);
    assert.equal(await page.locator('#playback-state').getAttribute('data-active'), 'false');
    assert.deepEqual(await dice.evaluateAll(elements => elements.map(element => element.dataset.face)), ['BOTH DOWN', 'BOTH DOWN']);
  });
  await check('successful movement rolls stay synchronized without dice pauses', async page => {
    const view = state(1, 10);
    const native = ['dodgeRoll', 'goForItRoll', 'pickUpRoll'].map((reportId, index) => ({
      reportList: { reports: [{ reportId, playerId: base.players[0].id, roll: index + 4, minimumRoll: 3, successful: true }] },
      modelChangeList: { modelChangeArray: [{ modelChangeId: 'fieldModelSetPlayerCoordinate',
        modelChangeKey: base.players[0].id, modelChangeValue: { x: 8 + index, y: 7 } }] }
    }));
    await page.evaluate(input => window.publishPlayback(input),
      { view, records: [record(0), record(1, native, view)], enabled: true, mode: 'live' });
    await page.clock.runFor(650);
    assert.equal(await page.locator('#playback-state').getAttribute('data-x'), '10');
    assert.equal(await page.locator('#playback-state').getAttribute('data-active'), 'false');
    const frames = await page.evaluate(() => window.playbackFrames.filter(frame => frame.x >= 8));
    for (const [x, face] of [[8, '4'], [9, '5'], [10, '6']])
      assert.ok(frames.some(frame => frame.x === x && frame.faces.includes(face)), `Roll ${face} accompanies square ${x}`);
  });
  await check('weather remains pinned for a skill choice and restores statically for joining coaches', async page => {
    const view = { ...state(1), actions: [{ id: 'skill', kind: 'skill', actor: 'home', label: 'Use skill', target: null }] };
    await page.evaluate(input => window.publishPlayback(input), { view, records: [record(0), record(1,
      [{ reportList: { reports: [{ reportId: 'weather', weatherRoll: [3, 4] }] } }], view)], enabled: true, mode: 'live' });
    await page.clock.runFor(10000);
    assert.equal(await page.locator('.pitch-roll-group').count(), 1, 'Pending skill choice retains the weather result');
    assert.equal(await page.locator('#playback-state').getAttribute('data-active'), 'false');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.clock.runFor(30000);
    assert.equal(await page.locator('.pitch-roll-group').count(), 1, 'Recovery retains the shared static snapshot');
    assert.equal(await page.locator('#playback-state').getAttribute('data-roll-key'), '');
    assert.equal(await page.locator('.pitch-roll-group .polygon-die.rolling').count(), 0);
  });
  await check('unpinned weather keeps shared retention and ordered playback with the next roll', async page => {
    const weather = { reportList: { reports: [{ reportId: 'weather', weatherRoll: [3, 4] }] } };
    const followingRoll = { reportList: { reports: [{ reportId: 'goForItRoll', playerId: base.players[0].id,
      roll: 2, minimumRoll: 3, successful: false }] } };
    await page.evaluate(input => window.publishPlayback(input), { view: state(2),
      records: [record(0), record(1, [weather]), record(2, [followingRoll])], enabled: true, mode: 'live' });
    const weatherGroup = page.locator('.pitch-roll-group').filter({ has: page.locator('[aria-label^="Weather:"]') });
    await weatherGroup.waitFor();
    await page.clock.runFor(1100);
    assert.equal(await weatherGroup.count(), 1, 'A following roll does not clear weather early');
    assert.equal(await page.locator('.pitch-roll-group').count(), 2, 'Native roll ordering shares the normal stream');
    await page.clock.runFor(1700);
    assert.equal(await weatherGroup.count(), 0, 'Weather expires with the normal entrance, hold, and exit timing');
    assert.equal(await page.locator('.pitch-roll-group').count(), 1, 'The newer roll retains its independent lifetime');
  });
  await check('Multiple Block partial rerolls never enqueue a duplicate full-pool roll', async page => {
    const target = base.players.find(player => player.role === 'away').id;
    const view = { ...state(1), activePlayerAction: 'multipleBlock', actions: ['SKULL', 'PUSHBACK', 'POW'].map((face, index) => ({
      id: `1:block:multi:${target}:${index}`, kind: 'blockDie', actor: 'home', label: `Choose ${face} (die ${index + 1})`, target: { playerId: target }
    })) };
    await page.evaluate(input => window.publishPlayback(input), { view, records: [record(0), record(1,
      [{ reportList: { reports: [{ reportId: 'blockReRoll', playerId: base.players[0].id, defenderId: target,
        blockRoll: [3], blockRollAfterReroll: [1, 3, 6], rerolledIndexes: [1] },
        { reportId: 'blockRoll', defenderId: target, blockRoll: [1, 3, 6] }] } }], view)], enabled: true, mode: 'live', interactive: true });
    await page.locator('.pitch-block-dice .polygon-die').first().waitFor();
    const rollKey = await page.locator('#playback-state').getAttribute('data-roll-key');
    await page.clock.runFor(1100);
    assert.equal(await page.locator('#playback-state').getAttribute('data-roll-key'), rollKey, 'Offered choices must retain the native partial reroll');
    assert.equal(await page.locator('#playback-state').getAttribute('data-active'), 'false');
    assert.equal(await page.locator('.pitch-block-dice .polygon-die.rolling').count(), 0);
  });
  await check('a partial same-face block reroll animates only its chosen die', async page => {
    const view = state(1);
    await page.evaluate(input => window.publishPlayback(input), { view, records: [record(0), record(1,
      [{ reportList: { reports: [{ reportId: 'blockReRoll', blockRoll: [3], blockRollAfterReroll: [1, 3, 6], rerolledIndexes: [1] },
        { reportId: 'blockRoll', blockRoll: [1, 3, 6] }] } }], view)],
      enabled: true, mode: 'live' });
    await page.locator('.pitch-block-dice .polygon-die').first().waitFor();
    const phases = await page.locator('.pitch-block-dice .polygon-die').evaluateAll(elements => elements.map(element => element.classList.contains('rolling') ? 'rolling' : 'settled'));
    assert.deepEqual(phases, ['settled', 'rolling', 'settled']);
    const rollKey = await page.locator('#playback-state').getAttribute('data-roll-key');
    await page.clock.runFor(1100);
    assert.equal(await page.locator('#playback-state').getAttribute('data-roll-key'), rollKey, 'Native full-pool confirmation must not replay the roll');
  });
} finally { await browser.close(); await server.close(); }
if (failures.length) throw new AggregateError(failures, 'Roundup 5 presentation regressions');
