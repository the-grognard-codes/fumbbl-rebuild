import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { decodeRoutePreview } from '../src/route-protocol.ts';
import { squarePosition } from './projected-pitch-helper.mjs';
import { assertNoMovementMarkings } from './movement-markings-helper.mjs';

const load = name => JSON.parse(readFileSync(new URL(`./fixtures/route-forecast-${name}.json`, import.meta.url), 'utf8'));
const cases = [...load('dodge'), ...load('rush'), { ...load('safe'), name: 'earlier-risk' }];
const evidence = process.env.ROUTE_CHECK_EVIDENCE_DIR;
if (evidence) await mkdir(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const errors = [];
async function ensureSprites(page) {
  await page.waitForFunction(() => {
    const markers = [...document.querySelectorAll('.live-marker')];
    return markers.length > 0 && markers.every(marker => {
      const image = marker.querySelector('img');
      return image && image.complete && image.naturalWidth > 0;
    });
  });
}
try {
  for (const end of ['home', 'away']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 660 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(input => { window.routeCase = input; window.undoCount = 0; window.squareClicks = 0; }, { ...cases[0], state: { ...cases[0].state, callerRole: end } });
    await page.route('**/route-check-test', route => route.fulfill({ contentType: 'text/html', body: `
      <style>html,body{margin:0;height:100%;background:#101c2b;font-family:system-ui,sans-serif}.play-runtime{height:100%}#app .live-pitch{height:100%;display:flex;flex-direction:column;margin:0;padding:0;box-sizing:border-box}#app .live-pitch-viewport{flex:1;max-height:none;min-height:0;aspect-ratio:auto}</style>
      <div id="app" class="play-runtime"></div><script type="module" src="/test/route-check-harness.tsx"></script>` }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/route-check-test`);
    await page.locator('.live-selection-square').waitFor();
    await page.getByRole('button', { name: 'Reveal selected', exact: true }).click();
    await ensureSprites(page);
    const frame = await page.locator('.live-pitch-viewport').boundingBox();
    await page.mouse.click(frame.x + 40, frame.y + 40, { button: 'right' });
    assert.equal(await page.evaluate(() => window.undoCount), 1, 'A right-button click undoes once on release');
    await page.mouse.move(frame.x + 50, frame.y + 70);
    const focusBeforePan = Number(await page.locator('.live-pitch-scene').getAttribute('data-focus'));
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(frame.x + 130, frame.y + 145, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    assert.equal(await page.evaluate(() => window.undoCount), 1, 'A held right-button pan does not undo');
    assert.notEqual(Number(await page.locator('.live-pitch-scene').getAttribute('data-focus')), focusBeforePan, 'Right-button drag pans the pitch');
    await page.locator('.live-pitch-viewport').evaluate(element => {
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 42, button: 2, clientX: 80, clientY: 80 }));
      element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 42, button: 2, clientX: 80, clientY: 80 }));
    });
    assert.equal(await page.evaluate(() => window.undoCount), 1, 'Pointer cancellation does not synthesize an undo');
    await page.locator('.live-pitch-viewport').evaluate(element => {
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 43, button: 2, clientX: 80, clientY: 80 }));
      element.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 43, button: 2, clientX: 80, clientY: 80 }));
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 43, button: 2, clientX: 80, clientY: 80 }));
    });
    assert.equal(await page.evaluate(() => window.undoCount), 1, 'Lost pointer capture does not synthesize an undo');
    await page.locator('.live-pitch-scene').click({ position: await squarePosition(page, 12, 10) });
    assert.equal(await page.evaluate(() => window.squareClicks), 1, 'A left-click remains available after right-button panning');
    assert.equal(await page.locator('.live-token').count(), 0, 'Visual evidence uses real catalog sprites at native fixture positions');
    assert.ok(await page.locator('.live-route-waypoint-layer').evaluate(layer => {
      const style = getComputedStyle(layer), markers = [...document.querySelectorAll('.live-marker')];
      return style.position === 'absolute' && style.pointerEvents === 'none'
        && markers.every(marker => Number(getComputedStyle(marker).zIndex) < Number(style.zIndex));
    }), 'Waypoint dots stay above sprites without intercepting pitch input');
    for (const angle of [30, 40, 50, 90]) {
      if (angle === 90) await page.getByRole('button', { name: 'Top-down view', exact: true }).click();
      else await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      for (const input of cases) {
        decodeSetupStateValue(input.state);
        const route = decodeRoutePreview(JSON.stringify({ version: 2, type: 'routePreview', requestId: 'forecast',
          code: 'ACCEPTED', matchId: input.state.matchId, route: input.route })).route;
        await page.evaluate(input => window.updateRouteCase(input), { state: { ...input.state, callerRole: end }, route });
        await ensureSprites(page);
        await assertNoMovementMarkings(page);
        assert.equal(await page.locator('.live-target-square').count(), 0, 'Move destinations have no fallback highlighting');
        assert.equal(await page.locator('.live-route-line').count(), 1, 'The reviewed route remains visible');
        assert.equal(await page.getByLabel('Planned route', { exact: true }).locator('li').count(), route.steps.length);
        const destination = route.steps.at(-1);
        const position = await squarePosition(page, destination.x, destination.y);
        const dot = page.locator('.live-route-waypoint circle');
        assert.ok(Math.abs(Number(await dot.getAttribute('cx')) - position.x) < .01, 'Waypoint dot remains at the destination center');
        assert.ok(Math.abs(Number(await dot.getAttribute('cy')) - position.y) < .01, 'Waypoint dot remains at the destination center');
        assert.equal(await page.locator('.live-route-waypoint text').count(), 0, 'Waypoints remain unnumbered dots');
        if (evidence && [40, 90].includes(angle) && ['AG4-penalty3', 'drunkardtrue-blizzardtrue-molestrue', 'earlier-risk'].includes(input.name))
          await page.screenshot({ path: `${evidence}/${end}-${angle}-${input.name}.png` });
        for (const forecast of [input.state, { ...input.state, movementForecast: undefined }]) {
          await page.evaluate(input => window.updateRouteCase(input), { state: { ...forecast, callerRole: end }, route: null });
          await assertNoMovementMarkings(page);
          assert.equal(await page.locator('.live-target-square').count(), 0, 'Adjacent moves stay unmarked with or without forecasts');
          assert.equal(await page.locator('.live-route-line, .live-route-waypoint').count(), 0, 'Clearing the route clears its line and dots');
        }
      }
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: native Dodge/Rush forecasts and routes show no range or risk markings in both coach cameras at every preset; route lines, dots, canonical input and right-click undo/panning remain.');
} finally { await browser.close(); await server.close(); }
