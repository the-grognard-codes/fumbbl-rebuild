import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const matchId = '3b551645-5774-4d99-a28e-b0e37cafc5ad';
const state = { matchId, revision: 0, callerRole: 'home', phase: 'PLAY', actor: 'home', prompt: null,
  players: [], weather: 'NICE', homeRerolls: 0, awayRerolls: 0,
  actions: [{ id: '0:end-turn', kind: 'endTurn', label: 'End turn', actor: 'home' }],
  turn: 0, turnMode: 'REGULAR', ball: null, activePlayerId: null, half: 1,
  homeTurn: 0, awayTurn: 0, homeScore: 0, awayScore: 0, drive: 1 };
const frame = { before: { version: 2, type: 'setupState', code: 'ACCEPTED', duplicate: false, state },
  after: { version: 2, type: 'setupState', code: 'ACCEPTED', duplicate: false,
    state: { ...state, revision: 1, actor: 'away', actions: [] } } };
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused", getToken:async()=>"token"});</script>' }));
  await page.addInitScript(({ frame }) => {
    window.testSocket = null;
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      sent = [];
      constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
      send(raw) {
        const request = JSON.parse(raw);
        this.sent.push(request);
        if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication', requestId: request.requestId,
          code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
        if (request.type === 'setup' && request.operation === 'load') queueMicrotask(() => this.emit({ ...frame.before,
          version: 2, requestId: request.requestId }));
      }
      emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
      close() { this.readyState = 3; this.onclose?.(); }
    };
  }, { frame });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${matchId}`);
  await page.getByTestId('setup-status').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  const request = await page.evaluate(() => window.testSocket.sent.findLast(item => item.type === 'setup' && item.operation === 'action'));
  assert.ok(request, 'The match action must be sent');
  assert.equal(request.actionId, '0:end-turn');
  assert.equal(await page.getByRole('button', { name: 'Repeat retained request' }).count(), 0,
    'An ordinary in-flight match action must not show recovery');
  await page.evaluate(({ frame, request }) => window.testSocket.emit({ ...frame.after, version: 2,
    requestId: request.requestId }), { frame, request });
  await page.getByTestId('setup-status').filter({ hasText: 'Revision 1' }).waitFor({ state: 'attached' });
  assert.equal(await page.getByRole('button', { name: 'Repeat retained request' }).count(), 0);
  await page.reload();
  await page.getByTestId('setup-status').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  const uncertainRequest = await page.evaluate(() => window.testSocket.sent.findLast(item => item.type === 'setup' && item.operation === 'action'));
  await page.evaluate(requestId => window.testSocket.emit({ version: 2, type: 'error', requestId,
    code: 'MATCH_OUTCOME_UNKNOWN' }), uncertainRequest.requestId);
  await page.getByRole('button', { name: 'Repeat retained request' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Repeat retained request' }).waitFor();
  await page.getByRole('button', { name: 'Repeat retained request' }).click();
  assert.deepEqual(await page.evaluate(() => window.testSocket.sent.at(-1)), uncertainRequest,
    'Recovery must repeat the original request exactly');
  assert.equal(await page.getByRole('button', { name: 'Repeat retained request' }).count(), 0,
    'Recovery prompt should hide while the exact retry is in flight');
  await page.evaluate(({ frame, request }) => window.testSocket.emit({ ...frame.after,
    requestId: request.requestId, duplicate: true }), { frame, request: uncertainRequest });
  assert.equal(await page.getByRole('button', { name: 'Repeat retained request' }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS ordinary match action has no recovery popup; uncertain outcome retains exact retry');
} finally {
  await browser.close();
  await server.close();
}
