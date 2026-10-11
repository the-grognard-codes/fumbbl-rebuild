import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/manual-skill-rerolls.json', import.meta.url), 'utf8'));
const evidence = process.env.REROLL_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const journey of journeys) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>' }));
    await page.addInitScript(journey => {
      const transport = { frame: 0, sent: [], receipts: new Map() };
      window.testTransport = transport;
      window.WebSocket = class {
        static OPEN = 1;
        readyState = 1;
        constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
        emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
        send(raw) {
          const request = JSON.parse(raw);
          const snapshot = () => journey.frames[transport.frame];
          if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication',
            requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
          if (request.type === 'matchChat') queueMicrotask(() => this.emit({ version: 2, type: 'error', requestId: request.requestId, code: 'TRANSCRIPT_UNAVAILABLE' }));
          if (request.type === 'matchTranscript') {
            const records = snapshot().records;
            const from = request.from, next = Math.min(records.length, from + request.limit);
            setTimeout(() => this.emit({ version: 2, type: 'matchTranscript', code: 'ACCEPTED', requestId: request.requestId,
              matchId: snapshot().state.matchId, page: { formatVersion: 2, from, next, total: records.length, records: records.slice(from, next) } }), 50);
          }
          if (request.type !== 'setup') return;
          let duplicate = false;
          if (request.operation === 'action') {
            transport.sent.push(request);
            duplicate = transport.receipts.has(request.requestId);
            if (!duplicate) {
              if (!snapshot().state.actions.some(action => action.id === request.actionId && action.actor === journey.role))
                throw Error(`Action not offered by native phase: ${request.actionId}`);
              transport.receipts.set(request.requestId, request); transport.frame += 1;
            }
            if (transport.dropReply) { transport.dropReply = false; this.close(); return; }
          }
          setTimeout(() => this.emit({ version: 2, type: 'setupState', code: 'ACCEPTED', requestId: request.requestId,
            duplicate, state: snapshot().state }), request.operation === 'load' ? 0 : 200);
        }
        close() { this.readyState = 3; this.onclose?.(); }
      };
    }, journey);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${journey.frames[0].state.matchId}`);
    const block = journey.mode === 'block';
    const stages = block ? ['block-reroll:pro', 'block-pro-test:team', 'block-reroll-die:1'] : ['reroll:pro', 'pro-test:team'];
    for (let stage = 0; stage < stages.length; stage++) {
      const action = journey.frames[stage].state.actions.find(action => action.id.endsWith(`:${stages[stage]}`));
      assert.ok(action);
      const button = page.getByRole('button', { name: action.label, exact: true });
      await button.click({ trial: true });
      if (stage > 0) {
        await page.getByRole('status', { name: `Pro test: ${stage === 1 ? '1, failure' : '6, success'}`, exact: true }).waitFor();
        if (stage === 1) assert.equal(await page.getByRole('status', { name: block ? 'Original block dice' : 'Original action roll', exact: true }).locator('.match-die').count(), block ? 2 : 1);
        else assert.equal(await page.getByRole('dialog').locator('.live-die-choice').count(), 2);
        await page.evaluate(() => window.testSocket.close());
        await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
        await button.click({ trial: true });
        await page.getByRole('status', { name: `Pro test: ${stage === 1 ? '1, failure' : '6, success'}`, exact: true }).waitFor();
      }
      if (evidence && stage > 0) await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.mode}-pro-phase-${stage}.png`) });
      if (stage === 0) await page.evaluate(() => { window.testTransport.dropReply = true; });
      await button.click();
      if (stage === 0) {
        await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
        await page.getByRole('button', { name: 'Repeat retained request', exact: true }).click();
      }
      await page.getByTestId('setup-status').filter({ hasText: `Revision ${journey.frames[stage + 1].state.revision} ` }).waitFor({ state: 'attached' });
    }
    if (block) {
      await page.getByRole('button', { name: 'Choose PUSHBACK (die 2)', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Choose BOTH DOWN (die 1)', exact: true }).count(), 1);
    }
    const sent = await page.evaluate(() => window.testTransport.sent);
    assert.equal(sent.length, block ? 4 : 3);
    assert.deepEqual(sent[0], sent[1], 'The lost Pro reply repeats the exact original request');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(`PASS: ${journeys.length} native Pro phase journeys, original dice, separate d6, reconnect and retained retry.`);
} finally { await browser.close(); await server.close(); }
