import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { squarePosition } from './projected-pitch-helper.mjs';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-pass-ranges.json', import.meta.url), 'utf8'))
  .sort((a, b) => (a.weather === 'NICE' ? -1 : 0) - (b.weather === 'NICE' ? -1 : 0));
const evidence = process.env.PASS_RANGE_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const journey of journeys) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>' }));
    await page.addInitScript(journey => {
      window.WebSocket = class {
        static OPEN = 1; readyState = 1; index = 0; state = journey.frames[0].actor; sent = [];
        constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
        emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
        send(raw) {
          const request = JSON.parse(raw);
          if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication', requestId: request.requestId,
            code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
          if (request.type === 'matchTranscript' || request.type === 'matchChat') queueMicrotask(() => this.emit({ version: 2, type: 'error', requestId: request.requestId, code: 'TRANSCRIPT_UNAVAILABLE' }));
          if (request.type === 'movementRange') {
            const player = this.state.players.find(player => player.id === request.playerId);
            const steps = this.state.actions.filter(action => action.kind === 'move' && action.sourcePlayerId === player.id)
              .map(action => ({ ...action.target, dodge: 0, rush: 0, dodgeModifier: 0, reactions: [], checks: [] }));
            queueMicrotask(() => this.emit({ version: 2, type: 'movementRange', requestId: request.requestId,
              code: 'ACCEPTED', matchId: this.state.matchId, range: { rangeVersion: 1, playerId: player.id,
                from: { x: player.x, y: player.y }, remaining: 8, steps, revision: this.state.revision } }));
          }
          if (request.type === 'routePreview' || request.type === 'movementPreview') {
            const player = this.state.players.find(player => player.id === (request.playerId ?? this.state.activePlayerId));
            const from = { x: player.x, y: player.y }; const steps = []; let cursor = from;
            for (const target of request.waypoints) while (cursor.x !== target.x || cursor.y !== target.y) {
              cursor = { x: cursor.x + Math.sign(target.x-cursor.x), y: cursor.y + Math.sign(target.y-cursor.y) };
              steps.push({ ...cursor, dodge: 0, rush: 0, ...(request.type === 'movementPreview' ? { dodgeModifier: 0, checks: [] } : {}), reactions: [] });
            }
            const route = { routeVersion: request.type === 'movementPreview' ? 3 : 1, playerId: player.id,
              from, remaining: 8, steps, revision: this.state.revision, actor: this.state.actor };
            queueMicrotask(() => this.emit({ version: 2, type: request.type, requestId: request.requestId,
              code: 'ACCEPTED', matchId: this.state.matchId, ...(request.type === 'movementPreview'
                ? { plan: { planVersion: 1, kind: 'move', targetPlayerId: null, waypoints: request.waypoints, route } }
                : { route }) }));
          }
          if (request.type === 'setup' && request.operation !== 'load') { this.sent.push(request); this.state = journey.frames[++this.index].actor; }
          if (request.type === 'setup') queueMicrotask(() => this.emit({ version: 2, type: 'setupState', requestId: request.requestId,
            code: 'ACCEPTED', duplicate: false, state: this.state }));
        }
        close() { this.readyState = 3; this.onclose?.(); }
      };
    }, journey);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${journey.frames[0].actor.matchId}`);
    const pitch = page.getByLabel('Live match pitch'), confirm = page.getByRole('button', { name: 'Confirmed!', exact: true });
    const cell = (x, y) => pitch.locator(`[data-cell-x="${x}"][data-cell-y="${y}"]`);
    await pitch.locator('[data-player-id="actor"]').click();
    assert.equal(await pitch.locator('[data-pass-range]').count(), 0);
    await page.getByRole('button', { name: 'Other action', exact: true }).click();
    await page.getByRole('button', { name: 'Pass', exact: true }).click(); await confirm.click();
    await page.getByTestId('setup-status').filter({ hasText: 'Revision 1 ' }).waitFor({ state: 'attached', timeout: 5000 });
    if (evidence && ['NICE', 'VERY_SUNNY', 'BLIZZARD'].includes(journey.weather)) await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.weather}.png`) });
    assert.equal(await cell(13, 7).getAttribute('data-pass-range'), 'Q');
    assert.equal(await cell(14, 7).getAttribute('data-pass-range'), 'S');
    assert.equal(await cell(17, 7).getAttribute('data-pass-range'), journey.weather === 'BLIZZARD' ? '-' : 'L');
    const normalColors = ['#43bc6580', '#eed24b80', '#ee8a3280', '#db3d4280'];
    const sunnyColors = ['#eed24b80', '#ee8a3280', '#db3d4280', '#7d192a99'];
    if (journey.weather !== 'BLIZZARD') for (const [index, x] of [13, 14, 17, 21].entries()) assert.equal(await cell(x, 7).getAttribute('fill'), (journey.weather === 'VERY_SUNNY' ? sunnyColors : normalColors)[index]);
    assert.equal(await pitch.locator('[data-pass-range]').count(), 390);
    const legend = page.locator('.live-pass-legend');
    assert.deepEqual(await legend.evaluate(element => ({ position: getComputedStyle(element).position,
      zIndex: getComputedStyle(element).zIndex, pointerEvents: getComputedStyle(element).pointerEvents })),
      { position: 'absolute', zIndex: '60', pointerEvents: 'none' }, 'The hosted legend is visible above the pitch without intercepting targets');
    const nativeMoves = journey.frames[1].actor.actions.filter(action => action.kind === 'move').length;
    await pitch.locator('.live-available-step').first().waitFor();
    assert.equal(await pitch.locator('.live-available-step').count(), nativeMoves, 'Every offered move has its native forecast over the pass ranges');
    assert.equal(await pitch.locator('.live-target-square').count(), 0, 'Confirmed movement forecasts replace generic target outlines');
    assert.equal(await pitch.locator('.live-available-step polygon').first().evaluate(element => getComputedStyle(element).stroke), 'none', 'Movement squares use a filled highlight during passing');
    assert.notEqual(await pitch.locator('.live-available-step polygon').first().evaluate(element => getComputedStyle(element).fill), 'none');
    const debug = page.getByRole('button', { name: 'Debug', exact: true });
    if (await debug.count()) await debug.click();
    for (const angle of [30, 50, 40]) {
      await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      assert.equal(await cell(14, 7).getAttribute('data-pass-range'), 'S');
      assert.notEqual(await cell(14, 7).getAttribute('points'), '');
    }
    await page.getByRole('button', { name: 'Top-down view', exact: true }).click();
    await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
    if (journey.weather === 'BLIZZARD') {
      await page.locator('.live-pitch-scene').click({ position: await squarePosition(page, 17, 7) });
      assert.equal(await page.evaluate(() => window.testSocket.state.actions.some(action => action.kind === 'pass' && action.target?.x === 17 && action.target?.y === 7)), false, 'Native weather-forbidden pass is never offered');
      await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
      assert.match(await page.locator('.live-pass-legend').innerText(), /weather.*Quick.*Short/);
    }
    if (journey.weather === 'VERY_SUNNY') assert.match(await page.locator('.live-pass-legend').innerText(), /weather \+1 passing penalty/);
    await pitch.locator('[data-player-id="mate"]').click();
    assert.match(await page.locator('.live-pass-target-detail').innerText(), /Short Pass/);
    assert.equal(await confirm.isEnabled(), true);
    await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
    await squarePosition(page, 10, 7);
    await pitch.locator('[data-player-id="actor"]').click();
    await page.locator('.live-pitch-scene').click({ position: await squarePosition(page, 11, 7) }); await confirm.click();
    await page.getByTestId('setup-status').filter({ hasText: 'Revision 2 ' }).waitFor({ state: 'attached', timeout: 5000 });
    assert.equal(await cell(17, 7).getAttribute('data-pass-range'), 'S');
    if (journey.weather === 'NICE') {
      assert.equal(await cell(14, 7).getAttribute('fill'), '#eed24b80', 'A native weather change refreshes colors with the accepted revision');
      assert.match(await page.locator('.live-pass-legend').innerText(), /weather \+1 passing penalty/);
    }
    await page.getByRole('button', { name: 'Other action', exact: true }).click();
    await page.getByRole('button', { name: 'End player action', exact: true }).click();
    await page.getByTestId('setup-status').filter({ hasText: 'Revision 3 ' }).waitFor({ state: 'attached', timeout: 5000 });
    assert.equal(await pitch.locator('[data-pass-range]').count(), 0);
    assert.equal(await page.locator('.live-pass-legend').count(), 0);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('PASS: native pass ranges, all weather states, colors, forbidden target, movement and completion render at both coach ends in every camera.');
} finally { await browser.close(); await server.close(); }
