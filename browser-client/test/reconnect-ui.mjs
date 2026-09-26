import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const address = server.httpServer.address();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const view of ['play', 'builder']) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      let attempt = 0;
      let authAttempt = 0;
      window.__reconnectTrace = [];
      window.WebSocket = class {
        readyState = 0;
        onopen = null;
        onmessage = null;
        onclose = null;
        onerror = null;
        constructor() {
          attempt++;
          window.__reconnectTrace.push(`socket ${attempt}`);
          queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
        }
        send(raw) {
          const request = JSON.parse(raw);
          window.__reconnectTrace.push(`send ${request.type} on ${attempt}`);
          if (request.type !== 'authenticate') return;
          authAttempt++;
          queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(authAttempt === 1
            ? { version: 2, type: 'error', requestId: request.requestId, code: 'AUTHENTICATION_FAILED' }
            : { version: 2, type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: '11111111-1111-4111-8111-111111111111' }) }));
        }
        close() { this.readyState = 3; this.onclose?.(); }
      };
    });
    await page.goto(`http://127.0.0.1:${address.port}/test/fixtures/reconnect.html?view=${view}`);
    try { await page.getByRole('alert').filter({ hasText: 'AUTHENTICATION FAILED' }).waitFor({ timeout: 5000 }); }
    catch (error) { throw new Error(`${view} did not reach the initial rejection: ${JSON.stringify({ pageErrors, trace: await page.evaluate(() => window.__reconnectTrace), body: (await page.locator('body').innerText()).slice(0, 500) })}`, { cause: error }); }
    await page.getByRole('button', { name: 'Reconnect' }).click();
    await page.getByRole('status').filter({ hasText: 'Connected' }).waitFor();
    assert.equal(await page.getByRole('alert').filter({ hasText: 'AUTHENTICATION FAILED' }).count(), 0,
      `${view} must clear the earlier authentication error after successful reconnect`);
    assert.deepEqual(pageErrors, [], `${view} has no uncaught page errors`);
    await page.close();
  }
  console.log('PASS play and builder clear stale authentication errors after reconnect');
} finally {
  await browser.close();
  await server.close();
}
