import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { decodeSetupStateValue } from '../../browser-client/src/setup-protocol.ts';
import { assertV2Projection } from '../../browser-client/src/v2-projection.ts';
import { parseUniqueJson } from '../../browser-client/src/saved-team-protocol.ts';
import { chooseDecision } from './policy.mjs';

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const matchId = value('--match');
const url = value('--url');
const origin = value('--origin');
const tokenFile = value('--service-token-file', false);
if (!uuid.test(matchId ?? '') || !url || !origin || !['ws:', 'wss:'].includes(new URL(url).protocol)) {
  console.error('Usage: node src/main.mjs --match <uuid> --url <ws(s)://host/browser/v2> --origin <allowed origin> [--service-token-file <path>]');
  process.exit(2);
}
if (new URL(url).pathname !== '/browser/v2' || new URL(url).search || new URL(url).hash || !/^https?:\/\/[^/]+$/.test(origin)) {
  throw Error('Use the exact /browser/v2 endpoint and its allowed Origin.');
}
if (!tokenFile && !process.env.FFB_COMPUTER_SERVICE_TOKEN) throw Error('Set FFB_COMPUTER_SERVICE_TOKEN or pass --service-token-file.');

let socket;
let authenticated = false;
let state;
let pending;
let loadId;
let authenticationId;
let retryDelay = 1000;
let stopped = false;
let turnKey;
let actionsThisTurn = 0;
let lastDecisionKey;
let sentAt = 0;
let setupKey;
let setupVariant = 0;

function value(flag, required = true) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return required ? undefined : null;
  if (index + 1 >= process.argv.length || process.argv[index + 1].startsWith('--')) throw Error(`Missing ${flag} value`);
  return process.argv[index + 1];
}
function send(request) {
  socket.send(JSON.stringify(request));
  if (request.type === 'setup') sentAt = Date.now();
}
function log(message) { console.log(`[computer-player] ${message}`); }
function requestLoad() {
  if (!authenticated || !socket || socket.readyState !== WebSocket.OPEN || loadId || pending) return;
  loadId = randomUUID();
  send({ version: 2, type: 'setup', operation: 'load', requestId: loadId, matchId });
}
function decide() {
  if (!state || pending || loadId || !authenticated || socket?.readyState !== WebSocket.OPEN) return;
  if (state.phase === 'FULL_TIME') { log(`Match complete at revision ${state.revision}.`); stop(); return; }
  const decisionKey = `${state.revision}:${state.saveResume?.status ?? ''}:${state.saveResume?.proposalId ?? ''}`;
  if (decisionKey === lastDecisionKey) return;
  const key = `${state.half}:${state.drive}:${state.homeTurn}:${state.awayTurn}:${state.actor}`;
  if (key !== turnKey) { turnKey = key; actionsThisTurn = 0; }
  const currentSetupKey = state.phase === 'SETUP' ? `${state.half}:${state.drive}:${state.actor}` : null;
  if (currentSetupKey !== setupKey) { setupKey = currentSetupKey; setupVariant = 0; }
  const decision = chooseDecision(state, Math.random, actionsThisTurn, setupVariant);
  if (!decision) {
    const active = !state.saveResume || state.saveResume.status === 'ACTIVE';
    if (active && state.phase === 'SETUP' && state.actor === state.callerRole) throw Error('No legal setup candidate remains');
    if (active && state.actor === state.callerRole && ['PLAY', 'READY_FOR_KICKOFF'].includes(state.phase)
      && state.actions.every(action => action.actor !== state.callerRole)) throw Error(`No server actions at ${state.phase}/${state.turnMode}`);
    return;
  }
  pending = { version: 2, type: 'setup', requestId: randomUUID(), matchId, expectedRevision: state.revision, ...decision };
  lastDecisionKey = decisionKey;
  log(`Revision ${state.revision}: ${decision.operation}${decision.actionId ? ` ${decision.actionId}` : decision.optionId ? ` ${decision.optionId}` : ''}`);
  send(pending);
}
function applyState(raw) {
  const next = decodeSetupStateValue(raw);
  if (next.matchId !== matchId || next.callerRole === 'spectator') throw Error('Unexpected match or role');
  if (!state || next.revision >= state.revision) state = next;
}
function receive(raw) {
  if (Buffer.byteLength(raw, 'utf8') > 262144) throw Error('Oversized response');
  const message = parseUniqueJson(raw);
  assertV2Projection(message);
  if (message.version !== 2) throw Error('Wrong protocol version');
  if (message.type === 'computerAuthentication') {
    if (message.requestId !== authenticationId || message.code !== 'ACCEPTED') throw Error('Authentication failed');
    authenticated = true;
    retryDelay = 1000;
    if (pending) send(pending); else requestLoad();
    return;
  }
  if (message.type === 'error') {
    if (message.requestId === authenticationId || ['AUTHENTICATION_REQUIRED', 'AUTHENTICATION_FAILED', 'CONNECTION_REPLACED', 'AUTHORIZATION'].includes(message.code)) {
      throw Error(`Access unavailable: ${message.code}`);
    }
    if (message.requestId === pending?.requestId) throw Error(`Action rejected: ${message.code}`);
    if (message.requestId === loadId) throw Error(`Load rejected: ${message.code}`);
    return;
  }
  if (message.type !== 'setupState' || (message.requestId !== null && message.requestId !== pending?.requestId && message.requestId !== loadId)) return;
  if (typeof message.code !== 'string' || typeof message.duplicate !== 'boolean'
    || (message.code === 'ACCEPTED' && !message.state)
    || (message.requestId === null && message.code !== 'ACCEPTED')) throw Error('Invalid setup response');
  if (message.state) applyState(message.state);
  if (message.requestId === pending?.requestId) {
    const old = pending;
    pending = null;
    sentAt = 0;
    if (message.code === 'ACCEPTED') {
      if (old.operation === 'action') actionsThisTurn++;
    } else if (message.code === 'ILLEGAL_SETUP' && old.operation === 'confirm') {
      setupVariant++;
      lastDecisionKey = undefined;
    } else if (['STALE_REVISION', 'WRONG_PHASE', 'WRONG_ACTOR', 'PROMPT_MISMATCH'].includes(message.code)) {
      state = null; lastDecisionKey = undefined; requestLoad(); return;
    } else throw Error(`Action rejected: ${message.code}`);
  } else if (message.requestId === loadId) {
    loadId = null;
    sentAt = 0;
    if (message.code === 'NOT_ACTIVATED') { setTimeout(requestLoad, 3000); return; }
    if (message.code !== 'ACCEPTED') throw Error(`Load rejected: ${message.code}`);
  }
  decide();
}
async function connect() {
  if (stopped) return;
  const serviceToken = (tokenFile ? await readFile(tokenFile, 'utf8') : process.env.FFB_COMPUTER_SERVICE_TOKEN).trim();
  if (!serviceToken) throw Error('Service token is empty');
  socket = new WebSocket(url, { headers: { Origin: origin } });
  const current = socket;
  current.addEventListener('open', () => {
    authenticationId = randomUUID();
    send({ version: 2, type: 'authenticateComputer', requestId: authenticationId, serviceToken });
  });
  current.addEventListener('message', event => {
    if (current !== socket) return;
    try { receive(String(event.data)); } catch (error) { fail(error); }
  });
  current.addEventListener('error', event => { if (current === socket) log(`Transport error: ${event.message ?? 'connection failed'}`); });
  current.addEventListener('close', () => {
    if (current !== socket || stopped) return;
    socket = null; loadId = null; state = null; sentAt = 0; authenticated = false;
    const delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, 30000);
    log(`Disconnected; reconnecting in ${delay} ms.`);
    setTimeout(() => connect().catch(fail), delay);
  });
}
function fail(error) {
  console.error(`[computer-player] ${error.message}`);
  stop();
  process.exitCode = 1;
}
function stop() { stopped = true; try { socket?.close(); } catch { /* A connecting socket may already be closing. */ } socket = null; }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(requestLoad, 30000).unref();
setInterval(() => {
  if (sentAt && Date.now() - sentAt > 15000 && socket?.readyState === WebSocket.OPEN) {
    log('Response timed out; reconnecting to retry or reload.');
    socket.close();
  }
}, 2000).unref();
connect().catch(fail);
