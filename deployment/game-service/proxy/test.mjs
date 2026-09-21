import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect as connectTls } from 'node:tls';
import { connect as connectTcp, createServer as createTcpServer } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

const host = 'game-dev.molesunderthepitch.org';
const origin = 'https://dev.molesunderthepitch.org';
const nginx = process.env.NGINX_TEST_BINARY;
const openssl = process.env.OPENSSL_TEST_BINARY;

test('DEV nginx TLS boundary and sanitized loopback handoff', { timeout: 30000 }, async () => {
  assert.ok(nginx && openssl, 'Set NGINX_TEST_BINARY and OPENSSL_TEST_BINARY; no silent skip');
  const directory = await mkdtemp(resolve('.tools/r3d-proxy-'));
  await mkdir(resolve(directory, 'tls')); await mkdir(resolve(directory, 'logs')); await mkdir(resolve(directory, 'temp'));
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', `/CN=${host}`, '-addext', `subjectAltName=DNS:${host}`,
    '-keyout', resolve(directory, 'tls/privkey.pem'), '-out', resolve(directory, 'tls/fullchain.pem')], { windowsHide: true, stdio: 'pipe' });
  const ca = await readFile(resolve(directory, 'tls/fullchain.pem'));
  const received = [];
  const backend = createServer((request, response) => response.writeHead(404).end());
  backend.on('upgrade', (request, socket) => {
    received.push({ url: request.url, headers: request.headers });
    socket.on('error', () => {});
    const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.end(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  });
  await new Promise(done => backend.listen(0, '127.0.0.1', done));
  const reservation = createTcpServer();
  await new Promise(done => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port;
  await new Promise(done => reservation.close(done));
  let config = await readFile(new URL('./dev.nginx.conf', import.meta.url), 'utf8');
  config = 'daemon off;\nmaster_process off;\n' + config.replaceAll(':24443', `:${port}`)
    .replace('127.0.0.1:22231;', `127.0.0.1:${backend.address().port};`);
  if (process.platform === 'win32') config = config.replace('/dev/null', 'NUL');
  await writeFile(resolve(directory, 'nginx.conf'), config);
  const args = ['-p', directory.replaceAll('\\', '/') + '/', '-c', 'nginx.conf', '-e', 'stderr'];
  let child;
  try {
    execFileSync(nginx, [...args, '-t'], { windowsHide: true, stdio: 'pipe' });
    child = spawn(nginx, args, { windowsHide: true, stdio: 'ignore' });
    child.on('error', () => {});
    const request = (path = '/browser/v2', headers = {}, options = {}) => new Promise((done, reject) => {
      const socket = options.plain ? connectTcp({ host: '127.0.0.1', port })
        : connectTls({ host: '127.0.0.1', port, ca, servername: host, ...options });
      let response = '';
      socket.setTimeout(2000, () => socket.destroy(Error('test socket timeout')));
      socket.on('error', reject);
      socket.on('data', data => { response += data.toString(); if (response.includes('\r\n\r\n')) { socket.destroy(); done(response); } });
      socket.on('end', () => done(response));
      socket.once(options.plain ? 'connect' : 'secureConnect', () => {
        const fields = { Host: host, Origin: origin, Upgrade: 'websocket', Connection: 'Upgrade',
          'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'AAAAAAAAAAAAAAAAAAAAAA==', ...headers };
        socket.write(`GET ${path} HTTP/1.1\r\n` + Object.entries(fields).filter(([, value]) => value !== null)
          .map(([name, value]) => `${name}: ${value}\r\n`).join('') + '\r\n');
      });
    });
    let ready = false;
    for (let attempt = 0; attempt < 40 && !ready; attempt++) {
      try { assert.match(await request('/unavailable'), /^HTTP\/1.1 404/); ready = true; }
      catch (error) { if (child.exitCode !== null) throw error; await new Promise(done => setTimeout(done, 100)); }
    }
    assert.ok(ready, 'nginx did not start');
    assert.match(await request('/browser/v2', { Forwarded: 'host=foreign.invalid;proto=http',
      'X-Forwarded-Host': 'foreign.invalid', 'X-Forwarded-Proto': 'http', 'X-Forwarded-For': '192.0.2.1' }), /^HTTP\/1.1 101/);
    assert.equal(received.length, 1);
    assert.equal(received[0].headers.host, host); assert.equal(received[0].headers.origin, origin);
    for (const field of ['forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for'])
      assert.equal(received[0].headers[field], undefined);
    for (const version of ['TLSv1.2', 'TLSv1.3'])
      assert.match(await request('/browser/v2', {}, { minVersion: version, maxVersion: version }), /^HTTP\/1.1 101/);
    for (const headers of [{ Origin: null }, { Origin: 'null' }, { Origin: origin + '/' },
      { Origin: 'https://molesunderthepitch.org' }, { Origin: 'http://localhost:5000' },
      { Origin: origin + '\r\nOrigin: ' + origin }, { Host: 'foreign.invalid' },
      { Authorization: 'Bearer synthetic-secret' }, { Cookie: 'token=synthetic-secret' }])
      assert.match(await request('/browser/v2', headers), /^HTTP\/1.1 (400|403)/);
    for (const path of ['/browser/v2?', '/browser/v2?token=synthetic-secret', '/browser/%76%32'])
      assert.match(await request(path), /^HTTP\/1.1 403/);
    for (const path of ['/browser/v1', '/session/v1', '/spectator', '/admin', '/replay', '/browser/v2/'])
      assert.match(await request(path), /^HTTP\/1.1 404/);
    await assert.rejects(request('/browser/v2', {}, { servername: 'foreign.invalid' }));
    await assert.rejects(request('/browser/v2', {}, { servername: '' }));
    await assert.rejects(request('/browser/v2', {}, { maxVersion: 'TLSv1.1', minVersion: 'TLSv1.1',
      ciphers: 'DEFAULT:@SECLEVEL=0' }), /alert protocol version/);
    assert.doesNotMatch(await request('/browser/v2', {}, { plain: true }), /^HTTP\/1.1 101/);
    assert.equal(received.length, 3, 'rejected traffic must not reach the JVM backend');
    const log = await readFile(resolve(directory, 'logs/access.log'), 'utf8');
    for (const line of log.trim().split(/\r?\n/)) assert.match(line, /^\d{3} \d+ \d+\.\d+$/);
    assert.doesNotMatch(log, /synthetic-secret|token|Origin|192\.0\.2|browser|foreign/);
    console.log(`nginx TLS fixture retained at ${directory}; accepted upstream upgrades=3; rejected cases=22`);
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill(); await exited;
    }
    await new Promise(done => backend.close(done));
  }
});
