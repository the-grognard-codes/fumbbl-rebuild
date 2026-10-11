import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-pass-workflow.json', import.meta.url), 'utf8'));
const evidence = process.env.PASS_WORKFLOW_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const journey of journeys) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>' }));
    await page.addInitScript(journey => {
      const states = journey.frames.map(frame => frame.actor);
      window.WebSocket = class {
        static OPEN = 1;
        readyState = 1;
        index = 0;
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
          if (request.type === 'routePreview') queueMicrotask(() => this.emit({ version: 2, type: 'routePreview',
            requestId: request.requestId, code: 'ACCEPTED', matchId: this.state.matchId, route: journey.route }));
          if (request.type === 'movementRange') queueMicrotask(() => this.emit({ version: 2, type: 'error',
            requestId: request.requestId, code: 'ROUTE_UNAVAILABLE' }));
          if (request.type === 'movementPreview') queueMicrotask(() => this.emit({ version: 2, type: 'movementPreview',
            requestId: request.requestId, code: 'ACCEPTED', matchId: this.state.matchId,
            plan: { planVersion: 1, kind: 'move', targetPlayerId: null, waypoints: request.waypoints, route: journey.route } }));
          if (request.type === 'setup' && request.operation !== 'load') {
            this.sent.push(request);
            this.state = states[++this.index];
          }
          if (request.type === 'setup') queueMicrotask(() => this.emit({ version: 2, type: 'setupState',
            requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: this.state }));
        }
        close() { this.readyState = 3; this.onclose?.(); }
      };
    }, journey);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${journey.frames[0].actor.matchId}`);
    const pitch = page.getByLabel('Live match pitch');
    const confirmed = page.getByRole('button', { name: 'Confirmed!', exact: true });
    const waitRevision = revision => page.getByTestId('setup-status').filter({ hasText: `Revision ${revision} ` }).waitFor({ state: 'attached', timeout: 5000 });
    await pitch.locator('[data-player-id="actor"]').click();
    await page.getByRole('button', { name: 'Other action', exact: true }).click();
    await page.getByRole('button', { name: 'Pass', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.testSocket.sent), [], 'Declaration is reviewed before it is sent');
    await confirmed.click();
    await waitRevision(1);
    if (journey.route) {
      const point = await squarePosition(page, 11, 7);
      await page.locator('.live-pitch-scene').click({ position: point });
      await page.locator('.live-route-line').waitFor({ state: 'attached', timeout: 5000 });
      if (journey.frames[1].actor.actions.some(action => action.kind === 'pass')) {
        await pitch.locator('[data-player-id="mate"]').click();
        assert.equal(await page.locator('.live-route-line').count(), 0, 'Choosing a pass recipient cancels the unconfirmed movement plan');
        assert.equal(await confirmed.isEnabled(), true);
        assert.equal(await page.evaluate(() => window.testSocket.sent.length), 1, 'Switching from a route to a recipient stays read-only');
        await pitch.locator('[data-player-id="actor"]').click();
        await page.locator('.live-pitch-scene').click({ position: await squarePosition(page, 11, 7) });
        await page.locator('.live-route-line').waitFor({ state: 'attached', timeout: 5000 });
      }
      await confirmed.click();
      await waitRevision(2);
      if (journey.mode === 'pickup-reroll') {
        const option = journey.frames[2].actor.actions.find(action => action.id.endsWith('reroll:team'));
        await page.getByRole('button', { name: option.label, exact: true }).click();
        await waitRevision(3);
      }
    }
    const beforeThrow = journey.frames.at(-2).actor;
    const pass = beforeThrow.actions.find(action => action.kind === 'pass' && action.target.x === 14 && action.target.y === 7);
    const sentCount = await page.evaluate(() => window.testSocket.sent.length);
    if (journey.mode === 'stationary') {
      const empty = beforeThrow.actions.find(action => action.kind === 'pass' && !beforeThrow.players.some(player =>
        player.x === action.target.x && player.y === action.target.y));
      await page.getByRole('button', { name: 'Debug', exact: true }).click();
      await page.getByLabel('Server action', { exact: true }).selectOption(empty.id);
      assert.equal(await confirmed.isEnabled(), true, 'Native empty-square targets remain available through the offered controls');
      assert.equal(await page.evaluate(() => window.testSocket.sent.length), sentCount);
      await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
      await pitch.locator('[data-player-id="actor"]').click();
    }
    await pitch.locator('[data-player-id="mate"]').click();
    if (evidence) await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.mode}-target.png`) });
    assert.equal(await confirmed.isEnabled(), true, 'Clicking the legal recipient stages the offered throw');
    assert.equal(await pitch.locator('.live-selection-square').getAttribute('data-selection'), 'actor', 'The passer remains selected');
    assert.equal(await pitch.locator('.live-target-line').count(), 1, 'The recipient has a visible target path');
    assert.equal(await pitch.locator('[data-player-id="mate"]').evaluate(element => element.classList.contains('target')), true);
    assert.equal(await page.evaluate(() => window.testSocket.sent.length), sentCount, 'Target selection does not throw');
    const debug = page.getByRole('button', { name: 'Debug', exact: true });
    if (await debug.count()) await debug.click();
    for (const angle of [30, 50, 40]) {
      await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      assert.equal(await confirmed.isEnabled(), true, 'Camera changes preserve the reviewed recipient');
    }
    await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
    await confirmed.click();
    await waitRevision(journey.frames.at(-1).actor.revision);
    const sent = await page.evaluate(() => window.testSocket.sent);
    assert.equal(sent.at(-1).actionId, pass.id);
    assert.equal(sent.filter(request => request.actionId === pass.id).length, 1);
    assert.equal(await confirmed.isDisabled(), true, 'Accepted revision clears the proposal and prevents double confirmation');
    assert.deepEqual(await page.evaluate(() => window.testSocket.state.ball), { x: 14, y: 7 });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: both coaches declare Pass, retain movement/pickup/reroll, click the recipient and confirm the exact offered throw once.');
} finally {
  await browser.close();
  await server.close();
}
