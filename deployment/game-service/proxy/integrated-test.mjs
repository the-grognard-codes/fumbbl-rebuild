import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:tls';
import { createServer } from 'node:net';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

const host = 'game-dev.molesunderthepitch.org';
const origin = 'https://dev.molesunderthepitch.org';

async function freePort() {
  const reservation = createServer();
  await new Promise(done => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port;
  await new Promise(done => reservation.close(done));
  return port;
}

test('Linux nginx TLS to real Jetty, single worker, v2 auth and reconnect', { timeout: 90000 }, async () => {
  assert.equal(process.platform, 'linux', 'This is the Linux integration gate');
  const { NGINX_TEST_BINARY: nginx, OPENSSL_TEST_BINARY: openssl, PROXY_FIXTURE_CLASSPATH: classpath } = process.env;
  assert.ok(nginx && openssl && classpath, 'Explicit local test tools/classpath required');
  const directory = await mkdtemp(resolve('.tools/r3d-integrated-'));
  for (const name of ['tls', 'logs', 'temp']) await mkdir(resolve(directory, name));
  // Actual native entry point must not create storage when its provisioned paths are absent.
  assert.equal(existsSync('/var/lib/moles-game-v2-dev'), false);
  const nativeArgs = ['-cp', classpath, 'com.fumbbl.ffb.server.local.NativeMarker6ServerMain'];
  const missingStorage = spawnSync('java', [...nativeArgs, '/classes/local-schema/native-dev.properties'], { encoding: 'utf8' });
  assert.equal(missingStorage.status, 1);
  assert.match(missingStorage.stderr, /^Native marker-6 startup rejected; verify profile, storage and secret provisioning\.\n$/);
  assert.equal(existsSync('/var/lib/moles-game-v2-dev'), false);
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${host}`,
    '-addext', `subjectAltName=DNS:${host}`, '-keyout', resolve(directory, 'tls/privkey.pem'),
    '-out', resolve(directory, 'tls/fullchain.pem')], { stdio: 'pipe' });
  const ca = await readFile(resolve(directory, 'tls/fullchain.pem'));
  const upstreamPort = await freePort(), proxyPort = await freePort();
  const children = [], sockets = [];
  let javaOutput = '';
  try {
    const java = spawn('java', ['-cp', classpath, 'com.fumbbl.ffb.server.local.BrowserV2ProxyFixture', String(upstreamPort)], { stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(java);
    java.stdout.on('data', chunk => { javaOutput += chunk; }); java.stderr.on('data', chunk => { javaOutput += chunk; });
    java.on('error', error => { javaOutput += error.message; });
    for (let attempt = 0; attempt < 400 && !javaOutput.includes('PROXY_FIXTURE_READY'); attempt++) {
      assert.equal(java.exitCode, null, javaOutput);
      await new Promise(done => setTimeout(done, 100));
    }
    assert.match(javaOutput, /PROXY_FIXTURE_READY/);
    const original = await readFile(new URL('./dev.nginx.conf', import.meta.url), 'utf8');
    await writeFile(resolve(directory, 'nginx.conf'), 'daemon off;\n' + original
      .replaceAll(':24443', `:${proxyPort}`).replace('127.0.0.1:22231;', `127.0.0.1:${upstreamPort};`));
    const args = ['-p', directory + '/', '-c', 'nginx.conf', '-e', 'stderr'];
    execFileSync(nginx, [...args, '-t'], { stdio: 'pipe' });
    const proxy = spawn(nginx, args, { stdio: 'ignore' }); children.push(proxy);

    const open = () => new Promise((done, reject) => {
      const socket = connect({ host: '127.0.0.1', port: proxyPort, servername: host, ca }); sockets.push(socket);
      const responses = [], pending = [];
      let buffer = Buffer.alloc(0), upgraded = false;
      const push = value => pending.length ? pending.shift()(value) : responses.push(value);
      socket.on('error', reject);
      socket.setTimeout(5000, () => socket.destroy(Error('fixture timeout')));
      socket.once('secureConnect', () => socket.write(`GET /browser/v2 HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==\r\n\r\n`));
      socket.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!upgraded) {
          const end = buffer.indexOf('\r\n\r\n'); if (end < 0) return;
          if (!buffer.toString().startsWith('HTTP/1.1 101')) { reject(Error('Upgrade rejected')); socket.destroy(); return; }
          upgraded = true; buffer = buffer.subarray(end + 4);
          done({
            send(value) {
              const payload = Buffer.from(JSON.stringify(value)), mask = randomBytes(4);
              const header = payload.length < 126 ? Buffer.from([0x81, 0x80 | payload.length])
                : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 255]);
              const masked = Buffer.from(payload); for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
              socket.write(Buffer.concat([header, mask, masked]));
            },
            next() {
              return responses.length ? Promise.resolve(responses.shift()) : new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(Error('No protocol response within five seconds')), 5000);
                pending.push(value => { clearTimeout(timeout); resolve(value); });
              });
            },
            close() { socket.destroy(); }
          });
        }
        while (buffer.length >= 2) {
          const opcode = buffer[0] & 15; let length = buffer[1] & 127, offset = 2;
          if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
          if (length === 127) { reject(Error('Unexpected oversized fixture frame')); socket.destroy(); return; }
          if (buffer.length < offset + length) return;
          const payload = buffer.subarray(offset, offset + length); buffer = buffer.subarray(offset + length);
          if (opcode === 1) push(JSON.parse(payload.toString()));
        }
      });
    });
    let client;
    for (let attempt = 0; attempt < 40 && !client; attempt++) {
      try { client = await open(); } catch { await new Promise(done => setTimeout(done, 100)); }
    }
    assert.ok(client, 'Proxy did not become ready');
    const request = (type, requestId, extra = {}) => ({ version: 2, type, requestId, ...extra });
    client.send(request('browse', 'before-auth'));
    assert.equal((await client.next()).code, 'AUTHENTICATION_REQUIRED');
    client.send(request('authenticate', 'invalid', { bearer: 'synthetic-rejected' }));
    assert.equal((await client.next()).code, 'AUTHENTICATION_FAILED');
    client.send(request('authenticate', 'valid', { bearer: 'synthetic-dev-only' }));
    assert.equal((await client.next()).code, 'ACCEPTED');
    client.send(request('browse', 'browse'));
    const browse = await client.next(); assert.equal(browse.code, 'ACCEPTED'); assert.deepEqual(browse.matches, []);
    execFileSync(nginx, [...args, '-t'], { stdio: 'pipe' });
    execFileSync(nginx, [...args, '-s', 'reload'], { stdio: 'pipe' });
    await new Promise(done => setTimeout(done, 250));
    client.send(request('browse', 'same-socket-after-reload'));
    assert.equal((await client.next()).code, 'ACCEPTED');
    client.send(request('setup', 'nonmember', { operation: 'load', matchId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }));
    assert.equal((await client.next()).code, 'NOT_FOUND');
    client.close();
    const reconnect = await open();
    reconnect.send(request('browse', 'reconnect-before-auth'));
    assert.equal((await reconnect.next()).code, 'AUTHENTICATION_REQUIRED');
    reconnect.send(request('authenticate', 'reconnect-auth', { bearer: 'synthetic-dev-only' }));
    assert.equal((await reconnect.next()).code, 'ACCEPTED');
    reconnect.send(request('browse', 'reconnect-browse'));
    assert.equal((await reconnect.next()).code, 'ACCEPTED'); reconnect.close();
    assert.doesNotMatch(javaOutput, /synthetic-dev-only|synthetic-rejected/);
    console.log(`Linux nginx/Jetty fixture passed; evidence=${directory}; nine protocol assertions including nginx reload`);
    await writeFile(resolve(directory, 'result.json'), JSON.stringify({ passed: true, protocolAssertions: 9,
      nativeMissingStorageRejected: true,
      node: process.version, javaVersion: execFileSync('java', ['--version'], { encoding: 'utf8' }).trim(),
      nginxVersion: spawnSync(nginx, ['-v'], { encoding: 'utf8' }).stderr.trim(),
      opensslVersion: execFileSync(openssl, ['version'], { encoding: 'utf8' }).trim(),
      java: javaOutput.trim(), scope: 'Real TLS/Jetty/adapter/worker; synthetic identity and empty memberships; no database' }, null, 2));
  } finally {
    for (const socket of sockets) socket.destroy();
    for (const child of children.reverse()) if (child.exitCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
    }
  }
});
