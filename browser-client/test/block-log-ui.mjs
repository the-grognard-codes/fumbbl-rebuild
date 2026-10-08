import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { matchLogLines } from '../src/match-log.ts';

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/match-log-block-${name}.json`, import.meta.url), 'utf8'));
const cases = ['faces', 'skills', 'rerolls', 'pro-test'].flatMap(read);
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(records => { window.logFixture = records; }, cases[0].records);
  await page.route('**/block-log', route => route.fulfill({ contentType: 'text/html', body:
    '<style>body{background:#07131f;color:#b6c7d8}.match-event-log{height:430px;width:600px;max-width:95vw}</style><div id="app"></div><script type="module" src="/test/match-log-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/block-log`); await page.evaluate(() => document.fonts.ready);
  const log = page.getByRole('log'), debug = page.getByRole('checkbox', { name: 'Debug', exact: true });
  const movement = page.getByRole('checkbox', { name: 'Movement', exact: true }), modifiers = page.getByRole('checkbox', { name: 'Roll modifiers', exact: true });
  const publish = async input => {
    await page.evaluate(records => window.publishLogRecords(records), input.records);
    const expected = matchLogLines(input.records).map(line => line.text).join('');
    await page.waitForFunction(text => document.querySelector('[role="log"]').textContent === text, expected);
  };
  await log.waitFor();
  for (const input of cases) {
    await publish(input);
    const lines = matchLogLines(input.records), moments = lines.filter(line => line.dice);
    assert.equal(await log.locator('svg.match-die').count(), moments.reduce((sum, line) => sum + line.dice.faces.length, 0), input.name);
    assert.equal(await log.locator('svg.selected').count(), 1, input.name);
    for (const image of await log.getByRole('img').all()) assert.match(await image.getAttribute('aria-label'), /^Ivory and cyan die: (Skull|Both down|Push|Stumble|Pow)$/);
    const bounds = await log.locator('svg.match-die').first().boundingBox(); assert.equal(bounds.width, 22); assert.equal(bounds.height, 22);
    await page.waitForFunction(() => [...document.querySelectorAll('.match-log-dice image')].every(image => {
      const probe = new Image(); probe.src = image.getAttribute('href'); return probe.complete && probe.naturalWidth > 0;
    }));
    if (process.env.MATCH_LOG_EVIDENCE_DIR && ['home-both-block', 'home-wrestle-defender', 'home-chain', 'home-pro-test-uphill'].includes(input.name)) {
      mkdirSync(process.env.MATCH_LOG_EVIDENCE_DIR, { recursive: true });
      await log.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await page.locator('.match-event-log').screenshot({ path: `${process.env.MATCH_LOG_EVIDENCE_DIR}/${input.name}.png` });
    }
  }
  const input = read('pro-test')[0]; await publish(input);
  for (const showDebug of [false, true]) for (const showMovement of [false, true]) for (const showModifiers of [false, true]) {
    await debug.setChecked(showDebug); await movement.setChecked(showMovement); await modifiers.setChecked(showModifiers);
    const expected = matchLogLines(input.records, { debug: showDebug, movement: showMovement, rollModifiers: showModifiers });
    assert.equal(await log.locator('svg.selected').count(), 1); assert.equal(await log.locator('p').count(), expected.length);
    assert.equal(await log.locator('.match-log-debug').count() > 0, showDebug);
  }
  await debug.uncheck(); await movement.uncheck(); await modifiers.check();
  await page.reload(); assert.equal(await log.locator('svg.selected').count(), 1); assert.equal(await debug.isChecked(), false);
  const records = structuredClone(input.records); while (records.length < 220) {
    const record = structuredClone(input.records.find(record => record.native.some(command => command.reportList.reports.some(report => report.reportId === 'blockChoice'))));
    record.index = records.length; record.revision = records.length; record.state.revision = records.length; record.decision = null; records.push(record);
  }
  await page.evaluate(records => window.publishLogRecords(records), records);
  await page.waitForFunction(() => document.querySelectorAll('[role="log"] p').length === 160);
  await page.getByRole('button', { name: 'Earlier', exact: true }).click();
  assert.equal(await log.locator('p').count(), Math.min(320, matchLogLines(records).length)); assert.ok(await log.getByRole('img').count() > 0);
  assert.deepEqual(errors, []); console.log(`PASS ${cases.length} native block log journeys, loaded dice artwork, chooser, skills, outcomes, all settings, reload and paging`);
} finally { await browser.close(); await server.close(); }
