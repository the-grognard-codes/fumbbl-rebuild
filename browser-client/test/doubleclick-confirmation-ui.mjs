import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';
import { installInitialMovementPreview } from './initial-movement-preview-helper.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/movement-interaction-projections.json', import.meta.url), 'utf8'));
const transfers = JSON.parse(readFileSync(new URL('./fixtures/planned-transfers.json', import.meta.url), 'utf8'));
const evidence = process.env.CONFIRMATION_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });

async function open(state = fixture.readyState, plan = fixture.movePlan.plan, touch = false) {
  const page = await browser.newPage({ viewport: touch ? { width: 1024, height: 768 } : { width: 1440, height: 900 },
    hasTouch: touch, isMobile: touch });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
    '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>' }));
  await page.addInitScript(installInitialMovementPreview);
  await page.addInitScript(({ state, plan }) => {
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      state = state;
      sent = [];
      previews = [];
      constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
      emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
      send(raw) {
        const request = JSON.parse(raw); this.sent.push(request);
        if (window.replyToInitialMovementPreview(request, this.state, value => this.emit(value))) return;
        let response;
        if (request.type === 'authenticate') response = { version: 2, type: 'authentication', requestId: request.requestId,
          code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };
        if (['matchTranscript', 'matchChat', 'movementRange'].includes(request.type)) response = {
          version: 2, type: 'error', requestId: request.requestId, code: 'TRANSCRIPT_UNAVAILABLE' };
        if (request.type === 'movementPreview') {
          const last = request.waypoints.at(-1);
          const end = last ? plan.route.steps.findIndex(step => step.x === last.x && step.y === last.y) : -1;
          response = { version: 2, type: 'movementPreview', requestId: request.requestId, code: 'ACCEPTED', matchId: state.matchId,
            plan: { ...plan, kind: request.kind, targetPlayerId: request.targetPlayerId, waypoints: request.waypoints,
              route: { ...plan.route, revision: this.state.revision, steps: last ? plan.route.steps.slice(0, end + 1) : plan.route.steps } } };
          if (window.holdPreviews) { this.previews.push(response); return; }
        }
        // Keep committed operations pending to expose accidental duplicate submissions.
        if (request.type === 'setup' && request.operation === 'load' || request.type === 'watch') response = {
          version: 2, type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: this.state };
        if (response) queueMicrotask(() => this.emit(response));
      }
      close() { this.readyState = 3; this.onclose?.(); }
    };
  }, { state, plan });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${state.matchId}${state.callerRole === 'spectator' ? '&watch=1' : ''}`);
  await page.getByLabel('Live match pitch').waitFor();
  return { page, errors, close: async () => { assert.deepEqual(errors, []); await page.close(); } };
}

const mutations = page => page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'setup' && request.operation !== 'load'));
const ready = page => page.waitForFunction(() => {
  const button = document.querySelector('.commit-action');
  return button && !button.disabled;
});
const marker = (page, id) => page.locator(`.live-marker[data-player-id="${id}"]`);
const square = async (page, point, options = {}) => page.locator('.live-pitch-scene').click({ position: await squarePosition(page, point.x, point.y), ...options });
const tapSquare = async (page, point) => {
  const position = await squarePosition(page, point.x, point.y);
  const box = await page.locator('.live-pitch-scene').boundingBox();
  await page.touchscreen.tap(box.x + position.x, box.y + position.y);
};
const end = fixture.movePlan.plan.waypoints.at(-1);

try {
  for (const touch of [false, true]) {
    const run = await open(undefined, undefined, touch);
    const { page } = run;
    await marker(page, fixture.meta.playerId)[touch ? 'tap' : 'click']();
    const click = () => touch ? tapSquare(page, end) : square(page, end);
    await click(); await ready(page);
    const previewCount = await page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'movementPreview').length);
    await click();
    assert.equal((await mutations(page)).length, 0, 'Selecting the endpoint plus one repeat never confirms');
    assert.equal(await page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'movementPreview').length), previewCount,
      'A repeated endpoint leaves the reviewed preview intact');
    await click();
    await page.waitForFunction(() => window.testSocket.sent.some(request => request.operation === 'movement'));
    await click(); await click();
    assert.equal((await mutations(page)).length, 1, 'Mouse/touch confirms exactly once, including further clicks while pending');
    assert.equal((await mutations(page))[0].kind, 'move');
    await run.close();
  }

  // Native adjacent Block, planned Blitz/Foul, and both planned transfers share the gesture.
  const blockSource = fixture.readyState.players.find(player => player.role === 'home' && player.x === 12 && player.y === 6);
  const blockTarget = fixture.readyState.players.find(player => player.role === 'away' && player.x === 13 && player.y === 6);
  const foulState = structuredClone(fixture.blitzReadyState);
  foulState.players.find(player => player.id === fixture.meta.blitzTargetId).state = 'Prone';
  const declaration = foulState.actions.find(action => action.sourcePlayerId === fixture.meta.blitzPlayerId && action.kind === 'blitz');
  foulState.actions.push({ ...declaration, id: `${declaration.id}-foul`, kind: 'declareFoul', label: 'Foul' });
  const cases = [
    { kind: 'block', state: fixture.readyState, plan: fixture.movePlan.plan, source: blockSource.id, target: blockTarget.id },
    { kind: 'blitz', state: fixture.blitzReadyState, plan: fixture.blitzPlan.plan, source: fixture.meta.blitzPlayerId, target: fixture.meta.blitzTargetId, menu: 'Blitz' },
    { kind: 'foul', state: foulState, plan: { ...fixture.blitzPlan.plan, kind: 'foul' }, source: fixture.meta.blitzPlayerId, target: fixture.meta.blitzTargetId },
    ...transfers.filter(journey => !journey.moving).map(journey => ({ kind: journey.kind, state: journey.ready,
      plan: journey.plan, source: journey.sourceId, target: journey.targetId })),
  ];
  const rapid = await open();
  await marker(rapid.page, blockSource.id).click();
  await marker(rapid.page, blockTarget.id).click({ clickCount: 3, delay: 25 });
  assert.equal((await mutations(rapid.page)).length, 1, 'Three rapid clicks select and confirm a ready native block');
  await rapid.close();
  for (const item of cases) {
    for (const touch of [false, true]) {
      console.log(`Confirming and cancelling ${item.kind} with ${touch ? 'touch' : 'mouse'}`);
      const run = await open(item.state, item.plan, touch);
      const { page } = run;
      const select = id => marker(page, id)[touch ? 'tap' : 'click']();
      await select(item.source);
      if (item.menu) await page.getByRole('button', { name: item.menu, exact: true })[touch ? 'tap' : 'click']();
      await select(item.target); await ready(page);
      if (touch) {
        await page.getByRole('button', { name: 'Cancel plan', exact: true }).tap();
        assert.equal((await mutations(page)).length, 0);
        assert.equal(await page.locator('.commit-action').isDisabled(), true);
        assert.equal(await page.locator('.live-route-line, .live-target-line').count(), 0, 'Cancel clears the entire plan');
        await select(item.source);
        if (item.menu) await page.getByRole('button', { name: item.menu, exact: true }).tap();
        await select(item.target); await ready(page);
      } else assert.equal(await page.getByRole('button', { name: 'Cancel plan', exact: true }).count(), 0);
      await select(item.target);
      assert.equal((await mutations(page)).length, 0, 'The first repeat leaves the selected target intact');
      await select(item.target);
      await page.waitForFunction(() => window.testSocket.sent.some(request => request.type === 'setup' && request.operation !== 'load'));
      const sent = await mutations(page);
      assert.equal(sent.length, 1);
      if (item.kind === 'block') assert.equal(sent[0].operation, 'action');
      else { assert.equal(sent[0].kind, item.kind); assert.equal(sent[0].targetPlayerId, item.target); }
      await run.close();
    }
  }

  const delayed = await open();
  await delayed.page.evaluate(() => { window.holdPreviews = true; });
  await marker(delayed.page, fixture.meta.playerId).click();
  await square(delayed.page, end, { clickCount: 3 });
  assert.equal((await mutations(delayed.page)).length, 0, 'Three clicks before readiness never execute');
  await delayed.page.evaluate(() => { window.holdPreviews = false; for (const reply of window.testSocket.previews) window.testSocket.emit(reply); });
  await ready(delayed.page);
  assert.equal((await mutations(delayed.page)).length, 0, 'Receiving a preview never executes a queued gesture');
  await square(delayed.page, end);
  assert.equal((await mutations(delayed.page)).length, 0, 'Readiness requires a fresh pair');
  await square(delayed.page, end);
  assert.equal((await mutations(delayed.page)).length, 1);
  await delayed.close();

  const revised = await open();
  await marker(revised.page, fixture.meta.playerId).click();
  await square(revised.page, end); await ready(revised.page);
  await square(revised.page, end);
  await revised.page.evaluate(() => {
    window.testSocket.state = { ...window.testSocket.state, revision: window.testSocket.state.revision + 1 };
    window.testSocket.emit({ version: 2, type: 'setupState', requestId: null, code: 'ACCEPTED', duplicate: false, state: window.testSocket.state });
  });
  await revised.page.waitForFunction(() => document.querySelector('.commit-action')?.disabled);
  await square(revised.page, end); await ready(revised.page);
  await square(revised.page, end);
  assert.equal((await mutations(revised.page)).length, 0, 'A new revision discards the previous confirmation click');
  await revised.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await square(revised.page, end);
  assert.equal((await mutations(revised.page)).length, 0, 'Window blur interrupts the pair');
  await revised.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await square(revised.page, end);
  assert.equal((await mutations(revised.page)).length, 0, 'Changing visibility interrupts the pair');
  await square(revised.page, end);
  assert.equal((await mutations(revised.page)).length, 1);
  await revised.close();

  const nativePass = JSON.parse(readFileSync(new URL('./fixtures/adr0003-pass-workflow.json', import.meta.url), 'utf8'))
    .find(journey => journey.mode === 'stationary').frames.at(-2).actor;
  const changedPass = await open(nativePass);
  await marker(changedPass.page, 'actor').click();
  await marker(changedPass.page, 'mate').click(); await ready(changedPass.page);
  const emptyPass = nativePass.actions.find(action => action.kind === 'pass' && !nativePass.players.some(player =>
    player.x === action.target.x && player.y === action.target.y));
  await changedPass.page.getByRole('button', { name: 'Debug', exact: true }).click();
  await changedPass.page.getByLabel('Server action', { exact: true }).selectOption(emptyPass.id);
  await changedPass.page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  await marker(changedPass.page, 'mate').dblclick();
  assert.equal((await mutations(changedPass.page)).length, 0, 'An old teammate selection cannot confirm a newly offered empty-square pass');
  await changedPass.close();

  const hailMaryState = JSON.parse(readFileSync(new URL('./fixtures/hail-mary-workflow.json', import.meta.url), 'utf8'))
    .find(journey => !journey.bomb && journey.weather === 'NICE').frames[1].actor;
  const hailMary = await open(hailMaryState);
  await marker(hailMary.page, hailMaryState.activePlayerId).click();
  const emptyTarget = hailMaryState.actions.find(action => action.kind === 'pass' && !hailMaryState.players.some(player =>
    player.x === action.target.x && player.y === action.target.y)).target;
  await square(hailMary.page, emptyTarget, { clickCount: 3 });
  assert.equal((await mutations(hailMary.page)).length, 0, 'Empty-square Hail Mary passes remain outside doubleclick confirmation');
  await hailMary.close();

  const hybrid = await open(undefined, undefined, true);
  await marker(hybrid.page, fixture.meta.playerId).tap();
  await tapSquare(hybrid.page, end); await ready(hybrid.page);
  const cancel = hybrid.page.getByRole('button', { name: 'Cancel plan', exact: true });
  assert.equal(await cancel.isVisible(), true);
  if (evidence) await hybrid.page.screenshot({ path: `${evidence}/touch-cancel.png` });
  await tapSquare(hybrid.page, end);
  await hybrid.page.mouse.move(10, 10);
  await square(hybrid.page, end);
  assert.equal(await cancel.count(), 0, 'Mouse input hides Cancel on a hybrid device');
  assert.equal((await mutations(hybrid.page)).length, 0, 'A touch click and mouse click do not form a pair');
  await tapSquare(hybrid.page, end);
  assert.equal(await cancel.isVisible(), true);
  assert.equal((await mutations(hybrid.page)).length, 0);
  await hybrid.page.locator('.live-pitch-viewport').dispatchEvent('wheel', { deltaY: 1 });
  await cancel.waitFor({ state: 'detached' });
  assert.equal(await cancel.count(), 0, 'Trackpad/wheel input hides Cancel');
  await tapSquare(hybrid.page, end);
  assert.equal(await cancel.isVisible(), true);
  await cancel.tap();
  assert.equal(await hybrid.page.locator('.commit-action').isDisabled(), true);
  assert.equal(await hybrid.page.locator('.live-route-line, .live-route-waypoint').count(), 0);
  await hybrid.close();

  const disconnected = await open();
  await marker(disconnected.page, fixture.meta.playerId).click();
  await square(disconnected.page, end); await ready(disconnected.page);
  await square(disconnected.page, end);
  const stalePosition = await squarePosition(disconnected.page, end.x, end.y);
  const staleBox = await disconnected.page.locator('.live-pitch-scene').boundingBox();
  await disconnected.page.evaluate(() => window.testSocket.close());
  await disconnected.page.mouse.click(staleBox.x + stalePosition.x, staleBox.y + stalePosition.y, { clickCount: 3 });
  assert.equal((await mutations(disconnected.page)).length, 0, 'Disconnect invalidates a partial gesture');
  await disconnected.close();

  const spectator = await open({ ...fixture.readyState, callerRole: 'spectator' });
  await marker(spectator.page, fixture.meta.playerId).click({ clickCount: 3 });
  await square(spectator.page, end, { clickCount: 3 });
  assert.equal((await mutations(spectator.page)).length, 0, 'Spectators cannot confirm by gesture');
  await spectator.close();
  console.log('Doubleclick confirmation: six actions, touch/mouse, cancellation, pending, readiness and disconnect passed.');
} finally { await browser.close(); await server.close(); }
