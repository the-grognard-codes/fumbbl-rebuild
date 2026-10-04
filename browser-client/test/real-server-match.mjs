// Real Firebase /browser/v2 acceptance. No routes, fixtures, or engine commands
// are substituted. Match-changing positive paths use the production UI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { squarePosition } from './projected-pitch-helper.mjs';
import { capturePresentation, captureNativeZoom, captureEdgeSmoke } from './real-server-presentation.mjs';

const origin = 'http://localhost:5000';
const computer = process.env.COACH_ACCEPTANCE_COMPUTER === '1';
const output = resolve(process.env.COACH_ACCEPTANCE_EVIDENCE ?? '../.tools/coach-oriented-match-ui/real-server-evidence');
const resumed = process.env.COACH_ACCEPTANCE_RESUME_FROM ? JSON.parse(await readFile(process.env.COACH_ACCEPTANCE_RESUME_FROM, 'utf8')) : null;
const completedContinuation = resumed?.state?.phase === 'FULL_TIME';
if (resumed) {
  assert.match(resumed.matchId ?? '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.ok(resumed.state && Array.isArray(resumed.assertions) && Array.isArray(resumed.checkpoints), 'Continuation requires the prior native-run evidence');
}
const tokens = JSON.parse(await readFile(process.env.COACH_ACCEPTANCE_TOKENS_FILE, 'utf8'));
assert.ok(tokens.home && tokens.away && tokens.spectator, 'Three independent real Firebase custom tokens are required');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.COACH_ACCEPTANCE_BROWSER ?? 'chrome', headless: process.env.COACH_ACCEPTANCE_FOREGROUND !== '1' });
const pages = [], contexts = [], assertions = [], checkpoints = [], errors = [];
let matchId, lastState, lastAction, teams = [];
const record = (name, details = {}) => { assertions.push({ name, ...details }); console.log(name); };

async function observe(context) {
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    window.__acceptance = { socket: null, incoming: [], outgoing: [] };
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args); window.__acceptance.socket = this;
        this.addEventListener('message', event => {
          const message = JSON.parse(event.data);
          if (message.type !== 'error' || !/AUTHENTICATION/.test(message.code)) window.__acceptance.incoming.push(message);
        });
      }
      send(raw) {
        const message = JSON.parse(raw);
        if (message.type !== 'authenticate' && message.type !== 'computerAuthenticate') window.__acceptance.outgoing.push(message);
        super.send(raw);
      }
    };
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
}
async function signIn(page, token) {
  await page.goto(`${origin}/login`);
  await page.evaluate(async token => {
    const { authentication } = await import('/assets/auth-client.js');
    const { signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    await signInWithCustomToken(authentication().auth, token);
  }, typeof token === 'string' ? token : token.token);
  await page.goto(`${origin}/teambuilder`);
  await page.getByRole('status').filter({ hasText: /^Connected$/ }).waitFor();
}
async function state(page) {
  return page.evaluate(() => window.__acceptance.incoming.filter(message => message.type === 'setupState' && message.state).at(-1)?.state ?? null);
}
function canonical(view) {
  const { callerRole, clock, ...fields } = view;
  return fields;
}
async function converge(revision) {
  await Promise.all(pages.map(page => page.waitForFunction(revision => window.__acceptance.incoming.some(message => message.state?.revision >= revision), revision)));
  let states;
  for (let attempt = 0; attempt < 200; attempt++) {
    states = await Promise.all(pages.map(state));
    if (states.every(view => view.revision === states[0].revision)) break;
    await pages[0].waitForTimeout(20);
  }
  for (const view of states) {
    assert.ok(view.revision >= revision); assert.equal(view.revision, states[0].revision);
    if (!computer) assert.equal(view.revision, revision);
    assert.deepEqual(canonical(view), canonical(states[0]));
  }
  assert.deepEqual(states.map(view => view.callerRole), completedContinuation ? (computer ? ['home'] : ['home', 'away'])
    : computer ? ['home', 'spectator', 'spectator'] : ['home', 'away', 'spectator']);
  lastState = states[0];
  return states[0];
}
async function advanced(before, intent) {
  await intent();
  await pages[0].waitForFunction(revision => window.__acceptance.incoming.some(message => message.state?.revision > revision), before.revision);
  return converge((await state(pages[0])).revision);
}
async function wire(page, fields) {
  const request = { ...fields, version: 2, requestId: fields.requestId ?? randomUUID() };
  return page.evaluate(request => new Promise((done, reject) => {
    const socket = window.__acceptance.socket;
    const timer = setTimeout(() => { socket.removeEventListener('message', receive); reject(Error('Real wire response timed out')); }, 15000);
    const receive = event => { const response = JSON.parse(event.data); if (response.requestId === request.requestId) {
      clearTimeout(timer); socket.removeEventListener('message', receive); done(response);
    } };
    socket.addEventListener('message', receive); socket.send(JSON.stringify(request));
  }), request);
}
async function buildTeam(page, roster) {
  await page.goto(`${origin}/teambuilder`);
  await page.getByRole('status').filter({ hasText: /^Connected$/ }).waitFor();
  await page.getByLabel('Team', { exact: true }).selectOption(roster);
  await page.getByLabel('Team name', { exact: true }).fill(roster === 'human' ? 'Acceptance Ironbank Rovers' : 'Acceptance Cinderclaw Crew');
  const catalog = await page.evaluate(roster => window.__acceptance.incoming.filter(message => message.type === 'catalog' && message.rosterId === roster).at(-1), roster);
  const positions = roster === 'human'
    ? ['ogre', 'blitzer', 'blitzer', 'catcher', 'thrower', 'halfling', ...Array(5).fill('lineman')]
    : ['troll', 'orc-blitzer', 'orc-blitzer', 'big-un-blocker', 'orc-thrower', 'goblin-lineman', ...Array(5).fill('orc-lineman')];
  for (const id of positions) await page.getByRole('button', { name: `Add ${catalog.positions.find(position => position.id === id).name}`, exact: true }).click();
  for (const [id, count] of [['rerolls', 3], ['apothecary', 1]]) for (let index = 0; index < count; index++)
    await page.getByRole('button', { name: `Add ${catalog.resources.find(resource => resource.id === id).name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Validate Roster', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Server validation passed.' }).waitFor();
  await page.getByRole('button', { name: 'Save team', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).waitFor();
  const document = await page.evaluate(() => window.__acceptance.incoming.filter(message => message.type === 'savedTeam' && message.document).at(-1).document);
  assert.equal(document.draft.rosterId, roster); assert.equal(document.draft.players.length, 11);
  assert.equal(new Set(document.draft.players.map(player => player.positionId)).size, 6);
  await page.goto(`${origin}/play`);
  await page.getByRole('combobox', { name: /^Saved team/ }).selectOption(document.teamId);
  return document;
}
async function arrange(view) {
  const page = pages[view.actor === 'home' ? 0 : 1], role = view.actor;
  const disclosure = page.getByText('Place players with keyboard or touch', { exact: true });
  await disclosure.click();
  for (const player of view.players.filter(player => player.role === role && player.x !== null)) {
    await page.getByLabel('Setup player', { exact: true }).selectOption(player.id);
    view = await advanced(view, () => page.getByRole('button', { name: 'Return selected player to reserve', exact: true }).click());
  }
  const available = view.players.filter(player => player.role === role && ['pitch', 'reserve'].includes(player.offPitch)).slice(0, 11);
  for (let index = 0; index < available.length; index++) {
    await page.getByLabel('Setup player', { exact: true }).selectOption(available[index].id);
    const x = index < 3 ? 12 : 10, y = index < 3 ? 6 + index : 1 + index;
    await page.getByLabel('Setup X', { exact: true }).fill(String(role === 'home' ? x : 25 - x));
    await page.getByLabel('Setup Y', { exact: true }).fill(String(y));
    view = await advanced(view, () => page.getByRole('button', { name: 'Place on empty own-half square', exact: true }).click());
  }
  return advanced(view, () => page.getByRole('button', { name: 'Confirm Setup', exact: true }).click());
}
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const attempts = new Set();
const blockAttempts = new Set();
function selectAction(view) {
  if (view.phase === 'READY_FOR_KICKOFF') return view.actions.find(action => action.id.endsWith(view.actor === 'home' ? 'kick-17-7' : 'kick-8-7')) ?? view.actions[0];
  for (const suffix of [':decline-event', ':end-event', ':reroll:team', ':skill:true']) {
    const offered = view.actions.find(action => action.id.endsWith(suffix)); if (offered) return offered;
  }
  if (view.actions.some(action => action.kind === 'blockDie'))
    return view.actions.find(action => action.kind === 'blockDie' && /Defender Down|Defender Stumbles|Push/i.test(action.label))
      ?? view.actions.find(action => action.kind === 'blockDie');
  const blockKey = `${view.half}:${view.actor}`;
  if (!view.activePlayerId && !blockAttempts.has(blockKey)) {
    const blocker = view.actions.find(action => action.kind === 'selectBlock'
      && /blitzer/i.test(view.players.find(player => player.id === action.sourcePlayerId)?.position ?? ''));
    if (blocker) { blockAttempts.add(blockKey); return blocker; }
  }
  if (view.actions.some(action => action.kind === 'endTurn') && view.ball) {
    const carrier = view.players.find(player => player.x === view.ball.x && player.y === view.ball.y);
    if (!carrier || carrier.role === view.actor) {
      const selecting = view.actions.filter(action => action.kind === 'select').map(action => ({ action, player: view.players.find(player => action.id.endsWith(player.id)) })).filter(item => item.player?.x !== null && item.player);
      selecting.sort((a, b) => distance(a.player, view.ball) - distance(b.player, view.ball));
      const active = view.players.find(player => player.id === view.activePlayerId);
      const key = `${view.half}:${view.drive}:${view.homeTurn}:${view.awayTurn}:${view.actor}`;
      if (!active && selecting.length && !attempts.has(key)) { attempts.add(key); return selecting[0].action; }
      if (active) {
        const target = carrier?.id === active.id ? { x: view.actor === 'home' ? 25 : 0, y: active.y } : view.ball;
        const occupied = new Set(view.players.filter(player => player.id !== active.id && player.x !== null).map(player => `${player.x},${player.y}`));
        const distances = new Map([[`${target.x},${target.y}`, 0]]), queue = [target];
        for (let index = 0; index < queue.length; index++) {
          const at = queue[index], depth = distances.get(`${at.x},${at.y}`);
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const x = at.x + dx, y = at.y + dy, coordinate = `${x},${y}`;
            if (x >= 0 && x < 26 && y >= 0 && y < 15 && !occupied.has(coordinate) && !distances.has(coordinate)) { distances.set(coordinate, depth + 1); queue.push({ x, y }); }
          }
        }
        const pathDistance = player => distances.get(`${player.x},${player.y}`) ?? 1000;
        const moves = view.actions.filter(action => action.kind === 'move' && !/rush/i.test(action.label)).map(action => {
          const match = /move-(\d+)-(\d+)$/.exec(action.id); return match && { action, x: +match[1], y: +match[2] };
        }).filter(move => move && pathDistance(move) < pathDistance(active));
        moves.sort((a, b) => (/dodge/i.test(a.action.label) ? 10 : 0) - (/dodge/i.test(b.action.label) ? 10 : 0) + pathDistance(a) - pathDistance(b));
        if (moves.length) return moves[0].action;
      }
    }
  }
  return view.actions.find(action => action.kind === 'endAction') ?? view.actions.find(action => action.kind === 'endTurn')
    ?? view.actions.find(action => action.kind === 'reroll' && /^Do not/i.test(action.label)) ?? view.actions[0];
}
async function routeUI(view, action) {
  const page = pages[action.actor === 'home' ? 0 : 1], target = action.target;
  await page.locator('.live-pitch-viewport[aria-label="Pitch action preview"]').waitFor();
  const player = view.players.find(player => player.id === action.sourcePlayerId);
  await squarePosition(page, player.x, player.y);
  await page.locator(`.live-marker[data-player-id="${player.id}"]`).press('Enter');
  await page.getByRole('button', { name: 'Other action', exact: true }).click();
  await page.getByRole('button', { name: 'Plan path', exact: true }).click();
  const waypoint = async () => {
    const position = await squarePosition(page, target.x, target.y);
    await page.locator('.live-pitch-scene').click({ position });
    await page.waitForFunction(expected => {
      const route = window.__acceptance.incoming.filter(message => message.type === 'routePreview').at(-1)?.route;
      return route?.revision === expected.revision && route.steps.at(-1)?.x === expected.x && route.steps.at(-1)?.y === expected.y;
    }, { revision: view.revision, x: target.x, y: target.y });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Confirmed!' && !button.disabled));
  };
  await waypoint();
  assert.equal((await state(page)).revision, view.revision, 'Server route preview is read-only');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await page.getByRole('list', { name: 'Waypoints' }).locator('li').count(), 0);
  await waypoint(); await page.getByRole('button', { name: 'Clear', exact: true }).click();
  assert.equal(await page.getByRole('list', { name: 'Waypoints' }).locator('li').count(), 0);
  await waypoint();
  const focus = await page.locator('.live-pitch-scene').getAttribute('data-focus');
  await page.getByRole('button', { name: 'Top-down view', exact: true }).click();
  assert.equal(await page.locator('.live-pitch-scene').getAttribute('data-focus'), focus);
  assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Perspective view', exact: true }).click();
  await page.reload(); await page.getByLabel('Live match pitch').waitFor();
  await converge(view.revision);
  assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isEnabled(), false, 'Reconnect discards an uncommitted route instead of sending it');
  await squarePosition(page, player.x, player.y);
  await page.locator(`.live-marker[data-player-id="${player.id}"]`).press('Enter');
  await page.getByRole('button', { name: 'Other action', exact: true }).click();
  await page.getByRole('button', { name: 'Plan path', exact: true }).click();
  await waypoint();
  view = await advanced(view, () => page.getByRole('button', { name: 'Confirmed!', exact: true }).click());
  record('Real server-bound route preview, Undo/Clear, camera-preserved proposal, reconnect and confirmed native route');
  return view;
}
async function actionUI(view, action) {
  assert.ok(action, `No reachable offered action at ${view.phase}/${view.turnMode}`);
  lastAction = action;
  const page = pages[action.actor === 'home' ? 0 : 1];
  await page.locator('.live-pitch-viewport[aria-label="Pitch action preview"]').waitFor();
  const dialog = page.getByRole('dialog', { name: 'Match decision', exact: true });
  const direct = page.getByRole('button', { name: action.label, exact: true });
  if (await page.getByLabel('Kickoff player choice', { exact: true }).count()) {
    const label = action.id.endsWith(':event-confirm') ? 'Confirm selection' : action.label;
    return advanced(view, () => page.getByRole('button', { name: label, exact: true }).click());
  }
  if (await dialog.count()) {
    let label = action.label;
    if (action.kind === 'followUp') label = /^Do not/i.test(label) ? 'No' : 'Yes';
    return advanced(view, () => dialog.getByRole('button', { name: label, exact: true }).click());
  }
  if (['blockDie', 'reroll', 'skill'].includes(action.kind) && await direct.count()) return advanced(view, () => direct.click());
  if (action.kind === 'push') {
    // Push arrows expose the authoritative label; the text companion also remains usable.
    if (await direct.count()) return advanced(view, () => direct.click());
  }
  if (action.kind === 'endTurn') {
    await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  } else if (['select', 'stand', 'selectBlock', 'blitz'].includes(action.kind) && action.sourcePlayerId) {
    const player = view.players.find(player => player.id === action.sourcePlayerId);
    await squarePosition(page, player.x, player.y);
    await page.locator(`.live-marker[data-player-id="${player.id}"]`).press('Enter');
    await page.getByRole('button', { name: action.kind === 'selectBlock' ? 'Block' : action.kind === 'blitz' ? 'Blitz' : 'Move', exact: true }).click();
  } else if (action.kind === 'move' && action.target && 'x' in action.target) {
    const player = view.players.find(player => player.id === action.sourcePlayerId);
    await squarePosition(page, player.x, player.y);
    await page.locator(`.live-marker[data-player-id="${player.id}"]`).press('Enter');
    const position = await squarePosition(page, action.target.x, action.target.y);
    await page.locator('.live-pitch-scene').click({ position });
  } else {
    await page.getByRole('button', { name: 'Other action', exact: true }).click();
    await page.getByText('All offered actions', { exact: true }).click();
    await page.getByLabel('Server action', { exact: true }).selectOption(action.id);
  }
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Confirmed!' && !button.disabled));
  return advanced(view, () => page.getByRole('button', { name: 'Confirmed!', exact: true }).press('Enter'));
}
async function negative(view) {
  const offered = view.actions[0]; if (!offered) return;
  const fields = { type: 'setup', operation: 'action', matchId, expectedRevision: view.revision, actionId: offered.id };
  const wrong = pages[offered.actor === 'home' ? 1 : 0];
  assert.equal((await wire(wrong, fields)).code, 'WRONG_ACTOR');
  assert.ok(['FORBIDDEN', 'WRONG_ACTOR', 'NOT_PARTICIPANT', 'NOT_FOUND'].includes((await wire(pages[2], fields)).code));
  assert.ok(['STALE_REVISION', 'ACTION_NOT_AVAILABLE'].includes((await wire(pages[offered.actor === 'home' ? 0 : 1], { ...fields, expectedRevision: Math.max(0, view.revision - 1), actionId: 'fabricated-action' })).code));
  assert.equal((await state(pages[0])).revision, view.revision);
  record('Wrong-coach, spectator and stale/fabricated requests rejected without mutation', { revision: view.revision });
}
async function pauseResume(view) {
  const menu = async (page, name) => { await page.getByRole('button', { name: /^Game Menu/ }).click(); await page.getByRole('button', { name, exact: true }).click(); await page.getByRole('button', { name: 'Close Game Menu', exact: true }).click(); };
  const saved = async (intent, status) => {
    await intent();
    // Save proposals are durable metadata and need not advance the native game revision.
    await Promise.all(pages.map(page => page.waitForFunction(status =>
      window.__acceptance.incoming.filter(message => message.type === 'setupState' && message.state).at(-1)?.state.saveResume?.status === status, status)));
    return converge((await state(pages[0])).revision);
  };
  view = await saved(() => menu(pages[0], 'Request Match Pause'), 'SAVE_PENDING');
  view = await saved(() => menu(pages[1], 'Accept pause'), 'SUSPENDED');
  assert.equal(view.saveResume.status, 'SUSPENDED');
  await pages[1].reload(); await pages[1].getByLabel('Live match pitch').waitFor();
  await converge(view.revision);
  if (process.env.COACH_ACCEPTANCE_PRESENTATION === '1') {
    await capturePresentation(pages, resolve(output, 'presentation'));
    await captureNativeZoom({ origin, matchId, token: tokens.home, output: resolve(output, 'native-zoom') });
    await captureEdgeSmoke({ origin, matchId, token: tokens.home, output: resolve(output, 'edge') });
    await pages[0].unroute('**/assets/game/teams/**');
    await pages[0].emulateMedia({ reducedMotion: 'no-preference' });
    await Promise.all(pages.map(async page => { await page.setViewportSize({ width: 1920, height: 1080 }); await page.reload(); await page.getByLabel('Live match pitch').waitFor(); }));
    await converge(view.revision);
    record('Foreground viewport, camera, unavailable-art and native browser zoom acceptance');
  }
  view = await saved(() => menu(pages[0], 'Request resume'), 'RESUME_PENDING');
  view = await saved(() => menu(pages[1], 'Accept resume'), 'ACTIVE');
  assert.equal(view.saveResume.status, 'ACTIVE'); record('Save, agree, reconnect suspended snapshot and agree resume'); return view;
}

try {
  for (const role of ['home', 'away', 'spectator']) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); contexts.push(context); await observe(context);
    const page = await context.newPage(); pages.push(page); await signIn(page, tokens[role]);
  }
  if (resumed) {
    matchId = resumed.matchId; teams = resumed.teams ?? [];
    assertions.push(...resumed.assertions); checkpoints.push(...resumed.checkpoints);
    record('Continued retained native match through authenticated production UI', { matchId, priorRevision: resumed.state.revision });
    await pages[0].goto(`${origin}/play/match?matchId=${matchId}`);
  } else {
  teams = computer ? [await buildTeam(pages[0], 'human'), await buildTeam(pages[0], 'orc')]
    : await Promise.all([buildTeam(pages[0], 'human'), buildTeam(pages[1], 'orc')]);
  record('Real DEV Firebase authentication and server-validated Human/Orc teams built through the UI');
  if (computer) {
    await pages[0].getByRole('combobox', { name: /^Play mode/ }).selectOption('computer');
    await pages[0].getByRole('combobox', { name: /^Your saved team/ }).selectOption(teams[0].teamId);
    await pages[0].getByRole('combobox', { name: /^Roster for Bugman/ }).selectOption(teams[1].teamId);
    await pages[0].getByRole('button', { name: 'Create computer game', exact: true }).click();
    await pages[0].getByRole('button', { name: 'Start game', exact: true }).waitFor();
  } else {
    await pages[0].getByRole('button', { name: 'Create game', exact: true }).click();
    await pages[0].getByLabel('Invitation code', { exact: true }).waitFor();
    await pages[0].waitForFunction(() => document.querySelector('input[autocomplete="off"]')?.value.length === 22);
    const invitation = await pages[0].getByLabel('Invitation code', { exact: true }).inputValue();
    await pages[1].getByLabel('Invitation code', { exact: true }).fill(invitation);
    await pages[1].getByRole('button', { name: 'Join game', exact: true }).click();
  }
  matchId = await pages[0].getByLabel('Match ID', { exact: true }).inputValue();
  await pages[0].getByRole('button', { name: 'Start game', exact: true }).waitFor();
  const popupPromise = pages[0].waitForEvent('popup');
  await pages[0].getByRole('button', { name: 'Start game', exact: true }).click();
  const popup = await popupPromise; await popup.waitForURL(/\/play\/match/); pages[0] = popup;
  }
  if (!completedContinuation || !computer) await pages[1].goto(`${origin}/play/match?matchId=${matchId}${computer ? '&watch=1' : ''}`);
  if (completedContinuation) {
    // Existing spectators received the terminal snapshot in the original run.
    // A fresh spectator connection has public history, but no live-watch grant.
    for (const spectator of pages.slice(computer ? 1 : 2)) {
      assert.equal((await wire(spectator, { type: 'watch', matchId })).code, 'NOT_FOUND');
      assert.equal((await wire(spectator, { type: 'matchTranscript', matchId, from: 0, limit: 1 })).code, 'ACCEPTED');
      await spectator.close();
    }
    record('Completed match retains public transcript access and rejects new live spectators');
    pages.splice(computer ? 1 : 2);
  } else await pages[2].goto(`${origin}/play/match?matchId=${matchId}&watch=1`);
  await Promise.all(pages.map(page => page.getByLabel('Live match pitch').waitFor()));
  let view = await converge(resumed?.state.revision ?? 0);
  record(completedContinuation ? 'Both coaches reload the same retained native full-time snapshot'
    : computer ? 'Human coach and independent spectators subscribe to the native computer match'
    : 'Two independent coaches and spectator converge on the real native prematch snapshot', { matchId });
  if (!resumed) {
  await pages[0].getByRole('button', { name: 'Write message', exact: true }).click();
  await pages[0].getByLabel('Message the match', { exact: true }).fill('Acceptance: good luck <escaped>');
  await pages[0].getByRole('button', { name: 'Send', exact: true }).click();
  await Promise.all(pages.map(page => page.getByRole('log', { name: 'Match chat messages' }).getByText('Acceptance: good luck <escaped>', { exact: true }).waitFor()));
  record('Durable escaped chat delivered to both coaches and spectator');
  }
  let continuity = assertions.some(item => item.name.startsWith('Save, agree')), permission = assertions.some(item => item.name.startsWith('Wrong-coach')),
    route = assertions.some(item => item.name.startsWith('Real server-bound route')), decisionReconnect = assertions.some(item => item.name.startsWith('Reconnect preserved'));
  for (let index = 0; index < 1500 && view.phase !== 'FULL_TIME'; index++) {
    const before = view;
    if (index % 30 === 0) console.log(JSON.stringify({ decisions: index, revision: view.revision, phase: view.phase, half: view.half, turns: [view.homeTurn, view.awayTurn], score: [view.homeScore, view.awayScore] }));
    if (computer && (view.prompt?.actor ?? view.actor) === 'away') {
      await pages[0].waitForFunction(revision => window.__acceptance.incoming.some(message => message.state?.revision > revision), view.revision);
      await Promise.all(pages.map(page => page.waitForFunction(() => {
        const view = window.__acceptance.incoming.filter(message => message.type === 'setupState' && message.state).at(-1)?.state;
        return view && (view.phase === 'FULL_TIME' || (view.prompt?.actor ?? view.actor) === 'home');
      }, null, { timeout: 120000 })));
      view = await converge((await state(pages[0])).revision);
    } else if (view.prompt) {
      const page = pages[view.prompt.actor === 'home' ? 0 : 1];
      if (!decisionReconnect) {
        await page.reload(); await page.getByLabel('Live match pitch').waitFor();
        await converge(view.revision);
        await page.getByRole('dialog', { name: 'Match decision', exact: true }).waitFor();
        record('Reconnect preserved the native pending decision and its actor'); decisionReconnect = true;
      }
      const option = view.prompt.kind === 'coin' ? 'Heads' : 'Receive';
      view = await advanced(view, () => page.getByRole('dialog', { name: 'Match decision' }).getByRole('button', { name: option, exact: true }).click());
    } else if (view.phase === 'SETUP') view = await arrange(view);
    else {
      if (!permission && !computer) { await negative(view); permission = true; }
      if (view.phase === 'PLAY' && !continuity && !computer && view.actions.some(action => action.kind === 'endTurn')) { view = await pauseResume(view); continuity = true; }
      const action = selectAction(view);
      if (!route && action?.kind === 'move' && action.target && 'x' in action.target) {
        view = await routeUI(view, action); route = true;
      } else view = await actionUI(view, action);
    }
    if (before.half !== view.half || before.homeScore !== view.homeScore || before.awayScore !== view.awayScore || view.phase === 'FULL_TIME') {
      checkpoints.push({ revision: view.revision, half: view.half, drive: view.drive, phase: view.phase, score: [view.homeScore, view.awayScore] });
      await Promise.all(pages.map((page, index) => page.screenshot({ path: resolve(output, `transition-${view.revision}-${['home','away','spectator'][index]}.png`) })));
    }
  }
  assert.equal(view.phase, 'FULL_TIME'); assert.ok(checkpoints.some(checkpoint => checkpoint.half === 2), 'Native halftime reached');
  assert.ok(view.homeScore + view.awayScore > 0, 'Native play includes at least one touchdown');
  record(computer ? 'Human-versus-Orc computer match reached native full time with browser coach decisions'
    : 'Human-versus-Orc match reached full time through both halves using native UI decisions', { revision: view.revision, score: [view.homeScore, view.awayScore] });
  await pages[0].getByRole('link', { name: 'Open final result and replay', exact: true }).click();
  await pages[0].getByRole('region', { name: 'Authoritative result', exact: true }).waitFor();
  await pages[0].getByRole('button', { name: 'Last', exact: true }).click();
  await pages[0].getByRole('region', { name: 'Replay event', exact: true }).getByText(/FULL_TIME/).waitFor();
  await pages[0].screenshot({ path: resolve(output, 'completed-result-last.png'), fullPage: true });
  const result = await pages[0].evaluate(() => window.__acceptance.incoming.filter(message => message.type === 'matchResult' && message.result).at(-1).result);
  assert.equal(result.homeScore, view.homeScore); assert.equal(result.awayScore, view.awayScore); assert.ok(result.eventCount > 32);
  if (!computer) {
    await pages[1].goto(`${origin}/play/result?matchId=${matchId}`);
    await pages[1].getByRole('region', { name: 'Authoritative result', exact: true }).waitFor();
    await pages[1].waitForFunction(() => window.__acceptance.incoming.some(message => message.type === 'matchResult' && message.result));
    const awayResult = await pages[1].evaluate(() => window.__acceptance.incoming.filter(message => message.type === 'matchResult' && message.result).at(-1).result);
    assert.deepEqual(awayResult, result);
    record('Both independent coaches load the identical authoritative completed result');
  }
  await pages[0].getByRole('button', { name: 'First', exact: true }).click();
  await pages[0].getByRole('region', { name: 'Replay event' }).getByRole('heading').filter({ hasText: 'Event 1 of' }).waitFor();
  record('Authoritative completed result and backward replay seek preserved');
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  const frozenTeams = ['home', 'away'].map(role => ({ rosterId: role === 'home' ? 'human' : 'orc',
    teamId: view.players.find(player => player.role === role).id.split(':')[0],
    positions: [...new Set(view.players.filter(player => player.role === role).map(player => player.position))] }));
  await writeFile(resolve(output, 'acceptance.json'), JSON.stringify({ passed: true, protocol: '/browser/v2', browser: browser.version(),
    teams: frozenTeams, matchId, assertions, checkpoints, result, finalState: canonical(view) }, null, 2));
} catch (failure) {
  await Promise.allSettled(pages.map((page, index) => page.screenshot({ path: resolve(output, `failure-${index}.png`) })));
  const protocol = await Promise.all(pages.map(page => page.evaluate(() => ({
    responses: window.__acceptance?.incoming.slice(-12).map(message => ({ type: message.type, code: message.code, revision: message.state?.revision })),
    intents: window.__acceptance?.outgoing.slice(-6).map(message => ({ type: message.type, operation: message.operation, actionId: message.actionId }))
  }))));
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ passed: false, matchId, teams, assertions, checkpoints, state: lastState, lastAction, protocol, errors, failure: failure.message }, null, 2));
  throw failure;
} finally { await browser.close(); }
