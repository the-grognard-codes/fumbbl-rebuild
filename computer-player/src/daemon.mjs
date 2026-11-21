import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertV2Projection } from '../../browser-client/src/v2-projection.ts';
import { parseUniqueJson } from '../../browser-client/src/saved-team-protocol.ts';
import { abandonedWorkerExitCode, idleWorkerExitCode, observeWorkerClose, persistenceUnavailableExitCode, suspendedWorkerExitCode } from './worker-lifecycle.mjs';

const url = option('--url');
const origin = option('--origin');
const tokenFile = option('--service-token-file', false);
// The server admits sixteen sockets total, including coaches, spectators and this dispatcher.
const maxMatches = Number(option('--max-matches', false) ?? 4);
const refreshMs = Number(option('--refresh-ms', false) ?? 30000);
const idleTimeoutMs = Number(option('--idle-timeout-ms', false) ?? 15000);
const maxRememberedEndedMatches = 8192;
if (!url || !origin || !['ws:', 'wss:'].includes(new URL(url).protocol)
  || new URL(url).pathname !== '/browser/v2' || new URL(url).search || new URL(url).hash
  || !/^https?:\/\/[^/]+$/.test(origin) || (!tokenFile && !process.env.FFB_COMPUTER_SERVICE_TOKEN)
  || !Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 64
  || !Number.isInteger(refreshMs) || refreshMs < 1000 || refreshMs > 300000
  || !Number.isInteger(idleTimeoutMs) || idleTimeoutMs < 100 || idleTimeoutMs > 300000) {
  console.error('Usage: node src/daemon.mjs --url <ws(s)://host/browser/v2> --origin <allowed origin> --service-token-file <path> [--max-matches 4] [--refresh-ms 30000]');
  process.exit(2);
}

let socket;
let stopped = false;
let authenticated = false;
let retryDelay = 1000;
let authId;
let registerId;
let sentAt = 0;
let ready = false;
let connectionGeneration = 0;
let watchChangesAttempts = 0;
let watchChangesRetryAt = 0;
let registerWatchesChanges = false;
let watchesChanges = false;
let watchSuspension = true;
let inventoryContinuation;
let registeredMatches;
let activeMatches;
const queued = new Set();
const children = new Map();
const failures = new Map();
const waiting = new Map();
const completed = new Set();

function option(flag, required = true) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return required ? undefined : null;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw Error(`Missing ${flag} value`);
  return process.argv[index + 1];
}
function log(message) { console.log(`[computer-daemon] ${message}`); }
function send(request) { socket.send(JSON.stringify(request)); sentAt = Date.now(); }
function register() {
  if (stopped || !authenticated || !socket || socket.readyState !== WebSocket.OPEN || registerId) return;
  clearTimeout(inventoryContinuation);
  registerId = randomUUID();
  registerWatchesChanges = Date.now() >= watchChangesRetryAt;
  registeredMatches = undefined;
  send({ version: 2, type: 'computer', operation: 'register', requestId: registerId,
    ...(registerWatchesChanges ? { watchChanges: true, ...(watchSuspension ? { watchSuspension: true } : {}) } : {}) });
}
function retryBackoff(attempts, initialMs) {
  return Math.min(initialMs * 2 ** Math.min(attempts - 1, 9), 300000);
}
function markFailure(matchId, reason) {
  const attempts = (failures.get(matchId)?.attempts ?? 0) + 1;
  const delay = retryBackoff(attempts, 1000);
  failures.set(matchId, { attempts, retryAt: Date.now() + delay });
  log(`${reason}; retrying active match ${matchId} after ${delay} ms.`);
}
function parkWorker(matchId, revision, observedGeneration) {
  const previous = waiting.get(matchId);
  const attempts = previous?.revision === revision ? previous.attempts + 1 : 1;
  const delay = Math.round(retryBackoff(attempts, 60000) * (0.8 + Math.random() * 0.2));
  // The next inventory refresh checks this deadline, so fallback retries have refreshMs granularity.
  waiting.set(matchId, { revision, attempts, retryAt: Date.now() + delay, generation: observedGeneration });
  log(`Match ${matchId} yielded its idle worker; waiting for a change or retry after ${delay} ms.`);
}
function withdrawSuspendedMatch(matchId) {
  activeMatches?.delete(matchId);
  registeredMatches?.delete(matchId);
  waiting.delete(matchId);
  failures.delete(matchId);
  queued.delete(matchId);
  const worker = children.get(matchId);
  if (worker) {
    worker.withdrawn = true;
    worker.readvertised = false;
    worker.child.kill();
  }
}
function rememberEndedMatch(matchId) {
  waiting.delete(matchId);
  failures.delete(matchId);
  queued.delete(matchId);
  completed.add(matchId);
  if (ready && !activeMatches) trimLegacyEndedMatches();
}
function trimLegacyEndedMatches() {
  while (completed.size > maxRememberedEndedMatches) completed.delete(completed.values().next().value);
}
function startQueued() {
  while (!stopped && ready && children.size < maxMatches && queued.size) {
    const matchId = queued.values().next().value;
    queued.delete(matchId);
    if (children.has(matchId) || completed.has(matchId)
      || (failures.get(matchId)?.retryAt ?? 0) > Date.now()) continue;
    const args = [fileURLToPath(new URL('./main.mjs', import.meta.url)), '--match', matchId,
      '--url', url, '--origin', origin, '--idle-timeout-ms', String(idleTimeoutMs)];
    if (tokenFile) args.push('--service-token-file', tokenFile);
    const child = spawn(process.execPath, args, { stdio: ['inherit', 'inherit', 'inherit', 'ipc'], env: process.env, windowsHide: true });
    const worker = { child, connectionGeneration, changedRevision: -1, saveResumeRevision: -1, withdrawn: false, readvertised: false };
    children.set(matchId, worker);
    log(`Started match ${matchId}; ${children.size} active computer clients.`);
    child.once('error', error => {
      children.delete(matchId);
      markFailure(matchId, `Could not start match ${matchId}: ${error.message}`);
      startQueued();
    });
    observeWorkerClose(child, (code, idleRevision) => {
      if (children.get(matchId) !== worker) return;
      children.delete(matchId);
      if (worker.withdrawn || code === suspendedWorkerExitCode && watchSuspension && watchesChanges) {
        if (worker.readvertised && !completed.has(matchId)) queued.add(matchId);
      } else if ((code === idleWorkerExitCode || code === suspendedWorkerExitCode) && !stopped) {
        failures.delete(matchId);
        if (!completed.has(matchId) && (!activeMatches || activeMatches.has(matchId))) {
          // A reconnect can miss publications even if the child exits after registration.
          if (worker.changedRevision > idleRevision
            || worker.saveResumeRevision >= 0 && worker.saveResumeRevision === idleRevision) {
            waiting.delete(matchId);
            queued.add(matchId);
          } else {
            parkWorker(matchId, idleRevision, worker.connectionGeneration);
            // Older inventories include saved matches. A change-capable server will announce resume.
            if (code === suspendedWorkerExitCode && watchesChanges) waiting.get(matchId).retryAt = Infinity;
            if (ready) queueAvailableMatches([matchId]);
          }
        }
      } else if (code === persistenceUnavailableExitCode && !stopped) {
        markFailure(matchId, `Match ${matchId} persistence unavailable`);
      } else if (code === abandonedWorkerExitCode) rememberEndedMatch(matchId);
      else if (code === 0) {
        rememberEndedMatch(matchId);
        log(`Match ${matchId} completed.`);
      } else if (!stopped) markFailure(matchId, `Match ${matchId} stopped with status ${code}`);
      startQueued();
    });
  }
}
function queueAvailableMatches(matches) {
  const now = Date.now();
  for (const matchId of matches) {
    const worker = children.get(matchId);
    if (worker?.withdrawn) worker.readvertised = true;
    if (worker || completed.has(matchId)) continue;
    const parked = waiting.get(matchId);
    if (parked && parked.generation !== connectionGeneration) {
      // Recheck missed publications only after the server advertises this job on the new connection.
      const generation = connectionGeneration;
      const delay = 1000 + Math.floor(Math.random() * Math.min(refreshMs, 30000));
      parked.generation = generation;
      parked.retryAt = now + delay;
      setTimeout(() => {
        if (ready && connectionGeneration === generation && waiting.get(matchId) === parked) {
          queued.add(matchId);
          startQueued();
        }
      }, delay).unref();
    } else if (!parked || parked.retryAt <= now) queued.add(matchId);
  }
  startQueued();
}
function reconcileRegisteredMatches(matches) {
  for (const matchId of waiting.keys()) if (!matches.has(matchId)) waiting.delete(matchId);
  for (const matchId of failures.keys()) if (!matches.has(matchId)) failures.delete(matchId);
  for (const matchId of completed) if (!matches.has(matchId)) completed.delete(matchId);
  for (const matchId of queued) if (!matches.has(matchId)) queued.delete(matchId);
  queueAvailableMatches(matches);
}
function receive(raw) {
  if (Buffer.byteLength(raw, 'utf8') > 262144) throw Error('Oversized response');
  const message = parseUniqueJson(raw);
  assertV2Projection(message);
  if (message.version !== 2) throw Error('Wrong protocol version');
  if (message.type === 'error') {
    if (registerWatchesChanges && registerId && message.requestId === registerId && message.code === 'MALFORMED_MESSAGE') {
      // A daemon can be upgraded before its server. Registration still supplies the fallback jobs.
      if (watchSuspension) watchSuspension = false;
      else watchChangesRetryAt = Date.now() + retryBackoff(++watchChangesAttempts, refreshMs);
      registerId = null;
      register();
      return;
    }
    throw Error(`Server error: ${message.code}`);
  }
  if (message.type === 'computerAuthentication' && message.requestId === authId) {
    sentAt = 0;
    if (message.code !== 'ACCEPTED') throw Error('Computer service authentication failed');
    authenticated = true;
    retryDelay = 1000;
    register();
    return;
  }
  if (message.type === 'computer' && message.requestId === registerId) {
    sentAt = 0; registerId = null;
    if (message.code !== 'READY') throw Error(`Computer registration rejected: ${message.code}`);
    if (!ready) log(`Ready for computer matches; capacity ${maxMatches}.`);
    ready = true;
    watchesChanges = registerWatchesChanges;
    if (registerWatchesChanges) { watchChangesAttempts = 0; watchChangesRetryAt = 0; }
    if (message.inventoryPending && watchSuspension && watchesChanges) {
      inventoryContinuation = setTimeout(register, 1000).unref();
    }
    activeMatches = registeredMatches;
    if (activeMatches) reconcileRegisteredMatches(activeMatches);
    else { trimLegacyEndedMatches(); startQueued(); }
    return;
  }
  if (message.type === 'computerJobs') {
    if (message.code !== 'AVAILABLE') throw Error('Invalid computer jobs');
    if (message.requestId === null) {
      for (const matchId of message.matches) {
        activeMatches?.add(matchId);
        const worker = children.get(matchId);
        if (worker) worker.readvertised = true;
      }
      queueAvailableMatches(message.matches);
    } else if (registerId && message.requestId === registerId) {
      registeredMatches ??= new Set();
      for (const matchId of message.matches) registeredMatches.add(matchId);
    }
    return;
  }
  if (message.type === 'computerJobChanged') {
    const { matchId, revision, saveResumeChanged } = message;
    const worker = children.get(matchId);
    if (worker) {
      worker.changedRevision = Math.max(worker.changedRevision, revision);
      if (saveResumeChanged) worker.saveResumeRevision = Math.max(worker.saveResumeRevision, revision);
      return;
    }
    const idleRevision = waiting.get(matchId)?.revision ?? -1;
    if (revision < idleRevision || revision === idleRevision && !saveResumeChanged) return;
    waiting.delete(matchId);
    queued.add(matchId);
    startQueued();
  }
  if (message.type === 'computerJobSuspended') withdrawSuspendedMatch(message.matchId);
  if (message.type === 'computerJobEnded') rememberEndedMatch(message.matchId);
}
async function connect() {
  if (stopped) return;
  const serviceToken = (tokenFile ? await readFile(tokenFile, 'utf8') : process.env.FFB_COMPUTER_SERVICE_TOKEN).trim();
  if (!serviceToken) throw Error('Service token is empty');
  socket = new WebSocket(url, { headers: { Origin: origin } });
  const current = socket;
  current.addEventListener('open', () => {
    authId = randomUUID();
    send({ version: 2, type: 'authenticateComputer', requestId: authId, serviceToken });
  });
  current.addEventListener('message', event => {
    if (socket !== current) return;
    try { receive(String(event.data)); } catch (error) { fail(error); }
  });
  current.addEventListener('error', () => { if (socket === current) log('Transport error.'); });
  current.addEventListener('close', () => {
    if (socket !== current || stopped) return;
    socket = null; sentAt = 0; registerId = null; ready = false; authenticated = false;
    clearTimeout(inventoryContinuation);
    connectionGeneration++;
    queued.clear();
    activeMatches = undefined;
    watchSuspension = true;
    watchChangesAttempts = 0; watchChangesRetryAt = 0;
    const delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, 30000);
    log(`Disconnected; reconnecting in ${delay} ms.`);
    setTimeout(() => connect().catch(fail), delay);
  });
}
function fail(error) { console.error(`[computer-daemon] ${error.message}`); stop(); process.exitCode = 1; }
function stop() {
  stopped = true;
  try { socket?.close(); } catch { /* The socket may still be connecting. */ }
  socket = null;
  for (const { child } of children.values()) child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(register, refreshMs).unref();
setInterval(() => {
  if (sentAt && Date.now() - sentAt > 15000 && socket?.readyState === WebSocket.OPEN) {
    log('Response timed out; reconnecting.');
    socket.close();
  }
}, 2000).unref();
connect().catch(fail);
