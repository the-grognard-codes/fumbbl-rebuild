import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const matchId = frames[0].actor.matchId;
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused", getToken:async()=>"token"});</script>' }));
  await page.addInitScript(({ frames, matchId }) => {
    window.testSocket = null;
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      sent = [];
      constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
      emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
      send(raw) {
        const request = JSON.parse(raw);
        this.sent.push(request);
        if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication',
          requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
        if (request.type === 'setup' && request.operation === 'load') queueMicrotask(() => this.emit({ version: 2,
          type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: frames[0].actor }));
        if (request.type === 'matchTranscript' || request.type === 'matchChat') queueMicrotask(() => this.emit({
          version: 2, type: 'error', requestId: request.requestId, code: 'TRANSCRIPT_UNAVAILABLE' }));
        if (request.type === 'movementPreview') queueMicrotask(() => this.emit({ version: 2,
          type: 'movementPreview', requestId: request.requestId, code: 'ACCEPTED', matchId,
          plan: { planVersion: 1, kind: 'blitz', targetPlayerId: 'away1', waypoints: [{ x: 10, y: 7 }],
            route: { routeVersion: 3, playerId: 'home1', from: { x: 7, y: 7 }, remaining: 8,
              steps: frames.slice(3, 6).map(frame => {
                const player = frame.actor.players.find(item => item.id === 'home1');
                return { x: player.x, y: player.y, dodge: 0, rush: 0, dodgeModifier: 0, reactions: [], checks: [] };
              }), revision: 0, actor: 'home' } } }));
        if (request.type === 'setup' && request.operation !== 'load') {
          const next = request.operation === 'movement' ? frames[6].actor : null;
          if (next) queueMicrotask(() => this.emit({ version: 2, type: 'setupState', requestId: request.requestId,
            code: 'ACCEPTED', duplicate: false, state: next }));
        }
      }
      close() { this.readyState = 3; this.onclose?.(); }
    };
  }, { frames, matchId });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${matchId}`);
  await page.locator('.live-marker.home').click();
  await page.locator('.live-marker.away').click();
  assert.equal(await page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'setup' && request.operation !== 'load').length), 0);
  await page.getByText('Plan blitz against away1').waitFor();
  await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
  await page.getByRole('dialog', { name: 'Choose a block die' }).waitFor();
  const sent = await page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'setup' && request.operation !== 'load'));
  assert.equal(sent.length, 1, 'One confirmation commits the full Blitz');
  assert.equal(sent[0].operation, 'movement');
  assert.equal(sent[0].kind, 'blitz');
  assert.equal(sent[0].playerId, 'home1');
  assert.equal(sent[0].targetPlayerId, 'away1');
  assert.equal(sent[0].expectedRevision, 0);
  assert.deepEqual(sent[0].waypoints, [{ x: 10, y: 7 }]);
  const previews = await page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'movementPreview'));
  assert.equal(previews.length, 1);
  assert.deepEqual(previews[0].waypoints, [], 'The server chooses the approach to the selected target');
  assert.deepEqual(errors, []);
  console.log('PASS: one confirmation commits the reviewed Blitz approach and block; the required native die choice follows.');
} finally {
  await browser.close();
  await server.close();
}
