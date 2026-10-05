import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertV2Projection } from '../../browser-client/src/v2-projection.ts';
import { parseUniqueJson } from '../../browser-client/src/saved-team-protocol.ts';

const url = option('--url');
const origin = option('--origin');
const tokenFile = option('--service-token-file', false);
const maxMatches = Number(option('--max-matches', false) ?? 32);
const refreshMs = Number(option('--refresh-ms', false) ?? 30000);
if (!url || !origin || !['ws:', 'wss:'].includes(new URL(url).protocol)
  || new URL(url).pathname !== '/browser/v2' || new URL(url).search || new URL(url).hash
  || !/^https?:\/\/[^/]+$/.test(origin) || (!tokenFile && !process.env.FFB_COMPUTER_SERVICE_TOKEN)
  || !Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 64
  || !Number.isInteger(refreshMs) || refreshMs < 1000 || refreshMs > 300000) {
  console.error('Usage: node src/daemon.mjs --url <ws(s)://host/browser/v2> --origin <allowed origin> --service-token-file <path> [--max-matches 32] [--refresh-ms 30000]');
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
const queued = new Set();
const children = new Map();
const failures = new Map();
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
  registerId = randomUUID();
  send({ version: 2, type: 'computer', operation: 'register', requestId: registerId });
}
function markFailure(matchId, reason) {
  const attempts = (failures.get(matchId)?.attempts ?? 0) + 1;
  const delay = Math.min(1000 * 2 ** Math.min(attempts - 1, 9), 300000);
  failures.set(matchId, { attempts, retryAt: Date.now() + delay });
  log(`${reason}; retrying active match ${matchId} after ${delay} ms.`);
}
function startQueued() {
  while (!stopped && children.size < maxMatches && queued.size) {
    const matchId = queued.values().next().value;
    queued.delete(matchId);
    if (children.has(matchId) || completed.has(matchId)
      || (failures.get(matchId)?.retryAt ?? 0) > Date.now()) continue;
    const args = [fileURLToPath(new URL('./main.mjs', import.meta.url)), '--match', matchId,
      '--url', url, '--origin', origin];
    if (tokenFile) args.push('--service-token-file', tokenFile);
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env, windowsHide: true });
    children.set(matchId, child);
    log(`Started match ${matchId}; ${children.size} active computer clients.`);
    child.once('error', error => {
      children.delete(matchId);
      markFailure(matchId, `Could not start match ${matchId}: ${error.message}`);
      startQueued();
    });
    child.once('exit', code => {
      if (children.get(matchId) !== child) return;
      children.delete(matchId);
      if (code !== 0 && !stopped) markFailure(matchId, `Match ${matchId} stopped with status ${code}`);
      else if (code === 0) { completed.add(matchId); failures.delete(matchId); log(`Match ${matchId} completed.`); }
      startQueued();
    });
  }
}
function receive(raw) {
  if (Buffer.byteLength(raw, 'utf8') > 262144) throw Error('Oversized response');
  const message = parseUniqueJson(raw);
  assertV2Projection(message);
  if (message.version !== 2) throw Error('Wrong protocol version');
  if (message.type === 'error') throw Error(`Server error: ${message.code}`);
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
    return;
  }
  if (message.type === 'computerJobs' && message.requestId === null) {
    if (message.code !== 'AVAILABLE') throw Error('Invalid computer jobs');
    for (const matchId of message.matches) if (!children.has(matchId) && !completed.has(matchId)
      && (failures.get(matchId)?.retryAt ?? 0) <= Date.now()) queued.add(matchId);
    startQueued();
  }
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
  for (const child of children.values()) child.kill();
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
