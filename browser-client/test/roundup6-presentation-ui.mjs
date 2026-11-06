import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { DICE_GROUP_INTERVAL_MS } from '../src/presentation-timing.ts';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const adjacent = fixtures.find(frame => frame.actor.actions.some(action => action.kind === 'block')).actor;
const attack = adjacent.actions.find(action => action.kind === 'block');
const actor = attack.sourcePlayerId;
const target = attack.target.playerId;
const initial = { ...adjacent, revision: 0, blockPreview: { version: 1, rolls: [{ playerId: actor, targetPlayerId: target, dice: 3 }] } };
const record = (state, native = []) => ({ index: state.revision, revision: state.revision, kind: 'action', actor: 'home', at: state.revision, decision: null, state, native });
const start = record(initial);
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const failures = [];
const evidence = fileURLToPath(new URL('../../.tools/roundup6-ui/', import.meta.url));
mkdirSync(evidence, { recursive: true });
async function open(view = initial, records = [start]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.install({ time: new Date('2026-11-05T12:00:00Z') });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 10000));
  await page.addInitScript(input => { window.roundup6Input = input; window.roundup6Intents = []; }, { view, records });
  await page.route('**/roundup6-test', route => route.fulfill({ contentType: 'text/html', body: '<div id="app"></div><script type="module" src="/test/roundup6-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/roundup6-test`);
  await page.getByTestId('setup-status').waitFor({ state: 'attached' });
  return page;
}
const publish = (page, view, records) => page.evaluate(input => window.publishRoundup6(input), { view, records });
async function check(name, run) {
  try { await run(); console.log(`PASS ${name}`); } catch (error) { failures.push(error); console.error(`FAIL ${name}: ${error.message}`); }
}
try {
  await check('touchdown completes before next-drive tracker, including a pending setup prompt', async () => {
    const page = await open();
    const scores = () => page.locator('.coach-score b').allTextContents();
    const before = [String(initial.homeScore), String(initial.awayScore)];
    const after = [String(initial.homeScore + 1), String(initial.awayScore)];
    const next = { ...initial, revision: 1, homeScore: initial.homeScore + 1, drive: initial.drive + 1, phase: 'SETUP', activePlayerId: null, actions: [],
      prompt: { id: 'setup', actor: 'home', kind: 'setup', options: [] },
      driveTracker: { version: 1, receivingRole: 'away', phase: 'SETUP', secretWeapons: 'COMPLETE', knockouts: 'COMPLETE', event: null, eventComplete: false } };
    const native = [{ modelChangeList: { modelChangeArray: [{ modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: actor, modelChangeValue: { x: 25, y: 7 } }] } },
      { commandNr: 2, matchAnnouncements: { version: 1, events: [{ kind: 'touchdown', team: 'home', turn: 1, half: 1, reason: null }] } }];
    await publish(page, next, [start]);
    await page.clock.runFor(1500);
    assert.equal(await page.locator('.drive-phase-tracker').count(), 0, 'A late transcript cannot expose the future drive decision');
    assert.deepEqual(await scores(), before, 'A late transcript cannot reveal the touchdown score early');
    await publish(page, next, [start, record(next, native)]);
    assert.equal(await page.locator('.drive-phase-tracker').count(), 0, 'Future drive tracker must not be exposed during scoring movement');
    assert.deepEqual(await scores(), before, 'Keep the previous score while the player travels into the endzone');
    await page.clock.runFor(500);
    await page.locator('.match-splash-touchdown').waitFor({ state: 'attached', timeout: 2000 });
    assert.deepEqual(await scores(), after, 'Reveal the touchdown score when the splash starts');
    assert.equal(await page.locator('.drive-phase-tracker').count(), 0, 'Drive tracker waits for TOUCHDOWN splash');
    await page.screenshot({ path: `${evidence}/touchdown.png` });
    await page.clock.runFor(3000);
    await page.locator('.match-splash-shade[data-exiting=true]').waitFor({ state: 'attached' });
    await page.clock.runFor(550);
    assert.equal(await page.locator('.match-splash-touchdown').count(), 0);
    assert.equal(await page.locator('.drive-phase-tracker').count(), 1);
    assert.deepEqual(await scores(), after, 'Retain the touchdown score after the splash');
    await page.close();
  });
  await check('away final-touchdown score waits for its splash, while recovery restores the current score', async () => {
    const spectator = { ...initial, callerRole: 'spectator', actions: [] };
    const first = record(spectator);
    const next = { ...spectator, revision: 1, phase: 'FULL_TIME', activePlayerId: null, awayScore: spectator.awayScore + 1 };
    const scorer = initial.players.find(player => player.role === 'away' && player.x !== null);
    const native = [{ modelChangeList: { modelChangeArray: [{ modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: scorer.id, modelChangeValue: { x: 0, y: 7 } }] } },
      { commandNr: 2, matchAnnouncements: { version: 1, events: [{ kind: 'touchdown', team: 'away', turn: 1, half: 2, reason: null }] } }];
    for (const recover of [false, true]) {
      const page = await open(spectator, [first]);
      const scores = () => page.locator('.coach-score b').allTextContents();
      const before = [String(spectator.homeScore), String(spectator.awayScore)];
      const after = [String(next.homeScore), String(next.awayScore)];
      await publish(page, next, [first]);
      await page.clock.runFor(1500);
      assert.deepEqual(await scores(), before, 'Full time without a drive increment must still wait for the scoring transcript');
      if (recover) {
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        assert.deepEqual(await scores(), after, 'Recovery restores the authoritative score without replaying old events');
        await publish(page, next, [first, record(next, native)]);
        await page.clock.runFor(5000);
        assert.equal(await page.locator('.match-splash-touchdown').count(), 0, 'A late old record cannot replay a recovered touchdown');
      } else {
        await publish(page, next, [first, record(next, native)]);
        assert.deepEqual(await scores(), before, 'Away touchdown waits for the scoring movement');
        await page.clock.runFor(500);
        await page.locator('.match-splash-touchdown').waitFor({ state: 'attached', timeout: 2000 });
        assert.deepEqual(await scores(), after, 'The away score is revealed with its splash for spectators');
        await page.clock.runFor(3600);
        assert.deepEqual(await scores(), after);
      }
      await page.close();
    }
  });
  await check('proposed block dice stay above Bone Head until the actual block roll', async () => {
    const page = await open();
    await page.getByLabel('Live match pitch').locator(`[data-player-id="${actor}"]`).click();
    await page.getByRole('button', { name: 'Debug', exact: true }).click();
    await page.getByLabel('Server action', { exact: true }).selectOption(attack.id);
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    const next = { ...initial, revision: 1, actions: [1, 2, 3].map((die, index) => ({ id: `1:choice:${die}`, kind: 'blockDie', actor: 'home', sourcePlayerId: actor, target: null, label: `Choose ${['SKULL', 'PUSHBACK', 'POW'][index]} (die ${die})` })) };
    const native = [{ reportList: { reports: [{ reportId: 'confusionRoll', confusion: 'Bone Head', playerId: actor, roll: 5, minimumRoll: 2, successful: true }] } },
      { reportList: { reports: [{ reportId: 'blockRoll', blockRoll: [1, 3, 6], defenderId: target }] } }];
    await publish(page, next, [start, record(next, native)]);
    await page.locator('.pitch-roll-group').waitFor({ timeout: 2000 });
    const proposed = page.locator('.pitch-block-dice .match-die.awaiting');
    assert.equal(await proposed.count(), 3, 'Future offered block faces cannot replace preview before prerequisites finish');
    const above = await page.locator('.pitch-block-dice').boundingBox();
    const below = await page.locator('.pitch-roll-group').boundingBox();
    assert.ok(above.y + above.height <= below.y, 'Prerequisite dice belong below proposed block dice');
    await page.screenshot({ path: `${evidence}/bone-head-preview.png` });
    await page.clock.runFor(DICE_GROUP_INTERVAL_MS + 50);
    assert.equal(await proposed.count(), 0);
    assert.equal(await page.locator('.pitch-block-dice .match-die').count(), 3);
    await page.close();
  });
  await check('failed Pro and Loner retain the original block dice without another tumble', async () => {
    for (const source of ['Pro', 'Loner']) {
      const choices = [1, 2].map((die, index) => ({ id: `0:choice:${die}`, kind: 'blockDie', actor: 'home', sourcePlayerId: actor, target: null, label: `Choose ${['SKULL', 'POW'][index]} (die ${die})` }));
      const rolled = { ...initial, actions: choices };
      const block = { reportId: 'blockRoll', blockRoll: [1, 6], defenderId: target };
      const first = record(rolled, [{ reportList: { reports: [block] } }]);
      const page = await open(rolled, [first]);
      const original = page.locator('.pitch-block-dice .match-die');
      assert.equal(await original.count(), 2);
      await page.clock.runFor(1000);
      await original.evaluateAll(elements => elements.forEach(element => { element.dataset.originalDie = 'yes'; }));
      const positions = await original.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().y));
      const next = { ...rolled, revision: 1, actions: choices.map(choice => ({ ...choice, id: `1${choice.id}` })) };
      await publish(page, next, [first, record(next, [{ reportList: { reports: [
        { reportId: 'reRoll', reRollSource: source, playerId: actor, roll: 1, successful: false }, block] } }])]);
      await page.locator('.pitch-roll-group').waitFor({ timeout: 2000 });
      assert.equal(await page.locator('.pitch-block-dice [data-original-die="yes"]').count(), 2, 'The original dice stay mounted during the conditional test');
      assert.deepEqual(await original.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().y)), positions, 'Conditional test is added below the original dice');
      await page.clock.runFor(DICE_GROUP_INTERVAL_MS + 50);
      assert.equal(await page.locator('.pitch-block-dice .match-die.rolling').count(), 0, `${source} failure must not animate original block dice again`);
      assert.deepEqual(await original.evaluateAll(elements => elements.map(element => element.dataset.face)), ['SKULL', 'POW']);
      assert.equal(await page.locator('.pitch-decision-overlay .block-die').count(), 2, 'Failed Pro does not duplicate the original dice');
      await page.screenshot({ path: `${evidence}/failed-${source.toLowerCase()}.png` });
      await page.close();
    }
  });
  await check('a failed prerequisite keeps proposed dice through its reroll choice and fades them only after cancellation', async () => {
    const page = await open();
    await page.getByLabel('Live match pitch').locator(`[data-player-id="${actor}"]`).click();
    await page.getByRole('button', { name: 'Debug', exact: true }).click();
    await page.getByLabel('Server action', { exact: true }).selectOption(attack.id);
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    const pending = { ...initial, revision: 1, actions: [{ id: '1:reroll:none', kind: 'reroll', actor: initial.callerRole,
      sourcePlayerId: actor, target: null, label: 'Do not re-roll Bone Head' }] };
    const failure = record(pending, [{ reportList: { reports: [{ reportId: 'confusionRoll', playerId: actor,
      roll: 1, minimumRoll: 2, successful: false }] } }]);
    await publish(page, pending, [start, failure]);
    await page.locator('.pitch-roll-group').waitFor();
    await page.clock.runFor(10000);
    assert.equal(await page.locator('.pitch-block-dice .match-die.awaiting').count(), 3, 'A failed prerequisite still has a pending legal reroll');
    const cancelled = { ...initial, revision: 2, activePlayerId: null, actions: [] };
    await publish(page, cancelled, [start, failure, record(cancelled)]);
    await page.locator('.pitch-dice-lifetime.exiting .pitch-block-dice').waitFor({ state: 'attached' });
    await page.clock.runFor(250);
    assert.equal(await page.locator('.pitch-block-dice').count(), 0, 'Cancelled proposed dice use the normal expiration');
    await page.close();
  });
  await check('turn tracks have no inherited rectangular outline at desktop or compact sizes', async () => {
    const page = await open();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.deepEqual(await page.locator('.live-turn-track').evaluateAll(elements => elements.map(element => getComputedStyle(element).outlineStyle)), ['none', 'none']);
      assert.equal(await page.locator('.live-turn-track li').count(), 16);
      await page.screenshot({ path: `${evidence}/turn-track-${width}.png` });
    }
    await page.close();
  });
  await check('declining a second chance for failed Pro keeps the original dice across transcript revisions', async () => {
    const choices = [1, 2].map((die, index) => ({ id: `0:block-die:${die}`, kind: 'blockDie', actor: 'home', sourcePlayerId: actor, target: null, label: `Choose ${['SKULL', 'POW'][index]} (die ${die})` }));
    const rolled = { ...initial, actions: choices };
    const block = { reportId: 'blockRoll', blockRoll: [1, 6], defenderId: target };
    const first = record(rolled, [{ reportList: { reports: [block] } }]);
    const page = await open(rolled, [first]);
    await page.locator('.pitch-block-dice .match-die').evaluateAll(elements => elements.forEach(element => { element.dataset.originalDie = 'yes'; }));
    const gateState = { ...rolled, revision: 1, actions: [{ id: '1:block-pro-test:none', kind: 'proTestReroll', actor: 'home', sourcePlayerId: actor, target: null, label: 'Do not reroll Pro test' }] };
    const gate = record(gateState, [{ reportList: { reports: [{ reportId: 'reRoll', reRollSource: 'Pro', playerId: actor, roll: 1, successful: false }] } }]);
    await publish(page, gateState, [first, gate]);
    await page.locator('.pitch-roll-group').waitFor();
    await page.clock.runFor(DICE_GROUP_INTERVAL_MS + 50);
    assert.equal(await page.locator('.pitch-block-dice [data-original-die="yes"]').count(), 2, 'The failed Pro test preserves the original dice nodes');
    const reopened = { ...rolled, revision: 2, actions: choices.map(choice => ({ ...choice, id: `2${choice.id}` })) };
    await publish(page, reopened, [first, gate, record(reopened, [{ reportList: { reports: [block] } }])]);
    await page.clock.runFor(1200);
    assert.equal(await page.locator('.pitch-block-dice .match-die.rolling').count(), 0, 'Declining another Pro test reroll cannot reroll the original pool');
    assert.equal(await page.locator('.pitch-block-dice [data-original-die="yes"]').count(), 2, 'Queue completion preserves original nodes as well as faces');
    const rerolled = { ...reopened, revision: 3, actions: choices.map(choice => ({ ...choice, id: `3${choice.id}` })) };
    await publish(page, rerolled, [first, gate, record(reopened, [{ reportList: { reports: [block] } }]),
      record(rerolled, [{ reportList: { reports: [{ ...block, reportId: 'blockReRoll' }] } }])]);
    await page.clock.runFor(50);
    assert.equal(await page.locator('.pitch-block-dice .match-die.rolling').count(), 2, 'An actual same-face native reroll still tumbles both dice');
    await page.close();
  });
  await check('failed reroll gates preserve uphill dice when priority returns to the opponent for every viewer', async () => {
    for (const source of ['Pro', 'Loner']) for (const callerRole of ['home', 'away', 'spectator']) {
      const block = { reportId: 'blockRoll', blockRoll: [1, 6], defenderId: target, logBlock: { attackerId: actor, chooser: 'away' } };
      const rolled = { ...initial, revision: 0, callerRole, actor: 'home', actions: [{ id: '0:block-reroll:pro', kind: 'reroll',
        actor: 'home', sourcePlayerId: actor, target: null, label: 'Use Pro' }] };
      const first = record(rolled, [{ reportList: { reports: [block] } }]);
      const page = await open(rolled, [first]);
      const original = page.locator('.pitch-block-dice .match-die');
      assert.equal(await original.count(), 2);
      await original.evaluateAll(elements => elements.forEach(element => { element.dataset.originalDie = 'yes'; }));
      const next = { ...rolled, revision: 1, actor: 'away', actions: ['SKULL', 'POW'].map((face, index) => ({
        id: `1:block-die:${index}`, kind: 'blockDie', actor: 'away', sourcePlayerId: actor, target: null, label: `Choose ${face} (die ${index + 1})` })) };
      await publish(page, next, [first, record(next, [{ reportList: { reports: [
        { reportId: 'reRoll', reRollSource: source, playerId: actor, roll: 1, successful: false }, block] } }])]);
      await page.locator('.pitch-roll-group').waitFor();
      await page.clock.runFor(DICE_GROUP_INTERVAL_MS + 50);
      assert.equal(await page.locator('.pitch-block-dice [data-original-die="yes"]').count(), 2, `${source}: ${callerRole} retains the original nodes after priority changes`);
      assert.equal(await page.locator('.pitch-block-dice .match-die.rolling').count(), 0);
      assert.deepEqual(await original.evaluateAll(elements => elements.map(element => element.dataset.face)), ['SKULL', 'POW']);
      assert.deepEqual(await page.evaluate(() => window.roundup6Intents), []);
      await page.close();
    }
  });
} finally { await browser.close(); await server.close(); }
if (failures.length) process.exitCode = 1;
