import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';
import { assertNoMovementMarkings } from './movement-markings-helper.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/movement-interaction-projections.json', import.meta.url), 'utf8'));
const evidence = process.env.MOVEMENT_RANGE_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });

async function open(role, distant = false, hold = false) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>' }));
  await page.addInitScript(({ fixture, role, distant, hold }) => {
    const ready = distant ? fixture.distantMoveReadyState : fixture.readyState;
    const plan = (distant ? fixture.distantMovePlan : fixture.movePlan).plan;
    const accepted = distant ? fixture.distantMoveAcceptedState : fixture.moveAcceptedState;
    const snapshot = state => {
      const value = { ...state, callerRole: 'home', actions: [], prompt: null };
      delete value.movementForecast; delete value.passing; return value;
    };
    window.rangeFrames = [];
    window.WebSocket = class {
      static OPEN = 1; readyState = 1; sent = []; ranges = []; hold = hold;
      state = { ...ready, callerRole: role };
      records = Array.from({ length: ready.revision + 1 }, (_, revision) => ({
        index: revision, revision, kind: revision ? 'ACTION' : 'START', actor: revision ? ready.actor : 'system',
        at: revision, decision: revision ? {} : null, native: [], state: snapshot({ ...ready, revision }) }));
      constructor() { window.rangeSocket = this; queueMicrotask(() => this.onopen?.()); }
      emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
      range(request, override) {
        const player = this.state.players.find(player => player.id === request.playerId);
        const found = Object.values(fixture).find(value => value?.type === 'movementRange'
          && value.range.playerId === request.playerId && value.range.revision === request.expectedRevision
          && value.range.from.x === player.x && value.range.from.y === player.y);
        const range = override ?? found?.range ?? { rangeVersion: 2, playerId: player.id,
          from: { x: player.x, y: player.y }, remaining: 0, normalRemaining: 0, normal: [], full: [], revision: request.expectedRevision };
        this.emit({ version: 2, type: 'movementRange', code: 'ACCEPTED', requestId: request.requestId,
          matchId: request.matchId, range });
      }
      send(raw) {
        const request = JSON.parse(raw); this.sent.push(request);
        if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication',
          requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
        if (request.type === 'matchChat') queueMicrotask(() => this.emit({ version: 2, type: 'error',
          requestId: request.requestId, code: 'CHAT_UNAVAILABLE' }));
        if (request.type === 'matchTranscript') {
          const records = this.records.slice(request.from, request.from + request.limit);
          queueMicrotask(() => this.emit({ version: 2, type: 'matchTranscript', code: 'ACCEPTED',
            requestId: request.requestId, matchId: this.state.matchId, page: { formatVersion: 2,
              from: request.from, next: request.from + records.length, total: this.records.length, records } }));
        }
        if (request.type === 'movementRange') {
          this.ranges.push(request); if (!this.hold) queueMicrotask(() => this.range(request));
        }
        if (request.type === 'movementPreview') queueMicrotask(() => this.emit({ version: 2, type: 'movementPreview',
          code: 'ACCEPTED', requestId: request.requestId, matchId: this.state.matchId,
          plan: { ...plan, waypoints: request.waypoints, route: { ...plan.route, revision: this.state.revision } } }));
        if (request.type === 'setup') {
          if (request.operation === 'movement') {
            this.state = { ...accepted, callerRole: role };
            const revision = this.state.revision;
            this.records.push({ index: revision, revision, kind: 'ACTION', actor: ready.actor, at: revision,
              decision: {}, state: snapshot(this.state), native: [{ commandNr: revision + 1,
                modelChangeList: { modelChangeArray: plan.route.steps.map(square => ({
                  modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: plan.route.playerId,
                  modelChangeValue: { x: square.x, y: square.y } })) } }] });
          }
          queueMicrotask(() => this.emit({ version: 2, type: 'setupState', requestId: request.requestId,
            code: 'ACCEPTED', duplicate: false, state: this.state }));
        }
      }
      close() { this.readyState = 3; this.onclose?.(); }
    };
  }, { fixture, role, distant, hold });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${fixture.readyState.matchId}`);
  await page.getByLabel('Live match pitch').waitFor();
  return { page, errors };
}
const select = (page, id) => page.locator(`.live-marker[data-player-id="${id}"]`).click();
const ranges = page => page.evaluate(() => window.rangeSocket.ranges.length);
const mutations = page => page.evaluate(() => window.rangeSocket.sent.filter(request => request.type === 'setup' && request.operation !== 'load'));
const waitRange = (page, id, revision) => page.waitForFunction(({ id, revision }) => {
  const range = document.querySelector('.live-movement-range');
  return range?.dataset.rangePlayer === id && Number(range.dataset.rangeRevision) === revision;
}, { id, revision });

try {
  for (const role of ['home', 'away']) {
    const { page, errors } = await open(role);
    // Select the other coach's player first, then clear it before independent inspection.
    for (const id of role === fixture.meta.role ? [fixture.meta.opponentId, fixture.meta.playerId]
      : [fixture.meta.playerId, fixture.meta.opponentId]) {
      await select(page, id); await waitRange(page, id, fixture.readyState.revision);
      await page.getByRole('button', { name: 'Debug', exact: true }).click();
      for (const projection of ['Top-down view', 'Perspective view']) {
        await page.getByRole('button', { name: projection, exact: true }).click();
        assert.ok(await page.locator('.live-range-normal').count() > 0);
        assert.ok(await page.locator('.live-range-full').count() > 0);
        assert.ok(await page.locator('[data-rush-warning]').count() > 0);
        const styles = await page.evaluate(() => {
          const normal = getComputedStyle(document.querySelector('.live-range-normal'));
          const full = getComputedStyle(document.querySelector('.live-range-full'));
          return [normal.stroke, normal.strokeDasharray, normal.strokeWidth, normal.strokeOpacity,
            full.stroke, full.strokeDasharray, full.strokeWidth, full.strokeOpacity];
        });
        assert.deepEqual(styles, ['rgb(54, 221, 255)', 'none', '2.25px', '0.75',
          'rgb(255, 225, 123)', 'none', '2.25px', '0.75']);
        const warning = await page.locator('[data-rush-warning]').first().evaluate(element => {
          const triangle = element.querySelector('.live-range-warning-triangle'), mark = element.querySelector('.live-range-warning-mark');
          const [x, y] = element.dataset.rushWarning.split(',');
          const cell = document.querySelector(`[data-cell-x="${x}"][data-cell-y="${y}"]`).getBBox();
          const bounds = triangle.getBBox(), outline = getComputedStyle(triangle), text = getComputedStyle(mark);
          return { fill: outline.fill, stroke: outline.stroke, mark: text.fill, strokeWidth: outline.strokeWidth,
            width: bounds.width / cell.width, height: bounds.height / cell.height };
        });
        assert.equal(warning.fill, 'none');
        assert.equal(warning.stroke, warning.mark, 'The exclamation mark matches the outline');
        assert.equal(warning.strokeWidth, '1px');
        assert.ok(warning.width < .25 && warning.height < .25, 'The smaller warning fits in one fifth of a square');
        // The fixture's coin toss can make either team active; choose a notch by team.
        const selectedRole = fixture.readyState.players.find(player => player.id === id).role;
        const obstacle = fixture.readyState.players.find(player => player.role === selectedRole
          && player.number === (selectedRole === 'home' ? 2 : 8));
        assert.ok(obstacle && obstacle.offPitch === 'pitch');
        const obstacleEdges = await page.evaluate(({ x, y }) => {
          const polygon = document.querySelector(`[data-cell-x="${x}"][data-cell-y="${y}"]`);
          const corners = Array.from(polygon.points, point => ({ x: point.x, y: point.y }));
          const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < .001;
          return [...document.querySelectorAll('.live-range-normal, .live-range-full')].filter(path => {
            const from = path.getPointAtLength(0), to = path.getPointAtLength(path.getTotalLength());
            return corners.some((a, index) => {
              const b = corners[(index + 1) % corners.length];
              return (same(from, a) && same(to, b)) || (same(from, b) && same(to, a));
            });
          }).length;
        }, { x: obstacle.x, y: obstacle.y });
        assert.equal(obstacleEdges, 0, 'An occupied interior/boundary notch has no player-shaped outline');
        await assertNoMovementMarkings(page);
        assert.equal(await page.locator('.live-movement-range').evaluate(element => getComputedStyle(element).pointerEvents), 'none');
        if (evidence) {
          await page.getByRole('button', { name: 'Debug', exact: true }).click();
          await page.screenshot({ path: resolve(evidence, `${role}-${id === fixture.meta.playerId ? 'active' : 'inactive'}-${projection.startsWith('Top') ? 'top' : 'perspective'}.png`) });
          await page.getByRole('button', { name: 'Debug', exact: true }).click();
        }
      }
      await page.getByRole('button', { name: 'Debug', exact: true }).click();
      assert.deepEqual(await mutations(page), []);
      await page.locator('.live-pitch-viewport').focus();
      await page.keyboard.press('Escape');
      await page.locator('.live-movement-range').waitFor({ state: 'detached' });
    }
    assert.deepEqual(errors, []); await page.close();
  }

  // Superseded responses arrive after a new selection and after a disconnect.
  const stale = await open(fixture.meta.role, false, true);
  await select(stale.page, fixture.meta.opponentId);
  await stale.page.waitForFunction(() => window.rangeSocket.ranges.length === 1);
  await select(stale.page, fixture.meta.playerId);
  await stale.page.waitForFunction(() => window.rangeSocket.ranges.length === 2);
  await stale.page.evaluate(() => window.rangeSocket.range(window.rangeSocket.ranges[1]));
  await waitRange(stale.page, fixture.meta.playerId, fixture.readyState.revision);
  await stale.page.evaluate(() => window.rangeSocket.range(window.rangeSocket.ranges[0]));
  await waitRange(stale.page, fixture.meta.playerId, fixture.readyState.revision);
  await stale.page.locator('.live-pitch-viewport').focus(); await stale.page.keyboard.press('Escape');
  await select(stale.page, fixture.meta.opponentId);
  await stale.page.waitForFunction(() => window.rangeSocket.ranges.length === 3);
  await select(stale.page, fixture.meta.playerId);
  await stale.page.waitForFunction(() => window.rangeSocket.ranges.length === 4);
  await stale.page.evaluate(() => {
    window.rangeSocket.range(window.rangeSocket.ranges[3]);
    window.rangeSocket.emit({ version: 2, type: 'error', requestId: window.rangeSocket.ranges[2].requestId, code: 'STALE_REVISION' });
  });
  await waitRange(stale.page, fixture.meta.playerId, fixture.readyState.revision);
  assert.equal(await stale.page.getByRole('alert').count(), 0, 'A superseded range error does not interrupt the new selection');
  await stale.page.evaluate(() => window.rangeSocket.close());
  await stale.page.locator('.live-movement-range').waitFor({ state: 'detached' });
  assert.deepEqual(stale.errors, []); await stale.page.close();

  for (const distant of [false, true]) {
    const plan = (distant ? fixture.distantMovePlan : fixture.movePlan).plan;
    const accepted = distant ? fixture.distantMoveAcceptedState : fixture.moveAcceptedState;
    const after = (distant ? fixture.postDistantMoveRange : fixture.postMoveRange).range;
    const journey = await open(plan.route.actor, distant);
    await select(journey.page, plan.route.playerId);
    await journey.page.waitForFunction(() => window.rangeSocket.ranges.length === 1);
    const before = await ranges(journey.page);
    const endpoint = plan.waypoints.at(-1);
    await journey.page.locator('.live-pitch-scene').click({ position: await squarePosition(journey.page, endpoint.x, endpoint.y) });
    const confirmed = journey.page.getByRole('button', { name: 'Confirmed!', exact: true });
    await confirmed.waitFor(); await journey.page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
    assert.equal(await ranges(journey.page), before, 'Drafting a route does not request a range');
    await journey.page.evaluate(id => {
      const observer = new MutationObserver(() => {
        const marker = document.querySelector(`.live-marker[data-player-id="${id}"]`);
        window.rangeFrames.push({ x: Number(marker.dataset.x), y: Number(marker.dataset.y), requests: window.rangeSocket.ranges.length });
      });
      observer.observe(document.querySelector('.live-pitch-scene'), { subtree: true, attributes: true });
    }, plan.route.playerId);
    await confirmed.click();
    await journey.page.waitForFunction(revision => window.rangeSocket.ranges.some(request => request.expectedRevision === revision), accepted.revision);
    assert.equal(await ranges(journey.page), before + 1, 'Exactly one refresh at the settled committed endpoint');
    const intermediate = await journey.page.evaluate(({ from, endpoint }) => window.rangeFrames.filter(frame =>
      (frame.x !== from.x || frame.y !== from.y) && (frame.x !== endpoint.x || frame.y !== endpoint.y)), { from: plan.route.from, endpoint });
    if (plan.route.steps.length > 1) assert.ok(intermediate.length > 0, 'Multi-square playback visited intermediate positions');
    assert.ok(intermediate.every(frame => frame.requests === before), 'No range requests at intermediate playback squares');
    if (after.full.length) {
      await waitRange(journey.page, plan.route.playerId, accepted.revision);
      assert.equal(await journey.page.locator('.live-movement-range').getAttribute('data-range-from'), `${after.from.x},${after.from.y}`);
    } else await journey.page.locator('.live-movement-range').waitFor({ state: 'detached' });
    assert.equal((await mutations(journey.page)).length, 1, 'Single confirmation retains one movement mutation');
    assert.deepEqual(journey.errors, []); await journey.page.close();
  }
  console.log('Movement range UI passed: both coaches/projections, native sets, stale reads and settled route refresh.');
} finally { await browser.close(); await server.close(); }
