import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { DICE_GROUP_INTERVAL_MS, EMPHASIZED_DICE_RETENTION_MS } from '../src/presentation-timing.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = process.env.ROUNDUP_UI_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const failures = [];
const check = async (name, run) => { try { await run(); console.log(`PASS ${name}`); } catch (error) { failures.push(error); console.error(`FAIL ${name}: ${error.message}`); } };
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, reducedMotion: 'reduce' });
  await check('stationary site/menu/lobby edges remain hit targets and activate once', async () => {
    const siteCss = readFileSync(new URL('../../site/src/assets/site.css', import.meta.url), 'utf8').replace(/^@import[^;]*;/, '');
    const lobbyCss = readFileSync(new URL('../src/play-lobby.css', import.meta.url), 'utf8');
    await page.setContent(`<style>${siteCss}\n${lobbyCss}</style><main style="padding:40px;display:grid;gap:30px"><button id="site">Site action</button><a class="button" href="#done">Site link</a><div class="account-options" style="position:static"><button>Menu action</button></div><section class="play-lobby"><button class="ai-coach-card">Coach choice</button></section></main>`);
    await page.evaluate(() => { window.activations = 0; document.querySelectorAll('button,a').forEach(button => button.addEventListener('click', () => window.activations++)); });
    for (const width of [1100, 768]) {
      await page.setViewportSize({ width, height: 900 });
      for (const control of await page.locator('button,a').all()) {
        await page.mouse.move(0, 0);
        const box = await control.boundingBox();
        const edges = [[.5, .5], [box.width / 2, .5], [box.width - .5, .5], [.5, box.height / 2],
          [box.width - .5, box.height / 2], [.5, box.height - .5], [box.width / 2, box.height - .5], [box.width - .5, box.height - .5]];
        for (const [dx, dy] of edges) {
          const x = box.x + dx, y = box.y + dy;
          await page.mouse.move(x, y);
          const hits = await control.evaluate(async (element, { x, y }) => {
            const results = [];
            for (let i = 0; i < 8; i++) { await new Promise(requestAnimationFrame); results.push(element.contains(document.elementFromPoint(x, y))); }
            return results;
          }, { x, y });
          assert.ok(hits.every(Boolean), `${await control.textContent()} loses its pointer at ${dx},${dy}: ${hits}`);
          const before = await page.evaluate(() => window.activations);
          await page.mouse.click(x, y);
          assert.equal(await page.evaluate(() => window.activations), before + 1);
        }
        await page.mouse.move(0, 0);
        assert.equal(await control.evaluate(element => element.matches(':hover')), false);
        const beforeKeyboard = await page.evaluate(() => window.activations);
        await control.focus(); await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => window.activations), beforeKeyboard + 1, 'Keyboard activation works after hover exit');
      }
      if (evidence) await page.screenshot({ path: resolve(evidence, `hover-${width}.png`) });
    }
    const touch = await browser.newPage({ viewport: { width: 768, height: 900 }, hasTouch: true });
    await touch.setContent(await page.content());
    await touch.evaluate(() => { window.activations = 0; document.querySelectorAll('button,a').forEach(button => button.addEventListener('click', () => window.activations++)); });
    for (const control of await touch.locator('button,a').all()) await control.tap();
    assert.equal(await touch.evaluate(() => window.activations), 4, 'Touch taps activate each control once');
    await touch.close();
  });
  const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
  const reports = [
    { reportId: 'blockRoll', blockRoll: [1, 6] },
    { reportId: 'injury', defenderId: initial.players[0].id, armorRoll: [6, 5], injuryRoll: [4, 3], armorBroken: true },
    ...Array.from({ length: 8 }, (_, i) => ({ reportId: 'scatterBall', rolls: [i + 1] })),
    ...Array.from({ length: 16 }, (_, i) => ({ reportId: 'injury', casualtyRoll: [i + 1, 2], skipInjuryParts: 'EVERYTHING_BUT_CAS' }))
  ];
  const records = reports.map((report, index) => ({ index, revision: index, at: index, kind: 'action', actor: 'home', decision: null,
    state: { ...initial, revision: index }, native: [{ commandNr: index, reportList: { reports: [report] } }] }));
  await page.addInitScript(records => { window.logFixture = records; }, records);
  await page.route('**/roundup-log', route => route.fulfill({ contentType: 'text/html', body:
    '<style>body{background:#07131f;color:#b6c7d8}.match-event-log{width:660px;max-width:95vw}.match-event-scroll{height:780px;overflow:auto}</style><div id="app"></div><script type="module" src="/test/match-log-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/roundup-log`);
  await page.getByRole('log').waitFor(); await page.evaluate(() => document.fonts.ready);
  await check('all log dice scale at every selected size, including grouped and appended entries', async () => {
    const widths = [];
    for (const [name, pixels] of [['Small', 10], ['Medium', 12], ['Large', 14]]) {
      await page.getByRole('button', { name: `${name} log text` }).click();
      const sizes = await page.locator('.match-event-scroll .polygon-die').evaluateAll(elements => elements.map(element => ({ kind: element.dataset.dieKind, width: element.getBoundingClientRect().width, font: parseFloat(getComputedStyle(element).fontSize) })));
      assert.ok(sizes.length >= 29);
      assert.ok(sizes.every(size => Math.abs(size.width - pixels * 1.9) < .1), `${name}: ${JSON.stringify(sizes.slice(0, 5))}`);
      assert.equal(await page.getByRole('log').evaluate(element => element.scrollWidth <= element.clientWidth), true, `${name}: wrapping log has no horizontal clipping`);
      assert.equal(await page.locator('.match-event-scroll .polygon-die').evaluateAll(elements => elements.every(element => {
        const die = element.getBoundingClientRect(), row = element.closest('p').getBoundingClientRect();
        return die.left >= row.left - .5 && die.right <= row.right + .5 && die.top >= row.top - .5 && die.bottom <= row.bottom + .5;
      })), true, `${name}: every die fits its wrapped text row`);
      widths.push(sizes[0].width);
      const appended = { ...records.at(-1), index: records.length, revision: records.length };
      await page.evaluate(records => window.publishLogRecords(records), [...records, appended]);
      assert.equal(await page.locator('.match-event-scroll .polygon-die').last().evaluate(element => Math.round(element.getBoundingClientRect().width * 10)), Math.round(pixels * 19));
      if (evidence) {
        await page.setViewportSize({ width: 1100, height: 2000 });
        const saved = await page.locator('.match-event-log').getAttribute('style');
        await page.locator('.match-event-log').evaluate(element => { element.style.cssText = 'position:relative;bottom:auto;width:660px;height:auto;max-height:none'; });
        const scrollStyle = await page.getByRole('log').getAttribute('style');
        await page.getByRole('log').evaluate(element => { Object.assign(element.style, { height: 'auto', flex: 'none', overflow: 'visible' }); });
        await page.locator('.match-event-log').screenshot({ path: resolve(evidence, `log-${name.toLowerCase()}.png`) });
        await page.locator('.match-event-log').evaluate((element, saved) => { if (saved === null) element.removeAttribute('style'); else element.setAttribute('style', saved); }, saved);
        await page.getByRole('log').evaluate((element, saved) => element.setAttribute('style', saved), scrollStyle);
        await page.setViewportSize({ width: 1100, height: 900 });
      }
    }
    assert.ok(widths[0] < widths[1] && widths[1] < widths[2]);
  });
  await check('D8 and D16 use matching triangles and every numeral fits and centers at every size', async () => {
    for (const size of ['Small', 'Medium', 'Large']) {
      await page.getByRole('button', { name: `${size} log text` }).click();
      // The die's ResizeObserver centers glyphs after the new font size reaches layout.
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const values = await page.locator('.match-event-scroll :is(.d8,.d16)').evaluateAll(dice => dice.map(die => {
        const svg = die.querySelector('svg'), text = svg.querySelector('text'), polygon = svg.querySelector('polygon');
        const box = text.getBBox(), transform = text.transform.baseVal.consolidate()?.matrix;
        const x = box.x + (transform?.e ?? 0), y = box.y + (transform?.f ?? 0);
        return { kind: die.dataset.dieKind, face: die.dataset.face, points: polygon.getAttribute('points'), x, y, width: box.width, height: box.height,
          triangles: die.querySelectorAll('polygon').length };
      }));
      for (const item of values) {
        assert.equal(item.triangles, 1, `${size} ${item.kind} ${item.face} must use one static triangle`);
        assert.equal(item.points, values[0].points, 'D8 and D16 share the same face');
        assert.ok(Math.abs(item.x + item.width / 2) < .15 && Math.abs(item.y + item.height / 2 - 8) < .15, `${size}: ${JSON.stringify(item)}`);
        for (const [x, y] of [[item.x, item.y], [item.x + item.width, item.y], [item.x, item.y + item.height], [item.x + item.width, item.y + item.height]])
          assert.ok(y <= 24 && y >= -24 && Math.abs(x) <= (y + 24) * 26 / 48, `${size} ${item.kind} ${item.face} escapes its triangle`);
      }
      assert.equal(new Set(values.filter(value => value.kind === 'd8').map(value => value.face)).size, 8);
      assert.equal(new Set(values.filter(value => value.kind === 'd16').map(value => value.face)).size, 16);
    }
  });
  await page.close();
  await check('native armor/injury updates appear once in horizontal pairs, preserving rerolls and successive players', async () => {
    const armor = { reportId: 'injury', defenderId: initial.players[0].id, armorRoll: [6, 5], skipInjuryParts: 'INJURY',
      numericDice: { version: 1, dice: [6, 5].map(value => ({ sides: 6, value, label: 'Armour' })) } };
    const injury = { ...armor, injuryRoll: [4, 3], skipInjuryParts: 'ARMOUR',
      numericDice: { version: 1, dice: [4, 3].map(value => ({ sides: 6, value, label: 'Injury' })) } };
    const outcome = { reportId: 'injury', defenderId: initial.players[0].id, armorRoll: [6, 5], injuryRoll: [4, 3], skipInjuryParts: 'ARMOUR_AND_INJURY' };
    const scenarios = [
      { name: 'armor-held', reports: [armor, { ...outcome, injuryRoll: undefined }], expected: [['6', '5']] },
      { name: 'armor-injury', reports: [armor, injury, outcome], expected: [['6', '5'], ['4', '3']] },
      { name: 'legitimate-reroll', reports: [armor, armor, injury, outcome], expected: [['6', '5'], ['6', '5'], ['4', '3']] },
      { name: 'successive-players', reports: [armor, outcome, { ...armor, defenderId: initial.players[1].id }], expected: [['6', '5'], ['6', '5']] }
    ];
    for (const scenario of scenarios) {
      const pitch = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const state = revision => ({ ...initial, revision, actions: [] });
      const record = (revision, reports = []) => ({ index: revision, revision, kind: 'action', actor: 'home', at: revision,
        decision: null, native: [{ commandNr: revision, reportList: { reports } }], state: state(revision) });
      await pitch.clock.install();
      await pitch.addInitScript(input => { window.playbackInput = input; window.playbackFrames = []; }, { view: state(0), records: [record(0)], enabled: true, mode: 'live' });
      await pitch.route('**/roundup-pitch', route => route.fulfill({ contentType: 'text/html', body:
        '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
      await pitch.goto(`http://127.0.0.1:${server.httpServer.address().port}/roundup-pitch`);
      await pitch.waitForFunction(() => !!window.publishPlayback);
      await pitch.clock.pauseAt(await pitch.evaluate(() => Date.now() + 100));
      await pitch.evaluate(input => window.publishPlayback(input), { view: state(1), records: [record(0), record(1, scenario.reports)], enabled: true, mode: 'live' });
      await pitch.waitForFunction(() => document.querySelectorAll('.pitch-roll-group').length === 1);
      for (let index = 1; index < scenario.expected.length; index++) {
        await pitch.clock.runFor(DICE_GROUP_INTERVAL_MS - 1);
        assert.equal(await pitch.locator('.pitch-roll-group').count(), index, `${scenario.name}: the next logical roll waits for the group cadence`);
        await pitch.clock.runFor(1);
        await pitch.waitForFunction(count => document.querySelectorAll('.pitch-roll-group').length === count, index + 1);
      }
      assert.deepEqual(await pitch.locator('.pitch-roll-group').evaluateAll(groups => groups.map(group => [...group.querySelectorAll('.polygon-die')].map(die => die.dataset.face))), scenario.expected, scenario.name);
      for (const group of await pitch.locator('.pitch-roll-group').all()) {
        const boxes = await group.locator('.polygon-die').evaluateAll(dice => dice.map(die => die.getBoundingClientRect().y));
        assert.equal(boxes.length, 2); assert.ok(Math.abs(boxes[0] - boxes[1]) < 1, `${scenario.name}: both D6 occupy the same row`);
      }
      if (evidence && scenario.name === 'armor-injury') await pitch.screenshot({ path: resolve(evidence, 'armor-injury-once.png') });
      await pitch.clock.runFor(DICE_GROUP_INTERVAL_MS);
      await pitch.waitForFunction(() => document.querySelector('#playback-state').dataset.revision === '1'
        && document.querySelector('#playback-state').dataset.active === 'false');
      await pitch.clock.runFor(EMPHASIZED_DICE_RETENTION_MS);
      assert.equal(await pitch.locator('.pitch-roll-group').count(), 0, `${scenario.name}: no duplicate is queued after the original dice expire`);
      await pitch.close();
    }
  });
} finally { await browser.close(); await server.close(); }
if (failures.length) throw new AggregateError(failures, `${failures.length} roundup UI checks failed`);
