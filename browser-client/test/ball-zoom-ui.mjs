import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const initial = JSON.parse(readFileSync(new URL('./fixtures/ball-route-presentation.json', import.meta.url), 'utf8'))[0].frames[0].state;
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const role of ['home', 'away']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    await page.addInitScript(view => { window.playbackInput = { view, records: [], enabled: false, mode: 'replay' }; window.playbackFrames = []; },
      { ...initial, callerRole: role, ball: { x: 13, y: 7 }, ballState: { version: 1, carrierPlayerId: null, inPlay: true, moving: true } });
    await page.route('**/ball-zoom-test', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/ball-zoom-test`);
    await page.locator('.live-ball-football').waitFor();
    for (const angle of [30, 40, 50, 90]) {
      if (angle === 90) await page.getByRole('button', { name: 'Top-down view', exact: true }).click();
      else await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      const samples = [];
      for (const zoom of [.75, 1, 1.5, 2, 3]) {
        const current = Number(await page.locator('.live-pitch-scene').getAttribute('data-zoom'));
        await page.locator('.live-pitch-viewport').dispatchEvent('wheel', { deltaY: -Math.log(zoom / current) / .0015 });
        await page.waitForFunction(zoom => Math.abs(Number(document.querySelector('.live-pitch-scene').dataset.zoom) - zoom) < .001, zoom);
        samples.push(await page.locator('.live-ball-marker').evaluate(marker => {
          const ball = marker.querySelector('.live-ball-football').getBoundingClientRect();
          const ring = marker.querySelector('.live-ball-highlight').getBoundingClientRect();
          const shadow = marker.querySelector('.live-ball-shadow').getBoundingClientRect();
          const center = marker.getBoundingClientRect();
          return { ball: ball.width / ring.width, shadow: shadow.width / ring.width,
            offset: Math.hypot(ball.x + ball.width / 2 - center.x, ball.y + ball.height / 2 - center.y) };
        }));
      }
      for (const sample of samples) {
        assert.ok(Math.abs(sample.ball - samples[0].ball) < .001, `football proportion stays constant across zoom: ${JSON.stringify(samples)}`);
        assert.ok(Math.abs(sample.shadow - samples[0].shadow) < .001, 'shadow scales with the football');
        assert.ok(sample.offset < .1, 'tilted football stays centered');
      }
    }
    await page.close();
  }
  console.log('PASS: football and shadow scale with the square at .75x–3x zoom, both coach ends, and all four camera angles.');
} finally { await browser.close(); await server.close(); }
