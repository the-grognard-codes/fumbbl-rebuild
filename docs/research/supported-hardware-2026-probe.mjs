import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit, devices } from '../../browser-client/node_modules/playwright/index.mjs';
import { createServer } from '../../browser-client/test/browser-test-server.mjs';

const root = fileURLToPath(new URL('../../browser-client/', import.meta.url));
const output = fileURLToPath(new URL('../../.tools/hardware-research/', import.meta.url));
const base = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const state = { ...base, revision: 1, phase: 'PLAY', actor: 'home', callerRole: 'home', activePlayerId: null,
  clock: { activeRole: 'home', turnElapsedMs: 0, homeReserveMs: 600000, awayReserveMs: 600000 },
  players: [{ ...base.players[0], id: 'human', role: 'home', name: 'Human Blitzer', x: 12, y: 7 }],
  actions: [{ id: 'select', kind: 'select', label: 'Move Human Blitzer', actor: 'home', sourcePlayerId: 'human', target: null }, { id: 'end', kind: 'endTurn', label: 'End Turn', actor: 'home', sourcePlayerId: null, target: null }] };
const profiles = ['iPhone SE', 'iPhone 13', 'iPhone 13 landscape', 'iPhone 15', 'iPad (gen 7)', 'iPad (gen 7) landscape', 'Pixel 7', 'Pixel 7 landscape']
  .filter(name => devices[name]).map(name => ({ name, ...devices[name] }));
await writeFile(`${output}/device-profiles.json`, JSON.stringify(profiles, null, 2));
const server = await createServer({ root, configFile: false, cacheDir: `${output}/probe-vite-cache`, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const results = [];
try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    let browser;
    try {
      browser = await engine.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await context.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, state);
      await context.route('**/research-hud', route => route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      for (const [width, height] of [[1280,720],[1024,768],[844,390],[667,375],[360,800],[640,330],[375,300]]) {
        const result = { engine: name, version: browser.version(), width, height };
        try {
          errors.length = 0;
          await page.setViewportSize({ width, height });
          await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/research-hud`);
          const confirm = page.getByRole('button', { name: 'Confirmed!', exact: true });
          await confirm.waitFor({ timeout: 15000 });
          await page.evaluate(() => document.fonts.ready);
          await page.getByRole('button', { name: 'End Turn', exact: true }).click({ timeout: 5000 });
          await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Confirmed!' && !button.disabled), null, { timeout: 5000 });
          const bounds = await confirm.boundingBox();
          assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
          await confirm.click({ timeout: 5000 });
          assert.deepEqual(await page.evaluate(() => window.hudIntents), [{ operation: 'action', fields: { actionId: 'end' } }]);
          result.capabilities = await page.evaluate(() => ({ has: CSS.supports('selector(:has(*))'), dvh: CSS.supports('height','100dvh'), resizeObserver: typeof ResizeObserver === 'function', pointerEvent: typeof PointerEvent === 'function', randomUUID: typeof crypto.randomUUID === 'function', visualViewport: !!window.visualViewport, fullscreenEnabled: document.fullscreenEnabled, dpr: devicePixelRatio, bodyOverflows: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight }));
          result.pageErrors = [...errors]; result.confirmationBounds = bounds;
          if (width === 844 || width === 1280) await page.screenshot({ path: `${output}/${name}-${width}x${height}.png` });
          assert.deepEqual(errors, []);
          result.status = 'pass';
        } catch (error) { result.status = 'fail'; result.error = error.message; result.bodyExcerpt = (await page.locator('body').innerText()).slice(-2500); }
        results.push(result);
        console.log(`${name} ${width}x${height} ${result.status}${result.error ? ': '+result.error : ''}`);
      }
    } catch (error) { results.push({ engine: name, status: 'unavailable', error: error.message }); }
    finally { await browser?.close(); }
  }
} finally { await server.close(); }
await writeFile(`${output}/cross-browser-baseline.json`, JSON.stringify({ scope: 'Synthetic existing GameView harness, single end-turn intent; no real-server, physical-device or full-match acceptance', results }, null, 2));
process.exitCode = results.some(result => result.status !== 'pass') ? 1 : 0;
