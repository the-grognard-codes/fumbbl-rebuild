import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '../../../browser-client/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';

// Read-only probe of the already-running local stack. No login, account creation,
// match mutation, bearer capture, database write, or server restart.
test('assembled local client selects nginx; native browser reaches real v2 auth gate through it twice', { timeout: 30000 }, async () => {
  // The local Hosting document is deliberately HTTP loopback-only. Read the
  // assembled public configuration from disk so no configuration is downloaded
  // over that diagnostic transport.
  const script = await readFile('deployment/firebase/hosting/firebase-web-config.js', 'utf8');
  assert.match(script, /"environment": "local-dev"/);
  assert.match(script, /"gameWebSocketUrl": "ws:\/\/127\.0\.0\.1:22232\/browser\/v2"/);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  try {
    const page = await browser.newPage();
    // Use a real loopback document response: a route.fulfill document has no
    // loopback network provenance in Chrome's Local Network Access checks.
    // Suppress page scripts/assets so this probe cannot initialize Firebase.
    await page.route('**/*', route => route.request().isNavigationRequest() ? route.continue() : route.abort());
    await page.goto('http://localhost:5000/play');
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await page.evaluate(() => new Promise((resolve, reject) => {
        const socket = new WebSocket('ws://127.0.0.1:22232/browser/v2');
        const timer = setTimeout(() => { socket.close(); reject(Error('Proxy response timeout')); }, 5000);
        socket.onopen = () => socket.send(JSON.stringify({ version: 2, type: 'browse', requestId: 'local-proxy-read-only' }));
        socket.onmessage = event => { clearTimeout(timer); socket.close(); resolve(JSON.parse(event.data)); };
        socket.onerror = () => { clearTimeout(timer); socket.close(); reject(Error('Proxy connection failed')); };
      }));
      assert.equal(reply.version, 2);
      assert.equal(reply.requestId, 'local-proxy-read-only');
      assert.equal(reply.code, 'AUTHENTICATION_REQUIRED');
      assert.equal(reply.matches, undefined);
    }
    console.log('Proxy port 22232: real Java AUTHENTICATION_REQUIRED received on initial connection and reconnect; no credentials submitted.');
  } finally { await browser.close(); }
});
