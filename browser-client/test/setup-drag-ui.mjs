import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { squarePosition } from './projected-pitch-helper.mjs';

const frame = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const reserve = { ...frame.players[0], id: 'reserve', name: 'Reserve', slot: 2, number: 2,
  x: null, y: null, state: 'is reserve', offPitch: 'reserve' };
const setup = { ...frame, phase: 'SETUP', actions: [], players: [...frame.players, reserve] };
const solid = { ...frame, phase: 'PLAY', turnMode: 'SOLID_DEFENCE', actions: [
  { id: '0:event-pick:home1', label: 'Reposition home1', kind: 'kickoffChoice', actor: 'home',
    sourcePlayerId: null, target: { playerId: 'home1' } }
] };
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
async function open(initial) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused", getToken:async()=>"token"});</script>' }));
  await page.addInitScript(initial => {
    window.testSocket = null;
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      sent = [];
      state = initial;
      constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
      emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
      reply(requestId) { queueMicrotask(() => this.emit({ version: 2, type: 'setupState', requestId,
        code: 'ACCEPTED', duplicate: false, state: this.state })); }
      send(raw) {
        const request = JSON.parse(raw);
        this.sent.push(request);
        if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication',
          requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
        if (request.type === 'matchTranscript' || request.type === 'matchChat') queueMicrotask(() => this.emit({
          version: 2, type: 'error', requestId: request.requestId, code: 'TRANSCRIPT_UNAVAILABLE' }));
        if (request.type === 'setup' && request.operation === 'load') this.reply(request.requestId);
        if (request.type === 'setup' && request.operation === 'place') {
          this.state = { ...this.state, revision: this.state.revision + 1,
            players: this.state.players.map(player => player.id === request.playerId ? { ...player,
              x: request.to?.x ?? null, y: request.to?.y ?? null, offPitch: request.to ? 'pitch' : 'reserve' } : player) };
          this.reply(request.requestId);
        }
        if (request.type === 'setup' && request.operation === 'action' && request.actionId.endsWith(':event-pick:home1')) {
          this.state = { ...this.state, revision: this.state.revision + 1, actions: [
            { id: `${this.state.revision + 1}:solid-place:home1:8:7`, label: 'Place home1 at 8, 7',
              kind: 'kickoffMove', actor: 'home', sourcePlayerId: null, target: { x: 8, y: 7 } }
          ] };
          this.reply(request.requestId);
        } else if (request.type === 'setup' && request.operation === 'action' && request.actionId.includes(':solid-place:')) {
          this.state = { ...this.state, revision: this.state.revision + 1, actions: [],
            players: this.state.players.map(player => player.id === 'home1' ? { ...player, x: 8, y: 7 } : player) };
          this.reply(request.requestId);
        }
      }
      close() { this.readyState = 3; this.onclose?.(); }
    };
  }, initial);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${frame.matchId}`);
  await page.locator('.live-pitch-scene').waitFor();
  return { page, errors };
}
try {
  const { page, errors } = await open(setup);
  const scene = page.locator('.live-pitch-scene');
  const sent = () => page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'setup' && request.operation === 'place'));
  const reserveButton = page.getByRole('button', { name: 'Reserve, number 2, Reserves' });
  await page.locator('.live-dugout.home').getByRole('button', { name: /Reserves.*1/ }).click();
  await reserveButton.dragTo(scene, { targetPosition: await squarePosition(page, 8, 7) });
  await page.waitForFunction(() => window.testSocket.state.revision === 1);
  assert.deepEqual((await sent())[0].to, { x: 8, y: 7 });
  const home = page.locator('.live-marker.home').first();
  await home.dragTo(scene, { targetPosition: await squarePosition(page, 9, 7) });
  await page.waitForFunction(() => window.testSocket.state.revision === 2);
  assert.deepEqual((await sent())[1].to, { x: 9, y: 7 });
  await home.dragTo(scene, { targetPosition: await squarePosition(page, 8, 7) });
  assert.equal((await sent()).length, 2, 'occupied setup drop must not mutate');
  await home.dragTo(page.locator('.live-dugout.home .live-dugout-zone').first());
  await page.waitForFunction(() => window.testSocket.state.revision === 3);
  assert.equal((await sent())[2].to, null);
  assert.deepEqual(errors, []);
  await page.close();

  const keyboard = await open(setup);
  await keyboard.page.getByText('Place players with keyboard or touch', { exact: true }).focus();
  await keyboard.page.keyboard.press('Enter');
  const selected = keyboard.page.getByLabel('Setup player');
  await selected.focus(); await selected.press('End');
  assert.equal(await selected.inputValue(), 'reserve');
  const coordinate = async (label, value) => {
    const input = keyboard.page.getByLabel(label);
    await input.focus(); await input.press('ControlOrMeta+A'); await input.pressSequentially(value);
  };
  await coordinate('Setup X', '8'); await coordinate('Setup Y', '7');
  await keyboard.page.getByRole('button', { name: 'Place on empty own-half square' }).focus();
  await keyboard.page.keyboard.press('Enter');
  await keyboard.page.waitForFunction(() => window.testSocket.state.revision === 1);
  assert.deepEqual(await keyboard.page.evaluate(() => window.testSocket.sent.filter(request => request.operation === 'place').map(request => request.to)), [{ x: 8, y: 7 }]);
  await keyboard.page.getByRole('button', { name: 'Return selected player to reserve' }).focus();
  await keyboard.page.keyboard.press('Enter');
  await keyboard.page.waitForFunction(() => window.testSocket.state.revision === 2);
  await coordinate('Setup X', '20');
  assert.equal(await keyboard.page.getByRole('button', { name: 'Place on empty own-half square' }).isDisabled(), true);
  assert.equal(await keyboard.page.evaluate(() => window.testSocket.sent.filter(request => request.operation === 'place').length), 2);
  assert.deepEqual(keyboard.errors, []);
  await keyboard.page.close();

  const choices = await open({ ...frame, actions: [
    { id: '0:choose-die', label: 'Choose SKULL (die 1)', kind: 'blockDie', actor: 'home', sourcePlayerId: 'home1', target: null },
    { id: '0:reroll', label: 'Use team reroll', kind: 'reroll', actor: 'home', sourcePlayerId: 'home1', target: null }
  ] });
  await choices.page.setViewportSize({ width: 375, height: 660 });
  const popup = choices.page.getByRole('dialog', { name: 'Choose a block die' });
  await popup.waitFor();
  await choices.page.waitForFunction(() => {
    const box = document.querySelector('.live-dice-overlay.interactive').getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
  });
  const dieButton = popup.getByRole('button', { name: 'Choose SKULL (die 1)' });
  await dieButton.focus(); await dieButton.press('Enter');
  assert.equal(await choices.page.evaluate(() => window.testSocket.sent.filter(request => request.actionId === '0:choose-die').length), 1);
  assert.deepEqual(choices.errors, []);
  await choices.page.close();

  const event = await open(solid);
  const eventScene = event.page.locator('.live-pitch-scene');
  await event.page.locator('.live-marker.home').dragTo(eventScene, { targetPosition: await squarePosition(event.page, 8, 7) });
  await event.page.waitForFunction(() => window.testSocket.sent.filter(request => request.type === 'setup' && request.operation === 'action').length === 2);
  assert.deepEqual(await event.page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'setup' && request.operation === 'action').map(request => request.actionId)),
    ['0:event-pick:home1', '1:solid-place:home1:8:7']);
  assert.deepEqual(event.errors, []);
  await event.page.close();
  console.log('PASS: setup drag and keyboard placement obey legality; narrow mandatory choices stay reachable; Solid Defence uses offered actions.');
} finally {
  await browser.close();
  await server.close();
}
