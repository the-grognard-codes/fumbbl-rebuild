import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { decodeRoutePreview } from '../src/route-protocol.ts';

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
    await page.addInitScript(input => { window.routeCase = input; }, { ...cases[0], state: { ...cases[0].state, callerRole: end } });
    await page.route('**/route-check-test', route => route.fulfill({ contentType: 'text/html', body: `
      <style>html,body{margin:0;height:100%;background:#101c2b;font-family:system-ui,sans-serif}.play-runtime{height:100%}#app .live-pitch{height:100%;display:flex;flex-direction:column;margin:0;padding:0;box-sizing:border-box}#app .live-pitch-viewport{flex:1;max-height:none;min-height:0;aspect-ratio:auto}</style>
      <div id="app" class="play-runtime"></div><script type="module" src="/test/route-check-harness.tsx"></script>` }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/route-check-test`);
    await page.locator('.live-route-step').first().waitFor();
    await page.getByRole('button', { name: 'Reveal selected', exact: true }).click();
    await ensureSprites(page);
    assert.equal(await page.locator('.live-token').count(), 0, 'Visual evidence uses real catalog sprites at native fixture positions');
    assert.ok(await page.locator('.live-movement-label-layer').evaluate(layer => {
      const style = getComputedStyle(layer), markers = [...document.querySelectorAll('.live-marker')];
      return style.position === 'absolute' && style.pointerEvents === 'none'
        && markers.every(marker => Number(getComputedStyle(marker).zIndex) < Number(style.zIndex));
    }), 'Roll labels remain above neighboring sprites without intercepting canonical pitch input');
    for (const angle of [30, 40, 50, 90]) {
      if (angle === 90) await page.getByRole('button', { name: 'Top-down view', exact: true }).click();
      else await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      await page.keyboard.press('Tab');
      await page.locator('.live-marker').last().focus();
      assert.ok(await page.locator('.live-marker').last().evaluate(marker => marker.matches(':focus-visible')
        && Number(getComputedStyle(marker).zIndex) < Number(getComputedStyle(document.querySelector('.live-movement-label-layer')).zIndex)),
        'Keyboard-focused sprites remain below roll labels');
      for (const input of cases) {
        decodeSetupStateValue(input.state);
        const route = decodeRoutePreview(JSON.stringify({ version: 2, type: 'routePreview', requestId: 'forecast',
          code: 'ACCEPTED', matchId: input.state.matchId, route: input.route })).route;
        await page.evaluate(input => window.updateRouteCase(input), { state: { ...input.state, callerRole: end }, route });
        await ensureSprites(page);
        for (const step of route.steps) {
          const indicator = page.locator(`[data-route-square="${step.x},${step.y}"]`);
          const band = step.dodge ? ['dodge-zero', 'dodge-one', 'dodge-two', 'dodge-three'][Math.min(3, Math.max(0, -step.dodgeModifier))]
            : step.rush ? 'rush' : 'clear';
          assert.equal(await indicator.getAttribute('data-route-band'), band);
          const label = page.locator(`[data-label-square="${step.x},${step.y}"]`);
          const labels = await label.locator('tspan').allTextContents();
          assert.deepEqual(labels, [...(step.dodge ? [`D ${step.dodge}+`] : []), ...(step.rush ? [`R ${step.rush}+`] : [])]);
          assert.equal(await indicator.locator('polygon').evaluate(polygon => getComputedStyle(polygon).stroke), 'none');
          assert.ok((await indicator.locator('polygon').getAttribute('fill')).endsWith(step.dodge || step.rush ? '4d' : '26'), 'Risk bands are stronger while safe squares retain the existing transparent blue');
          const rect = await indicator.locator('polygon').boundingBox();
          assert.ok(rect && rect.width > 10 && rect.height > 5, 'Planned squares remain visible in every camera');
          if (labels.length && step === route.steps.at(-1)) {
            const labelRect = await label.locator('text').boundingBox();
            const badge = await page.locator('.live-route-waypoint circle').boundingBox();
            assert.ok(labelRect && badge && (badge.x + badge.width <= labelRect.x || badge.x >= labelRect.x + labelRect.width
              || badge.y + badge.height <= labelRect.y || badge.y >= labelRect.y + labelRect.height), 'Waypoint badges leave targets visible');
          }
        }
        assert.equal(await page.getByLabel('Planned square checks').locator('li').count(), route.steps.length);
        if (evidence && [40, 90].includes(angle) && ['AG4-penalty3', 'drunkardtrue-blizzardtrue-molestrue', 'earlier-risk'].includes(input.name))
          await page.screenshot({ path: `${evidence}/${end}-${angle}-${input.name}.png` });
        await page.evaluate(input => window.updateRouteCase(input), { state: { ...input.state, callerRole: end }, route: null });
        assert.equal(await page.locator('.live-route-step[data-route-square]').count(), 0);
        const adjacent = input.state.movementForecast.steps;
        assert.equal(await page.locator('.live-available-step').count(), adjacent.length);
        for (const step of adjacent) {
          const indicator = page.locator(`[data-movement-square="${step.x},${step.y}"]`);
          const band = step.dodge ? ['dodge-zero', 'dodge-one', 'dodge-two', 'dodge-three'][Math.min(3, Math.max(0, -step.dodgeModifier))]
            : step.rush ? 'rush' : 'clear';
          assert.equal(await indicator.getAttribute('data-route-band'), band);
          assert.deepEqual(await page.locator(`[data-label-square="${step.x},${step.y}"] tspan`).allTextContents(), [...(step.dodge ? [`D ${step.dodge}+`] : []), ...(step.rush ? [`R ${step.rush}+`] : [])]);
          assert.equal(await indicator.locator('polygon').evaluate(polygon => getComputedStyle(polygon).stroke), 'none');
          assert.ok((await indicator.locator('polygon').getAttribute('fill')).endsWith(step.dodge || step.rush ? '4d' : '26'), 'Risk bands are stronger while safe squares retain the existing transparent blue');
        }
      }
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: 21 native dodge/rush/safe-route forecasts and their adjacent choices render per-square bands and exact targets in both coach cameras at all four presets, with accessible descriptions.');
} finally { await browser.close(); await server.close(); }
