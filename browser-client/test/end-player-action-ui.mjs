import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[2].actor;
const after = { ...initial, revision: initial.revision + 1, activePlayerId: null, actions: [] };
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
  await page.addInitScript(states => {
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      sent = [];
      constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
      emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
      send(raw) {
        const request = JSON.parse(raw);
        if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication',
          requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
        if (request.type === 'matchTranscript' || request.type === 'matchChat') queueMicrotask(() => this.emit({
          version: 2, type: 'error', requestId: request.requestId, code: 'TRANSCRIPT_UNAVAILABLE' }));
        if (request.type === 'setup' && request.operation === 'load') queueMicrotask(() => this.emit({
          version: 2, type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: this.state = states[0] }));
        if (request.type === 'setup' && request.operation === 'action') {
          this.sent.push(request.actionId);
          this.state = states[1];
          queueMicrotask(() => this.emit({ version: 2, type: 'setupState', requestId: request.requestId,
            code: 'ACCEPTED', duplicate: false, state: this.state }));
        }
      }
      close() { this.readyState = 3; this.onclose?.(); }
    };
  }, [initial, after]);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${initial.matchId}`);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByLabel('Additional actions').getByRole('button', { name: 'End player action' }).click();
  await page.waitForFunction(() => window.testSocket.state.revision === 3);
  assert.deepEqual(await page.evaluate(() => window.testSocket.sent), ['2:end-action']);
  assert.deepEqual(errors, []);
  console.log('PASS: End player action sends on selection without an additional Commit.');
} finally {
  await browser.close();
  await server.close();
}
