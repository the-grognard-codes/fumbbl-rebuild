import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const nginx = process.env.NGINX_LOCAL_BINARY || resolve(root, '.tools/nginx-1.30.5/nginx.exe');
const backendPort = process.env.LOCAL_GAME_BACKEND_PORT || '22231';
if (!['22231', '22234', '22235'].includes(backendPort)) throw Error('Unapproved local game backend port');
// Fail on occupied ports; never signal an existing instance or rewrite its files.
const reservation = createServer();
await new Promise((done, reject) => { reservation.once('error', reject); reservation.listen(22232, '127.0.0.1', done); });
await new Promise(done => reservation.close(done));
const directory = await mkdtemp(resolve(root, '.tools/local-nginx-'));
for (const name of ['logs', 'temp']) await mkdir(resolve(directory, name));
let config = await readFile(new URL('./local.nginx.conf', import.meta.url), 'utf8');
config = config.replaceAll('127.0.0.1:22231', `127.0.0.1:${backendPort}`);
if (process.platform === 'win32') config = config.replace('/dev/null', 'NUL');
// Foreground single-process nginx lets the launcher own exactly the process it starts.
await writeFile(resolve(directory, 'nginx.conf'), 'daemon off;\nmaster_process off;\n' + config);
const args = ['-p', directory.replaceAll('\\', '/') + '/', '-c', 'nginx.conf', '-e', 'stderr'];
execFileSync(nginx, [...args, '-t'], { windowsHide: true, stdio: 'pipe' });
const child = spawn(nginx, args, { cwd: directory, detached: true, windowsHide: true, stdio: 'ignore' });
let spawnError;
child.on('error', error => { spawnError = error; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 50 && !ready; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw Error('Local nginx exited before readiness.');
    ready = await new Promise(done => {
      const probe = request('http://127.0.0.1:22232/unavailable', { timeout: 500 }, response => {
        response.resume(); done(response.statusCode === 404);
      });
      probe.on('timeout', () => probe.destroy()); probe.on('error', () => done(false)); probe.end();
    });
    if (!ready) await new Promise(done => setTimeout(done, 100));
  }
  if (!ready) throw Error('Local nginx did not become ready.');
  console.log(`Local nginx ready: ws://127.0.0.1:22232/browser/v2 -> 127.0.0.1:${backendPort}`);
  console.log(`Instance prefix: ${directory}`);
  console.log(`Process ID: ${child.pid}`);
  console.log(process.platform === 'win32' ? `Stop this instance with taskkill /PID ${child.pid} /F`
    : `Stop this instance with kill -TERM ${child.pid}`);
  child.unref();
} catch (error) { child.kill(); throw error; }
