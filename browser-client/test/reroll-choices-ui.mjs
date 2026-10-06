import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-reroll-choices.json', import.meta.url), 'utf8'));
const cases = [...journeys, ...journeys.filter(journey => ['pro', 'block-pro'].includes(journey.mode))
  .flatMap(journey => ['otherCoach', 'spectator'].map(viewer => ({ ...journey, viewer })))];
const evidence = process.env.REROLL_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const journey of cases) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(5000);
    console.log(journey.role, journey.mode, journey.viewer ?? 'actor');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>' }));
    await page.addInitScript(journey => {
      const transport = { state: journey.viewer ? journey[journey.viewer] : journey.offered, sent: [], receipts: new Map(), consumptions: 0 };
      window.testTransport = transport;
      window.WebSocket = class {
        static OPEN = 1;
        readyState = 1;
        constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
        emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
        send(raw) {
          const request = JSON.parse(raw);
          if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication',
            requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
          if (request.type === 'matchChat') queueMicrotask(() => this.emit({ version: 2, type: 'error', requestId: request.requestId, code: 'TRANSCRIPT_UNAVAILABLE' }));
          if (request.type === 'matchTranscript') {
            // The transport envelope is synthetic; current snapshots and dice reports are exported by the native engine.
            const from = request.from, total = transport.state.revision + 1, next = Math.min(total, from + request.limit);
            const records = Array.from({ length: next - from }, (_, offset) => {
              const index = from + offset;
              const reports = index === journey.offered.revision ? journey.offeredReports : index === journey.accepted.revision ? journey.acceptedReports : [];
              return { index, revision: index, kind: index === 0 ? 'START' : 'ACTION', actor: index === 0 ? 'system' : journey.role,
                at: index, decision: index === 0 ? null : {}, native: [{ commandNr: index + 1, reportList: { reports } }],
                state: { ...transport.state, revision: index, callerRole: 'home', actions: [], prompt: null } };
            });
            setTimeout(() => this.emit({ version: 2, type: 'matchTranscript', code: 'ACCEPTED', requestId: request.requestId,
              matchId: transport.state.matchId, page: { formatVersion: 2, from, next, total, records } }), 80);
          }
          if (request.type !== 'setup' && request.type !== 'watch') return;
          let duplicate = false;
          if (request.type === 'setup' && request.operation !== 'load') {
            transport.sent.push(request);
            duplicate = transport.receipts.has(request.requestId);
            if (!duplicate) {
              if (request.actionId !== journey.selectedId) throw Error(`Unexpected action ${request.actionId}`);
              transport.receipts.set(request.requestId, request); transport.consumptions += 1; transport.state = journey.accepted;
            }
            if (transport.dropReply) { transport.dropReply = false; this.close(); return; }
          }
          setTimeout(() => this.emit({ version: 2, type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate, state: transport.state }), request.operation === 'load' ? 0 : 200);
        }
        close() { this.readyState = 3; this.onclose?.(); }
      };
    }, journey);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${journey.offered.matchId}${journey.viewer === 'spectator' ? '&watch=1' : ''}`);
    if (journey.viewer) {
      await page.locator('.live-dice-overlay .match-die').first().waitFor({ state: 'visible' });
      await page.waitForTimeout(500);
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.locator('.live-dice-overlay .match-die').count(), journey.mode.startsWith('block-') ? 2 : 1);
      assert.deepEqual(await page.evaluate(() => window.testTransport.sent), []);
      assert.deepEqual(errors, []);
      await page.close(); continue;
    }
    const options = journey.offered.actions.filter(action => ['blockDie', 'reroll', 'skill'].includes(action.kind));
    const selected = options.find(action => action.id === journey.selectedId);
    const button = page.getByRole('button', { name: selected.label, exact: true });
    await button.waitFor({ state: 'visible' });
    for (const option of options) assert.equal(await page.getByRole('button', { name: option.label, exact: true }).count(), 1, option.id);
    if (!journey.mode.startsWith('block-')) {
      await page.locator('.live-dice-overlay .match-die').first().waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(500);
      assert.equal(await page.locator('.live-dice-overlay .match-die').count(), 1, 'Late native reports restore and retain the pending result');
    }
    for (const angle of [30, 50, 40]) {
      await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      assert.equal(await button.isEnabled(), true);
    }
    const reconnect = ['pro', 'block-pro', 'mascot'].includes(journey.mode);
    if (reconnect) {
      await page.evaluate(() => window.testSocket.close());
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await button.waitFor({ state: 'visible' });
      if (journey.mode === 'pro') await page.locator('.live-dice-overlay .match-die').first().waitFor({ state: 'visible' });
    }
    await page.setViewportSize({ width: 560, height: 500 });
    await button.scrollIntoViewIfNeeded();
    await page.keyboard.press('Tab');
    await button.focus();
    if (evidence && ['pro', 'mascot', 'block-pro', 'block-opponent', 'block-multi-3'].includes(journey.mode))
      await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.mode}.jpg`), type: 'jpeg', quality: 80 });
    const loseReply = journey.mode === 'pro' || journey.mode === 'block-pro';
    if (loseReply) await page.evaluate(() => { window.testTransport.dropReply = true; });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    if (loseReply) {
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await page.getByRole('button', { name: 'Repeat retained request', exact: true }).click();
    }
    await page.getByTestId('setup-status').filter({ hasText: `Revision ${journey.accepted.revision} ` }).waitFor({ state: 'attached' });
    await page.waitForTimeout(250);
    const transport = await page.evaluate(() => ({ sent: window.testTransport.sent, consumptions: window.testTransport.consumptions }));
    assert.equal(transport.consumptions, 1, 'Pending keyboard clicks and an exact retry spend only once');
    assert.equal(transport.sent.length, loseReply ? 2 : 1);
    assert.equal(transport.sent[0].actionId, journey.selectedId);
    if (loseReply) assert.deepEqual(transport.sent[0], transport.sent[1], 'Reconnect reuses the complete retained request');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: 48 native choices and 8 other-coach/spectator views in production play, late dice, cameras, keyboard, narrow views, reconnect and exact retries.');
} finally { await browser.close(); await server.close(); }
