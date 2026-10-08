import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { matchDecision } from '../src/match-decision.ts';

const accounting = Boolean(process.env.REROLL_FIXTURE);
const journeys = JSON.parse(readFileSync(new URL(process.env.REROLL_FIXTURE ?? './fixtures/adr0003-reroll-choices.json', import.meta.url), 'utf8'));
const cases = [...journeys, ...journeys.filter(journey => !accounting && ['pro', 'block-pro'].includes(journey.mode))
  .flatMap(journey => ['otherCoach', 'spectator'].map(viewer => ({ ...journey, viewer })))];
const selectedCases = process.env.REROLL_MODES ? cases.filter(journey => process.env.REROLL_MODES.split(',').includes(journey.mode) && !journey.viewer) : cases;
const evidence = process.env.REROLL_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const journey of selectedCases) {
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
            const frozen = { ...transport.state, actions: [], prompt: null };
            delete frozen.movementForecast; // Mirror native frozen snapshots: live choices are absent.
            const records = Array.from({ length: next - from }, (_, offset) => {
              const index = from + offset;
              const reports = index === journey.offered.revision ? journey.offeredReports : index === journey.accepted.revision ? journey.acceptedReports : [];
              return { index, revision: index, kind: index === 0 ? 'START' : 'ACTION', actor: index === 0 ? 'system' : journey.role,
                at: index, decision: index === 0 ? null : {}, native: [{ commandNr: index + 1, reportList: { reports } }],
                state: { ...frozen, revision: index, callerRole: 'home' } };
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
    const decision = matchDecision(journey.offered, options);
    const group = decision.options.find(option => option.choices?.some(choice => choice.id === selected.id));
    const button = page.getByRole('button', { name: group?.label ?? selected.label, exact: true });
    await button.waitFor({ state: 'visible' });
    if (accounting) {
      const resource = page.locator(`.live-resources.${journey.role} .live-resource.reroll`);
      assert.equal(await resource.count(), journey.before > 0 ? 1 : 0);
      if (journey.before > 0) assert.equal(await resource.getAttribute('aria-label'), `Rerolls: ${journey.before} available`);
    }
    for (const option of decision.options) assert.equal(await page.getByRole('button', { name: option.label, exact: true }).count(), 1, option.id);
    const skillIcons = decision.options.filter(option => option.icon && option.icon !== 'resource').map(option => option.icon);
    assert.equal(new Set(skillIcons).size, skillIcons.length, 'One icon per manually offered skill source');
    for (const option of decision.options.filter(option => /^(?:Use|Try)\b/.test(option.label))) {
      const offeredButton = page.getByRole('button', { name: option.label, exact: true });
      const resource = /^(?:Use|Try) (?:team|mascot|brilliant coaching|pump up the crowd|star of the show)/i.test(option.label);
      if (resource) assert.ok(await offeredButton.locator('img').evaluate(image => image.complete && image.naturalWidth > 0 && image.src.endsWith('/assets/game/ui/reroll-v1.png')), option.label);
      else assert.ok(await offeredButton.locator('svg use').evaluate(use => {
        const bounds = use.getBBox(); return bounds.width > 0 && bounds.height > 0;
      }), `Skill icon rendered for ${option.label}`);
    }
    if (!journey.mode.startsWith('block-')) {
      await page.locator('.live-dice-overlay .match-die').first().waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(500);
      assert.equal(await page.locator('.live-dice-overlay .match-die').count(), 1, 'Late native reports restore and retain the pending result');
    }
    const debug = page.getByRole('button', { name: 'Debug', exact: true });
    if (await debug.count()) await debug.click();
    for (const angle of [30, 50, 40]) {
      await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      assert.equal(await button.isEnabled(), true);
    }
    await page.getByRole('button', { name: 'Close debug panel' }).click();
    const reconnect = ['pro', 'block-pro', 'mascot'].includes(journey.mode);
    if (reconnect) {
      await page.evaluate(() => window.testSocket.close());
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await button.waitFor({ state: 'visible' });
      if (journey.mode === 'pro') await page.locator('.live-dice-overlay .match-die').first().waitFor({ state: 'visible' });
    }
    const accountingCapture = accounting && ['all', 'mascot-success', 'mascot-fallback', 'leader', 'team'].includes(journey.mode);
    if (evidence && accountingCapture)
      await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.mode}-before.jpg`), type: 'jpeg', quality: 80 });
    await page.setViewportSize({ width: 560, height: 500 });
    await button.scrollIntoViewIfNeeded();
    assert.ok(await page.getByRole('dialog').evaluate(dialog => [...dialog.querySelectorAll('button')].every(choice => {
      const rect = choice.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    })), 'All offered choices fit the compact viewport');
    assert.equal(await page.getByRole('dialog').evaluate(dialog => dialog.scrollHeight <= dialog.clientHeight + 1), true,
      'The roll overlay has no vertical display scrollbar');
    await page.keyboard.press('Tab');
    await button.focus();
    if (evidence && ['pro', 'mascot', 'block-pro', 'block-opponent', 'block-multi-3'].includes(journey.mode))
      await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.mode}.jpg`), type: 'jpeg', quality: 80 });
    const loseReply = journey.mode === 'pro' || journey.mode === 'block-pro';
    if (loseReply) await page.evaluate(() => { window.testTransport.dropReply = true; });
    if (group) { await button.click(); await page.getByRole('button', { name: selected.label, exact: true }).focus(); }
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    if (loseReply) {
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await page.getByRole('button', { name: 'Repeat retained request', exact: true }).click();
    }
    await page.getByTestId('setup-status').filter({ hasText: `Revision ${journey.accepted.revision} ` }).waitFor({ state: 'attached' });
    await page.waitForTimeout(250);
    if (accounting) {
      const resource = page.locator(`.live-resources.${journey.role} .live-resource.reroll`);
      assert.equal(await resource.count(), journey.after > 0 ? 1 : 0);
      if (journey.after > 0) assert.equal(await resource.getAttribute('aria-label'), `Rerolls: ${journey.after} available`);
    }
    if (evidence && accountingCapture) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.mode}-after.jpg`), type: 'jpeg', quality: 80 });
    }
    const transport = await page.evaluate(() => ({ sent: window.testTransport.sent, consumptions: window.testTransport.consumptions }));
    assert.equal(transport.consumptions, 1, 'Pending keyboard clicks and an exact retry spend only once');
    assert.equal(transport.sent.length, loseReply ? 2 : 1);
    assert.equal(transport.sent[0].actionId, journey.selectedId);
    if (loseReply) assert.deepEqual(transport.sent[0], transport.sent[1], 'Reconnect reuses the complete retained request');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(`PASS: ${selectedCases.length} native fixture cases in production play, skill/resource icons, late dice, cameras, keyboard, narrow views, reconnect and exact retries.`);
} finally { await browser.close(); await server.close(); }
