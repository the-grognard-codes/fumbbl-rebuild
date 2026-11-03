import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

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
          window.__reconnectSocket = this;
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
    try { await (view === 'play' ? page.getByRole('heading', { name: 'Create a game', exact: true }) : page.getByRole('status').filter({ hasText: 'Connected' })).waitFor({ timeout: 5000 }); }
    catch (error) { throw new Error(`${view} did not reconnect: ${JSON.stringify({ pageErrors, trace: await page.evaluate(() => window.__reconnectTrace), body: (await page.locator('body').innerText()).slice(0, 500) })}`, { cause: error }); }
    assert.equal(await page.getByRole('alert').filter({ hasText: 'AUTHENTICATION FAILED' }).count(), 0,
      `${view} must clear the earlier authentication error after successful reconnect`);
    if (view === 'play') {
      await page.evaluate(() => window.__reconnectSocket.onmessage?.({ data: '{"version":2,"type":"unsupported"}' }));
      await page.getByRole('alert').filter({ hasText: 'INVALID RESPONSE' }).waitFor({ timeout: 3000 });
      await page.getByRole('status').filter({ hasText: 'Disconnected' }).waitFor();
    }
    assert.deepEqual(pageErrors, [], `${view} has no uncaught page errors`);
    await page.close();
  }
  console.log('PASS play and builder clear stale authentication errors after reconnect');
  for (const retained of [false, true]) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const matchId = '12345678-1234-1234-1234-123456789abc';
    const accountId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const pending = { accountId, request: { version: 2, type: 'setup', operation: 'action',
      requestId: 'retained-action', matchId, expectedRevision: 0, actionId: '0:retained-action' } };
    const requests = [];
    let connections = 0;
    let publish;
    let revision = 0;
    await page.routeWebSocket('**/unused', socket => {
      connections++;
      const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
      publish = send;
      socket.onMessage(raw => {
        const request = JSON.parse(raw);
        requests.push({ connection: connections, request });
        if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId });
        else if (request.type === 'setup') {
          if (request.operation === 'action') revision++;
          send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false,
            state: { matchId, revision, callerRole: 'home', actor: 'home', phase: 'PLAY', prompt: null,
              players: [], actions: [], weather: 'NICE', homeRerolls: 0, awayRerolls: 0, turn: 1,
              turnMode: 'REGULAR', ball: null, activePlayerId: null, half: 1, drive: 1,
              homeTurn: 1, awayTurn: 0, homeScore: 0, awayScore: 0 } });
        }
      });
    });
    await page.route('**/play/match?*', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module">import { mountPlay } from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), { url: "ws://127.0.0.1/unused", getToken: async () => "test-token" });</script>' }));
    if (retained) await page.addInitScript(pending => sessionStorage.setItem('ffb.intent.v2', JSON.stringify(pending)), pending);
    await page.goto(`http://127.0.0.1:${address.port}/play/match?matchId=${matchId}`);
    await page.getByLabel('Live match pitch').waitFor();
    publish({ type: 'error', requestId: null, code: 'VIEW_UNAVAILABLE' });
    const panel = page.getByRole('region', { name: 'Match connection', exact: true });
    await panel.getByRole('alert').filter({ hasText: 'VIEW UNAVAILABLE' }).waitFor();
    assert.equal(await panel.getByRole('status').textContent(), 'Connected');
    const reconnect = panel.getByRole('button', { name: 'Reconnect', exact: true });
    assert.equal(await reconnect.isEnabled(), true, 'A connected socket with a missing match view permits explicit reconnect');
    await reconnect.click();
    await page.getByLabel('Live match pitch').waitFor();
    assert.equal(connections, 2, 'Explicit reconnect creates a new socket');
    assert.equal(requests.filter(({ request }) => request.type === 'authenticate').length, 2, 'The replacement socket authenticates');
    assert.deepEqual(requests.filter(({ request }) => request.type === 'setup' && request.operation === 'load')
      .map(({ connection, request }) => ({ connection, matchId: request.matchId })),
    [{ connection: 1, matchId }, { connection: 2, matchId }], 'The selected match reloads after authentication');
    assert.deepEqual(requests.filter(({ request }) => request.type === 'setup' && request.operation !== 'load'), [],
      'Restoring the view never automatically replays gameplay');
    assert.equal(await page.getByRole('alert').filter({ hasText: 'VIEW UNAVAILABLE' }).count(), 0);
    if (retained) {
      assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('ffb.intent.v2'))), pending,
        'Reconnect preserves the exact retained request');
      await page.getByRole('button', { name: 'Repeat retained request', exact: true }).click();
      await page.waitForFunction(() => sessionStorage.getItem('ffb.intent.v2') === null);
      assert.deepEqual(requests.filter(({ request }) => request.type === 'setup' && request.operation === 'action')
        .map(({ request }) => request), [pending.request], 'Only explicit retry submits the original intent once');
    }
    assert.deepEqual(pageErrors, []);
    await page.close();
  }
  console.log('PASS unavailable connected match views reconnect, authenticate and reload without replaying retained gameplay');
} finally {
  await browser.close();
  await server.close();
}
