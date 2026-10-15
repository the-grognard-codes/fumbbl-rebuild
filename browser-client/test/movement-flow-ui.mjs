import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
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

async function openJourney(readyState, plan, acceptedState, replyDelay = 0, actionStates = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>' }));
  await page.addInitScript(({ fixture, readyState, plan, acceptedState, replyDelay, actionStates }) => {
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
          const reply = () => {
            if (request.operation === 'movement') this.state = acceptedState;
            if (request.operation === 'action' && actionStates[request.actionId]) this.state = actionStates[request.actionId];
            this.emit({ version: 2, type: 'setupState', requestId: request.requestId,
              code: 'ACCEPTED', duplicate: false, state: this.state });
          };
          if (replyDelay && request.operation !== 'load') setTimeout(reply, replyDelay);
          else queueMicrotask(reply);
        }
      }
      close() { this.readyState = 3; this.onclose?.(); }
    };
  }, { fixture, readyState, plan, acceptedState, replyDelay, actionStates });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${readyState.matchId}`);
  await page.getByLabel('Live match pitch').waitFor();
  return { page, errors, confirmed: page.getByRole('button', { name: 'Confirmed!', exact: true }) };
}

const mutations = page => page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'setup' && request.operation !== 'load'));
const select = (page, id) => page.locator(`.live-marker[data-player-id="${id}"]`).click();
const clickSquare = async (page, square, button = 'left') => page.locator('.live-pitch-scene').click({
  position: await squarePosition(page, square.x, square.y), button });

try {
  // Presentation forecasts are controlled here; native calculations are tested in the server suite.
  const blocker = fixture.readyState.players.find(player => player.id === fixture.meta.blitzPlayerId);
  const targets = fixture.readyState.players.filter(player => player.role !== blocker.role && player.x !== null
    && Math.max(Math.abs(player.x - blocker.x), Math.abs(player.y - blocker.y)) === 1);
  const blockState = { ...fixture.readyState, blockPreview: { version: 1, rolls: targets.map((target, index) =>
    ({ playerId: blocker.id, targetPlayerId: target.id, dice: index ? 3 : -2 })) } };
  const proposal = await openJourney(blockState, fixture.movePlan.plan, fixture.moveAcceptedState);
  await select(proposal.page, blocker.id);
  await select(proposal.page, targets[0].id);
  const potential = proposal.page.locator('.block-dice-surface[role="status"]');
  await potential.waitFor();
  assert.equal(await potential.locator('.block-die.potential').count(), 2);
  assert.match(await potential.getAttribute('class'), /uphill/);
  assert.match(await potential.getAttribute('aria-label'), /opponent chooses/);
  assert.ok(await potential.locator('.block-die-cube').first().evaluate(el => el.getAnimations().length > 0));
  assert.deepEqual(await mutations(proposal.page), [], 'Proposing a block never rolls or sends an action');
  await select(proposal.page, targets[1].id);
  assert.equal(await potential.locator('.block-die.potential').count(), 3, 'Changing targets updates the native forecast');
  assert.doesNotMatch(await potential.getAttribute('class'), /uphill/);
  await select(proposal.page, targets[1].id);
  assert.equal(await potential.count(), 0, 'Clicking the proposed target again clears potential dice');
  await select(proposal.page, blocker.id);
  await select(proposal.page, targets[0].id);
  await proposal.page.locator('.live-pitch-viewport').focus(); await proposal.page.keyboard.press('Escape');
  assert.equal(await potential.count(), 0);
  assert.deepEqual(await mutations(proposal.page), []);
  assert.deepEqual(proposal.errors, []); await proposal.page.close();

  // A normal block declares the attacker before rolling. Keep its preview
  // motion through both replies and tumble only when the native result arrives.
  const declaration = blockState.actions.find(action => action.kind === 'selectBlock' && action.sourcePlayerId === blocker.id);
  const attack = { id: '6:block-preview-target', kind: 'block', label: 'Block target', actor: blockState.actor,
    sourcePlayerId: blocker.id, target: { playerId: targets[0].id } };
  const declared = { ...blockState, revision: 6, activePlayerId: blocker.id, actions: [attack] };
  const block = await openJourney(blockState, fixture.movePlan.plan, fixture.blitzAcceptedState, 550,
    { [declaration.id]: declared, [attack.id]: fixture.blitzAcceptedState });
  await select(block.page, blocker.id);
  await select(block.page, targets[0].id);
  await block.page.evaluate(() => {
    window.blockCube = document.querySelector('.block-die-cube'); window.blockAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains('block-die-cube')) window.blockAnimations.push({
        phase: this.closest('.block-die').className, duration: animation.effect.getTiming().duration,
        iterations: animation.effect.getTiming().iterations });
      return animation;
    };
  });
  await block.confirmed.click();
  await block.page.locator('.block-die.awaiting').first().waitFor();
  assert.equal(await block.page.locator('.block-die.awaiting').count(), 2, 'Slow block confirmation retains the forecast dice');
  await block.page.getByRole('dialog').waitFor();
  await block.page.waitForFunction(() => document.querySelectorAll('.block-die.rolling').length === 0);
  assert.deepEqual((await mutations(block.page)).map(request => request.actionId), [declaration.id, attack.id]);
  const blockMotion = await block.page.evaluate(() => ({
    sameCube: document.querySelector('.block-die-cube') === window.blockCube, animations: window.blockAnimations }));
  assert.equal(blockMotion.sameCube, true, 'Normal block keeps the same cube through declaration and result');
  assert.deepEqual(blockMotion.animations.filter(animation => /awaiting/.test(animation.phase))
    .map(({ duration, iterations }) => ({ duration, iterations })),
    [], 'Confirmation continues the preview motion without an extra roll across both replies');
  assert.deepEqual(blockMotion.animations.filter(animation => /rolling/.test(animation.phase)).map(animation => animation.duration),
    [310], 'The normal block uses one short result animation');
  assert.deepEqual(block.errors, []); await block.page.close();

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
      await selection.page.locator(`.live-marker[data-player-id="${player.id}"]`).click({ button: 'right' });
      assert.equal(await selection.page.locator('.live-selection-square').count(), 0, 'A short right click deselects without a waypoint');
      assert.deepEqual(await mutations(selection.page), [], 'Right-click deselection does not change the native match');
    }
    assert.deepEqual(selection.errors, []);
    await selection.page.close();
  }
  const { page, errors, confirmed } = await openJourney(fixture.readyState, fixture.movePlan.plan,
    { ...fixture.moveAcceptedState, activePlayerAction: 'move' });
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
  const moveButton = page.getByRole('button', { name: 'Move', exact: true });
  assert.equal(await page.locator('.player-action-icons [aria-pressed="true"]').count(), 0,
    'Selecting an undeclared player leaves every action unhighlighted');
  assert.equal(await confirmed.isDisabled(), true, 'Player selection alone cannot activate');
  const end = fixture.movePlan.plan.waypoints.at(-1);
  await clickSquare(page, end);
  await page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  assert.equal(await moveButton.getAttribute('aria-pressed'), 'true', 'The first destination implicitly selects Move');
  await clickSquare(page, end, 'right');
  assert.equal(await moveButton.getAttribute('aria-pressed'), 'false', 'Undoing the last implicit waypoint clears the highlight');
  await moveButton.click();
  assert.equal(await moveButton.getAttribute('aria-pressed'), 'true', 'Move can be explicitly selected before planning');
  assert.equal(await confirmed.isDisabled(), true, 'Explicit selection waits for a destination');
  await clickSquare(page, end);
  await page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  await clickSquare(page, end, 'right');
  assert.equal(await moveButton.getAttribute('aria-pressed'), 'true', 'Explicit Move survives removal of its last waypoint');
  await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
  await select(page, fixture.meta.playerId);
  assert.equal(await moveButton.getAttribute('aria-pressed'), 'false', 'Cancellation clears explicit Move');
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
  assert.equal(await moveButton.getAttribute('aria-pressed'), 'false', 'Replacing Move clears its highlight');
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
  await page.waitForFunction(() => document.querySelector('.player-action-icons [aria-label="Move"]')?.getAttribute('aria-pressed') === 'true');
  await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
  await select(page, fixture.meta.playerId);
  assert.equal(await moveButton.getAttribute('aria-pressed'), 'true', 'A declared Move stays highlighted without a draft route');
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

  const blitz = await openJourney(fixture.blitzReadyState, { ...fixture.blitzPlan.plan, blockDice: -3 }, fixture.blitzAcceptedState, 450);
  await select(blitz.page, fixture.meta.blitzPlayerId);
  await blitz.page.getByRole('button', { name: 'Blitz', exact: true }).click();
  await select(blitz.page, fixture.meta.blitzTargetId);
  await blitz.page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  assert.equal(await blitz.page.locator('.block-dice-surface .block-die.potential').count(), 3);
  assert.match(await blitz.page.locator('.block-dice-surface[role="status"]').getAttribute('class'), /uphill/);
  assert.equal(await blitz.page.locator('.live-selection-square').getAttribute('data-selection'), fixture.meta.blitzPlayerId);
  await assertNoMovementMarkings(blitz.page);
  assert.equal(await blitz.page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'movementRange'
    && request.playerId === window.testSocket.state.players.find(player => player.role !== window.testSocket.state.callerRole)?.id).length), 0);
  assert.deepEqual(await mutations(blitz.page), []);
  if (evidence) await blitz.page.screenshot({ path: resolve(evidence, 'blitz-plan.png') });
  await blitz.page.evaluate(() => {
    window.handoffCube = document.querySelector('.block-die-cube'); window.handoffFrames = []; window.observeHandoff = true;
    window.blitzResultDurations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains('block-die-cube') && this.closest('.block-die.rolling'))
        window.blitzResultDurations.push(animation.effect.getTiming().duration);
      return animation;
    };
    const frame = () => {
      const cube = document.querySelector('.block-die-cube'), panel = cube?.closest('.live-dice-overlay');
      window.handoffFrames.push(!!cube && cube === window.handoffCube && getComputedStyle(panel).visibility === 'visible');
      if (window.observeHandoff) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await blitz.confirmed.click();
  await blitz.page.locator('.block-die.awaiting').first().waitFor();
  assert.equal(await blitz.page.locator('.block-die.awaiting').count(), 3, 'Pending confirmation keeps the proposed dice visible');
  await blitz.page.waitForFunction(revision => window.testSocket.state.revision === revision, fixture.blitzAcceptedState.revision);
  const attacks = await mutations(blitz.page);
  assert.equal(attacks.length, 1);
  assert.equal(attacks[0].operation, 'movement');
  assert.equal(attacks[0].kind, 'blitz');
  assert.equal(attacks[0].targetPlayerId, fixture.meta.blitzTargetId);
  await blitz.page.getByRole('dialog').waitFor();
  await blitz.page.waitForFunction(() => document.querySelectorAll('.block-die.rolling').length === 0);
  assert.deepEqual(await blitz.page.evaluate(() => window.blitzResultDurations), [310],
    'Blitz and ordinary block use the same short result duration');
  assert.ok(await blitz.page.evaluate(() => {
    window.observeHandoff = false; return window.handoffFrames.length > 10 && window.handoffFrames.every(Boolean);
  }), 'Every rendered frame preserves the first preview cube through the pending request and native roll');
  assert.equal(await blitz.page.locator('.block-die.potential').count(), 0, 'Confirmed blitz replaces potential dice with native choices');
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

  const activePlayerId = fixture.moveAcceptedState.activePlayerId;
  const teammateId = fixture.readyState.players.find(player => player.role === 'home' && player.x === 11 && player.y === 9).id;
  const teammate = fixture.readyState.players.find(player => player.id === teammateId);
  const selectTeammate = fixture.readyState.actions.find(action => action.kind === 'select' && action.sourcePlayerId === teammateId);
  const passTeammate = fixture.readyState.actions.find(action => action.kind === 'declarePass' && action.sourcePlayerId === teammateId);
  const activeWithTeammate = { ...fixture.moveAcceptedState, actions: [...fixture.moveAcceptedState.actions, selectTeammate, passTeammate] };
  const destination = { x: 10, y: 8 };
  const teammatePlan = { ...fixture.movePlan.plan, waypoints: [destination], route: {
    ...fixture.movePlan.plan.route, playerId: teammateId, from: { x: teammate.x, y: teammate.y },
    steps: [{ ...fixture.movePlan.plan.route.steps[0], ...destination }], revision: activeWithTeammate.revision } };
  const teammateAccepted = { ...activeWithTeammate, revision: activeWithTeammate.revision + 1,
    activePlayerId: teammateId, players: activeWithTeammate.players.map(player => player.id === teammateId
      ? { ...player, ...destination } : player) };
  const switchJourney = await openJourney(activeWithTeammate, teammatePlan, teammateAccepted);
  await select(switchJourney.page, activePlayerId);
  await select(switchJourney.page, teammateId);
  assert.equal(await switchJourney.page.getByRole('group', { name: 'Player actions', exact: true }).getByRole('button', { name: 'Pass', exact: true }).count(), 1,
    'Action icons belong to the selected teammate');
  await clickSquare(switchJourney.page, destination);
  await switchJourney.page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  assert.deepEqual(await mutations(switchJourney.page), [], 'Teammate preview does not end the active player action');
  await select(switchJourney.page, activePlayerId);
  assert.equal(await switchJourney.confirmed.isDisabled(), true, 'Returning to the active player cancels the teammate plan');
  await select(switchJourney.page, teammateId);
  await clickSquare(switchJourney.page, destination);
  await switchJourney.page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  await switchJourney.confirmed.click();
  await switchJourney.page.waitForFunction(revision => window.testSocket.state.revision === revision, teammateAccepted.revision);
  assert.deepEqual((await mutations(switchJourney.page)).map(request => [request.operation, request.playerId, request.kind]),
    [['movement', teammateId, 'move']]);
  assert.deepEqual(switchJourney.errors, []); await switchJourney.page.close();

  const proneId = fixture.readyState.players.find(player => player.role === 'away' && player.x === 14 && player.y === 9).id;
  const foulState = { ...activeWithTeammate, players: activeWithTeammate.players.map(player => player.id === proneId
    ? { ...player, x: 12, y: 9, state: 'Prone' } : player), actions: [...activeWithTeammate.actions,
      { ...selectTeammate, id: `${selectTeammate.id}-foul`, kind: 'declareFoul', label: `Foul with ${teammate.name}` }] };
  const foulPlan = { ...teammatePlan, kind: 'foul', targetPlayerId: proneId, waypoints: [],
    route: { ...teammatePlan.route, steps: [] } };
  const foulAccepted = { ...foulState, revision: foulState.revision + 1, activePlayerId: teammateId };
  const foulJourney = await openJourney(foulState, foulPlan, foulAccepted);
  await select(foulJourney.page, teammateId);
  await select(foulJourney.page, proneId);
  await foulJourney.page.waitForFunction(() => !document.querySelector('.commit-action').disabled);
  assert.deepEqual(await mutations(foulJourney.page), [], 'Foul preview is read-only');
  await foulJourney.confirmed.click();
  await foulJourney.page.waitForFunction(revision => window.testSocket.state.revision === revision, foulAccepted.revision);
  assert.deepEqual((await mutations(foulJourney.page)).map(request => [request.operation, request.playerId,
    request.kind, request.targetPlayerId, request.waypoints]), [['movement', teammateId, 'foul', proneId, []]]);
  assert.deepEqual(foulJourney.errors, []); await foulJourney.page.close();
  console.log('PASS: read-only range and teammate selection, Move, Blitz, adjacent Foul, waypoint undo, cancellation, Space and repeated-confirm guards.');
} finally {
  await browser.close(); await server.close();
}
