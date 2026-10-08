import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { decodeRoutePreview } from '../src/route-protocol.ts';

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
    await page.locator('.live-route-step').first().waitFor();
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
          const steps = plan?.steps ?? input.state.movementForecast.steps;
          for (const [index, step] of steps.entries()) {
            const label = page.locator(`[data-label-square="${step.x},${step.y}"][data-step-index="${index}"]`);
            assert.equal(await label.count(), 1);
            assert.deepEqual(await label.locator('tspan').allTextContents(), [...(step.dodge ? [`D ${step.dodge}+`] : []), ...(step.rush ? [`R ${step.rush}+`] : [])]);
            const additional = label.locator('.live-additional-check');
            assert.equal(await additional.count(), step.checks.length ? 1 : 0);
            if (step.checks.length) {
              assert.equal(await additional.getAttribute('data-check-names'), step.checks.map(check => check.name).join(','));
              assert.ok(await additional.isVisible());
              const center = await label.evaluate(element => ({ x: Number(element.dataset.centerX), y: Number(element.dataset.centerY) }));
              const viewport = await page.locator('.live-pitch-scene').boundingBox();
              await page.mouse.move(viewport.x + center.x, viewport.y + center.y);
              for (const check of step.checks) await page.waitForFunction(name => document.querySelector('.live-check-description')?.textContent?.includes(name), check.name);
              const rectangle = await additional.boundingBox();
              assert.ok(rectangle && rectangle.width >= 2 && rectangle.height >= 2);
              const square = await page.locator(`[data-${plan ? 'route' : 'movement'}-square="${step.x},${step.y}"][data-step-index="${index}"] polygon`).boundingBox();
              assert.ok(square && rectangle.x >= square.x && rectangle.x + rectangle.width <= square.x + square.width
                && rectangle.y >= square.y && rectangle.y + rectangle.height <= square.y + square.height, `Additional-check marker stays within its own square: ${JSON.stringify({ name: input.name, end, angle, square, rectangle, index })}`);
              for (const check of step.checks) assert.ok((await page.getByLabel('Additional movement check key').textContent()).includes(check.name));
            }
          }
          if (input.name === 'overlapping-checks' && end === 'home' && angle === 40 && !plan) {
            const actor = await page.locator('[data-player-id="actor"]').evaluate(element => ({ x: Number(element.dataset.centerX), y: Number(element.dataset.centerY) }));
            const scene = await page.locator('.live-pitch-scene').boundingBox();
            await page.mouse.move(scene.x + actor.x, scene.y + actor.y);
            await page.waitForFunction(() => !document.querySelector('.live-check-description'));
            await page.locator('.live-pitch-viewport').focus();
            await page.keyboard.press('ArrowDown');
            await page.waitForFunction(() => document.querySelector('.live-check-description')?.textContent?.includes('Square 9, 7'));
            for (const name of ['Pickup 4+', 'Possible Tentacles', 'Steady Footing 6+']) assert.ok((await page.locator('.live-check-description').textContent()).includes(name));
          }
          if (evidence && [40, 90].includes(angle) && ['overlapping-checks', 'native-jump', 'no-hands-ball-contact', 'repeated-ball-square'].includes(input.name))
            await page.screenshot({ path: `${evidence}/${end}-${angle}-${input.name}-${plan ? 'plan' : 'adjacent'}.png` });
        }
      }
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${cases.length} native pickup/ball-contact/reaction/jump cases, overlapping target labels, named conditional keys, loaded sprites and both coach cameras at every preset.`);
} finally { await browser.close(); await server.close(); }
