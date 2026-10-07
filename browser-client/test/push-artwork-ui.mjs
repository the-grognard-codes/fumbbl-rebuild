import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-push-artwork.json', import.meta.url), 'utf8'));
const evidence = process.env.PUSH_ARTWORK_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const journey of journeys) for (const role of ['home', 'away', 'spectator']) {
    const states = journey.frames.map(frame => frame[role]);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>' }));
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
          if (request.type === 'setup' && request.operation === 'action') {
            this.sent.push(request.actionId);
            this.state = states[this.sent.length];
          }
          if (request.type === 'watch' || request.type === 'setup' && ['action', 'load'].includes(request.operation)) queueMicrotask(() => this.emit({
            version: 2, type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: this.state }));
        }
        close() { this.readyState = 3; this.onclose?.(); }
      };
    }, states);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${states[0].matchId}${role === 'spectator' ? '&watch=1' : ''}`);
    const pitch = page.getByLabel('Live match pitch');
    await pitch.locator('[data-player-id="away:1"]').waitFor({ state: 'attached', timeout: 5000 });
    if (evidence) await page.screenshot({ path: resolve(evidence, `${role}-${journey.chain ? 'chain' : 'ordinary'}-push.png`) });
    const checkArtwork = async (view, end, tactical = false) => {
      for (const player of view.players) {
        const marker = pitch.locator(`[data-player-id="${player.id}"]`);
        const prone = player.state === 'is prone';
        const pushedDiagonal = player.id === 'away:1' && player.x === 12 || player.id === 'away:2' && player.x === 13;
        const expected = prone ? 'prone' : pushedDiagonal ? end === 'home' ? 'back45' : 'front45' : (player.role === end ? 'back' : 'front');
        assert.equal(await marker.getAttribute('data-pose'), expected, `${role}: ${player.id} ${player.state} retains artwork`);
        assert.equal(await marker.locator('.live-token').count(), 0);
        assert.equal(await marker.locator('img').evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }), true);
        assert.equal(await marker.getAttribute('data-x'), String(player.x));
        assert.equal(await marker.getAttribute('data-y'), String(player.y));
        assert.equal(await marker.locator('.live-number').textContent(), String(player.number));
        assert.equal(await marker.getAttribute('data-anchor-mode'), prone ? 'ground' : tactical ? 'visual-center' : 'feet');
      }
    };
    const end = role === 'away' ? 'away' : 'home';
    const debug = page.getByRole('button', { name: 'Debug', exact: true });
    if (await debug.count()) await debug.click();
    for (const angle of [30, 40, 50]) {
      await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      await checkArtwork(states[0], end);
    }
    await page.getByRole('button', { name: 'Top-down view', exact: true }).click();
    await checkArtwork(states[0], end, true);
    await page.getByRole('button', { name: 'Perspective view', exact: true }).click();
    for (let index = 1; index < states.length; index++) {
      if (role === 'home') {
        const action = states[index - 1].actions.find(action => action.kind === (journey.frames[index].checkpoint === 'resolved' ? 'followUp' : 'push'));
        const choice = page.getByRole('button', { name: action.kind === 'followUp' ? 'Yes' : action.label, exact: true });
        if (journey.frames[index].checkpoint === 'chain-choice') await choice.click();
        else { await choice.focus(); await choice.press('Enter'); }
        await page.waitForFunction(revision => window.testSocket.state.revision === revision, states[index].revision);
        assert.equal(await page.evaluate(() => window.testSocket.sent.at(-1)), action.id);
      } else {
        await page.evaluate(state => { window.testSocket.state = state; window.testSocket.emit({ version: 2, type: 'setupState',
          requestId: null, code: 'ACCEPTED', duplicate: false, state }); }, states[index]);
      }
      await page.getByTestId('setup-status').filter({ hasText: `Revision ${states[index].revision} ` }).waitFor({ state: 'attached', timeout: 5000 });
      await checkArtwork(states[index], end);
    }
    if (role !== 'home') assert.deepEqual(await page.evaluate(() => window.testSocket.sent), []);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: native Human/Orc pending knockdown, ordinary/chain push and prone resolution retain artwork for both coaches and spectator.');
} finally {
  await browser.close();
  await server.close();
}
