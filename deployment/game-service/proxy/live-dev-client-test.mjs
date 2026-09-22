// Public read-only verification: no sign-in, account creation, or match mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from '../../../browser-client/node_modules/playwright/index.mjs';

test('served DEV artifact and CSP connect a real browser through nginx twice', { timeout: 45000 }, async () => {
  const origin = 'https://dev.molesunderthepitch.org';
  const expected = await readFile('.tools/dev-release-20260921/client/hosting/firebase-web-config.js', 'utf8');
  const configuration = await fetch(origin + '/firebase-web-config.js', { cache: 'no-store' });
  assert.equal(configuration.status, 200);
  assert.equal(await configuration.text(), expected);
  assert.match(configuration.headers.get('cache-control'), /no-store/);
  const deployed = await fetch(origin + '/assets/game/game.js');
  assert.equal(deployed.status, 200);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest(Buffer.from(await deployed.arrayBuffer())), digest(await readFile('.tools/dev-release-20260921/client/hosting/assets/game/game.js')));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
  try {
    const page = await browser.newPage();
    // Retain the real document's CSP, but do not initialize Firebase or load user state.
    await page.route('**/*', route => route.request().isNavigationRequest() ? route.continue() : route.abort());
    const response = await page.goto(origin + '/play');
    assert.equal(response.status(), 200);
    const csp = response.headers()['content-security-policy'];
    const connectDirective = csp.split(';').find(part => part.trim().startsWith('connect-src '));
    assert.ok(connectDirective, 'CSP must declare connect-src');
    const connectSources = connectDirective.trim().split(/\s+/).slice(1);
    // Parse and compare every URL component. A substring check would accept an
    // attacker-controlled authority such as "game-dev…evil".
    const parsedSources = connectSources.filter(source => source !== "'self'").map(source => new URL(source));
    assert.ok(parsedSources.every(source => source.protocol !== 'ws:'
      && source.hostname !== '127.0.0.1' && source.hostname !== 'localhost'));
    const webSocketSources = parsedSources.filter(source => source.protocol === 'wss:');
    assert.equal(webSocketSources.length, 1);
    const [webSocketSource] = webSocketSources;
    assert.deepEqual({ protocol: webSocketSource.protocol, hostname: webSocketSource.hostname,
      port: webSocketSource.port, pathname: webSocketSource.pathname,
      search: webSocketSource.search, hash: webSocketSource.hash }, {
      protocol: 'wss:', hostname: 'game-dev.molesunderthepitch.org', port: '', pathname: '/', search: '', hash: ''
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await page.evaluate(() => new Promise((resolve, reject) => {
        const socket = new WebSocket('wss://game-dev.molesunderthepitch.org/browser/v2');
        const timer = setTimeout(() => { socket.close(); reject(Error('DEV WSS response timeout')); }, 10000);
        socket.onopen = () => socket.send(JSON.stringify({ version: 2, type: 'browse', requestId: 'dev-hosting-read-only' }));
        socket.onmessage = event => { clearTimeout(timer); socket.close(); resolve(JSON.parse(event.data)); };
        socket.onerror = () => { clearTimeout(timer); socket.close(); reject(Error('DEV WSS failed')); };
      }));
      assert.equal(reply.version, 2);
      assert.equal(reply.requestId, 'dev-hosting-read-only');
      assert.equal(reply.code, 'AUTHENTICATION_REQUIRED');
      assert.equal(reply.matches, undefined);
    }
    console.log('PASS deployed artifact parity, DEV-only CSP, real-browser WSS auth gate and reconnect; no credentials submitted.');
  } finally { await browser.close(); }
});
