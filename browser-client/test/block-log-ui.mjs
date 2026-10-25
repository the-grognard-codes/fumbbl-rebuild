import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
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
    const expected = matchLogLines(input.records);
    await page.waitForFunction(count => document.querySelectorAll('[role="log"] p').length === count, expected.length);
    const rendered = await log.locator('p').evaluateAll(rows => rows.map(row => {
      const copy = row.cloneNode(true);
      copy.querySelectorAll('.polygon-die').forEach(die => die.remove());
      copy.querySelectorAll('.match-log-dice').forEach(dice => dice.remove());
      return { text: copy.textContent, dice: row.querySelectorAll('.polygon-die').length };
    }));
    for (let index = 0; index < expected.length; index++) {
      if (!expected[index].dice) assert.equal(rendered[index].text, expected[index].text, `${input.name}: ${expected[index].text}`);
      else assert.equal(rendered[index].dice, expected[index].dice.faces.length, `${input.name}: ${expected[index].text}`);
    }
  };
  await log.waitFor();
  for (const input of cases) {
    await publish(input);
    const lines = matchLogLines(input.records), moments = lines.filter(line => line.dice);
    assert.equal(await log.locator('.match-die').count(), moments.reduce((sum, line) => sum + line.dice.faces.length, 0), input.name);
    assert.equal(await log.locator('.match-die.selected').count(), 1, input.name);
    assert.equal(await log.locator('.match-die.selected').evaluateAll(dice => dice.every(die => {
      if (getComputedStyle(die).filter !== 'none') return false;
      const home = die.classList.contains('home-selected'), away = die.classList.contains('away-selected');
      if (home || away) {
        if (die.dataset.coachMarker !== undefined || die.title) return false;
        if (getComputedStyle(die).outlineStyle === 'none') return false;
        if (die.classList.contains('uphill-selected')) return getComputedStyle(die).outlineColor === 'rgb(228, 74, 80)';
        return getComputedStyle(die).outlineColor === (home ? 'rgb(73, 223, 255)' : 'rgb(228, 74, 80)');
      }
      return getComputedStyle(die).outlineStyle === 'none';
    })), true, `${input.name}: selected dice identify the chooser and use a clear outline`);
    const d6 = log.locator('.numeric-die.d6').first();
    if (await d6.count()) {
      const markerOffset = await d6.evaluate(die => {
        const face = die.querySelector('.block-die-side[data-result="true"]'), bounds = face.getBoundingClientRect();
        const markers = [...face.querySelectorAll('[data-pip]')].map(marker => marker.getBoundingClientRect());
        const center = markers.reduce((sum, marker) => sum + marker.y + marker.height / 2, 0) / markers.length;
        return center - (bounds.y + bounds.height / 2);
      });
      assert.ok(markerOffset < .75 && markerOffset > -.75, `${input.name}: D6 pips are optically centered on the face (${markerOffset}px)`);
    }
    for (const image of await log.getByRole('img').all()) assert.match(await image.getAttribute('aria-label'), /^Ivory and cyan die: /);
    const blockGeometry = await log.locator('.match-log-dice .block-die').first().evaluate(die => ({
      bounds: die.getBoundingClientRect().toJSON(),
      fontSize: parseFloat(getComputedStyle(die).fontSize),
      cube: parseFloat(getComputedStyle(die.querySelector('.block-die-cube')).width),
      mark: getComputedStyle(die.querySelector('.block-die-side svg')).transform
    }));
    const slotSize = blockGeometry.fontSize * 1.9;
    assert.ok(Math.abs(blockGeometry.bounds.width - slotSize) < .05, `${input.name}: block die width scales with log text`);
    assert.ok(Math.abs(blockGeometry.bounds.height - slotSize) < .05, `${input.name}: block die height scales with log text`);
    if (await d6.count()) {
      const numericBounds = await d6.boundingBox();
      assert.ok(Math.abs(blockGeometry.bounds.width - numericBounds.width) < .05, `${input.name}: block and numeric log dice share a slot size`);
    }
    const selectionShift = await log.locator('.match-log-dice .block-die.selected').evaluateAll(dice => dice.map(die => {
      const before = die.getBoundingClientRect();
      const face = die.querySelector('.block-die-side[data-result="true"]');
      const graphicBefore = face.getBoundingClientRect();
      die.classList.remove('selected');
      const after = die.getBoundingClientRect(), graphicAfter = face.getBoundingClientRect();
      die.classList.add('selected');
      return Math.max(...['x', 'y', 'width', 'height'].map(key => Math.max(
        Math.abs(before[key] - after[key]), Math.abs(graphicBefore[key] - graphicAfter[key]))));
    }));
    assert.ok(selectionShift.every(shift => shift < .05), `${input.name}: selection outline does not shift the die or its face`);
    assert.ok(Math.abs(blockGeometry.cube - blockGeometry.fontSize * 1.5) < .05, `${input.name}: block die face scales within its log slot`);
    assert.equal(blockGeometry.mark, 'matrix(1, 0, 0, 1, 0, -0.5)', `${input.name}: face marking is centered without moving the die`);
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
    assert.equal(await log.locator('.match-die.selected').count(), 1); assert.equal(await log.locator('p').count(), expected.length);
    assert.equal(await log.locator('.match-log-debug').count() > 0, showDebug);
  }
  await debug.uncheck(); await movement.uncheck(); await modifiers.check();
  await page.reload(); assert.equal(await log.locator('.match-die.selected').count(), 1); assert.equal(await debug.isChecked(), false);
  const records = structuredClone(input.records); while (records.length < 220) {
    const record = structuredClone(input.records.find(record => record.native.some(command => command.reportList.reports.some(report => report.reportId === 'blockChoice'))));
    record.index = records.length; record.revision = records.length; record.state.revision = records.length; record.decision = null; records.push(record);
  }
  await page.evaluate(records => window.publishLogRecords(records), records);
  const completeLines = matchLogLines(records);
  await page.waitForFunction(count => document.querySelectorAll('[role="log"] p').length === count, completeLines.length);
  assert.equal(await log.getByRole('button', { name: /Earlier|Later/ }).count(), 0);
  assert.ok(await log.getByRole('img').count() > 0);
  assert.deepEqual(errors, []); console.log(`PASS ${cases.length} native block log journeys, loaded dice artwork, chooser, skills, outcomes, all settings, reload and complete history`);
} finally { await browser.close(); await server.close(); }
