import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export async function verifyDiceStream(browser, url) {
  const evidence = process.env.DICE_UI_EVIDENCE;
  if (evidence) mkdirSync(evidence, { recursive: true });
  const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
  const state = revision => ({ ...initial, revision, actions: [] });
  const report = { reportId: 'injury', playerId: 'home1', numericDice: { version: 1, dice: [
    { sides: 6, value: 6, label: 'Armour' }, { sides: 6, value: 5, label: 'Armour' },
    { sides: 6, value: 4, label: 'Injury' }, { sides: 6, value: 3, label: 'Injury' }
  ] } };
  const record = (revision, reports = []) => ({ index: revision, revision, kind: 'action', actor: 'home', at: revision,
    decision: null, native: [{ reportList: { reports } }], state: state(revision) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.clock.install();
    await page.addInitScript(view => { window.diceInput = { view }; window.diceActions = []; }, state(0));
    await page.route('**/stream-render-test', route => route.fulfill({ contentType: 'text/html', body:
      '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/dice-ui-harness.tsx"></script>' }));
    await page.goto(`${url}/stream-render-test`);
    await page.waitForFunction(() => !!window.publishDice);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (let value = 1; value <= 16; value++) {
        await page.evaluate(({ view, value }) => window.publishDice({ view, rollKey: `d16:${value}`, report: {
          reportId: 'apothecaryRoll', numericDice: { version: 1, dice: [{ sides: 16, value, label: 'Casualty' }] }
        } }), { view: state(1), value });
        await page.waitForFunction(() => document.querySelector('.pitch-decision-overlay')?.style.visibility === 'visible');
        for (const time of [0, 100, 200, 300, 500, 619, 620]) {
          const overflow = await page.locator('.pitch-dice-content').evaluate((content, time) => {
            content.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = time; });
            return { width: content.clientWidth, scrollWidth: content.scrollWidth, height: content.clientHeight, scrollHeight: content.scrollHeight };
          }, time);
          assert.ok(overflow.scrollWidth <= overflow.width && overflow.scrollHeight <= overflow.height,
            `D16 ${value}, ${width}px, frame ${time}ms must have no scrollbars: ${JSON.stringify(overflow)}`);
        }
      }
      if (evidence) await page.screenshot({ path: resolve(evidence, `d16-no-scrollbar-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/stream-playback-test', route => route.fulfill({ contentType: 'text/html', body:
      '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
    await page.addInitScript(input => { window.playbackInput = input; window.playbackFrames = []; },
      { view: state(0), records: [record(0)], enabled: true, mode: 'live' });
    await page.goto(`${url}/stream-playback-test`);
    await page.waitForFunction(() => !!window.publishPlayback);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    const publish = input => page.evaluate(input => window.publishPlayback(input), { enabled: true, mode: 'live', ...input });
    const faces = () => page.locator('.live-dice-overlay .pitch-dice-lifetime:not(.exiting) .match-die').evaluateAll(dice => dice.map(die => die.dataset.face));
    await publish({ view: state(1), records: [record(0), record(1, [report])] });
    await page.waitForFunction(() => document.querySelectorAll('.live-dice-overlay .pitch-dice-lifetime:not(.exiting) .match-die').length === 2);
    assert.equal(await page.locator('#playback-state').getAttribute('data-active'), 'true', 'Playback owns logical roll timing');
    assert.deepEqual(await faces(), ['6', '5'], 'Armour arrives together before injury');
    await page.clock.runFor(999);
    assert.deepEqual(await faces(), ['6', '5'], 'The next roll waits its turn');
    await page.clock.runFor(1);
    assert.deepEqual(await faces(), ['6', '5', '4', '3'], 'Injury streams in 1,000ms later');
    await page.locator('.pitch-roll-caption', { hasText: 'Injury' }).waitFor();
    await page.locator('.live-dice-overlay .pitch-dice-lifetime:not(.exiting) .match-die').evaluateAll(dice => { window.injuryDice = dice.slice(2); });
    await page.clock.runFor(620);
    if (evidence) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({ path: resolve(evidence, `armour-injury-stream-${width}.png`) });
      }
    }
    await page.clock.runFor(980);
    assert.deepEqual(await faces(), ['4', '3'], 'Armour expires after its own entrance plus 2,400ms hold');
    assert.equal(await page.locator('.live-dice-overlay .pitch-dice-lifetime:not(.exiting) .match-die').evaluateAll(dice => dice.every((die, i) => die === window.injuryDice[i])), true,
      'Expiring an older group cannot remount or reroll surviving dice');
    await page.clock.runFor(3399);
    assert.deepEqual(await faces(), ['4', '3']);
    await page.clock.runFor(1);
    assert.deepEqual(await faces(), [], 'Injury receives its own full visibility interval');
    // A later required choice waits behind all known logical rolls.
    await publish({ view: state(2), records: [record(0), record(1), record(2, [report])] });
    await page.waitForFunction(() => document.querySelectorAll('.live-dice-overlay .pitch-dice-lifetime:not(.exiting) .match-die').length === 2);
    assert.deepEqual(await faces(), ['6', '5']);
    const pending = { ...state(3), actions: [{ id: 'block-choice', kind: 'blockDie', actor: 'home',
      label: 'Choose POW (die 1)', sourcePlayerId: 'home1', target: null }] };
    const block = { reportId: 'blockRoll', blockRoll: [6], defenderId: 'away1' };
    await publish({ view: pending, records: [record(0), record(1), record(2), record(3, [block])] });
    assert.equal(await page.locator('#required-choice').count(), 0);
    await page.clock.runFor(1000);
    assert.deepEqual(await faces(), ['6', '5', '4', '3']);
    await page.clock.runFor(1000);
    assert.deepEqual(await faces(), ['POW'], 'The required roll follows the complete injury sequence');
    assert.equal(await page.locator('#required-choice').count(), 0);
    await page.clock.runFor(1000);
    await page.locator('#required-choice').waitFor();
    await page.clock.runFor(2000);
    assert.deepEqual(await faces(), ['POW'], 'The choice stays pinned and old injury never arrives');
    await publish({ view: state(4), records: [record(0), record(1), record(2), record(3), record(4, [report])] });
    await page.waitForFunction(() => document.querySelectorAll('.live-dice-overlay .pitch-dice-lifetime:not(.exiting) .match-die').length === 2);
    assert.deepEqual(await faces(), ['6', '5']);
    await publish({ view: state(4), records: [], enabled: false });
    await page.waitForFunction(() => !document.querySelector('.live-dice-overlay'));
    await publish({ view: state(4), records: [] });
    await page.clock.runFor(2500);
    assert.deepEqual(await faces(), [], 'Reconnect cancels queued groups and old expiry timers');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await publish({ view: state(5), records: [record(0), record(1), record(2), record(3), record(4), record(5, [report])], mode: 'replay' });
    await page.waitForFunction(() => document.querySelectorAll('.live-dice-overlay .pitch-dice-lifetime:not(.exiting) .match-die').length === 2);
    assert.deepEqual(await faces(), ['6', '5']);
    await page.clock.runFor(1000);
    assert.deepEqual(await faces(), ['6', '5', '4', '3'], 'Reduced motion retains roll chronology');
    assert.equal(await page.locator('.match-die').evaluateAll(dice => dice.flatMap(die => die.getAnimations({ subtree: true })).length), 0);
    await publish({ view: state(1), records: [record(0), record(1)], mode: 'replay' });
    await page.waitForFunction(() => document.querySelector('#playback-state').dataset.revision === '1');
    await page.clock.runFor(2500);
    assert.deepEqual(await faces(), [], 'Replay seeking cancels the decorative queue');
    assert.deepEqual(errors, []);
    console.log('PASS: animated D16 has no scrollbars; armour/injury retain independent lifetimes and gate dependent input.');
  } finally { await page.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = await import('playwright');
  const { createServer } = await import('./browser-test-server.mjs');
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
    server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  try { await verifyDiceStream(browser, `http://127.0.0.1:${server.httpServer.address().port}`); }
  finally { await browser.close(); await server.close(); }
}
