import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { squarePosition } from './projected-pitch-helper.mjs';
import { assertNoMovementMarkings } from './movement-markings-helper.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/movement-interaction-projections.json', import.meta.url), 'utf8'));
const evidence = process.env.MOVEMENT_FLOW_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });

async function openJourney(readyState, plan, acceptedState) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>' }));
  await page.addInitScript(({ fixture, readyState, plan, acceptedState }) => {
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      state = readyState;
      sent = [];
      constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
      emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
      send(raw) {
        const request = JSON.parse(raw); this.sent.push(request);
        if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication',
          requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
        if (request.type === 'matchTranscript' || request.type === 'matchChat') queueMicrotask(() => this.emit({
          version: 2, type: 'error', requestId: request.requestId, code: 'TRANSCRIPT_UNAVAILABLE' }));
        if (request.type === 'movementPreview') {
          const full = plan.route.steps;
          const last = request.waypoints.at(-1);
          const end = last ? full.findIndex(step => step.x === last.x && step.y === last.y) : full.length - 1;
          const steps = last ? full.slice(0, end + 1) : full;
          if (last && end < 0) queueMicrotask(() => this.emit({ version: 2, type: 'error', requestId: request.requestId, code: 'NO_ROUTE' }));
          else queueMicrotask(() => this.emit({ version: 2, type: 'movementPreview', requestId: request.requestId,
            code: 'ACCEPTED', matchId: this.state.matchId, plan: { ...plan,
              waypoints: request.waypoints.length ? request.waypoints : plan.waypoints,
              route: { ...plan.route, steps, revision: this.state.revision } } }));
        }
        if (request.type === 'movementRange') {
          const exported = [fixture.ownRange.range, fixture.opponentRange.range]
            .find(range => range.playerId === request.playerId);
          const player = this.state.players.find(player => player.id === request.playerId);
          const range = exported && exported.from.x === player.x && exported.from.y === player.y ? exported
            : { rangeVersion: 2, playerId: player.id, from: { x: player.x, y: player.y },
              remaining: 0, normalRemaining: 0, normal: [], full: [] };
          queueMicrotask(() => this.emit({ version: 2, type: 'movementRange', requestId: request.requestId,
            code: 'ACCEPTED', matchId: this.state.matchId, range: { ...range, revision: this.state.revision } }));
        }
        if (request.type === 'setup') {
          if (request.operation === 'movement') this.state = acceptedState;
          queueMicrotask(() => this.emit({ version: 2, type: 'setupState', requestId: request.requestId,
            code: 'ACCEPTED', duplicate: false, state: this.state }));
        }
      }
      close() { this.readyState = 3; this.onclose?.(); }
    };
  }, { fixture, readyState, plan, acceptedState });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${readyState.matchId}`);
  await page.getByLabel('Live match pitch').waitFor();
  return { page, errors, confirmed: page.getByRole('button', { name: 'Confirmed!', exact: true }) };
}

const mutations = page => page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'setup' && request.operation !== 'load'));
const select = (page, id) => page.locator(`.live-marker[data-player-id="${id}"]`).click();
const clickSquare = async (page, square, button = 'left') => page.locator('.live-pitch-scene').click({
  position: await squarePosition(page, square.x, square.y), button });

try {
  for (const role of ['home', 'away']) {
    const state = { ...fixture.readyState, callerRole: role };
    const selection = await openJourney(state, fixture.movePlan.plan, fixture.moveAcceptedState);
    for (const playerRole of [role === 'home' ? 'away' : 'home', role]) {
      const player = state.players.find(player => player.role === playerRole && player.x !== null && player.y !== null);
      await select(selection.page, player.id);
      await selection.page.waitForFunction(id => document.querySelector(`.live-selection-square[data-selection="${id}"]`), player.id);
      await assertNoMovementMarkings(selection.page);
      assert.ok(await selection.page.evaluate(id => window.testSocket.sent.some(request => request.type === 'movementRange'
        && request.playerId === id), player.id), 'Either coach requests a read-only range, including off-turn');
      assert.deepEqual(await mutations(selection.page), [], 'Selection does not activate a player');
    }
    assert.deepEqual(selection.errors, []);
    await selection.page.close();
  }
  const { page, errors, confirmed } = await openJourney(fixture.readyState, fixture.movePlan.plan, fixture.moveAcceptedState);
  await select(page, fixture.meta.opponentId);
  await page.waitForFunction(id => document.querySelector(`.live-selection-square[data-selection="${id}"]`), fixture.meta.opponentId);
  await assertNoMovementMarkings(page);
  await page.locator('.live-movement-range').waitFor();
  assert.ok(await page.evaluate(id => window.testSocket.sent.some(request => request.type === 'movementRange'
    && request.playerId === id), fixture.meta.opponentId), 'Opponent selection requests its range');
  assert.equal(await confirmed.isDisabled(), true, 'Opponent inspection cannot commit an action');
  assert.deepEqual(await mutations(page), []);
  await select(page, fixture.meta.opponentId);
  await select(page, fixture.meta.playerId);
  await assertNoMovementMarkings(page);
  await page.locator('.live-movement-range').waitFor();
  assert.ok(await page.evaluate(id => window.testSocket.sent.some(request => request.type === 'movementRange'
    && request.playerId === id), fixture.meta.playerId), 'Own selection requests its range');
  assert.equal(await page.getByRole('button', { name: 'Move', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await confirmed.isDisabled(), true, 'Player selection alone cannot activate');
  const end = fixture.movePlan.plan.waypoints.at(-1);
  await clickSquare(page, end);
  await page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  assert.deepEqual(await mutations(page), [], 'Waypoint selection remains read-only');
  await assertNoMovementMarkings(page);
  assert.equal(await page.locator('.live-route-waypoint circle').count(), 1);
  assert.equal(await page.locator('.live-route-waypoint text').count(), 0);
  if (evidence) await page.screenshot({ path: resolve(evidence, 'move-plan.png') });
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await page.getByLabel('Perspective angle', { exact: true }).selectOption('30');
  assert.equal(await confirmed.isEnabled(), true, 'Camera changes retain the reviewed plan');
  assert.equal(await page.getByLabel('Route squares', { exact: true }).locator('li').count(), fixture.movePlan.plan.route.steps.length);
  const endTurn = fixture.readyState.actions.find(action => action.kind === 'endTurn');
  await page.getByLabel('Server action', { exact: true }).selectOption(endTurn.id);
  assert.equal(await page.locator('.live-route-line').count(), 0, 'Choosing another server action cancels the pending movement');
  assert.deepEqual(await mutations(page), []);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  assert.equal(await confirmed.isDisabled(), true);
  await clickSquare(page, end);
  await page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  await clickSquare(page, end, 'right');
  await page.waitForFunction(() => document.querySelector('.commit-action').disabled);
  assert.equal(await page.locator('.live-route-waypoint circle').count(), 0);
  await clickSquare(page, end);
  await page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Space');
  await page.waitForFunction(revision => window.testSocket.state.revision === revision, fixture.moveAcceptedState.revision);
  const moved = await mutations(page);
  assert.deepEqual(moved.map(request => request.operation), ['movement']);
  assert.equal(moved[0].kind, 'move');
  assert.deepEqual(moved[0].waypoints, fixture.movePlan.plan.waypoints);
  assert.equal(await confirmed.isDisabled(), true, 'Accepted revision clears the proposal');
  const previewCount = await page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'movementPreview').length);
  await select(page, fixture.meta.opponentId);
  assert.equal(await page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'movementPreview').length), previewCount,
    'An ordinary committed Move cannot become Blitz');
  assert.deepEqual(errors, []); await page.close();

  const distant = await openJourney(fixture.distantMoveReadyState, fixture.distantMovePlan.plan, fixture.distantMoveAcceptedState);
  const distantPlan = fixture.distantMovePlan.plan;
  await select(distant.page, distantPlan.route.playerId);
  await clickSquare(distant.page, distantPlan.route.steps[1]);
  await distant.page.waitForFunction(() => document.querySelector('.commit-action') && !document.querySelector('.commit-action').disabled);
  await clickSquare(distant.page, distantPlan.waypoints.at(-1));
  await distant.page.waitForFunction(() => document.querySelectorAll('.live-route-waypoint').length === 2
    && !document.querySelector('.commit-action').disabled);
  assert.equal(await distant.page.getByLabel('Planned route', { exact: true }).locator('li').count(), distantPlan.route.steps.length);
  await clickSquare(distant.page, distantPlan.waypoints.at(-1), 'right');
  await distant.page.waitForFunction(() => document.querySelectorAll('.live-route-waypoint').length === 1
    && !document.querySelector('.commit-action').disabled);
  assert.equal(await distant.page.getByLabel('Planned route', { exact: true }).locator('li').count(), 2, 'Undo removes the last generated span');
  await distant.page.locator('.live-pitch-viewport').focus(); await distant.page.keyboard.press('Escape');
  assert.deepEqual(await mutations(distant.page), [], 'Clearing the route does not activate');
  assert.equal(await distant.confirmed.isDisabled(), true);
  await clickSquare(distant.page, distantPlan.waypoints.at(-1));
  await distant.page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  await distant.confirmed.dblclick();
  await distant.page.waitForFunction(revision => window.testSocket.state.revision === revision, fixture.distantMoveAcceptedState.revision);
  assert.equal((await mutations(distant.page)).length, 1, 'Repeated confirmation cannot submit another movement');
  assert.deepEqual((await mutations(distant.page))[0].waypoints, distantPlan.waypoints);
  assert.deepEqual(distant.errors, []); await distant.page.close();

  const blitz = await openJourney(fixture.blitzReadyState, fixture.blitzPlan.plan, fixture.blitzAcceptedState);
  await select(blitz.page, fixture.meta.blitzPlayerId);
  await select(blitz.page, fixture.meta.blitzTargetId);
  await blitz.page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  assert.equal(await blitz.page.locator('.live-selection-square').getAttribute('data-selection'), fixture.meta.blitzPlayerId);
  await assertNoMovementMarkings(blitz.page);
  assert.equal(await blitz.page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'movementRange'
    && request.playerId === window.testSocket.state.players.find(player => player.role !== window.testSocket.state.callerRole)?.id).length), 0);
  assert.deepEqual(await mutations(blitz.page), []);
  if (evidence) await blitz.page.screenshot({ path: resolve(evidence, 'blitz-plan.png') });
  await blitz.confirmed.click();
  await blitz.page.waitForFunction(revision => window.testSocket.state.revision === revision, fixture.blitzAcceptedState.revision);
  const attacks = await mutations(blitz.page);
  assert.equal(attacks.length, 1);
  assert.equal(attacks[0].operation, 'movement');
  assert.equal(attacks[0].kind, 'blitz');
  assert.equal(attacks[0].targetPlayerId, fixture.meta.blitzTargetId);
  await blitz.page.locator('.pitch-decision-overlay').waitFor();
  assert.deepEqual(blitz.errors, []); await blitz.page.close();

  const approachPlan = fixture.distantBlitzPlan.plan;
  const approach = await openJourney(fixture.distantBlitzReadyState, approachPlan, fixture.distantBlitzAcceptedState);
  await select(approach.page, approachPlan.route.playerId);
  await select(approach.page, approachPlan.targetPlayerId);
  await approach.page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  assert.equal(await approach.page.getByLabel('Planned route', { exact: true }).locator('li').count(), approachPlan.route.steps.length);
  assert.deepEqual(await mutations(approach.page), []);
  await assertNoMovementMarkings(approach.page);
  await approach.page.keyboard.press('Space');
  await approach.page.waitForFunction(revision => window.testSocket.state.revision === revision, fixture.distantBlitzAcceptedState.revision);
  assert.equal((await mutations(approach.page)).length, 1);
  assert.equal((await mutations(approach.page))[0].kind, 'blitz');
  assert.deepEqual((await mutations(approach.page))[0].waypoints, approachPlan.waypoints);
  assert.equal(fixture.distantBlitzAcceptedState.actions.some(action => action.kind === 'blockDie'), true,
    'The composite Blitz reaches the native block-die decision');
  if (fixture.distantBlitzAcceptedState.actor === fixture.distantBlitzAcceptedState.callerRole)
    await approach.page.locator('.pitch-decision-overlay').waitFor();
  else await approach.page.getByText('Waiting for the other participant.', { exact: true }).waitFor();
  assert.deepEqual(approach.errors, []); await approach.page.close();
  console.log('PASS: read-only own/opponent range selection, adjacent/distant Move and Blitz, waypoint-span undo, cancellation, Space and repeated-confirm guards; no movement risk grades or roll targets.');
} finally {
  await browser.close(); await server.close();
}
