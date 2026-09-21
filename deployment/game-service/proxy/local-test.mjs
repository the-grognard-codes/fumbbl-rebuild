import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect, createServer as tcpServer } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

test('local nginx exact boundary, fixed upstream, safe logs and unavailable routes', { timeout: 30000 }, async () => {
  const nginx = process.env.NGINX_TEST_BINARY;
  assert.ok(nginx, 'NGINX_TEST_BINARY is required; no silent skip');
  const directory = await mkdtemp(resolve('.tools/local-proxy-test-'));
  for (const name of ['logs', 'temp']) await mkdir(resolve(directory, name));
  const received = [];
  const backend = createServer((request, response) => { received.push(request); response.writeHead(404).end(); });
  backend.on('upgrade', (request, socket) => {
    received.push(request); socket.on('error', () => {});
    const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.end(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  });
  await new Promise(done => backend.listen(0, '127.0.0.1', done));
  const reserve = tcpServer(); await new Promise(done => reserve.listen(0, '127.0.0.1', done));
  const port = reserve.address().port; await new Promise(done => reserve.close(done));
  let config = await readFile(new URL('./local.nginx.conf', import.meta.url), 'utf8');
  assert.equal((config.match(/listen /g) ?? []).length, 1);
  assert.match(config, /listen 127\.0\.0\.1:22232 default_server;/);
  config = config.replaceAll(':22232', `:${port}`).replaceAll(':22231', `:${backend.address().port}`);
  if (process.platform === 'win32') config = config.replace('/dev/null', 'NUL');
  await writeFile(resolve(directory, 'nginx.conf'), 'daemon off;\nmaster_process off;\n' + config);
  const args = ['-p', directory.replaceAll('\\', '/') + '/', '-c', 'nginx.conf', '-e', 'stderr'];
  let child;
  const request = (path = '/browser/v2', headers = {}, method = 'GET') => new Promise((done, reject) => {
    const socket = connect({ host: '127.0.0.1', port }); let data = '';
    socket.setTimeout(2000, () => socket.destroy(Error('Probe timeout'))); socket.on('error', reject);
    socket.on('data', chunk => { data += chunk; if (data.includes('\r\n\r\n')) { socket.destroy(); done(data); } });
    socket.once('connect', () => {
      const fields = { Host: `127.0.0.1:${port}`, Origin: 'http://localhost:5000', Upgrade: 'websocket', Connection: 'Upgrade',
        'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'AAAAAAAAAAAAAAAAAAAAAA==', ...headers };
      socket.write(`${method} ${path} HTTP/1.1\r\n` + Object.entries(fields).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}\r\n`).join('') + '\r\n');
    });
  });
  try {
    execFileSync(nginx, [...args, '-t'], { windowsHide: true, stdio: 'pipe' });
    child = spawn(nginx, args, { windowsHide: true, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) {
      try { assert.match(await request('/unavailable'), /^HTTP\/1.1 404/); ready = true; }
      catch { await new Promise(done => setTimeout(done, 100)); }
    }
    assert.ok(ready);
    for (const origin of ['http://localhost:5000', 'http://127.0.0.1:5000', 'http://localhost:5173', 'http://127.0.0.1:5173']) {
      assert.match(await request('/browser/v2', { Origin: origin, Forwarded: 'host=foreign.invalid',
        'X-Forwarded-Host': 'foreign.invalid', 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '192.0.2.1', 'X-Real-IP': '192.0.2.1' }), /^HTTP\/1.1 101/);
      assert.equal(received.at(-1).headers.origin, origin);
      assert.equal(received.at(-1).headers.host, `127.0.0.1:${backend.address().port}`);
      for (const field of ['forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'x-real-ip']) assert.equal(received.at(-1).headers[field], undefined);
    }
    for (const headers of [{ Origin: null }, { Origin: 'null' }, { Origin: 'https://dev.molesunderthepitch.org' },
      { Origin: 'https://molesunderthepitch.org' }, { Origin: 'http://localhost:5000/' }, { Origin: 'http://localhost:5000.evil' },
      { Origin: 'http://localhost:5000\r\nOrigin: http://localhost:5000' }, { Host: 'foreign.invalid' },
      { Host: `localhost:${port}` }, { Upgrade: null }, { Authorization: 'Bearer synthetic-secret' }, { Cookie: 'token=synthetic-secret' }])
      assert.match(await request('/browser/v2', headers), /^HTTP\/1.1 (400|403)/);
    for (const path of ['/browser/v2?', '/browser/v2?token=synthetic-secret', '/browser/%76%32', '/browser/./v2'])
      assert.match(await request(path), /^HTTP\/1.1 403/);
    for (const path of ['/browser/v1', '/session/v1', '/spectator', '/admin', '/replay', '/browser/v2/', '/'])
      assert.match(await request(path), /^HTTP\/1.1 404/);
    assert.match(await request('/browser/v2', {}, 'POST'), /^HTTP\/1.1 403/);
    assert.equal(received.length, 4, 'Denied traffic must never reach the backend');
    const log = await readFile(resolve(directory, 'logs/access.log'), 'utf8');
    for (const line of log.trim().split(/\r?\n/)) assert.match(line, /^\d{3} \d+ \d+\.\d+$/);
    assert.doesNotMatch(log, /synthetic-secret|token|Origin|192\.0\.2|browser|foreign/);
    console.log(`Retained fixture: ${directory}; accepted upstream=4; denied cases=24`);
  } finally {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await new Promise(done => backend.close(done));
  }
});
