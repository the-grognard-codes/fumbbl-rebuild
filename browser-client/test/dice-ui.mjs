import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-dice.json', import.meta.url), 'utf8')).sort((a, b) => b.count - a.count);
const evidence = process.env.DICE_UI_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const journey of journeys) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(input => { window.diceInput = input; window.diceActions = []; },
      { view: journey.offered, report: journey.count === 0 ? journey.reports[0] : undefined });
    await page.route('**/dice-test', route => route.fulfill({ contentType: 'text/html', body:
      '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/dice-ui-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/dice-test`);
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    const publish = input => page.evaluate(input => window.publishDice(input), input);
    if (evidence) await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.count}-selectable.jpg`), type: 'jpeg', quality: 80 });
    const assertUnboxed = async element => assert.deepEqual(await element.evaluate(element => ({
      background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderTopWidth,
      shadow: getComputedStyle(element).boxShadow })), { background: 'rgba(0, 0, 0, 0)', border: '0px', shadow: 'none' });
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).backgroundColor),'rgba(9, 23, 38, 0.3)');
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).borderTopWidth),'1px');
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth),true,'Tight dice box has no horizontal scrollbar');
    assert.equal(await dialog.evaluate(element => getComputedStyle(element).pointerEvents), 'none', 'Empty overlay space does not intercept pitch input');
    const offered = journey.offered.actions.filter(action => action.kind === 'blockDie');
    assert.equal(await dialog.locator('.live-dice-choices .match-die').count(), journey.count);
    if (journey.count === 0) assert.equal(await dialog.getByRole('status').locator('.match-die').getAttribute('data-face'), '1', 'The failed pickup remains visible beside its reroll choices');
    for (const action of offered) {
      const choice = dialog.getByRole('button', { name: action.label, exact: true });
      await assertUnboxed(choice);
      assert.equal(await choice.locator('span').evaluate(element => element.getBoundingClientRect().width), 1, 'Native choice text remains accessible without visible labels around dice');
      assert.equal(await choice.evaluate(element => getComputedStyle(element).pointerEvents), 'auto');
      assert.match(await choice.locator('.match-die').evaluate(element => getComputedStyle(element).filter), /drop-shadow/);
    }
    for (const angle of [30, 50, 40]) {
      await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      assert.deepEqual(await page.evaluate(() => window.diceActions), []);
      assert.equal(await dialog.locator('.live-dice-choices .match-die').count(), journey.count);
    }
    await page.getByRole('button', { name: 'Top-down view', exact: true }).click();
    await page.setViewportSize({ width: 560, height: 500 });
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].every(button => {
      const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    }));
    for (const button of await dialog.getByRole('button').all()) {
      const rect = await button.boundingBox(); assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 560 && rect.y + rect.height <= 500);
    }
    const action = journey.count ? offered.at(-1) : journey.offered.actions.find(action => action.id.endsWith(':reroll:team'));
    const choice = dialog.getByRole('button', { name: action.label, exact: true });
    await page.keyboard.press('Tab');
    await choice.focus();
    assert.notEqual(await choice.evaluate(element => getComputedStyle(element).outlineStyle), 'none');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.diceActions), [action.id], 'One keyboard choice retains its exact native identity');
    assert.equal(await dialog.getByRole('button').first().isDisabled(), true);
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const report of journey.reports) for (const mode of ['coach', 'spectator', 'replay']) {
      await publish({ view: mode === 'coach' ? journey.chosen : journey.spectator, report, readOnly: true, replay: mode === 'replay' });
      const roll = page.locator('.live-dice-overlay[role="status"]'); await roll.waitFor(); assert.equal(await roll.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(9, 23, 38, 0.3)'); assert.equal(await roll.evaluate(el => getComputedStyle(el).borderTopWidth), '1px');
      const expected = report.blockRoll ? report.blockRoll.map(value => ['SKULL', 'BOTH DOWN', 'PUSHBACK', 'PUSHBACK', 'POW/PUSH', 'POW'][value - 1]) : [String(report.roll)];
      assert.deepEqual(await roll.locator('.match-die').evaluateAll(elements => elements.map(element => element.dataset.face)), expected);
      assert.equal(await roll.locator('.match-die.selected').count(), report.reportId === 'blockChoice' ? 1 : 0);
      if (report.reportId === 'blockChoice') assert.equal(await roll.locator('.match-die.selected').getAttribute('data-face'), expected[report.diceIndex]);
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.match(await roll.getAttribute('aria-label'), new RegExp(expected[0]));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await roll.locator('.match-die').evaluateAll(elements => elements.flatMap(element => element.getAnimations()).length), 0);
      if (evidence && (journey.count === 0 || journey.count === 3) && report === journey.reports.at(-1)) await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.count}-${mode}.jpg`), type: 'jpeg', quality: 80 });
    }
    assert.deepEqual(errors, []); await page.close();
  }
  const followUp = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[8].actor;
  for (const projection of ['perspective', 'top-down']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(input => { window.diceInput = input; window.diceActions = []; }, { view: { ...followUp, actions: [] } });
    await page.route('**/dice-test', route => route.fulfill({ contentType: 'text/html', body:
      '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/dice-ui-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/dice-test`);
    if (projection === 'top-down') await page.getByRole('button', { name: 'Top-down view' }).click();
    await page.evaluate(view => window.publishDice({ view }), followUp);
    const dialog = page.getByRole('dialog', { name: 'Match decision' }); await dialog.waitFor();
    assert.equal(await dialog.evaluate(element => getComputedStyle(element, '::backdrop').backgroundColor), 'rgba(0, 0, 0, 0)',
      'Follow-up leaves the pitch at normal brightness');
    assert.ok((await dialog.boundingBox()).width <= 202, 'Follow-up prompt is compact');
    assert.ok(await dialog.evaluate(element => {
      const player = document.querySelector('.live-marker.active');
      if (!player) return false;
      const prompt = element.getBoundingClientRect(), actor = player.getBoundingClientRect();
      return prompt.right <= actor.left || prompt.left >= actor.right || prompt.bottom <= actor.top || prompt.top >= actor.bottom;
    }), 'Follow-up prompt does not cover the active player');
    const chosen = followUp.actions.find(action => /Follow up$/.test(action.label));
    const choice = dialog.getByRole('button', { name: 'Yes' });
    await choice.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.diceActions), [chosen.id], 'Follow-up submits only the exact offered action');
    assert.equal(await choice.isDisabled(), true);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('PASS: native d6 and 1/2/3 block faces, boxed rolls and unboxed choice faces, exact keyboard choices, focus, viewport, both coaches, spectator and replay.');
} finally { await browser.close(); await server.close(); }
