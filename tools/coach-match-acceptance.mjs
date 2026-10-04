// Browser services for the isolated acceptance profile; never signals dev-local
// or the existing match-review containers. Database lifecycle is separate.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, '.tools', 'coach-oriented-match-ui');
const stateFile = join(directory, 'acceptance-services.json');
const node26 = process.env.COACH_ACCEPTANCE_NODE26 ?? (process.platform === 'win32' ? 'C:/Program Files/nodejs/node.exe' : process.execPath);
const run = (file, args, options = {}) => execFileSync(file, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 2 ** 20, ...options });
const mode = process.argv[2];

async function available(port) {
  const socket = createServer();
  try { await new Promise((done, reject) => { socket.once('error', reject); socket.listen(port, '127.0.0.1', done); }); }
  catch { return false; }
  await new Promise(done => socket.close(done)); return true;
}
function background(file, args, name) {
  const out = openSync(join(directory, `${name}.log`), 'a');
  const child = spawn(file, args, { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', out, out] });
  closeSync(out); child.unref();
  if (!child.pid) throw Error('Acceptance helper failed to start');
  return { pid: child.pid, file: resolve(file), required: args };
}
function save(state) { writeFileSync(stateFile, JSON.stringify({ version: 1, root: resolve(root), ...state }, null, 2)); }
async function start() {
  if (existsSync(stateFile) || !await available(5000) || !await available(22232)) throw Error('Acceptance browser services or unmanaged ports are already present');
  await mkdir(directory, { recursive: true });
  const nodeVersion = run(process.execPath, ['--version']).trim();
  if (!nodeVersion.startsWith('v24.')) throw Error('Run browser acceptance with the supported Node 24 runtime');
  // npm is installed beside system Node on Windows. Browser build scripts use
  // PATH's Node 24, while the assembler itself has no browser engine dependency.
  run(node26, ['deployment/firebase/scripts/assemble.mjs', '--environment', 'local-dev'], { stdio: 'inherit' });
  const nginx = process.env.NGINX_LOCAL_BINARY ?? join(root, '.tools', 'nginx-1.30.5', 'nginx.exe');
  const output = run(process.execPath, ['deployment/game-service/proxy/start-local.mjs'], { env: { ...process.env, NGINX_LOCAL_BINARY: nginx, LOCAL_GAME_BACKEND_PORT: '22235' } });
  const prefix = output.match(/^Instance prefix: (.+)$/m)?.[1]?.trim();
  const pid = Number(output.match(/^Process ID: (\d+)$/m)?.[1]);
  if (!prefix || !Number.isSafeInteger(pid) || pid < 1) throw Error('Acceptance proxy did not return an owned process');
  const state = { proxy: { pid, file: resolve(nginx), required: [prefix.replaceAll('\\', '/'), 'nginx.conf'] } }; save(state);
  const firebase = process.env.FIREBASE_CLI_JS ?? join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  const config = JSON.parse(readFileSync(join(root, 'firebase.generated.json'), 'utf8'));
  const hosting = Array.isArray(config.hosting) ? config.hosting : [config.hosting];
  for (const target of hosting) target.public = relative(directory, resolve(root, target.public)).replaceAll('\\', '/');
  const ownedConfig = join(directory, `acceptance-firebase-${randomUUID()}.json`);
  writeFileSync(ownedConfig, JSON.stringify(config, null, 2));
  state.hosting = background(process.execPath, [firebase, 'emulators:start', '--config', ownedConfig, '--only', 'hosting', '--project', 'dev-moles-under-the-pitch-org'], 'acceptance-hosting');
  save(state);
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch('http://localhost:5000/play', { signal: AbortSignal.timeout(1000) })).ok) { console.log('Acceptance Hosting ready: http://localhost:5000/play → isolated server 22235'); return; } } catch { /* Still starting. */ }
    await new Promise(done => setTimeout(done, 500));
  }
  throw Error('Acceptance Hosting did not become ready; owned state retained for stop');
}
async function stop() {
  if (!existsSync(stateFile)) return;
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (state.version !== 1 || resolve(state.root) !== resolve(root)) throw Error('Acceptance service ownership mismatch');
  for (const service of [state.hosting, state.proxy, state.computer].filter(Boolean)) {
    if (!Number.isSafeInteger(service.pid) || service.pid < 1 || typeof service.file !== 'string' || !Array.isArray(service.required)) throw Error('Acceptance process record invalid');
    if (process.platform !== 'win32') throw Error('Owned stop currently supports Windows; use the recorded process identities on other hosts');
    const command = run('powershell.exe', ['-NoProfile', '-Command', `$acceptanceProcess=Get-CimInstance Win32_Process -Filter 'ProcessId = ${service.pid}'; if($acceptanceProcess){$acceptanceProcess.CommandLine}`]).trim();
    if (command) {
      if (!command.toLowerCase().includes(service.file.toLowerCase()) || !service.required.every(argument => command.includes(argument))) throw Error('Acceptance PID was replaced; refusing to signal it');
      run('taskkill.exe', ['/PID', String(service.pid), '/T', '/F']);
    }
  }
  unlinkSync(stateFile); console.log('Owned acceptance browser processes stopped; all database volumes retained');
}
if (!['--start-browser', '--stop-browser', '--test'].includes(mode) || process.argv.length !== 3) throw Error('Usage: node tools/coach-match-acceptance.mjs --start-browser|--stop-browser|--test');
if (mode === '--start-browser') await start();
if (mode === '--stop-browser') await stop();
if (mode === '--test') run(process.execPath, ['test/real-server-match.mjs'], { cwd: join(root, 'browser-client'), stdio: 'inherit' });
