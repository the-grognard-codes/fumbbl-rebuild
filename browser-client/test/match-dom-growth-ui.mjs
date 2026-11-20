import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const view = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
view.actions = []; view.prompt = null; view.playerActionMenu = [];
const seed = JSON.parse(readFileSync(new URL('./fixtures/match-log-primary.json', import.meta.url), 'utf8'))
  .find(input => input.name === 'pass-6').records.at(-1);
const evidence = process.env.MATCH_DOM_EVIDENCE;
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(view => { window.domInput = { view, records: [] }; }, view);
  await page.route('**/dom-test', route => route.fulfill({ contentType: 'text/html', body:
    '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/match-dom-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/dom-test`);
  await page.locator('.live-pitch-viewport').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const cdp = await page.context().newCDPSession(page);
  const counts = () => page.evaluate(() => ({ total: document.querySelectorAll('*').length,
    log: document.querySelector('.match-history-log')?.querySelectorAll('*').length ?? 0,
    rows: document.querySelectorAll('.match-history-log [data-log-key]').length }));
  const measure = async label => {
    await page.waitForTimeout(500);
    const complete = new Promise(done => cdp.once('Tracing.tracingComplete', done));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' });
    await page.waitForTimeout(1100);
    await cdp.send('Tracing.end');
    const { stream } = await complete;
    let raw = ''; for (;;) { const chunk = await cdp.send('IO.read', { handle: stream }); raw += chunk.data; if (chunk.eof) break; }
    await cdp.send('IO.close', { handle: stream });
    const events = JSON.parse(raw).traceEvents;
    const names = ['Paint', 'Layerize', 'UpdateLayoutTree', 'AnimationFrame::Render'];
    const result = Object.fromEntries(names.map(name => [name, { count: events.filter(event => event.name === name && event.ph === 'X').length,
      ms: events.filter(event => event.name === name && event.ph === 'X').reduce((sum, event) => sum + (event.dur ?? 0) / 1000, 0) }]));
    result.animations = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').map(animation => ({
      target: animation.effect?.target?.className?.baseVal ?? animation.effect?.target?.className,
      duration: animation.effect?.getTiming().duration, iterations: String(animation.effect?.getTiming().iterations) })));
    if (evidence) { mkdirSync(evidence, { recursive: true }); writeFileSync(resolve(evidence, `${label}-trace.json`), raw); }
    return result;
  };
  const measurements = { early: await counts(), earlyOff: await measure('early-off') };
  await page.evaluate(() => window.diagnosticsMode('graph'));
  measurements.earlyGraph = await measure('early-graph');
  await page.evaluate(() => window.diagnosticsMode('off'));
  measurements.peakElements = await page.evaluate(({ view, seed }) => {
    const records = [];
    let peak = 0;
    for (let revision = 1; revision <= 450; revision++) {
      records.push({ ...seed, index: revision, revision, state: { ...seed.state, matchId: view.matchId, revision },
        decision: { operation: 'action', requestId: `revision-${revision}`, actionId: 'opaque-choice' },
        native: [{ commandNr: revision, reportList: { reports: [{ reportId: 'dodgeRoll', playerId: 'actor', roll: 6,
          minimumRoll: 3, successful: true, logRoll: { version: 1, base: 3, target: 3, modifier: 0, square: { x: 10, y: 7 } } }] } }] });
      window.publishDom({ view: { ...view, revision }, records: records.slice() });
      peak = Math.max(peak, document.querySelectorAll('*').length);
    }
    return peak;
  }, { view, seed });
  measurements.late = await counts();
  measurements.lateOff = await measure('late-off');
  await page.evaluate(() => window.diagnosticsMode('graph'));
  measurements.lateGraph = await measure('late-graph');
  measurements.userSelect = await page.locator('.live-pitch-viewport').evaluate(element => getComputedStyle(element).userSelect);
  await page.evaluate(() => window.diagnosticsMode('off'));
  if (evidence) { writeFileSync(resolve(evidence, 'measurements.json'), JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: resolve(evidence, 'late-match.png') });
    await page.locator('.match-history-log').screenshot({ path: resolve(evidence, 'bounded-log.png') }); }
  console.log(JSON.stringify(measurements));
  assert.ok(measurements.late.rows <= 100, `At most 100 log rows mounted after 450 revisions: ${measurements.late.rows}`);
  assert.ok(measurements.peakElements <= 2000, `Bound the complete match page: peak ${measurements.peakElements} elements`);
  assert.equal(measurements.userSelect, 'none');
  const earlier = page.getByRole('button', { name: 'Earlier log events', exact: true });
  const log = page.locator('.match-history-log [role=log]');
  await earlier.click();
  const pagedEnd = await log.locator('[data-log-key]').last().getAttribute('data-log-key');
  await log.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await log.locator('[data-log-key]').last().getAttribute('data-log-key'), pagedEnd,
    'Reaching the bottom of an explicit Earlier page must stay pinned');
  assert.equal(await log.locator('[data-revision="450"]').count(), 0);
  const later = page.getByRole('button', { name: 'Later log events', exact: true });
  for (let index = 0; index < 5 && !await later.isDisabled(); index++) await later.click();
  assert.equal(await later.isDisabled(), true);
  assert.equal(await log.getAttribute('aria-live'), 'polite', 'Later returns the paged window to live following');
  assert.ok(await log.locator('[data-revision="450"]').count());
  for (let index = 0; index < 4; index++) await earlier.click();
  assert.equal(await earlier.isDisabled(), true);
  assert.ok(await page.locator('.match-history-log [data-revision="1"]').count(), 'The oldest recorded event remains reachable');
  const latest = page.getByRole('button', { name: 'Latest log events', exact: true });
  await latest.focus();
  assert.equal(await latest.evaluate(element => element === document.activeElement), true);
  assert.equal(await page.locator('.match-history-log [role=log]').getAttribute('aria-live'), 'off');
  await page.getByRole('button', { name: 'Latest log events', exact: true }).click();
  assert.ok(await page.locator('.match-history-log [data-revision="450"]').count());
  await log.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
  const firstRead = await log.locator('[data-log-key]').first().getAttribute('data-log-key');
  await page.evaluate(() => {
    const { view, records: previous } = window.domInput;
    const records = previous.slice(), seed = records.at(-1);
    for (let revision = 451; revision <= 570; revision++) {
      records.push({ ...seed, index: revision, revision, state: { ...seed.state, revision } });
      window.publishDom({ view: { ...view, revision }, records: records.slice() });
    }
  });
  assert.equal(await log.locator('[data-log-key]').first().getAttribute('data-log-key'), firstRead,
    'Reading the latest page pins its window through more than a page of new events');
  await page.getByRole('button', { name: 'Latest log events', exact: true }).click();
  assert.ok(await page.locator('.match-history-log [data-revision="570"]').count());
  // Returning to the bottom after a small arrival burst resumes live following.
  await log.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector('.match-history-log [role=log]').getAttribute('aria-live') === 'off');
  await page.evaluate(() => {
    const { view, records: previous } = window.domInput;
    const records = previous.slice(), seed = records.at(-1);
    for (let revision = 571; revision <= 600; revision++)
      records.push({ ...seed, index: revision, revision, state: { ...seed.state, revision } });
    window.publishDom({ view: { ...view, revision: 600 }, records });
  });
  assert.equal(await log.locator('[data-revision="600"]').count(), 0, 'New arrivals stay hidden while reading');
  await log.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await log.locator('[data-revision="600"]').waitFor({ timeout: 1500 });
  await page.evaluate(() => {
    const { view, records } = window.domInput;
    const seed = records.at(-1), revision = 601;
    window.publishDom({ view: { ...view, revision }, records: [...records,
      { ...seed, index: revision, revision, state: { ...seed.state, revision } }] });
  });
  await log.locator('[data-revision="601"]').waitFor({ timeout: 1500 });
  assert.equal(await log.getAttribute('aria-live'), 'polite', 'The resumed live window keeps following without Later or Latest');
  assert.ok(await log.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight <= 36));
  // Below the mounted-row limit there is no Latest control to recover a pinned window.
  const resumed = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  resumed.on('pageerror', error => errors.push(error.message));
  const smallInput = await page.evaluate(() => ({ view: { ...window.domInput.view, revision: 40 },
    records: window.domInput.records.slice(0, 40) }));
  await resumed.addInitScript(input => { window.domInput = input; }, smallInput);
  await resumed.route('**/dom-follow-test', route => route.fulfill({ contentType: 'text/html', body:
    '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/match-dom-ui-harness.tsx"></script>' }));
  await resumed.goto(`http://127.0.0.1:${server.httpServer.address().port}/dom-follow-test`);
  await resumed.locator('.match-history-log [data-revision="40"]').waitFor();
  await resumed.evaluate(() => document.fonts.ready);
  const resumedLog = resumed.locator('.match-history-log [role=log]');
  assert.equal(await resumed.getByRole('button', { name: 'Latest log events', exact: true }).count(), 0);
  assert.ok(await resumedLog.evaluate(element => element.scrollHeight > element.clientHeight + 36));
  await resumedLog.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await resumed.waitForFunction(() => document.querySelector('.match-history-log [role=log]').getAttribute('aria-live') === 'off');
  await resumedLog.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await resumed.evaluate(() => {
    const { view, records } = window.domInput;
    const last = records.at(-1);
    window.publishDom({ view: { ...view, revision: 41 }, records: [...records,
      { ...last, index: 41, revision: 41, state: { ...last.state, revision: 41 } }] });
  });
  await resumedLog.locator('[data-revision="41"]').waitFor({ timeout: 1500 });
  assert.equal(await resumedLog.getAttribute('aria-live'), 'polite', 'Returning to the live bottom resumes following and announcements');
  assert.ok(await resumedLog.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight <= 36));
  await resumed.close();
  // Exercise real GameView announcement mounts without growing the retained log input.
  await page.clock.install();
  await page.evaluate(view => {
    const state = { ...view, matchId: 'splash-dom', revision: 100, phase: 'PLAY', turnMode: 'REGULAR', actions: [], prompt: null };
    const records = Array.from({length: 101}, (_, revision) => ({ index: revision, revision, kind: 'ACTION', actor: 'home', at: revision, decision: null, state: { ...state, revision },
      native: [{ commandNr: revision, matchAnnouncements: { version: 1, events: [{ kind: 'touchdown', team: 'home', turn: 1, half: 1, reason: null }] } }] }));
    window.publishDom({ view: state, records });
  }, view);
  await page.locator('.match-splash').waitFor({ state: 'detached' });
  let settledCount;
  for (let revision = 101; revision <= 151; revision++) {
    await page.evaluate(({ view, revision }) => {
      const state = { ...view, matchId: 'splash-dom', revision, phase: 'PLAY', turnMode: 'REGULAR', actions: [], prompt: null };
      window.publishDom({ view: state, records: [...window.domInput.records, { index: revision, revision, kind: 'ACTION', actor: 'home', at: revision, decision: null, state,
        native: [{ commandNr: revision, matchAnnouncements: { version: 1, events: [{ kind: 'touchdown', team: 'home', turn: 1, half: 1, reason: null }] } }] }] });
    }, { view, revision });
    await page.locator('.match-splash-touchdown').waitFor();
    await page.keyboard.press('Escape'); await page.clock.runFor(600);
    await page.locator('.match-splash').waitFor({ state: 'detached' });
    const current = await page.locator('*').count();
    if (revision === 101) settledCount = current;
    else assert.equal(current, settledCount, '50 further splashes retain no DOM after exit');
  }
  assert.deepEqual(errors, []);
  console.log('PASS 450 revisions, bounded match DOM, accessible full log history, idle Off/Graph evidence, pitch selection');
} finally { await browser.close(); await server.close(); }
