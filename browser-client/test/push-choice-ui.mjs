import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[7].actor;
const chain = { ...initial, revision: 8, players: [...initial.players,
  { ...initial.players[1], id: 'chain', name: 'Chain', x: 12, y: 6 }], actions: [
  { ...initial.actions[0], id: '8:push:chain:13:6', label: 'Push to 13, 6', target: { x: 13, y: 6 } },
  { ...initial.actions[0], id: '8:push:chain:13:7', label: 'Push to 13, 7', target: { x: 13, y: 7 } }
] };
const after = { ...chain, revision: 9, actions: [] };
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
      state = states[0];
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
          version: 2, type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: this.state }));
        if (request.type === 'setup' && request.operation === 'action') {
          this.sent.push(request.actionId);
          this.state = states[this.sent.length];
          queueMicrotask(() => this.emit({ version: 2, type: 'setupState', requestId: request.requestId,
            code: 'ACCEPTED', duplicate: false, state: this.state }));
        }
      }
      close() { this.readyState = 3; this.onclose?.(); }
    };
  }, [initial, chain, after]);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${initial.matchId}`);
  const pitch = page.getByLabel('Live match pitch');
  const arrows = pitch.locator('.live-push-choice');
  await arrows.first().waitFor();
  assert.equal(await arrows.count(), 3);
  assert.equal(await pitch.locator('.live-token').count(), 2, 'Native fixtures without artwork retain the explicit number-token fallback');
  const debug = page.getByRole('button', { name: 'Debug', exact: true });
    if (await debug.count()) await debug.click();
    for (const angle of [30, 50, 40]) {
    await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
    assert.equal(await arrows.count(), 3, 'Camera changes retain the pending push decision');
    assert.deepEqual(await page.evaluate(() => window.testSocket.sent), [], 'Camera changes never answer the decision');
  }
  await page.getByRole('button', { name: 'Top-down view', exact: true }).click();
  assert.equal(await arrows.count(), 3);
  await page.getByRole('button', { name: 'Perspective view', exact: true }).click();
  await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.live-team-nameplate strong').evaluateAll(elements => elements.every(element =>
    element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.parentElement.clientHeight)), true, 'Both frozen team names fit their plates');
  assert.equal(await pitch.locator('.live-target-square').count(), 0, 'Push choices use arrows without square boxes');
  assert.equal(await page.getByRole('dialog', { name: 'Match decision' }).count(), 0);
  await arrows.first().click();
  await page.waitForFunction(() => window.testSocket.state.revision === 8);
  assert.deepEqual(await page.evaluate(() => window.testSocket.sent), ['7:push:away1:12:6']);
  assert.equal(await arrows.count(), 2);
  await pitch.getByRole('button', { name: 'Push to 13, 6' }).focus();
  await pitch.getByRole('button', { name: 'Push to 13, 6' }).press('Enter');
  await page.waitForFunction(() => window.testSocket.state.revision === 9);
  assert.deepEqual(await page.evaluate(() => window.testSocket.sent), ['7:push:away1:12:6', '8:push:chain:13:6']);
  assert.equal(await arrows.count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: pitch click selects push, chain arrows update from the new player, and Enter selects the chain square.');
} finally {
  await browser.close();
  await server.close();
}
