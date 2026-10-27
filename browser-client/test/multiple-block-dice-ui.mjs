import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/block-visibility-multiple.json', import.meta.url), 'utf8'));
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const reverse of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/block-visibility.html`);
    await page.waitForFunction(() => typeof window.publishBlockVisibility === 'function');
    const publish = async (input, reset = false) => {
      const serial = await page.evaluate(({ input, reset }) => window.publishBlockVisibility(input, reset), { input, reset });
      await page.waitForFunction(serial => window.blockVisibilityCommitted === serial, serial);
    };
    const firstView = structuredClone(fixture.rolled);
    if (reverse) firstView.blockContext.blocks.reverse();
    const [first, second] = firstView.blockContext.blocks.map(block => block.targetPlayerId);
    firstView.blockContext.activeTargetPlayerId = first;
    const secondFaces = ['POW', 'BOTH DOWN'];
    // Distinct native outcomes make accidental cross-target presentation observable.
    firstView.actions.filter(action => action.kind === 'blockDie' && action.target?.playerId === second).forEach((action, index) => {
      action.label = `Choose ${secondFaces[index]} (die ${index + 1})`;
    });
    const secondView = { ...firstView, revision: 9, blockContext: { ...firstView.blockContext, activeTargetPlayerId: second },
      actions: firstView.actions.filter(action => action.target?.playerId === second).map(action => ({ ...action, id: action.id.replace(/^8:/, '9:') })) };
    const records = structuredClone(fixture.records);
    records[8].state = { ...firstView, actions: [] }; records[9].state = { ...secondView, actions: [] };
    // The native engine reports chosen block faces later, while resolving each push.
    for (const [revision, target, faces] of [[10, first, [3, 3]], [11, second, [6, 2]]]) {
      for (const sync of records[revision].native) for (const report of sync.reportList?.reports ?? []) if (report.reportId === 'blockChoice') {
        report.defenderId = target; report.blockRoll = faces; report.logBlock.defenderId = target;
      }
      records[revision].state.blockContext.activeTargetPlayerId = target;
    }
    const dice = page.locator('.live-dice-overlay .polygon-die');
    await publish({ mode: 'game', view: firstView, records: records.slice(0, 9), proposal: null, dice: null }, true);
    await page.getByRole('dialog', { name: 'Choose a block die', exact: true }).waitFor();
    assert.equal(await dice.count(), 2, 'Target 2 dice must not appear alongside target 1');
    assert.deepEqual(await dice.evaluateAll(elements => elements.map(element => element.dataset.face)), ['PUSHBACK', 'PUSHBACK']);
    // Background recovery must remember the restored target's roll so deferred
    // selection reports still cannot replay it after the second choice.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByRole('dialog', { name: 'Choose a block die', exact: true }).waitFor();
    if (process.env.MULTIPLE_BLOCK_DICE_EVIDENCE) {
      mkdirSync(process.env.MULTIPLE_BLOCK_DICE_EVIDENCE, { recursive: true });
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${process.env.MULTIPLE_BLOCK_DICE_EVIDENCE}/${reverse ? 'reverse' : 'forward'}-first.png` });
    }
    await page.getByRole('dialog').getByRole('button').first().click();
    assert.ok((await page.evaluate(() => window.blockVisibilityIntents)).at(-1).fields.actionId.includes(first));
    await publish({ view: secondView, records: records.slice(0, 10) });
    await page.waitForFunction(() => document.querySelectorAll('.live-dice-overlay .polygon-die').length === 2);
    assert.equal(await dice.count(), 2, 'Target 2 appears only after target 1 is selected');
    assert.deepEqual(await dice.evaluateAll(elements => elements.map(element => element.dataset.face)), secondFaces);
    if (process.env.MULTIPLE_BLOCK_DICE_EVIDENCE) {
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${process.env.MULTIPLE_BLOCK_DICE_EVIDENCE}/${reverse ? 'reverse' : 'forward'}-second.png` });
    }
    await page.getByRole('dialog').getByRole('button').first().click();
    assert.ok((await page.evaluate(() => window.blockVisibilityIntents)).at(-1).fields.actionId.includes(second));
    for (const revision of [10, 11]) {
      const view = revision === 11 ? { ...records[revision].state, activePlayerAction: undefined, activePlayerId: null,
        awayTurn: records[revision].state.awayTurn + 1, blockContext: undefined, actor: 'away', actions: [] }
        : { ...records[revision].state, actions: [{ id: `${revision}:push`, actor: 'home', kind: 'push', label: 'Choose push', target: { x: 9, y: 6 } }] };
      records[revision].state = { ...view, actions: [] };
      await publish({ view, records: records.slice(0, revision + 1) });
      await page.waitForTimeout(500);
      assert.equal(await dice.count(), 0, `Deferred native choice report at revision ${revision} must not replay already shown dice`);
    }
    const uphill = { ...firstView, actions: firstView.actions.map(action => ({ ...action,
      actor: action.target?.playerId === first ? 'away' : 'home' })) };
    await publish({ view: uphill, records: [] }, true);
    assert.equal(await page.locator('.live-dice-overlay[role="dialog"]').count(), 0, 'The attacker cannot choose target 2 before the opponent chooses the uphill target 1');
    assert.deepEqual(await dice.evaluateAll(elements => elements.map(element => element.dataset.face)), ['PUSHBACK', 'PUSHBACK']);
    await publish({ view: { ...uphill, callerRole: 'away' }, records: [] }, true);
    await page.getByRole('dialog', { name: 'Choose a block die', exact: true }).waitFor();
    assert.equal(await dice.count(), 2);
    await page.getByRole('dialog').getByRole('button').first().click();
    assert.ok((await page.evaluate(() => window.blockVisibilityIntents)).at(-1).fields.actionId.includes(first));
    await publish({ view: { ...secondView, callerRole: 'home' }, records: [] });
    assert.deepEqual(await dice.evaluateAll(elements => elements.map(element => element.dataset.face)), secondFaces,
      'The second chooser receives target 2 only at the native selection boundary');
    assert.deepEqual(errors, []);
    if (process.env.MULTIPLE_BLOCK_DICE_EVIDENCE) {
      mkdirSync(process.env.MULTIPLE_BLOCK_DICE_EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${process.env.MULTIPLE_BLOCK_DICE_EVIDENCE}/${reverse ? 'reverse' : 'forward'}-resolved.png` });
    }
    await page.close();
  }
  console.log('PASS Multiple Block target dice reveal once in selected order and deferred native choice reports do not replay them');
} finally { await browser.close(); await server.close(); }
