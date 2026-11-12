import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, publicDir: fileURLToPath(new URL('../../site/src/', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const evidence = fileURLToPath(new URL('../../.tools/lobby-read-ui/', import.meta.url));
await mkdir(evidence, { recursive: true });
try {
  for (const width of [1440, 390]) for (const view of ['play', 'spectate']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/bounded-lobby', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/play.css"><div id="app"></div><script type="module">
      import { mountPlay, mountSpectate } from '/src/play-entry.tsx';
      const options = { url: 'ws://127.0.0.1/unused', getToken: async () => 'test-token' };
      ${view === 'play' ? "mountPlay(document.getElementById('app'), options);" : "mountSpectate(document.getElementById('app'), options);"}
      </script>` }));
    await page.addInitScript(() => {
      window.requests = []; window.throttle = false;
      window.WebSocket = class {
        readyState = 0;
        constructor() { window.socket = this; queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
        close() { this.readyState = 3; this.onclose?.(); }
        send(raw) {
          const request = JSON.parse(raw); window.requests.push(request);
          const reply = message => queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ version: 2, requestId: request.requestId, ...message }) }));
          if (request.type === 'authenticate') reply({ type: 'authentication', code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
          if (['browse', 'currentMatches'].includes(request.type)) {
            if (window.throttle) reply({ type: 'error', code: 'RATE_LIMITED' });
            else reply({ type: request.type, code: 'ACCEPTED', matches: request.type === 'browse'
              ? [{ matchId: '12345678-1234-1234-1234-123456789abc', label: 'Home vs Away' }]
              : [{ matchId: '12345678-1234-1234-1234-123456789abc', callerRole: 'home', lifecycle: 'ACTIVATED', homeTeamName: 'Retained Reavers', awayTeamName: 'Raiders', phase: 'PLAY' }], ...(request.type === 'currentMatches' ? { next: null } : {}) });
          }
        }
      };
    });
    await page.goto(`${base}/bounded-lobby`);
    const retained = view === 'play' ? page.getByText('Retained Reavers', { exact: false }).first() : page.getByRole('link', { name: 'Watch Home vs Away' });
    await retained.waitFor().catch(async failure => { console.log(JSON.stringify({ errors, body: await page.locator('body').innerText(), requests: await page.evaluate(() => window.requests) })); throw failure; });
    if (view === 'spectate') await page.getByRole('searchbox').fill('Home');
    await page.evaluate(() => { window.throttle = true; });
    await page.getByRole('button', { name: 'Refresh games', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Game refresh is busy' }).waitFor();
    assert.equal(await retained.isVisible(), true);
    const reads = await page.evaluate(() => window.requests.filter(request => ['browse', 'currentMatches'].includes(request.type)).length);
    await page.getByRole('button', { name: 'Refresh games', exact: true }).click();
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.requests.filter(request => ['browse', 'currentMatches'].includes(request.type)).length), reads);
    assert.equal(await page.getByRole('button', { name: 'Reconnect', exact: true }).count(), 0);
    if (view === 'spectate') assert.equal(await page.getByRole('searchbox').inputValue(), 'Home');
    await page.screenshot({ path: `${evidence}/${view}-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Lobby read bounds: retained data/filter, usable refresh, bounded sends, no reconnect loop at 1440/390px.');
} finally { await browser.close(); await server.close(); }
