import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { decodeRoutePreview } from '../src/route-protocol.ts';
import { assertNoMovementMarkings } from './movement-markings-helper.mjs';

const cases = ['pickup', 'ball-contact', 'reactions', 'jump'].flatMap(family =>
  JSON.parse(readFileSync(new URL(`./fixtures/movement-checks-${family}.json`, import.meta.url), 'utf8')));
const evidence = process.env.MOVEMENT_CHECK_EVIDENCE_DIR;
if (evidence) await mkdir(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const errors = [];
try {
  for (const end of ['home', 'away']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 660 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(input => { window.routeCase = input; }, { ...cases[0], state: { ...cases[0].state, callerRole: end } });
    await page.route('**/movement-check-test', route => route.fulfill({ contentType: 'text/html', body: `
      <style>html,body{margin:0;height:100%;background:#101c2b;font-family:system-ui,sans-serif}.play-runtime{height:100%}#app .live-pitch{height:100%;display:flex;flex-direction:column;margin:0;padding:0;box-sizing:border-box}#app .live-pitch-viewport{flex:1;max-height:none;min-height:0;aspect-ratio:auto}</style>
      <div id="app" class="play-runtime"></div><script type="module" src="/test/route-check-harness.tsx"></script>` }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/movement-check-test`);
    await page.locator('.live-selection-square').waitFor();
    await page.getByRole('button', { name: 'Reveal selected', exact: true }).click();
    for (const angle of [30, 40, 50, 90]) {
      if (angle === 90) await page.getByRole('button', { name: 'Top-down view', exact: true }).click();
      else await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      for (const input of cases) {
        decodeSetupStateValue(input.state);
        const route = input.route && decodeRoutePreview(JSON.stringify({ version: 2, type: 'routePreview', requestId: 'checks',
          code: 'ACCEPTED', matchId: input.state.matchId, route: input.route })).route;
        for (const plan of route ? [route, null] : [null]) {
          await page.evaluate(input => window.updateRouteCase(input), { state: { ...input.state, callerRole: end }, route: plan });
          await page.waitForFunction(() => [...document.querySelectorAll('.live-marker')].every(marker => {
            const image = marker.querySelector('img'); return image && image.complete && image.naturalWidth > 0;
          }));
          await assertNoMovementMarkings(page);
          assert.equal(await page.locator('.live-target-square').count(), 0, 'Native Move and Jump choices have no range highlighting');
          assert.equal(await page.locator('.live-route-line').count(), plan ? 1 : 0);
          if (plan) assert.equal(await page.getByLabel('Planned route', { exact: true }).locator('li').count(), plan.steps.length);
          if (evidence && [40, 90].includes(angle) && ['overlapping-checks', 'native-jump', 'no-hands-ball-contact', 'repeated-ball-square'].includes(input.name))
            await page.screenshot({ path: `${evidence}/${end}-${angle}-${input.name}-${plan ? 'plan' : 'adjacent'}.png` });
        }
      }
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${cases.length} native pickup/ball-contact/reaction/jump cases remain unmarked, with loaded sprites and both coach cameras at every preset.`);
} finally { await browser.close(); await server.close(); }
