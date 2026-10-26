import { setCameraMode } from './camera-controls.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';

const frame = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const reserve = { ...frame.players[0], id: 'reserve', name: 'Reserve', slot: 2, number: 2,
  x: null, y: null, state: 'is reserve', offPitch: 'reserve' };
const setup = { ...frame, phase: 'SETUP', actions: [], players: [...frame.players, reserve] };
// Native PLAY fixtures include a menu that the protocol correctly forbids in SETUP.
delete setup.playerActionMenu;
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
    '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused", getToken:async()=>"token"});</script>' }));
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
          const moving = this.state.players.find(player => player.id === request.playerId);
          const displaced = request.to && this.state.players.find(player => player.id !== request.playerId && player.x === request.to.x && player.y === request.to.y);
          this.state = { ...this.state, revision: this.state.revision + 1,
            players: this.state.players.map(player => player.id === request.playerId ? { ...player,
              x: request.to?.x ?? null, y: request.to?.y ?? null, offPitch: request.to ? 'pitch' : 'reserve' }
              : player.id === displaced?.id ? {...player,x:moving.x,y:moving.y} : player) };
          this.reply(request.requestId);
        }
        if (request.type === 'setup' && request.operation === 'confirm') queueMicrotask(() => this.emit({version:2,type:'setupState',requestId:request.requestId,code:'ILLEGAL_SETUP',duplicate:false,state:this.state,
          setupErrors:['Too many players in a wide zone.','Minimum of 3 players on the Line of Scrimmage.']}));
        if (request.type === 'setup' && request.operation === 'action' && request.actionId.endsWith(':event-pick:home1')) {
          this.state = { ...this.state, revision: this.state.revision + 1,
            players: this.state.players.map(player => player.id === 'home1' ? { ...player, x: null, y: null, offPitch: 'reserve', state: 'is in reserve' } : player), actions: [
            { id: `${this.state.revision + 1}:solid-place:home1:8:7`, label: 'Place home1 at 8, 7',
              kind: 'kickoffMove', actor: 'home', sourcePlayerId: null, target: { x: 8, y: 7 } }
          ] };
          this.reply(request.requestId);
        } else if (request.type === 'setup' && request.operation === 'action' && request.actionId.includes(':solid-place:')) {
          const [, id, x, y] = request.actionId.slice(request.actionId.indexOf(':') + 1).split(':');
          this.state = { ...this.state, revision: this.state.revision + 1, actions: [],
            players: this.state.players.map(player => player.id === id ? { ...player, x: Number(x), y: Number(y), offPitch: 'pitch', state: 'is standing' } : player) };
          if (initial.kickoff?.event === 'SOLID_DEFENCE') this.state.actions = [
            ...this.state.players.filter(player => player.role === this.state.actor && player.offPitch === 'reserve')
              .map(player => ({ id: `${this.state.revision}:solid-place:${player.id}:${x}:${Number(y) + 1}`,
                label: `Place ${player.name}`, kind: 'kickoffMove', actor: this.state.actor,
                sourcePlayerId: null, target: { x: Number(x), y: Number(y) + 1 } })),
            { id: `${this.state.revision}:confirm-solid-defence`, label: 'Confirm Solid Defence', kind: 'kickoffChoice',
              actor: this.state.actor, sourcePlayerId: null, target: null }
          ];
          this.reply(request.requestId);
        } else if (request.type === 'setup' && request.operation === 'action' && request.actionId.endsWith(':confirm-solid-defence')) {
          this.state = { ...this.state, revision: this.state.revision + 1, turnMode: 'KICKOFF', kickoff: null, actions: [] };
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
  await page.waitForFunction(() => window.testSocket.state.revision === 3);
  assert.equal((await sent()).length, 3, 'two friendly pitch players swap in one placement intent');
  assert.deepEqual(await page.evaluate(() => window.testSocket.state.players.filter(p=>p.role==='home').map(p=>p.x).sort()),[8,9]);
  await home.dragTo(page.locator('.live-dugout.home .live-dugout-heading'));
  await page.waitForFunction(() => window.testSocket.state.revision === 4, null, { timeout: 3000 });
  assert.equal((await sent())[3].to, null);
  await page.getByRole('button',{name:'Confirmed!',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Too many players in a wide zone.'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirm Setup',exact:true}).count(),0,'Only the main confirmation button is used');
  assert.equal(await page.getByRole('button',{name:'Confirmed!',exact:true}).isEnabled(),true,'Illegal setup remains editable');
  assert.equal(await page.evaluate(() => window.testSocket.state.revision),4,'Illegal setup does not advance');
  await page.locator('.live-marker.home').first().dragTo(scene,{targetPosition:await squarePosition(page,10,7)});
  await page.waitForFunction(() => window.testSocket.state.revision === 5);
  assert.equal(await page.locator('.setup-feedback').count(),0,'Correcting setup clears the native rejection');
  assert.deepEqual(errors, []);
  await page.close();

  for (const callerRole of ['home', 'away']) {
    const placedId = `${callerRole}1`;
    const otherRole = callerRole === 'home' ? 'away' : 'home';
    const placement = await open({ ...setup, callerRole, actor: callerRole,
      players: [ { ...frame.players[0], x: 7 }, { ...frame.players[1], x: 18 }, { ...reserve, role: callerRole } ] });
    const current = placement.page;
    const ownDugout = current.locator(`.live-dugout.${callerRole}`);
    const opponentDugout = current.locator(`.live-dugout.${otherRole}`);
    await ownDugout.getByRole('button', { name: /Reserves: 1; expand dugout/ }).click();
    assert.equal(await current.locator('.live-dugouts').evaluate(element => {
      const home = element.querySelector('.home').getBoundingClientRect(), away = element.querySelector('.away').getBoundingClientRect();
      return home.right < away.left;
    }), true, 'Expanding one dugout cannot shift the other underneath it');
    await opponentDugout.getByRole('button', { name: /Expand .* dugout/ }).click();
    assert.equal(await ownDugout.evaluate(element => element.classList.contains('expanded')), true);
    const onPitch = current.locator(`.live-marker[data-player-id="${placedId}"]`);
    const placements = () => current.evaluate(() => window.testSocket.sent.filter(request => request.operation === 'place'));
    await onPitch.dragTo(opponentDugout.locator('.live-dugout-heading'));
    assert.equal((await placements()).length, 0, 'Opponent dugout cannot receive a friendly pitch player');
    await current.evaluate(otherRole => document.addEventListener('dragstart', event => {
      event.dataTransfer.setData('application/x-fumbbl-setup-player', `${otherRole}1`);
    }, { once: true }), otherRole);
    await onPitch.dragTo(ownDugout.locator('.live-dugout-heading'));
    assert.equal((await placements()).length, 0, 'An altered drag payload cannot return a different player');
    await onPitch.dragTo(ownDugout.locator('.live-dugout-zone').nth(2));
    await current.waitForFunction(() => window.testSocket.state.revision === 1, null, { timeout: 3000 });
    assert.deepEqual((await placements()).map(request => [request.playerId, request.to]), [[placedId, null]], 'Even a drop over the Casualties display returns an eligible setup player to reserves');
    assert.equal(await current.evaluate(id => window.testSocket.state.players.find(player => player.id === id).offPitch, placedId), 'reserve');
    const returning = ownDugout.getByRole('button', { name: new RegExp(`^${placedId}, number 1, Reserves$`) });
    const target = { x: callerRole === 'home' ? 8 : 17, y: 7 };
    await returning.dragTo(current.locator('.live-pitch-scene'), { targetPosition: await squarePosition(current, target.x, target.y) });
    await current.waitForFunction(() => window.testSocket.state.revision === 2, null, { timeout: 3000 });
    assert.deepEqual((await placements()).at(-1).to, target, 'The expanded container also supplies players for pitch placement');
    await ownDugout.getByRole('button', { name: /Minimize .* dugout/ }).click();
    await onPitch.dragTo(ownDugout.locator('.live-dugout-heading'));
    assert.equal((await placements()).length, 2, 'The summary view is not a placement drop container');
    await ownDugout.getByRole('button', { name: /Condense .* dugout/ }).click();
    await onPitch.dragTo(ownDugout.locator('.live-dugout-heading'));
    assert.equal((await placements()).length, 2, 'The title-only view is not a placement drop container');
    await ownDugout.getByRole('button', { name: /Restore .* dugout/ }).click();
    await ownDugout.getByRole('button', { name: /Expand .* dugout/ }).click();
    const evidence = process.env.DUGOUT_PLACEMENT_EVIDENCE_DIR;
    if (evidence) {
      await mkdir(evidence, { recursive: true });
      await current.screenshot({ path: `${evidence}/expanded-${callerRole}-1440-900.png` });
    }
    for (const [width, height] of [[1440,900], [640,330], [375,300]]) {
      await current.setViewportSize({ width, height });
      await current.waitForFunction(() => Math.abs(document.querySelector('.live-pitch-scene').clientWidth - innerWidth) < 1);
      assert.equal(await ownDugout.evaluate(element => {
        const r = element.getBoundingClientRect();
        const history = document.querySelector(`.match-history-${element.classList.contains('home') ? 'chat' : 'log'}`).getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= history.top && element.scrollWidth <= element.clientWidth;
      }), true, 'Expanded placement container fits above history without horizontal overflow');
      if (evidence) await current.screenshot({ path: `${evidence}/expanded-${callerRole}-${width}-${height}.png` });
    }
    assert.deepEqual(placement.errors, []);
    await current.close();
  }

  const keyboard = await open(setup);
  assert.equal(await keyboard.page.getByText('Place players with keyboard or touch', { exact: true }).count(), 0);
  assert.equal(await keyboard.page.getByLabel('Setup player').count(), 0, 'Numeric placement stays off the pitch');
  await keyboard.page.getByRole('button', { name: 'Debug', exact: true }).focus();
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

  const reserveEvent = await open({ ...solid, players: solid.players.map(player => player.id === 'home1'
    ? { ...player, x: null, y: null, state: 'is in reserve', offPitch: 'reserve' } : player), actions: [
      { id: '0:solid-place:home1:8:7', label: 'Place home1 at 8, 7', kind: 'kickoffMove', actor: 'home',
        sourcePlayerId: null, target: { x: 8, y: 7 } }
    ] });
  const reserveDugout = reserveEvent.page.locator('.live-dugout.home');
  await reserveDugout.getByRole('button', { name: /Reserves: 1; expand dugout/ }).click();
  const savedReserve = reserveDugout.getByRole('button', { name: /^home1, number 1, Reserves$/ });
  await savedReserve.dragTo(reserveEvent.page.locator('.live-pitch-scene'), { targetPosition: await squarePosition(reserveEvent.page, 8, 7) });
  await reserveEvent.page.waitForFunction(() => window.testSocket.state.revision === 1, null, { timeout: 3000 });
  assert.deepEqual(await reserveEvent.page.evaluate(() => window.testSocket.sent.filter(request => request.operation === 'action').map(request => request.actionId)), ['0:solid-place:home1:8:7']);
  assert.deepEqual(reserveEvent.errors, []);
  await reserveEvent.page.close();

  for (const callerRole of ['home', 'away']) {
    const x = callerRole === 'home' ? 12 : 13;
    const reserves = [0, 1, 2].map(index => ({ ...reserve, id: `redeploy${index}`, name: `Redeploy ${index}`,
      role: callerRole, slot: index + 2, number: index + 2 }));
    const redeployment = await open({ ...solid, callerRole, actor: callerRole,
      kickoff: { version: 1, event: 'SOLID_DEFENCE', actor: callerRole, stage: 'movement', allowed: 3, completed: 0, selected: 3 },
      players: [...solid.players, ...reserves], actions: [
        ...reserves.map(player => ({ id: `0:solid-place:${player.id}:${x}:5`, label: `Place ${player.name}`,
          kind: 'kickoffMove', actor: callerRole, sourcePlayerId: null, target: { x, y: 5 } })),
        { id: '0:confirm-solid-defence', label: 'Confirm Solid Defence', kind: 'kickoffChoice', actor: callerRole,
          sourcePlayerId: null, target: null }
      ] });
    const current = redeployment.page;
    await current.locator(`.live-dugout.${callerRole}`).getByRole('button', { name: /Reserves: 3; expand dugout/ }).click();
    for (const [row, index] of [2, 0, 1].entries()) {
      const player = current.getByRole('button', { name: `Redeploy ${index}, number ${index + 2}, Reserves`, exact: true });
      assert.equal(await player.getAttribute('draggable'), 'true', 'Every selected reserve can be dragged');
      await player.dragTo(current.locator('.live-pitch-scene'), { targetPosition: await squarePosition(current, x, row + 5) });
      await current.waitForFunction(revision => window.testSocket.state.revision === revision, row + 1, { timeout: 3000 });
    }
    const confirm = current.getByRole('button', { name: 'Confirmed!', exact: true });
    assert.equal(await confirm.isEnabled(), true, 'A redeployed formation can be confirmed without selecting an action in Debug');
    if (callerRole === 'home') await confirm.click();
    else {
      await current.locator('.live-pitch-scene').focus();
      await current.keyboard.press('Space');
    }
    await current.waitForFunction(() => window.testSocket.state.turnMode === 'KICKOFF', null, { timeout: 3000 });
    assert.deepEqual(await current.evaluate(() => window.testSocket.sent.filter(request => request.operation === 'action').map(request => request.actionId)), [
      `0:solid-place:redeploy2:${x}:5`, `1:solid-place:redeploy0:${x}:6`, `2:solid-place:redeploy1:${x}:7`, '3:confirm-solid-defence'
    ]);
    assert.deepEqual(redeployment.errors, []);
    await current.close();
  }

  for (const callerRole of ['home', 'away']) {
    const facing = await open({ ...frame, callerRole, players: frame.players.map(player => ({ ...player,
      x: player.role === 'home' ? 12 : 13, art: { rosterId: 'human', positionId: 'lineman' } })) });
    const current = facing.page;
    const pose = id => current.locator(`.live-marker[data-player-id="${id}"]`).getAttribute('data-pose');
    const update = changes => current.evaluate(changes => {
      const socket = window.testSocket;
      socket.state = { ...socket.state, ...changes, revision: socket.state.revision + 1 };
      if (socket.state.phase !== 'PLAY') delete socket.state.playerActionMenu;
      socket.reply(null);
    }, changes);
    const moveSideways = async () => {
      const players = await current.evaluate(() => window.testSocket.state.players.map(player => ({ ...player, y: player.y + 1 })));
      await update({ players });
      await current.waitForFunction(() => [...document.querySelectorAll('.live-marker')].every(player => player.dataset.pose === 'side'));
    };
    const expectAttackDirection = async () => {
      await current.waitForFunction(role => [...document.querySelectorAll('.live-marker')].every(player =>
        player.dataset.pose === (player.classList.contains(role) ? 'back' : 'front')), callerRole);
      assert.equal(await pose('home1'), callerRole === 'home' ? 'back' : 'front');
      assert.equal(await pose('away1'), callerRole === 'away' ? 'back' : 'front');
    };
    await moveSideways();
    await update({ drive: frame.drive + 1, phase: 'SETUP', actions: [] });
    await expectAttackDirection();
    const players = await current.evaluate(() => window.testSocket.state.players.map(player => ({ ...player, y: player.y + 1 })));
    await update({ players, phase: 'READY_FOR_KICKOFF' });
    await update({ phase: 'PLAY', turnMode: 'REGULAR' });
    await expectAttackDirection();
    await moveSideways();
    await update({ actor: callerRole === 'home' ? 'away' : 'home' });
    assert.equal(await pose('home1'), 'side', 'A normal team turn preserves facing');
    await update({ drive: frame.drive + 2, half: 2 });
    await expectAttackDirection();
    const facingEvidence = process.env.FACING_EVIDENCE_DIR;
    if (facingEvidence) {
      await mkdir(facingEvidence, { recursive: true });
      await current.screenshot({ path: `${facingEvidence}/drive-facing-${callerRole}-perspective.png` });
    }
    await current.getByRole('button', { name: 'Debug', exact: true }).click();
    await setCameraMode(current, 'top-down');
    await expectAttackDirection();
    if (facingEvidence) await current.screenshot({ path: `${facingEvidence}/drive-facing-${callerRole}-top-down.png` });
    assert.deepEqual(facing.errors, []);
    await current.close();
  }
  console.log('PASS: expanded dugout drag/drop, setup keyboard placement, required choices, Solid Defence reserve redeployment, and drive-start facing in both coach views and top-down.');
} finally {
  await browser.close();
  await server.close();
}
