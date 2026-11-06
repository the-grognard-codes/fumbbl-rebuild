import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-pass-workflow.json', import.meta.url), 'utf8'));
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const evidence = fileURLToPath(new URL('../../.tools/roundup6-ui/', import.meta.url));
mkdirSync(evidence, { recursive: true });
try {
  for (const role of ['home', 'away']) {
    const journey = journeys.find(journey => journey.mode === 'move' && journey.frames[0].actor.callerRole === role);
    assert.ok(journey, `Native movement/pass fixture for ${role}`);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const view = journey.frames[1].actor;
    const input = view => ({ view, records: [], route: journey.route });
    await page.addInitScript(input => { window.roundup6Input = input; window.roundup6Intents = []; }, input(view));
    await page.route('**/roundup6-test', route => route.fulfill({ contentType: 'text/html', body: '<div id="app"></div><script type="module" src="/test/roundup6-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/roundup6-test`);
    const pitch = page.getByLabel('Live match pitch');
    await pitch.locator('[data-player-id="actor"]').click();
    const toggle = page.getByRole('button', { name: 'Target pass square', exact: true });
    await toggle.waitFor({ timeout: 2000 });
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    const clickSquare = async (x, y) => page.locator('.live-pitch-scene').click({ position: await squarePosition(page, x, y) });
    await clickSquare(11, 7);
    await page.locator('.live-route-line').waitFor({ state: 'attached' });
    await toggle.focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.roundup6Intents.length), 0, 'Space on the targeting button toggles mode rather than committing movement');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.live-route-line').count(), 1, 'Targeting mode preserves planned movement');
    const empty = { x: 13, y: 6 };
    await clickSquare(empty.x, empty.y);
    await page.waitForFunction(() => window.roundup6Previews.at(-1)?.kind === 'pass');
    assert.deepEqual(await page.evaluate(() => window.roundup6Previews.at(-1).targetSquare), empty);
    assert.deepEqual(await page.evaluate(() => window.roundup6Previews.at(-1).waypoints), [{ x: 11, y: 7 }]);
    assert.equal(await page.locator('.live-target-line').count(), 1);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.live-route-line').count(), 1);
    await toggle.click();
    for (const target of view.players.filter(player => player.id !== 'actor' && player.x != null && player.y != null)) {
      await pitch.locator(`[data-player-id="${target.id}"]`).click();
      await page.waitForFunction(({x,y}) => window.roundup6Previews.at(-1)?.targetSquare?.x === x && window.roundup6Previews.at(-1)?.targetSquare?.y === y, target);
      assert.deepEqual(await page.evaluate(() => window.roundup6Previews.at(-1).waypoints), [{ x: 11, y: 7 }]);
    }
    await clickSquare(empty.x, empty.y);
    await page.screenshot({ path: `${evidence}/pass-square-${role}.png` });
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    let submitted = await page.evaluate(() => window.roundup6Intents.at(-1));
    assert.equal(submitted.operation, 'movement');
    assert.deepEqual(submitted.fields.targetSquare, empty);
    assert.deepEqual(submitted.fields.waypoints, [{ x: 11, y: 7 }]);
    await page.evaluate(input => window.publishRoundup6(input), input(journey.frames.at(-2).actor));
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'Finalized movement defaults to movement mode');
    await toggle.click();
    await clickSquare(empty.x, empty.y);
    await page.waitForFunction(() => window.roundup6Previews.at(-1)?.kind === 'pass' && !window.roundup6Previews.at(-1).waypoints.length);
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    submitted = await page.evaluate(() => window.roundup6Intents.at(-1));
    assert.deepEqual(submitted.fields.targetSquare, empty);
    assert.deepEqual(submitted.fields.waypoints, []);
    await page.evaluate(input => window.publishRoundup6(input), input(journey.frames[0].actor));
    assert.equal(await toggle.count(), 0, 'Streamlined actions do not expose square targeting before declaration');
    console.log(`PASS ${role}: route/square pass, occupied targets, finalized movement and declaration boundary`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
