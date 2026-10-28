import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { DICE_GROUP_INTERVAL_MS, PITCH_DICE_ROLL_MS } from '../src/presentation-timing.ts';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const state = (revision, x = 7, y = 7) => ({ ...initial, revision, actions: [], prompt: null,
  players: initial.players.map((player, index) => index ? player : { ...player, x, y }) });
const move = (x, y = 7) => ({ modelChangeId: 'fieldModelSetPlayerCoordinate',
  modelChangeKey: initial.players[0].id, modelChangeValue: { x, y } });
const ball = x => ({ modelChangeId: 'fieldModelSetBallCoordinate', modelChangeValue: { x, y: 7 } });
const sync = (changes = [], reports = []) => ({ modelChangeList: { modelChangeArray: changes }, reportList: { reports } });
const record = (view, native = []) => ({ index: view.revision, revision: view.revision, kind: 'action', actor: 'home',
  at: view.revision, decision: null, state: view, native });
const block = { reportId: 'blockRoll', blockRoll: [1, 3, 6], defenderId: 'away1' };
const injury = { reportId: 'injury', playerId: 'away1', numericDice: { version: 1, dice: [
  { sides: 6, value: 6, label: 'Armor' }, { sides: 6, value: 5, label: 'Armor' },
  { sides: 6, value: 4, label: 'Injury' }, { sides: 6, value: 3, label: 'Injury' },
  { sides: 16, value: 12, label: 'Casualty' }, { sides: 6, value: 2, label: 'Casualty' }
] } };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.clock.install();
await page.emulateMedia({ reducedMotion: 'no-preference' });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const evidence = resolve(process.env.CADENCE_EVIDENCE ?? '../.tools/cadence-evidence');
mkdirSync(evidence, { recursive: true });
const publish = input => page.evaluate(input => window.publishPlayback(input), { enabled: true, mode: 'live', ...input });
const output = () => page.locator('#playback-state').evaluate(out => ({ x: Number(out.dataset.x),
  revision: Number(out.dataset.revision), active: out.dataset.active === 'true', duration: Number(out.dataset.duration) }));
const at = (x, active) => page.waitForFunction(({ x, active }) => {
  const out = document.querySelector('#playback-state');
  return Number(out.dataset.x) === x && out.dataset.active === String(active);
}, { x, active });
const faces = () => page.locator('.live-dice-overlay .match-die').evaluateAll(dice => dice.map(die => die.dataset.face));
const reset = async (view = state(0)) => {
  await publish({ view, records: [record(view)], enabled: false }); await at(view.players[0].x, false);
  await publish({ view, records: [record(view)] });
  await page.evaluate(() => { window.playbackFrames = []; });
};
try {
  await page.addInitScript(input => { window.playbackInput = input; window.playbackFrames = []; },
    { view: state(0), records: [record(state(0))], enabled: true, mode: 'live' });
  await page.route('**/cadence-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/cadence-test`);
  await at(7, false);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));

  // A growing queue and a dependent prompt cannot change square speed. Both
  // coaches and spectators consume the same presentation without a barrier.
  for (const role of ['home', 'away', 'spectator']) {
    const base = { ...state(0), callerRole: role };
    await reset(base);
    const moved = { ...state(1, 10, 9), callerRole: role };
    const first = record(moved, [sync([move(8, 8), move(9, 9), move(10, 9)])]);
    await publish({ view: moved, records: [record(base), first] }); await at(8, true);
    assert.equal((await output()).duration, 200);
    const pending = { ...state(2, 11, 9), callerRole: role,
      actions: [{ id: 'choice', kind: 'blockDie', actor: 'home', label: 'Choose POW (die 1)', sourcePlayerId: 'home1', target: null }] };
    await publish({ view: pending, records: [record(base), first, record(pending, [sync([move(11, 9)])])] });
    for (const x of [8, 9, 10, 11]) {
      await at(x, true);
      assert.equal((await output()).duration, 200, 'Diagonal/straight steps and later revisions share cadence');
      assert.equal(await page.locator('#required-choice').count(), 0);
      await page.clock.runFor(199); await at(x, true);
      await page.clock.runFor(1);
    }
    await at(11, true);
    assert.deepEqual(await faces(), ['POW'], 'State-offered faces without a native report use the same cadence');
    await page.clock.runFor(DICE_GROUP_INTERVAL_MS);
    await at(11, false); await page.locator('#required-choice').waitFor();
    const steps = await page.evaluate(() => window.playbackFrames.filter((frame, i, all) => frame.x !== all[i - 1]?.x));
    assert.deepEqual(steps.map(frame => frame.x), [8, 9, 10, 11]);
    assert.deepEqual(steps.slice(1).map((frame, i) => frame.ms - steps[i].ms), [200, 200, 200]);
  }

  await reset();
  const pending = { ...state(1), actions: [{ id: 'apo', kind: 'apothecary', actor: 'home', label: 'Use apothecary', sourcePlayerId: null, target: null }] };
  await publish({ view: pending, records: [record(state(0)), record(pending, [sync([], [block, injury])])] });
  await at(7, true);
  assert.deepEqual(await faces(), ['SKULL', 'PUSHBACK', 'POW'], 'First roll is immediate and block dice are simultaneous');
  for (const expected of [['6', '5'], ['4', '3'], ['12', '2']]) {
    await page.clock.runFor(DICE_GROUP_INTERVAL_MS - 1);
    assert.equal(await page.locator('#required-choice').count(), 0);
    const before = await faces();
    await page.clock.runFor(1);
    await page.waitForFunction(expected => [...document.querySelectorAll('.live-dice-overlay .match-die')]
      .slice(-expected.length).every((die, index) => die.dataset.face === expected[index]), expected);
    assert.deepEqual((await faces()).slice(-2), expected);
    assert.notDeepEqual(await faces(), before);
  }
  await page.screenshot({ path: resolve(evidence, 'ordered-injury.png') });
  await page.clock.runFor(DICE_GROUP_INTERVAL_MS - 1); assert.equal(await page.locator('#required-choice').count(), 0);
  await page.clock.runFor(1); await at(7, false); await page.locator('#required-choice').waitFor();

  // A catch result belongs between the ball's arriving and departing squares.
  const loose = (revision, x) => ({ ...state(revision), ball: { x, y: 7 },
    ballState: { version: 1, inPlay: true, moving: true, carrierPlayerId: null } });
  await reset(loose(0, 7));
  const bobble = loose(1, 10);
  await publish({ view: bobble, records: [record(loose(0, 7)), record(bobble, [sync([ball(8)]),
    sync([], [{ reportId: 'catchRoll', roll: 1, successful: false, playerId: 'away1' }]),
    sync([ball(9)]), sync([ball(10)])])] });
  const ballAt = x => page.waitForFunction(x => window.playbackFrames.at(-1).ballX === x, x);
  await ballAt(8); assert.equal((await output()).duration, 250); assert.deepEqual(await faces(), []);
  await page.clock.runFor(249); await ballAt(8); assert.deepEqual(await faces(), []);
  await page.clock.runFor(1); await page.locator('.live-dice-overlay .match-die').waitFor();
  assert.deepEqual(await faces(), ['1']); await ballAt(8);
  await page.clock.runFor(DICE_GROUP_INTERVAL_MS - 1); await ballAt(8);
  await page.clock.runFor(1); await ballAt(9);
  await page.clock.runFor(249); await ballAt(9);
  await page.clock.runFor(1); await ballAt(10);
  await page.clock.runFor(250); await at(7, false);

  // A three-direction native scatter must visit every reported square even
  // though the model sync provides only its endpoint.
  await reset(loose(0, 7));
  const scattered = loose(1, 10);
  await publish({ view: scattered, records: [record(loose(0, 7)), record(scattered, [sync([ball(10)], [
    { reportId: 'scatterBall', directionArray: ['East', 'East', 'East'], rolls: [3, 3, 3] }
  ])])] });
  await page.locator('.live-dice-overlay .match-die').waitFor();
  for (const x of [8, 9, 10]) {
    await page.clock.runFor(DICE_GROUP_INTERVAL_MS); await ballAt(x);
    assert.equal((await output()).duration, 250);
    await page.clock.runFor(250);
  }
  await at(7, false);
  const scatterSquares = await page.evaluate(() => window.playbackFrames.map(frame => frame.ballX)
    .filter((x, i, all) => !i || x !== all[i - 1]));
  assert.deepEqual(scatterSquares, [7, 8, 9, 10]);

  // Reduced motion removes translation, not the readable ball/dice cadence.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reset(loose(0, 7));
  await publish({ view: loose(1, 9), records: [record(loose(0, 7)), record(loose(1, 9), [sync([ball(8)]),
    sync([], [injury]), sync([ball(9)])])] });
  await ballAt(8); assert.equal((await output()).duration, 0);
  await page.clock.runFor(250); assert.deepEqual(await faces(), ['6', '5']);
  await page.clock.runFor(DICE_GROUP_INTERVAL_MS - 1); assert.deepEqual(await faces(), ['6', '5']);
  await page.clock.runFor(1); assert.deepEqual((await faces()).slice(-2), ['4', '3']);
  await page.clock.runFor(DICE_GROUP_INTERVAL_MS); assert.deepEqual((await faces()).slice(-2), ['12', '2']);
  assert.equal(await page.locator('.match-die').evaluateAll(dice => dice.flatMap(die => die.getAnimations({ subtree: true })).length), 0);
  await page.clock.runFor(DICE_GROUP_INTERVAL_MS); await ballAt(9);
  await page.clock.runFor(250); await at(7, false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Replay speed scales movement, ball steps, roll spacing and roll animation.
  await reset(loose(0, 7));
  const replay = { ...loose(1, 8), players: state(1, 8).players };
  await publish({ view: replay, records: [record(loose(0, 7)), record(replay, [sync([move(8)]), sync([], [block, injury]), sync([ball(8)])])], mode: 'replay', speed: 2 });
  await at(8, true); assert.equal((await output()).duration, 100);
  await page.clock.runFor(100);
  assert.deepEqual(await faces(), ['SKULL', 'PUSHBACK', 'POW']);
  assert.ok((await page.locator('.block-die-cube').evaluateAll(dice => dice.flatMap(die => die.getAnimations().map(animation => animation.effect.getTiming().duration)))).every(duration => duration === PITCH_DICE_ROLL_MS / 2));
  await page.clock.runFor(DICE_GROUP_INTERVAL_MS / 2); assert.deepEqual((await faces()).slice(-2), ['6', '5']);
  await page.clock.runFor(DICE_GROUP_INTERVAL_MS / 2); assert.deepEqual((await faces()).slice(-2), ['4', '3']);
  await page.clock.runFor(DICE_GROUP_INTERVAL_MS / 2); assert.deepEqual((await faces()).slice(-2), ['12', '2']);
  await page.clock.runFor(DICE_GROUP_INTERVAL_MS / 2); assert.equal((await output()).duration, 125);
  await page.clock.runFor(125); await at(8, false);
  await publish({ view: state(5, 20), records: [], mode: 'replay', speed: 2 }); await at(20, false);
  await page.clock.runFor(2000); await at(20, false); assert.deepEqual(await faces(), []);
  const adjacentSeek = state(6, 23);
  await publish({ view: adjacentSeek, records: [...Array.from({ length: 6 }, (_,i) => record(state(i))),
    record(adjacentSeek, [sync([move(21), move(22), move(23)])])], mode: 'replay', snapshotKey: 1 });
  await at(23, false);
  await page.clock.runFor(1000); await at(23, false);

  // Background tabs consume current snapshots rather than building a backlog.
  await reset();
  const route = record(state(1, 10), [sync([move(8), move(9), move(10)])]);
  await publish({ view: route.state, records: [record(state(0)), route] }); await at(8, true);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await at(10, false);
  const restored = { ...state(2, 12), actions: [{ id: 'block', kind: 'blockDie', actor: 'home', label: 'Choose POW (die 1)', sourcePlayerId: 'home1', target: null }] };
  await publish({ view: restored, records: [record(state(0)), route, record(restored, [sync([], [block])])] }); await at(12, false);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.locator('#required-choice').waitFor();
  assert.equal(await page.locator('#playback-state').getAttribute('data-roll-key'), '');
  await page.clock.runFor(2500); await at(12, false);
  assert.equal(await page.locator('.match-die').evaluateAll(dice => dice.flatMap(die => die.getAnimations({ subtree: true })).length), 0);
  // Skip/disconnect cancels even an in-flight logical roll and its timers.
  await reset();
  await publish({ view: state(1), records: [record(state(0)), record(state(1), [sync([], [injury])])], mode: 'replay' }); await at(7, true);
  await publish({ view: state(1), records: [], mode: 'replay', enabled: false }); await at(7, false);
  await page.clock.runFor(2500); assert.deepEqual(await faces(), []);
  // A restored numeric prompt can precede its history. Late history restores
  // the result once, without animating or replaying the prior decision.
  await reset();
  const latePending = { ...state(1), actions: [{ id: 'team', kind: 'reroll', actor: 'home',
    label: 'Use team re-roll for Pick Up', sourcePlayerId: 'home1', target: null }] };
  await publish({ view: latePending, records: [] }); await at(7, false);
  assert.deepEqual(await faces(), []);
  await publish({ view: latePending, records: [record(state(0)), record(latePending, [sync([], [
    { reportId: 'pickUpRoll', roll: 1, successful: false, playerId: 'home1' }
  ])])] });
  await page.locator('.live-dice-overlay .match-die').waitFor();
  assert.deepEqual(await faces(), ['1']);
  assert.equal(await page.locator('#playback-state').getAttribute('data-roll-key'), '');
  // Mount the actual coach and completed-replay components, including their
  // keyboard action guards and existing navigation controls.
  const hosted = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  hosted.on('pageerror', error => errors.push(error.message));
  await hosted.clock.install();
  await hosted.addInitScript(input => { window.cadenceHostedInput = input; window.cadenceIntents = []; },
    { view: state(0), records: [record(state(0))], replay: false });
  await hosted.route('**/cadence-hosted', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module" src="/test/cadence-hosted-harness.tsx"></script>' }));
  await hosted.goto(`http://127.0.0.1:${server.httpServer.address().port}/cadence-hosted`);
  await hosted.getByLabel('Live match pitch').waitFor();
  await hosted.clock.pauseAt(await hosted.evaluate(() => Date.now() + 100));
  const pickup = JSON.parse(readFileSync(new URL('./fixtures/adr0003-dice.json', import.meta.url), 'utf8'))[0].reports[0];
  const failed = { ...state(1, 8), actions: [
    { id: 'decline', kind: 'reroll', actor: 'home', label: 'Do not re-roll Pick Up', sourcePlayerId: 'home1', target: null },
    { id: 'team', kind: 'reroll', actor: 'home', label: 'Use team re-roll for Pick Up', sourcePlayerId: 'home1', target: null }
  ] };
  await hosted.evaluate(input => window.publishCadenceHosted(input), { view: failed,
    records: [record(state(0)), record(failed, [sync([move(8)]), sync([], [pickup])])], replay: false });
  await hosted.waitForFunction(() => document.querySelector('.coach-match').dataset.playbackActive === 'true');
  assert.equal(await hosted.locator('.circular-skill-prompt').count(), 0);
  await hosted.keyboard.press('Space');
  assert.deepEqual(await hosted.evaluate(() => window.cadenceIntents), []);
  await hosted.clock.runFor(200);
  await hosted.locator('.live-dice-overlay .match-die').waitFor();
  await hosted.clock.runFor(DICE_GROUP_INTERVAL_MS - 1); assert.equal(await hosted.locator('.circular-skill-prompt').count(), 0);
  await hosted.clock.runFor(1); await hosted.locator('.circular-skill-prompt').waitFor();
  assert.equal(await hosted.locator('.polygon-die-body').evaluateAll(dice => dice.flatMap(die => die.getAnimations()).length), 0,
    'Exposing the decision does not roll its dice a second time');
  await hosted.screenshot({ path: resolve(evidence, 'hosted-dependent-decision.png') });
  await hosted.locator('.circular-skill-prompt button').first().click();
  assert.equal(await hosted.evaluate(() => window.cadenceIntents.length), 1);

  const replayRecords = [record(state(0)), record(state(1, 10), [sync([move(8), move(9), move(10)])]),
    record(state(2, 13), [sync([move(11), move(12), move(13)])]), record(state(3, 15), [sync([move(14), move(15)])])];
  await hosted.evaluate(input => window.publishCadenceHosted(input), { view: state(0), records: replayRecords, replay: true });
  await hosted.getByLabel('Skip animations').uncheck();
  const replayMarker = hosted.locator(`.replay-board .live-marker[data-player-id="${initial.players[0].id}"]`);
  const replayAt = x => hosted.waitForFunction(({ id, x }) => document.querySelector(`.replay-board [data-player-id="${id}"]`)
    ?.getAttribute('aria-label')?.endsWith(`square ${x}, 7`), { id: initial.players[0].id, x });
  await replayAt(7);
  await hosted.getByLabel('Event', { exact: true }).fill('2');
  await hosted.getByRole('button', { name: 'Seek', exact: true }).click();
  await replayAt(10);
  assert.equal(await replayMarker.evaluate(node => getComputedStyle(node).transitionDuration.split(',')[0].trim()), '0s');
  await hosted.getByRole('combobox', { name: /Speed/ }).selectOption('2');
  await hosted.getByRole('button', { name: 'Next', exact: true }).click(); await replayAt(11);
  await hosted.clock.runFor(99); await replayAt(11);
  await hosted.clock.runFor(1); await replayAt(12);
  await hosted.getByLabel('Skip animations').check(); await replayAt(13);
  await hosted.clock.runFor(1000); await replayAt(13);
  await hosted.getByLabel('Skip animations').uncheck();
  await hosted.getByRole('button', { name: 'Last', exact: true }).click(); await replayAt(15);
  await hosted.clock.runFor(1000); await replayAt(15);
  await hosted.close();
  writeFileSync(resolve(evidence, 'frames.json'), JSON.stringify(await page.evaluate(() => window.playbackFrames), null, 2));
  assert.deepEqual(errors, []);
  console.log('PASS: fixed coach/spectator cadence, prompt gating, grouped rolls, ball/catch order, reduced motion, replay rates/seek/skip, background recovery.');
} finally { await browser.close(); await server.close(); }
