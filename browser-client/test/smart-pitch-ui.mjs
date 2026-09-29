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
        if (request.type === 'routePreview') queueMicrotask(() => this.emit(request.waypoints[0].y === 6
          ? { version: 2, type: 'error', requestId: request.requestId, code: 'NO_ROUTE' }
          : { version: 2, type: 'routePreview', requestId: request.requestId, code: 'ACCEPTED', matchId,
            route: { routeVersion: 1, playerId: 'home1', from: { x: 7, y: 7 }, remaining: 8,
              steps: [{ x: 8, y: 7, dodge: 0, rush: 0, reactions: [] }, { x: 9, y: 7, dodge: 0, rush: 0, reactions: [] },
                { x: 10, y: 7, dodge: 0, rush: 0, reactions: [] }], revision: 2, actor: 'home' } }));
        if (request.type === 'setup' && request.operation !== 'load') {
          const next = request.actionId?.endsWith('blitz-home1') ? frames[1].actor
            : request.actionId?.endsWith('target-away1') ? frames[2].actor
              : request.operation === 'route' ? frames[5].actor
                : request.actionId?.endsWith('block-away1') ? frames[6].actor : null;
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
  assert.equal(await page.evaluate(() => window.testSocket.sent.filter(request => request.operation === 'action').length), 0);
  await page.getByText('Plan blitz against away1').waitFor();
  await page.getByRole('button', { name: 'Commit action', exact: true }).click();
  await page.waitForFunction(() => window.testSocket.sent.some(request => request.actionId?.endsWith('target-away1')));
  await page.getByRole('button', { name: 'Commit path' }).waitFor();
  await page.getByRole('button', { name: 'Commit path' }).click();
  await page.waitForFunction(() => window.testSocket.sent.some(request => request.actionId?.endsWith('block-away1')));
  const sent = await page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'setup' && request.operation !== 'load'));
  assert.deepEqual(sent.map(request => request.operation === 'route' ? `route:${request.waypoints.at(-1).x},${request.waypoints.at(-1).y}` : request.actionId.split(':')[1]),
    ['blitz-home1', 'target-away1', 'route:10,7', 'block-away1']);
  assert.deepEqual(await page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'routePreview')
    .map(request => request.waypoints[0])), [{ x: 10, y: 6 }, { x: 10, y: 7 }]);
  assert.deepEqual(errors, []);
  console.log('PASS: one Commit declares and targets Blitz; the reviewed server route commits before the offered Block.');
} finally {
  await browser.close();
  await server.close();
}
