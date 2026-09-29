// One-command lifecycle for the isolated, real-DEV Firebase match review stack.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startReview } from './match-review-start.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const toolsDirectory = join(root, '.tools');
const stateFile = join(toolsDirectory, 'dev-local-state.json');
const serverName = 'ffb-match-review-server-1';
const databaseName = 'ffb-match-review-database-1';
const project = 'dev-moles-under-the-pitch-org';
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const mode = process.argv[2];

function run(file, args, options = {}) {
  return execFileSync(file, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024,
    ...options });
}

function inspect(name, service) {
  const [container] = JSON.parse(run('docker', ['inspect', '--type', 'container', name]));
  if (container?.Name !== `/${name}` || container.Config?.Labels?.['com.docker.compose.project'] !== 'ffb-match-review'
    || container.Config.Labels['com.docker.compose.service'] !== service) throw Error('REVIEW_CONTAINER_MISMATCH');
  return container;
}

function mountSource(container, destination) {
  const mounts = container.Mounts.filter(mount => mount.Destination === destination);
  if (mounts.length !== 1 || mounts[0].Type !== 'bind' || mounts[0].RW !== false || !existsSync(mounts[0].Source))
    throw Error('REVIEW_MOUNT_UNAVAILABLE');
  return mounts[0].Source;
}

export function composeEnvironment(server, database) {
  return {
    M6_ADC_FILE: mountSource(server, '/run/adc/application_default_credentials.json'),
    M6_DB_PASSWORD_FILE: mountSource(server, '/run/secrets/db_password'),
    M6_DB_ROOT_PASSWORD_FILE: mountSource(database, '/run/secrets/db_root_password'),
    M6_ADMIN_PASSWORD_FILE: mountSource(server, '/run/secrets/admin_password'),
    M6_COACH_PASSWORD_FILE: mountSource(server, '/run/secrets/coach_password'),
  };
}

function findNginx() {
  const candidates = [process.env.NGINX_LOCAL_BINARY, join(root, '.tools', 'nginx-1.30.5', 'nginx.exe')];
  const worktrees = run('git', ['worktree', 'list', '--porcelain']).split(/\r?\n/)
    .filter(line => line.startsWith('worktree ')).map(line => line.slice('worktree '.length));
  for (const worktree of worktrees) candidates.push(join(worktree, '.tools', 'nginx-1.30.5', 'nginx.exe'));
  const found = candidates.find(candidate => candidate && existsSync(candidate));
  if (!found) throw Error('NGINX_BINARY_UNAVAILABLE');
  return resolve(found);
}

function firebaseCli() {
  const file = process.env.FIREBASE_CLI_JS || (process.platform === 'win32' && process.env.APPDATA
    ? join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js') : '');
  if (!file || !existsSync(file)) throw Error('FIREBASE_CLI_UNAVAILABLE');
  return resolve(file);
}

function readState() {
  if (!existsSync(stateFile)) return null;
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (state.schema !== 1 || state.root !== root) throw Error('DEV_LOCAL_STATE_MISMATCH');
  return state;
}

function saveState(state) {
  mkdirSync(toolsDirectory, { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ schema: 1, root, ...state }, null, 2));
}

function processCommandLine(pid) {
  if (process.platform !== 'win32') throw Error('HOSTING_STOP_UNSUPPORTED');
  if (!Number.isSafeInteger(pid) || pid < 1) throw Error('HOSTING_STATE_MISMATCH');
  const script = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if($p){$p.CommandLine}`;
  return run('powershell.exe', ['-NoProfile', '-Command', script]).trim();
}

function validateProxy(state) {
  if (typeof state?.prefix !== 'string' || typeof state.binary !== 'string') throw Error('PROXY_STATE_MISMATCH');
  const prefix = resolve(state.prefix);
  const expected = join(toolsDirectory, 'local-nginx-');
  if (!prefix.startsWith(expected) || prefix.slice(expected.length).includes(sep)
    || !existsSync(join(prefix, 'nginx.conf')) || !existsSync(state.binary)) throw Error('PROXY_STATE_MISMATCH');
  const config = readFileSync(join(prefix, 'nginx.conf'), 'utf8');
  if (!config.includes('proxy_pass http://127.0.0.1:22234;')) throw Error('PROXY_STATE_MISMATCH');
}

async function portFree(port) {
  const reservation = createServer();
  try { await new Promise((resolveFree, reject) => { reservation.once('error', reject); reservation.listen(port, '127.0.0.1', resolveFree); }); }
  catch { return false; }
  await new Promise(resolveFree => reservation.close(resolveFree));
  return true;
}

async function waitForPortFree(port) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await portFree(port)) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw Error('DEV_LOCAL_PORT_BUSY');
}

async function stopBrowserServices() {
  const state = readState();
  if (!state) {
    if (!await portFree(5000) || !await portFree(22232)) throw Error('UNMANAGED_LOCAL_SERVICE');
    return;
  }
  if (state.hosting) {
    const commandLine = processCommandLine(state.hosting.pid);
    if (commandLine) {
      if (!commandLine.includes(state.hosting.script) || !commandLine.includes('emulators:start')
        || !commandLine.includes('--only hosting')) throw Error('HOSTING_STATE_MISMATCH');
      run('taskkill.exe', ['/PID', String(state.hosting.pid), '/T', '/F']);
    }
    await waitForPortFree(5000);
  }
  if (state.proxy) {
    validateProxy(state.proxy);
    const commandLine = processCommandLine(state.proxy.pid);
    if (commandLine) {
      if (!commandLine.includes(state.proxy.binary) || !commandLine.includes(state.proxy.prefix.replaceAll('\\', '/'))
        || !commandLine.includes('nginx.conf')) throw Error('PROXY_STATE_MISMATCH');
      run('taskkill.exe', ['/PID', String(state.proxy.pid), '/F']);
    }
    await waitForPortFree(22232);
  }
  unlinkSync(stateFile);
}

async function stop() {
  await stopBrowserServices();
  const server = inspect(serverName, 'server');
  const database = inspect(databaseName, 'database');
  if (server.State.Running) run('docker', ['stop', serverName], { stdio: 'inherit' });
  if (database.State.Running) run('docker', ['stop', databaseName], { stdio: 'inherit' });
  console.log('Dev-local review services stopped; database volumes retained.');
}

async function waitForHosting() {
  for (let attempt = 0; attempt < 240; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:5000/play', { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Hosting is still starting. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw Error('HOSTING_UNAVAILABLE');
}

async function waitForReviewServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (inspect(serverName, 'server').State?.Health?.Status === 'healthy') return;
    await new Promise(resolveWait => setTimeout(resolveWait, 2000));
  }
  throw Error('REVIEW_SERVER_UNHEALTHY');
}

async function start() {
  await stopBrowserServices();
  const server = inspect(serverName, 'server');
  const database = inspect(databaseName, 'database');
  const secrets = composeEnvironment(server, database);
  const nginx = findNginx();
  const firebase = firebaseCli();
  console.log('Building current local-dev Hosting artifact...');
  run(process.execPath, [join(root, 'deployment', 'firebase', 'scripts', 'assemble.mjs'), '--environment', 'local-dev'], { stdio: 'inherit' });
  console.log('Building and starting the isolated review game server...');
  const compose = ['compose', '-f', join(root, 'containers', 'local', 'compose.match-review.yaml')];
  const environment = { ...process.env, ...secrets };
  run('docker', [...compose, 'config', '--quiet'], { env: environment, stdio: 'inherit' });
  run('docker', [...compose, 'up', '-d', '--build', 'server'], { env: environment, stdio: 'inherit' });
  await waitForReviewServer();
  await startReview();
  const proxyOutput = run(process.execPath, [join(root, 'deployment', 'game-service', 'proxy', 'start-local.mjs')],
    { env: { ...process.env, NGINX_LOCAL_BINARY: nginx, LOCAL_GAME_BACKEND_PORT: '22234' } });
  const prefix = proxyOutput.match(/^Instance prefix: (.+)$/m)?.[1]?.trim();
  const pid = Number(proxyOutput.match(/^Process ID: (\d+)$/m)?.[1]);
  if (!prefix || !Number.isSafeInteger(pid) || pid < 1) throw Error('PROXY_START_FAILED');
  saveState({ proxy: { prefix, binary: nginx, pid } });
  console.log('Starting local Firebase Hosting...');
  const out = openSync(join(toolsDirectory, 'dev-local-hosting.log'), 'a');
  const err = openSync(join(toolsDirectory, 'dev-local-hosting.err.log'), 'a');
  const child = spawn(process.execPath, [firebase, 'emulators:start', '--config', 'firebase.generated.json', '--only', 'hosting', '--project', project],
    { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', out, err] });
  closeSync(out); closeSync(err);
  if (!child.pid) throw Error('HOSTING_START_FAILED');
  child.unref();
  saveState({ proxy: { prefix, binary: nginx, pid }, hosting: { pid: child.pid, script: firebase } });
  await waitForHosting();
  run(process.execPath, ['--test', join(root, 'deployment', 'game-service', 'proxy', 'live-local-test.mjs')], { stdio: 'inherit' });
  console.log('Dev-local ready: http://localhost:5000/play');
}

if (invokedDirectly && (!['--start', '--stop', '--restart'].includes(mode) || process.argv.length !== 3)) {
  console.error('Usage: node tools/dev-local.mjs --start|--stop|--restart');
  process.exitCode = 2;
} else if (invokedDirectly) {
  try {
    if (mode === '--stop' || mode === '--restart') await stop();
    if (mode === '--start' || mode === '--restart') await start();
  } catch (failure) {
    const safe = /^[A-Z][A-Z_]+$/.test(failure.message) ? failure.message : 'DEV_LOCAL_COMMAND_FAILED';
    console.error(`Dev-local: ${safe}`);
    process.exitCode = 1;
  }
}
