import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/match-log-${name}.json`, import.meta.url), 'utf8'));
const cases = ['traits', 'trait-rerolls', 'automatic', 'pro-test', 'follow-up'].flatMap(read);
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(records => { window.logFixture = records; }, cases[0].records);
  await page.route('**/checks-log', route => route.fulfill({ contentType: 'text/html', body:
    '<style>body{background:#07131f;color:#b6c7d8}.match-event-log{height:360px;width:600px;max-width:95vw}</style><div id="app"></div><script type="module" src="/test/match-log-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/checks-log`); await page.evaluate(() => document.fonts.ready);
  const log = page.getByRole('log'), debug = page.getByRole('checkbox', { name: 'Debug', exact: true });
  const movement = page.getByRole('checkbox', { name: 'Movement', exact: true }), modifiers = page.getByRole('checkbox', { name: 'Roll modifiers', exact: true });
  await log.waitFor();
  for (const input of cases) {
    await page.evaluate(records => window.publishLogRecords(records), input.records);
    await page.waitForFunction(matchId => document.querySelector('main').dataset.fixtureMatch === matchId, input.records[0].state.matchId);
    await page.waitForFunction(revision => document.querySelector('[role="log"] [data-revision="' + revision + '"]'), input.records.at(-1).revision);
    const text = await log.textContent(); assert.ok(!/request |[0-9a-f]{8}-[0-9a-f]{4}-/.test(text), input.name);
    assert.ok(/base \d+\+/.test(text), input.name);
    if (input.name.includes('pro-test')) {
      const rows = await log.locator('p').allTextContents();
      const pro = rows.findIndex(row => row.includes('tests Pro: 1 vs 3+'));
      const team = rows.findIndex(row => row.includes('used Team reroll.'));
      const retry = rows.findIndex(row => row.includes('rerolls Pro: 6 vs 3+'));
      assert.ok(pro >= 0 && team > pro && retry > team, input.name);
      assert.equal(rows.filter(row => row.includes('used Pro reroll.')).length, 1);
      for (const showDebug of [false, true]) for (const showMovement of [false, true]) for (const showModifiers of [false, true]) {
        await debug.setChecked(showDebug); await movement.setChecked(showMovement); await modifiers.setChecked(showModifiers);
        assert.equal(await log.locator('.match-log-debug').count() > 0, showDebug);
        assert.ok((await log.textContent()).includes('rerolls Pro: 6 vs 3+'));
      }
      await debug.uncheck(); await movement.uncheck(); await modifiers.check();
    }
  }
  const input = read('pro-test')[0]; await page.evaluate(records => window.publishLogRecords(records), input.records);
  await page.waitForFunction(() => document.querySelector('[role="log"]').textContent.includes('rerolls Pro: 6 vs 3+'));
  if (process.env.MATCH_LOG_EVIDENCE_DIR) {
    mkdirSync(process.env.MATCH_LOG_EVIDENCE_DIR, { recursive: true });
    for (const [name, fragment] of [['original', 'picks up the ball'], ['failed-test', 'tests Pro: 1'], ['team-source', 'used Team reroll.'], ['retry', 'rerolls Pro: 6']]) {
      await log.evaluate((element, text) => {
        const row = [...element.querySelectorAll('p')].find(item => item.textContent.includes(text));
        element.scrollTop = row.offsetTop;
      }, fragment);
      await page.locator('.match-event-log').screenshot({ path: `${process.env.MATCH_LOG_EVIDENCE_DIR}/native-pro-${name}.png` });
    }
  }
  await page.reload(); assert.ok((await log.textContent()).includes('tests '));
  assert.equal(await debug.isChecked(), false); assert.equal(await movement.isChecked(), false); assert.equal(await modifiers.isChecked(), true);
  assert.deepEqual(errors, []);
  console.log('PASS 36 native trait/check journeys, Pro source-test chronology, all log controls and reload');
} finally { await browser.close(); await server.close(); }
