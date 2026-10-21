import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { installInitialMovementPreview } from './initial-movement-preview-helper.mjs';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/hail-mary-workflow.json', import.meta.url), 'utf8'))
  .sort((a, b) => (a.weather === 'NICE' ? -1 : 0) - (b.weather === 'NICE' ? -1 : 0));
const evidence = process.env.HMP_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const journey of journeys.filter(journey => !process.env.HMP_TOUCH_ONLY || journey.role === 'away' && journey.weather === 'BLIZZARD')) {
    journey.frames = journey.frames.filter((frame, index, frames) => index === 0 || frame.actor.revision !== frames[index - 1].actor.revision);
    const coarse = journey.role === 'away' && journey.weather === 'BLIZZARD';
    const page = await browser.newPage(coarse ? { viewport: { width: 768, height: 900 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
      '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>' }));
    await page.addInitScript(installInitialMovementPreview);
    await page.addInitScript(journey => {
      window.WebSocket = class {
        static OPEN = 1; readyState = 1; index = Number(sessionStorage.getItem('hmp-index') ?? 0); state = journey.frames[this.index].actor; sent = []; rangeResponses = 0;
        constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
        emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
        send(raw) {
          const request = JSON.parse(raw);
          if (window.replyToInitialMovementPreview(request,this.state,value=>this.emit(value))) return;
          if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication', requestId: request.requestId,
            code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
          if (request.type === 'matchTranscript' || request.type === 'matchChat') queueMicrotask(() => this.emit({ version: 2, type: 'error', requestId: request.requestId, code: 'TRANSCRIPT_UNAVAILABLE' }));
          if (request.type === 'movementRange') {
            const player = this.state.players.find(player => player.id === request.playerId);
            const squares = this.state.actions.filter(action => action.kind === 'move' && action.sourcePlayerId === player.id)
              .map(action => ({ x: action.target.x, y: action.target.y }));
            queueMicrotask(() => { this.emit({ version: 2, type: 'movementRange', requestId: request.requestId,
              code: 'ACCEPTED', matchId: this.state.matchId, range: { rangeVersion: 2, playerId: player.id,
                from: { x: player.x, y: player.y }, remaining: 8, normalRemaining: 6,
                normal: squares, full: squares, revision: this.state.revision } });
              this.rangeResponses++; });
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
          if (request.type === 'setup' && request.operation !== 'load') {
            if (request.operation === 'action' && !this.state.actions.some(action => action.id === request.actionId)) throw Error('The browser submitted an action not offered by the native engine');
            this.sent.push(request); this.state = journey.frames[++this.index].actor; sessionStorage.setItem('hmp-index', String(this.index));
          }
          if (request.type === 'setup') queueMicrotask(() => this.emit({ version: 2, type: 'setupState', requestId: request.requestId,
            code: 'ACCEPTED', duplicate: false, state: this.state }));
        }
        close() { this.readyState = 3; this.onclose?.(); }
      };
    }, journey);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${journey.frames[0].actor.matchId}`);
    const pitch = page.getByLabel('Live match pitch');
    const confirm = page.getByRole('button', { name: 'Confirmed!', exact: true });
    const hmp = page.getByRole('button', { name: journey.bomb ? 'Hail Mary Bomb' : 'Hail Mary Pass', exact: true });
    const normal = page.getByRole('button', { name: journey.bomb ? 'Throw Bomb' : 'Pass', exact: true });
    const revision = async value => page.getByTestId('setup-status').filter({ hasText: `Revision ${value} ` }).waitFor({ state: 'attached', timeout: 5000 });
    const cell = (x, y) => pitch.locator(`[data-cell-x="${x}"][data-cell-y="${y}"]`);
    await squarePosition(page, 10, 7);
    await pitch.locator('[data-player-id="actor"]').click();
    await hmp.click();
    assert.equal(await hmp.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.evaluate(() => window.testSocket.sent), [], 'Draft mode selection cannot declare an action');
    await hmp.click();
    assert.equal(await normal.getAttribute('aria-pressed'), 'true', 'Clicking the companion again selects normal mode');
    await hmp.click(); await confirm.click(); await revision(1);
    assert.equal(await hmp.getAttribute('aria-pressed'), 'true');
    assert.equal(await hmp.isEnabled(), true, 'Reserved pass/bomb allowance must not prevent mode switching');
    assert.equal(await hmp.locator('[data-action-icon]').getAttribute('data-action-icon'), journey.bomb ? 'hailMaryBomb' : 'hailMaryPass');
    assert.equal(await hmp.evaluate(element => Math.round(element.getBoundingClientRect().width)), coarse ? 44 : 30);
    assert.equal(await cell(14, 7).getAttribute('data-pass-range'), 'B');
    assert.equal(await cell(25, 7).getAttribute('data-pass-range'), journey.weather === 'BLIZZARD' ? '-' : 'B');
    assert.match(await page.locator('.live-pass-legend').innerText(), /Hail Mary: Long Bomb difficulty; inaccurate at best/);
    if (evidence) await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.bomb ? 'bomb' : 'ball'}-${journey.weather}.png`) });
    let currentRevision = 1;
    if (!journey.bomb) {
      await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
      await pitch.locator('[data-player-id="actor"]').click();
      await page.getByRole('button', { name: 'Move', exact: true }).click();
      await page.locator('.live-pitch-scene').click({ position: await squarePosition(page, 11, 7) });
      await confirm.click(); await revision(++currentRevision);
      assert.equal(await hmp.getAttribute('aria-pressed'), 'true', 'Movement retains HMP mode');
      assert.equal(await cell(25, 7).getAttribute('data-pass-range'), journey.weather === 'BLIZZARD' ? '-' : 'B');
      await page.getByRole('button', { name: 'Move', exact: true }).click();
      await page.locator('.live-pitch-scene').click({ position: await squarePosition(page, 12, 7) });
      assert.equal(await page.locator('.live-route-waypoint').count(), 1);
    }
    await hmp.click(); await revision(++currentRevision);
    assert.equal(await page.evaluate(() => window.testSocket.state.activePlayerAction), journey.bomb ? 'throwBomb' : 'passMove');
    if (journey.bomb) assert.equal(await normal.getAttribute('aria-pressed'), 'true');
    assert.equal(await cell(25, 7).getAttribute('data-pass-range'), '-');
    if (!journey.bomb) {
      assert.equal(await page.locator('.live-route-waypoint').count(), 1, 'Normal mode retains the uncommitted movement route');
      await confirm.waitFor({ state: 'visible' });
      assert.equal(await confirm.isEnabled(), true, 'The retained route is reviewed against the new revision');
    }
    await hmp.click(); await revision(++currentRevision);
    assert.equal(await page.evaluate(() => window.testSocket.state.activePlayerAction), journey.bomb ? 'hailMaryBomb' : 'hailMaryPass');
    if (journey.bomb) assert.equal(await hmp.getAttribute('aria-pressed'), 'true');
    if (!journey.bomb) assert.equal(await page.locator('.live-route-waypoint').count(), 1, 'HMP mode retains the uncommitted movement route');
    // Reload is read-only and restores the authoritative mode and range overlay.
    await page.reload(); await revision(currentRevision);
    assert.equal(await hmp.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.testSocket.sent.length), 0);
    await pitch.locator('[data-player-id="actor"]').click();
    const targetX = journey.weather === 'BLIZZARD' ? 14 : 25;
    await page.locator('.live-pitch-scene').click({ position: await squarePosition(page, targetX, 7) });
    assert.equal(await confirm.isEnabled(), true);
    await confirm.click(); await revision(++currentRevision);
    const committed = await page.evaluate(() => window.testSocket.sent);
    assert.equal(committed.length, 1, 'Reload and target review must not issue an extra declaration');
    assert.equal(committed[0].operation, 'action');
    assert.ok(committed[0].actionId.endsWith(`:${journey.bomb ? 'bomb' : 'pass'}-${targetX}-7`), 'Confirm must submit the exact offered HMP target');
    assert.equal(await pitch.locator('[data-pass-range]').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
    const replay = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const prior = journey.frames.at(-2).actor, last = journey.frames.at(-1).actor;
    await replay.clock.install();
    await replay.addInitScript(input => { window.playbackInput = input; window.playbackFrames = []; },
      { view: prior, records: journey.records.filter(record => record.revision <= prior.revision), enabled: true, mode: 'replay' });
    await replay.route('**/hmp-playback', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
    await replay.goto(`http://127.0.0.1:${server.httpServer.address().port}/hmp-playback`);
    await replay.locator('#playback-state').waitFor({ state: 'attached' });
    await replay.evaluate(input => window.publishPlayback(input), { view: last, records: journey.records, enabled: true, mode: 'replay' });
    await replay.clock.runFor(100);
    assert.ok(await replay.locator('.live-dice-overlay .match-die').count() > 0, 'Native HMP dice render in replay');
    await replay.clock.runFor(3000);
    assert.equal(await replay.locator('#playback-state').getAttribute('data-revision'), String(last.revision));
    assert.equal(await replay.locator('#playback-state').getAttribute('data-active'), 'false');
    if (!journey.bomb) assert.equal(await replay.evaluate(() => window.playbackFrames.some(frame => frame.active)), true, 'HMP ball scattering animates during replay');
    await replay.close();
  }
  console.log('PASS: HMP ball/bomb controls, icons, mode switching, movement, Blizzard overlays and target commitment for both coaches.');
} finally { await browser.close(); await server.close(); }
