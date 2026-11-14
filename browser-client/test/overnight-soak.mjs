// Unattended overnight latency soak against the local dev stack (localhost only).
//
// Plays the home side of AI-opponent matches through the production UI and
// periodically records: diagnostics overlay exports (60 s rolling windows),
// Chrome performance traces around scripted pitch pans, page runtime metrics,
// server container stats, and the arrival time of every authoritative revision.
//
// Usage (from browser-client/, Node 26):
//   node test/overnight-soak.mjs --sign-in            # once: sign in by hand in the soak Chrome profile
//   node test/overnight-soak.mjs --hours 7            # unattended run
//   node test/overnight-soak.mjs --minutes 10         # short smoke run
// Options: --origin http://localhost:5000  --output <dir>  --opponent <AI coach button name>
//          --export-every 50  --pan-every 300  --trace-every 1800  --trace-seconds 20  (seconds)
//
// Sign-in uses a dedicated Chrome profile under .tools/overnight-soak/chrome-profile.
// Chrome is started normally and attached over CDP, so provider sign-in pages work.
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { chromium } from 'playwright';
import { squarePosition } from './projected-pitch-helper.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index < 0 ? fallback : args[index + 1]; };
const signInOnly = args.includes('--sign-in');
const origin = option('origin', 'http://localhost:5000');
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('The soak only runs against a loopback dev stack');
const runMs = (Number(option('hours', 0)) * 60 + Number(option('minutes', 0))) * 60_000 || 6 * 3_600_000;
const every = { export: Number(option('export-every', 50)) * 1000, pan: Number(option('pan-every', 300)) * 1000,
  trace: Number(option('trace-every', 1800)) * 1000, traceLength: Number(option('trace-seconds', 20)) * 1000,
  metrics: 30_000, docker: 60_000, status: 60_000 };
const opponent = option('opponent', null);
const chromePath = option('chrome', process.env.SOAK_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
const debugPort = Number(option('port', 9333));
const profile = resolve(root, '.tools/overnight-soak/chrome-profile');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(option('output', resolve(root, `.tools/overnight-soak/run-${stamp}`)));
const dockerServer = option('server-container', 'ffb-match-review-server-1');

const sleep = ms => new Promise(done => setTimeout(done, ms));
const log = (event, details = {}) => {
  const line = JSON.stringify({ wall: new Date().toISOString(), event, ...details });
  console.log(line); if (!signInOnly) appendFileSync(resolve(output, 'events.jsonl'), line + '\n');
};

// ---------------------------------------------------------------- Chrome lifecycle
let chrome, browser, context, page, cdp;
async function launchChrome(url) {
  mkdirSync(profile, { recursive: true });
  chrome = spawn(chromePath, [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--start-maximized',
    // Keep rendering if the display turns off or the window is covered overnight.
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    url], { stdio: 'ignore', windowsHide: false });
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) break; } catch { /* starting */ }
    await sleep(500);
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  context = browser.contexts()[0];
  page = context.pages().find(candidate => candidate.url().startsWith(origin)) ?? context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(20_000);
}
async function closeChrome() {
  // Close through CDP first so the profile (including the sign-in session) is flushed to disk.
  try { const session = await browser.newBrowserCDPSession(); await session.send('Browser.close'); } catch { /* already gone */ }
  await sleep(3000);
  try { await browser?.close(); } catch { /* already gone */ }
  try { chrome?.kill(); } catch { /* already gone */ }
}
async function awaitSignIn(minutes) {
  log('waiting-for-sign-in', { minutes });
  console.log(`Not signed in. Sign in with your dev account in the soak Chrome window (waiting up to ${minutes} minutes)...`);
  const deadline = Date.now() + minutes * 60_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.startsWith(`${origin}/play`) && await connected(5000)) { log('signed-in'); return true; }
    if (!url.startsWith(`${origin}/login`) && !url.startsWith(`${origin}/signin`) && url.startsWith(origin)) await page.goto(`${origin}/play`).catch(() => {});
    await sleep(3000);
  }
  return false;
}

async function connected(timeout) {
  // /play has no "Connected" status label; its game-mode buttons render only for a signed-in, connected coach.
  // The mode buttons also render while disconnected (for example after AUTHENTICATION FAILED), so
  // require the absence of the Disconnected status as well.
  if (!await page.getByRole('button', { name: 'AI Opponent', exact: true }).waitFor({ timeout }).then(() => true, () => false)) return false;
  const deadline = Date.now() + Math.min(timeout, 10_000);
  do {
    if (!await page.getByRole('status').filter({ hasText: /^Disconnected$/ }).count()) return true;
    await sleep(500);
  } while (Date.now() < deadline);
  return false;
}

if (signInOnly) {
  await launchChrome(`${origin}/login`);
  console.log('Sign in with your dev account in the Chrome window that just opened. Waiting up to 15 minutes...');
  const deadline = Date.now() + 15 * 60_000;
  let ok = false;
  while (!ok && Date.now() < deadline) {
    if (/\/(play|teambuilder)/.test(page.url())) ok = await connected(5000);
    else { await sleep(3000); if (!/\/login|\/signin|accounts\.|login\.microsoft/.test(page.url())) await page.goto(`${origin}/play`).catch(() => {}); }
  }
  console.log(ok ? 'Signed in and connected. The soak profile is ready.' : 'Timed out waiting for sign-in.');
  if (ok) await sleep(5000); // let the auth session persist before the clean close
  await closeChrome(); process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------- page instrumentation
mkdirSync(resolve(output, 'captures'), { recursive: true });
mkdirSync(resolve(output, 'traces'), { recursive: true });
mkdirSync(resolve(output, 'screenshots'), { recursive: true });

// Bounded, payload-free observer: latest state for decisions plus a revision arrival log.
function instrument() {
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('moles.diagnostics.preferences') ?? '{}') ?? {}; } catch { return {}; } })();
  try { localStorage.setItem('moles.diagnostics.preferences', JSON.stringify({ ...prefs, window: 60, details: true, probes: true })); } catch { /* optional */ }
  const soak = window.__soak = { state: null, revision: -1, arrivals: [], outgoing: [], failures: [], seq: 0, exports: [], sockets: 0 };
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(...rest) {
      super(...rest); soak.sockets++;
      this.addEventListener('message', event => {
        let message; try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'setupState' && message.state) {
          soak.state = message.state; soak.revision = message.state.revision;
          soak.arrivals.push({ at: performance.now(), wall: Date.now(), revision: message.state.revision, actor: message.state.prompt?.actor ?? message.state.actor,
            phase: message.state.phase, bytes: event.data.length });
          if (soak.arrivals.length > 20_000) soak.arrivals.splice(0, 10_000);
        }
        const sent = message.requestId && soak.outgoing.find(entry => entry.requestId === message.requestId);
        if (sent && message.code && message.code !== 'ACCEPTED') soak.failures.push({ seq: sent.seq, code: message.code, operation: sent.operation });
        if (soak.failures.length > 200) soak.failures.splice(0, 100);
      });
    }
    send(raw) {
      try { const message = JSON.parse(raw); if (message.type === 'setup') {
        soak.outgoing.push({ seq: ++soak.seq, requestId: message.requestId, operation: message.operation, at: performance.now() });
        if (soak.outgoing.length > 200) soak.outgoing.splice(0, 100);
      } } catch { /* not JSON */ }
      super.send(raw);
    }
  };
  // Keep diagnostics exports in memory instead of filling the Downloads folder.
  const click = HTMLAnchorElement.prototype.click;
  const blobs = new Map(), create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = object => { const url = create(object); if (object instanceof Blob) blobs.set(url, object); return url; };
  HTMLAnchorElement.prototype.click = function () {
    if (this.download === 'mutp-performance-capture.json' && blobs.has(this.href)) { soak.exports.push(blobs.get(this.href)); blobs.delete(this.href); return; }
    return click.call(this);
  };
}

// ---------------------------------------------------------------- state helpers
const state = () => page.evaluate(() => window.__soak?.state ?? null);
const revision = () => page.evaluate(() => window.__soak?.revision ?? -1);
const mine = view => view && view.phase !== 'FULL_TIME' && (view.prompt?.actor ?? view.actor) === view.callerRole
  && (view.prompt || view.phase === 'SETUP' || view.actions?.length);

async function advanced(view, intent) {
  const mark = await page.evaluate(() => window.__soak.seq);
  await intent();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await page.evaluate(mark => ({ revision: window.__soak.revision,
      failure: window.__soak.failures.find(entry => entry.seq > mark) ?? null }), mark);
    if (result.failure) throw Error(`setup ${result.failure.operation} rejected: ${result.failure.code}`);
    if (result.revision > view.revision) return state();
    await sleep(25);
  }
  throw Error(`no new revision after intent at ${view.revision}`);
}

async function setDebug(open) {
  const toggle = page.getByRole('button', { name: 'Debug', exact: true });
  if ((await toggle.getAttribute('aria-expanded') === 'true') !== open) await toggle.click();
}

async function ensureDiagnostics() {
  const overlay = page.getByLabel('Performance diagnostics', { exact: true });
  if (await overlay.count()) return true;
  await setDebug(true);
  await page.getByLabel('Diagnostics display').selectOption('graph');
  const details = page.getByLabel('Detailed phase traces', { exact: true });
  if (!await details.isChecked()) await details.check();
  await page.getByRole('button', { name: 'Close debug panel', exact: true }).click().catch(() => setDebug(false));
  await overlay.waitFor({ timeout: 10_000 });
  log('diagnostics-enabled');
  return true;
}

// ---------------------------------------------------------------- home-side policy (from real-server-match.mjs)
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const attempts = new Set(), blockAttempts = new Set(), turnActions = new Map();
function selectAction(view) {
  const role = view.callerRole;
  if (view.phase === 'READY_FOR_KICKOFF') return view.actions.find(action => action.id.endsWith(role === 'home' ? 'kick-17-7' : 'kick-8-7')) ?? view.actions[0];
  for (const suffix of [':decline-event', ':end-event', ':reroll:team', ':skill:true']) {
    const offered = view.actions.find(action => action.id.endsWith(suffix)); if (offered) return offered;
  }
  if (view.actions.some(action => action.kind === 'blockDie'))
    return view.actions.find(action => action.kind === 'blockDie' && /Defender Down|Defender Stumbles|Push/i.test(action.label))
      ?? view.actions.find(action => action.kind === 'blockDie');
  const turnKey = `${view.half}:${view.drive}:${view.homeTurn}:${view.awayTurn}`;
  const count = (turnActions.get(turnKey) ?? 0) + 1; turnActions.set(turnKey, count);
  if (turnActions.size > 500) turnActions.clear();
  if (count > 14) return view.actions.find(action => action.kind === 'endAction') ?? view.actions.find(action => action.kind === 'endTurn') ?? view.actions[0];
  const block = view.actions.find(action => action.kind === 'block'); if (block) return block;
  const blockKey = `${turnKey}:block`;
  if (!view.activePlayerId && !blockAttempts.has(blockKey)) {
    const blocker = view.actions.find(action => action.kind === 'selectBlock');
    if (blocker) { blockAttempts.add(blockKey); return blocker; }
  }
  if (view.actions.some(action => action.kind === 'endTurn') && view.ball) {
    const carrier = view.players.find(player => player.x === view.ball.x && player.y === view.ball.y);
    if (!carrier || carrier.role === role) {
      const selecting = view.actions.filter(action => action.kind === 'select').map(action => ({ action, player: view.players.find(player => action.id.endsWith(player.id)) }))
        .filter(item => item.player && item.player.x !== null);
      selecting.sort((a, b) => distance(a.player, view.ball) - distance(b.player, view.ball));
      const active = view.players.find(player => player.id === view.activePlayerId);
      if (!active && selecting.length && !attempts.has(turnKey)) { attempts.add(turnKey); return selecting[0].action; }
      if (active) {
        const target = carrier?.id === active.id ? { x: role === 'home' ? 25 : 0, y: active.y } : view.ball;
        const occupied = new Set(view.players.filter(player => player.id !== active.id && player.x !== null).map(player => `${player.x},${player.y}`));
        const distances = new Map([[`${target.x},${target.y}`, 0]]), queue = [target];
        for (let index = 0; index < queue.length; index++) {
          const at = queue[index], depth = distances.get(`${at.x},${at.y}`);
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const x = at.x + dx, y = at.y + dy, key = `${x},${y}`;
            if (x >= 0 && x < 26 && y >= 0 && y < 15 && !occupied.has(key) && !distances.has(key)) { distances.set(key, depth + 1); queue.push({ x, y }); }
          }
        }
        const pathDistance = point => distances.get(`${point.x},${point.y}`) ?? 1000;
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

async function confirm(view) {
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Confirmed!' && !button.disabled), null, { timeout: 10_000 });
  return advanced(view, () => page.getByRole('button', { name: 'Confirmed!', exact: true }).press('Enter'));
}

async function debugAction(view, action) {
  await setDebug(true);
  await page.getByLabel('Server action', { exact: true }).selectOption(action.id);
  await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  return confirm(view);
}

async function actionUI(view, action) {
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
  if (['blockDie', 'reroll', 'skill', 'kickoffChoice', 'push'].includes(action.kind) && await direct.count()) return advanced(view, () => direct.click());
  // Optional kickoff events (for example High Kick: "select up to 1") keep Confirmed! disabled until a
  // player is picked; the soak takes the always-valid skip instead.
  const skip = page.getByRole('button', { name: 'Skip event', exact: true });
  if (['kickoffChoice', 'kickoffMove', 'touchback'].includes(action.kind) && await skip.isVisible().catch(() => false)
    && await skip.isEnabled().catch(() => false)) return advanced(view, () => skip.click());
  const kickoffPlayerId = view.turnMode === 'TOUCHBACK' && action.kind === 'touchback' && action.target && 'playerId' in action.target
    ? action.target.playerId : view.turnMode === 'HIGH_KICK' && action.kind === 'kickoffMove' ? action.sourcePlayerId : null;
  if (kickoffPlayerId) {
    await setDebug(false);
    const player = view.players.find(item => item.id === kickoffPlayerId);
    await squarePosition(page, player.x, player.y);
    await page.locator(`.live-marker[data-player-id="${player.id}"]`).press('Enter');
  } else if (action.kind === 'endTurn') {
    await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  } else if (action.kind === 'move' && action.target && 'x' in action.target) {
    // Real pointer path: select the player, then click the destination square.
    await setDebug(false);
    const player = view.players.find(item => item.id === action.sourcePlayerId);
    await squarePosition(page, player.x, player.y);
    await page.locator(`.live-marker[data-player-id="${player.id}"]`).press('Enter');
    const position = await squarePosition(page, action.target.x, action.target.y);
    await page.locator('.live-pitch-scene').click({ position });
  } else return debugAction(view, action);
  return confirm(view);
}

async function arrange(view) {
  // Prefer the coach's saved formations (the normal human path); fall back to per-player debug placement.
  await setDebug(false);
  const formations = page.getByRole('region', { name: 'Saved Formations', exact: true }).getByRole('button');
  const count = await formations.count();
  for (let index = 0; index < count; index++) {
    if (!await formations.nth(index).isEnabled()) continue;
    await formations.nth(index).click();
    const ready = await page.waitForFunction(() => [...document.querySelectorAll('button')]
      .some(button => button.textContent.trim().endsWith('Confirmed!') && !button.disabled), null, { timeout: 15_000 }).then(() => true, () => false);
    if (!ready) continue;
    const fresh = await state();
    try { return await advanced(fresh, () => page.getByRole('button', { name: /Confirmed!$/ }).first().click()); }
    catch (failure) { log('formation-rejected', { index, reason: failure.message.slice(0, 160) }); view = await state(); }
  }
  return arrangeByDebug(view);
}

async function arrangeByDebug(view) {
  const role = view.callerRole;
  if (!await page.getByRole('region', { name: 'Setup placement', exact: true }).isVisible()) await setDebug(true);
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
  view = await advanced(view, () => page.getByRole('button', { name: 'Confirmed!', exact: true }).click());
  await setDebug(false);
  return view;
}

async function decide(view) {
  if (view.prompt) {
    const option = view.prompt.kind === 'coin' ? 'Heads' : 'Receive';
    const button = page.getByRole('dialog', { name: 'Match decision' }).getByRole('button', { name: option, exact: true });
    if (await button.count()) return advanced(view, () => button.click());
    return actionUI(view, view.actions[0]);
  }
  if (view.phase === 'SETUP') return arrange(view);
  const action = selectAction(view);
  try { return await actionUI(view, action); }
  catch (failure) {
    if (/COMPLETION_PENDING/.test(failure.message)) {
      // The final decision is durable; the server's timer retries the result write. Wait, then reload.
      log('completion-pending', { revision: view.revision });
      await sleep(5000); await page.reload(); await page.getByLabel('Live match pitch').waitFor({ timeout: 60_000 });
      await ensureDiagnostics();
      return state();
    }
    log('ui-action-fallback', { kind: action.kind, reason: failure.message.slice(0, 200) });
    const fresh = await state();
    if (fresh.revision !== view.revision || !fresh.actions.some(item => item.id === action.id)) return fresh;
    return debugAction(fresh, action);
  }
}

// ---------------------------------------------------------------- match lifecycle
let matches = 0, completed = 0, decisions = 0, errors = 0, screenshots = 0;
async function rejectedSignIn() {
  const alerts = (await page.getByRole('alert').allTextContents().catch(() => [])).join(' ');
  if (/AUTHENTICATION FAILED/i.test(alerts)) throw Error('AUTHENTICATION_FAILED: the game server rejected sign-in; refresh its ADC (gcloud auth application-default login) and restart the server');
}
// A refused completion write (COMPLETION_PENDING) leaves the client holding the request; repeating it is the
// coach's documented recovery, and until it succeeds Play keeps routing back to the unfinished match.
async function repeatRetainedRequest() {
  const repeat = page.getByRole('button', { name: 'Repeat retained request', exact: true });
  if (!await repeat.isVisible().catch(() => false)) return false;
  log('retained-request-repeated', { url: page.url() });
  await repeat.click();
  await sleep(5000);
  return true;
}

async function createMatch() {
  await page.goto(`${origin}/play`);
  if (/\/play\/match/.test(page.url()) && await repeatRetainedRequest()) await page.goto(`${origin}/play`);
  if (!await connected(30_000)) {
    // Only a redirect to the login page means signed out. Otherwise the game server is down or restarting.
    // The server rejects every sign-in when its Google credentials (ADC) can no longer refresh.
    await rejectedSignIn();
    if (!/\/(login|signin)/.test(page.url())) throw Error('SERVER_UNAVAILABLE: play page did not connect');
    if (!await awaitSignIn(20)) throw Error('NOT_SIGNED_IN: sign in within the soak Chrome window when it opens');
    await page.goto(`${origin}/play`);
    if (!await connected(30_000)) throw Error('SERVER_UNAVAILABLE: play page did not connect after sign-in');
  }
  await page.getByRole('button', { name: 'AI Opponent', exact: true }).click();
  if (opponent) await page.getByRole('button', { name: opponent, exact: true }).click();
  for (const name of [/^Your saved team/, /^Roster for /]) {
    const select = page.getByRole('combobox', { name }).first();
    await select.waitFor();
    // Saved teams arrive over the socket after the page renders; wait for a selectable one.
    let value;
    for (let attempt = 0; attempt < 60 && !value; attempt++) {
      value = await select.evaluate(element => [...element.options].find(option => option.value && !option.disabled)?.value);
      if (!value) await sleep(500);
    }
    if (!value) {
      // A sign-in the server rejects after the page connects also leaves the team lists empty.
      await rejectedSignIn();
      if (await page.getByRole('status').filter({ hasText: /^Disconnected$/ }).count()) {
        throw Error('SERVER_UNAVAILABLE: disconnected before saved teams loaded');
      }
      throw Error('NO_SAVED_TEAM: save at least one current team for this account');
    }
    await select.selectOption(value);
  }
  await page.getByRole('button', { name: 'Create computer game', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click({ timeout: 60_000 });
  await page.waitForURL(/\/play\/match/, { timeout: 60_000 });
  await page.getByLabel('Live match pitch').waitFor({ timeout: 60_000 });
  matches++; log('match-started', { matches, url: page.url() });
}

// ---------------------------------------------------------------- recorders
let exportsSaved = 0, tracesSaved = 0, lastArrivalFlush = 0;
async function exportCapture() {
  const overlay = page.getByLabel('Performance diagnostics', { exact: true });
  if (!await overlay.count()) await ensureDiagnostics();
  await overlay.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const text = await page.evaluate(async () => { const blob = window.__soak.exports.shift(); window.__soak.exports.length = 0; return blob ? blob.text() : null; });
  if (!text) throw Error('diagnostics export produced nothing');
  writeFileSync(resolve(output, 'captures', `capture-${String(++exportsSaved).padStart(4, '0')}.json`), text);
}
async function flushArrivals() {
  const rows = await page.evaluate(() => window.__soak.arrivals.splice(0));
  if (rows.length) appendFileSync(resolve(output, 'revisions.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
}
async function metrics() {
  if (!cdp) { cdp = await context.newCDPSession(page); await cdp.send('Performance.enable'); }
  const { metrics: values } = await cdp.send('Performance.getMetrics');
  const view = await state();
  appendFileSync(resolve(output, 'page-metrics.jsonl'), JSON.stringify({ wall: Date.now(), revision: view?.revision, phase: view?.phase,
    half: view?.half, turns: view ? [view.homeTurn, view.awayTurn] : null, domNodes: await page.evaluate(() => document.getElementsByTagName('*').length),
    ...Object.fromEntries(values.map(metric => [metric.name, metric.value])) }) + '\n');
}
function dockerStats() {
  try {
    const text = execFileSync('docker', ['stats', '--no-stream', '--format', '{{json .}}', dockerServer], { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
    appendFileSync(resolve(output, 'server-stats.jsonl'), JSON.stringify({ wall: Date.now(), ...JSON.parse(text.trim()) }) + '\n');
  } catch { /* docker optional */ }
}
async function pan(label) {
  const viewport = page.locator('.live-pitch-viewport').first();
  if (!await viewport.count()) return;
  const box = await viewport.boundingBox(); if (!box) return;
  const x = box.x + box.width * .5, y = box.y + box.height * .5;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  // Human-paced drag: ~60 Hz pointer moves, out and back twice, then a sideways sweep.
  for (const [dx, dy] of [[0, 140], [0, -140], [0, 140], [0, -140], [160, 0], [-160, 0]]) {
    for (let step = 1; step <= 40; step++) {
      const t = step / 40;
      await page.mouse.move(x + dx * Math.sin(t * Math.PI / 2), y + dy * Math.sin(t * Math.PI / 2));
      await sleep(16);
    }
  }
  await page.mouse.up({ button: 'right' });
  log('pan', { label });
}
async function trace() {
  const session = await context.newCDPSession(page);
  const file = resolve(output, 'traces', `trace-${String(++tracesSaved).padStart(3, '0')}.json.gz`);
  // Input latency (EventLatency), frame pipeline, main-thread tasks and app timing marks; opens directly in DevTools.
  await session.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { recordMode: 'recordContinuously',
    includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', 'v8.execute',
      'input', 'latencyInfo'] } });
  const started = Date.now();
  const complete = new Promise(done => session.once('Tracing.tracingComplete', done));
  try {
    // Fixed-length window: the AI keeps playing; our own decisions wait so the trace cannot overrun.
    await sleep(3000); await pan(`trace-${tracesSaved}`);
    while (Date.now() - started < every.traceLength) await sleep(250);
  } finally { await session.send('Tracing.end'); }
  const { stream } = await complete;
  const out = createGzip(), sink = createWriteStream(file); out.pipe(sink);
  const written = new Promise((done, fail) => { sink.once('finish', done); sink.once('error', fail); });
  for (;;) { const chunk = await session.send('IO.read', { handle: stream, size: 1 << 20 }); out.write(chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data); if (chunk.eof) break; }
  out.end(); await written; await session.send('IO.close', { handle: stream }); await session.detach();
  log('trace-saved', { file: file.replace(root, '') });
}

// ---------------------------------------------------------------- main loop
let lastView = null, lastChange = Date.now();
async function maybeDecide() {
  const view = await state();
  if (!view) return;
  if (view.revision !== lastView?.revision) { lastChange = Date.now(); lastView = view; }
  if (!mine(view)) return;
  const next = await decide(view); decisions++;
  if (next) { lastView = next; lastChange = Date.now(); }
}

async function screenshot(name) {
  if (screenshots >= 60) return;
  await page.screenshot({ path: resolve(output, 'screenshots', `${String(++screenshots).padStart(2, '0')}-${name}.png`) }).catch(() => {});
}

const started = Date.now(), deadline = started + runMs;
writeFileSync(resolve(output, 'run.json'), JSON.stringify({ origin, startedAt: new Date(started).toISOString(), plannedMinutes: runMs / 60_000,
  every, cpu: cpus()[0]?.model, cores: cpus().length, memoryGiB: Math.round(totalmem() / 2 ** 30), node: process.version }, null, 2));
await launchChrome('about:blank');
await context.addInitScript(instrument);
log('run-started', { output: output.replace(root, ''), plannedMinutes: runMs / 60_000, browser: browser.version() });
await page.evaluate(() => { window.scrollTo(0, 0); }).catch(() => {});
const viewportInfo = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio, userAgent: navigator.userAgent }));
log('viewport', viewportInfo);

const due = { export: 0, pan: Date.now() + 60_000, trace: Date.now() + 120_000, metrics: 0, docker: 0, status: 0 };
let consecutiveFailures = 0, needMatch = true, unavailableSince = null;
while (Date.now() < deadline) {
  try {
    if (!browser.isConnected()) { log('browser-reconnect'); await closeChrome(); await launchChrome('about:blank'); await context.addInitScript(instrument); cdp = null; needMatch = true; }
    if (needMatch) { await createMatch(); await ensureDiagnostics(); needMatch = false; unavailableSince = null; lastChange = Date.now(); lastView = null; }
    const now = Date.now();
    if (now >= due.export) { await exportCapture(); due.export = now + every.export; }
    if (now >= due.metrics) { await metrics(); await flushArrivals(); due.metrics = now + every.metrics; }
    if (now >= due.docker) { dockerStats(); due.docker = now + every.docker; }
    if (now >= due.trace) { await trace(); due.trace = Date.now() + every.trace; due.pan = Date.now() + every.pan; }
    else if (now >= due.pan) { await pan('scheduled'); due.pan = now + every.pan; }
    if (now >= due.status) {
      const view = await state();
      const status = { wall: new Date().toISOString(), elapsedMinutes: Math.round((now - started) / 60_000), matches, completed, decisions, errors,
        exports: exportsSaved, traces: tracesSaved, revision: view?.revision, phase: view?.phase, half: view?.half, score: view ? [view.homeScore, view.awayScore] : null };
      writeFileSync(resolve(output, 'status.json'), JSON.stringify(status, null, 2)); log('status', status); due.status = now + every.status;
    }
    await maybeDecide();
    const view = lastView;
    if (view?.phase === 'FULL_TIME') {
      completed++; log('match-completed', { revision: view.revision, score: [view.homeScore, view.awayScore] });
      await exportCapture().catch(() => {}); await flushArrivals().catch(() => {});
      await screenshot('full-time'); await sleep(10_000); await repeatRetainedRequest(); needMatch = true; continue;
    }
    if (Date.now() - lastChange > 20 * 60_000) { log('stalled-new-match', { revision: view?.revision }); await screenshot('stalled'); needMatch = true; continue; }
    if (Date.now() - lastChange > 8 * 60_000 && !mine(view)) {
      log('stalled-reload', { revision: view?.revision }); await screenshot('stall'); lastChange = Date.now() - 8 * 60_000 + 60_000;
      await page.reload(); await page.getByLabel('Live match pitch').waitFor({ timeout: 60_000 }); await ensureDiagnostics(); continue;
    }
    consecutiveFailures = 0;
    await page.waitForFunction(revision => window.__soak?.revision !== revision, lastView?.revision ?? -1, { timeout: 1000 }).catch(() => {});
  } catch (failure) {
    errors++; consecutiveFailures++;
    log('error', { consecutive: consecutiveFailures, message: String(failure?.message ?? failure).split('\n')[0].slice(0, 300) });
    if (/NOT_SIGNED_IN|AUTHENTICATION_FAILED/.test(failure?.message)) break;
    if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|SERVER_UNAVAILABLE|NO_SAVED_TEAM/.test(failure?.message)) {
      // Server down or restarting (for example after an OOM exit): teams and the socket come back on their own.
      unavailableSince ??= Date.now();
      if (Date.now() - unavailableSince > 15 * 60_000) { log('server-unavailable-giving-up', { minutes: 15 }); break; }
      log('server-unreachable-backoff'); needMatch = true; consecutiveFailures = 0; await sleep(30_000); continue;
    }
    await screenshot('error');
    try {
      if (consecutiveFailures >= 6) { needMatch = true; consecutiveFailures = 0; }
      else if (browser.isConnected()) { await page.reload(); await page.getByLabel('Live match pitch').waitFor({ timeout: 60_000 }); await ensureDiagnostics(); }
    } catch (recovery) { log('recovery-failed', { message: String(recovery?.message).split('\n')[0].slice(0, 200) }); needMatch = true; }
    await sleep(2000);
  }
}
await flushArrivals().catch(() => {});
log('run-finished', { matches, completed, decisions, errors, exports: exportsSaved, traces: tracesSaved });
writeFileSync(resolve(output, 'status.json'), JSON.stringify({ finished: new Date().toISOString(), matches, completed, decisions, errors, exports: exportsSaved, traces: tracesSaved }, null, 2));
await closeChrome();
process.exit(matches === 0 ? 1 : 0);
