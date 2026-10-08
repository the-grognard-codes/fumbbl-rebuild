import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/match-log-${name}.json`, import.meta.url), 'utf8'));
const fixture = read('primary').find(input => input.name === 'pass-6').records;
const movementCases = [...read('movement'), ...read('interrupted')];
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(records => { window.logFixture = records; }, fixture);
  await page.route('**/log-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>body{background:#07131f;color:#b6c7d8}.match-event-log{height:360px;width:600px;max-width:95vw}</style><div id="app"></div><script type="module" src="/test/match-log-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/log-test`);
  await page.evaluate(() => document.fonts.ready);
  const log = page.getByRole('log'), debug = page.getByRole('checkbox', { name: 'Debug', exact: true });
  const movement = page.getByRole('checkbox', { name: 'Movement', exact: true }), modifiers = page.getByRole('checkbox', { name: 'Roll modifiers', exact: true });
  await log.waitFor(); assert.equal(await debug.isChecked(), false); assert.equal(await movement.isChecked(), false); assert.equal(await modifiers.isChecked(), true);
  assert.match(await log.textContent(), /Runner declares a pass\./);
  assert.match(await log.textContent(), /Runner passes to \(14, 7\): 6 vs 4\+ \(base 3\+ · -1 net modifier\).*accurate/);
  await debug.check(); assert.ok(await log.locator('.match-log-debug').count());
  await modifiers.uncheck(); assert.doesNotMatch(await log.textContent(), /net modifier/);
  assert.match(await log.textContent(), /6 vs 4\+ \(base 3\+\)/);
  await movement.check();
  for (const input of movementCases) {
    await page.evaluate(records => window.publishLogRecords(records), input.records);
    await page.waitForFunction(count => document.querySelectorAll('.match-event-scroll [data-log-key^="movement:"]').length === count, input.name.endsWith('separate') ? 4 : 1);
    if (input.name === 'pickup-failed') assert.match(await log.textContent(), /picks up the ball.*failure/);
  }
  await movement.uncheck(); assert.equal(await log.locator('[data-log-key^="movement:"]').count(), 0);
  await movement.check(); await page.reload(); await log.waitFor();
  assert.equal(await debug.isChecked(), true); assert.equal(await movement.isChecked(), true); assert.equal(await modifiers.isChecked(), false);
  await page.evaluate(records => window.publishLogRecords(records), fixture);
  const many = Array.from({ length: 400 }, (_, index) => ({ ...fixture.at(-1), index: index + 1, revision: index + 1,
    decision: { operation: 'action', requestId: `record-${index}`, actionId: 'opaque-choice' },
    state: { ...fixture.at(-1).state, revision: index + 1 }, native: [{ commandNr: index + 1, reportList: { reports: [
      { reportId: 'dodgeRoll', playerId: 'actor', roll: 6, minimumRoll: 3, successful: true, logRoll: { version: 1, base: 3, target: 3, modifier: 0, square: { x: 10, y: 7 } } }
    ] } }] }));
  await page.evaluate(records => window.publishLogRecords(records), many);
  await page.waitForFunction(() => document.querySelectorAll('.match-event-scroll p').length === 160);
  await page.getByRole('button', { name: 'Earlier', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.match-event-scroll p').length === 320);
  await log.evaluate(element => { element.scrollTop = 1000; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
  const visibleKey = () => log.evaluate(element => Array.from(element.querySelectorAll('[data-log-key]'))
    .find(row => row.offsetTop + row.offsetHeight > element.scrollTop)?.dataset.logKey);
  const before = await visibleKey();
  await debug.uncheck(); assert.equal(await visibleKey(), before, 'Changing settings preserves the visible history row');
  await modifiers.check(); assert.equal(await visibleKey(), before);
  const replaced = structuredClone(many); replaced[0].native[0].reportList.reports[0].successful = false;
  await page.evaluate(records => window.publishLogRecords(records), replaced);
  await page.getByRole('button', { name: 'Earlier', exact: true }).click();
  assert.match(await log.locator('p').first().textContent(), /failure/, 'Same-length replaced history is reformatted');
  assert.equal(await log.locator('.match-log-debug').count(), 0);
  assert.doesNotMatch(await log.textContent(), /opaque-choice|record-/);
  if (process.env.MATCH_LOG_EVIDENCE_DIR) {
    mkdirSync(process.env.MATCH_LOG_EVIDENCE_DIR, { recursive: true });
    await page.evaluate(records => window.publishLogRecords(records), read('primary').find(input => input.name === 'secure-ball').records);
    await page.getByRole('button', { name: 'Large log text' }).click();
    await log.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.locator('.match-event-log').screenshot({ path: `${process.env.MATCH_LOG_EVIDENCE_DIR}/native-log-controls.png` });
  }
  assert.deepEqual(errors, []); console.log('PASS native action log, committed movement, all preferences, reload, paging, scroll preservation and equal-length history replacement');
} finally { await browser.close(); await server.close(); }
