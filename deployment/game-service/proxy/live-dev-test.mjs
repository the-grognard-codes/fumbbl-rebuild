// Read-only public DEV probes: no real bearer, account creation, or match mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { connect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { execFileSync } from 'node:child_process';
const host = 'game-dev.molesunderthepitch.org';
const origin = 'https://dev.molesunderthepitch.org';
const headers = { Host: host, Origin: origin, Upgrade: 'websocket', Connection: 'Upgrade',
  'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'MDEyMzQ1Njc4OWFiY2RlZg==' };

function probe(path = '/browser/v2', overrides = {}, message, beforeSend) {
  return new Promise((resolve, reject) => {
    const selectedHeaders = { ...headers, ...overrides };
    for (const key of Object.keys(selectedHeaders)) if (selectedHeaders[key] == null) delete selectedHeaders[key];
    const request = https.request({ hostname: host, servername: host, path, headers: selectedHeaders, timeout: 10000 }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('timeout', () => request.destroy(Error('DEV probe timeout')));
    request.on('error', reject);
    request.on('upgrade', (response, socket, head) => {
      if (!message) { socket.destroy(); resolve(response.statusCode); return; }
      socket.setTimeout(10000, () => socket.destroy(Error('DEV frame timeout')));
      socket.on('error', reject);
      let pending = head;
      const receive = chunk => {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length < 2) return;
        let length = pending[1] & 127, offset = 2;
        if (length === 126) { if (pending.length < 4) return; length = pending.readUInt16BE(2); offset = 4; }
        if (length === 127 || (pending[0] & 15) !== 1) { socket.destroy(); reject(Error('Unexpected DEV frame')); return; }
        if (pending.length < offset + length) return;
        try { resolve(JSON.parse(pending.subarray(offset, offset + length).toString())); }
        catch (failure) { reject(failure); }
        socket.destroy();
      };
      socket.on('data', receive);
      const body = Buffer.from(JSON.stringify(message));
      assert.ok(body.length < 126);
      const mask = randomBytes(4);
      const frame = Buffer.concat([Buffer.from([0x81, 0x80 | body.length]), mask, body.map((byte, index) => byte ^ mask[index % 4])]);
      if (beforeSend) {
        try { beforeSend(); } catch (failure) { socket.destroy(); reject(failure); return; }
      }
      socket.write(frame);
      if (head.length) receive(Buffer.alloc(0));
    });
    request.end();
  });
}

test('public DEV certificate, exact route/Origin/Host, auth rejection and reconnect', { timeout: 60000 }, async () => {
  assert.equal(await probe(), 101); // Default trust store validates the real certificate.
  for (const path of ['/session/v1', '/browser/v1', '/spectator', '/admin', '/backup', '/command', '/gamestate', '/replay', '/'])
    assert.equal(await probe(path), 404, path);
  for (const path of ['/browser/v2?', '/browser/v2?token=synthetic-denial', '/browser/%76%32'])
    assert.equal(await probe(path), 403, path);
  for (const override of [{ Origin: null }, { Origin: '' }, { Origin: 'https://molesunderthepitch.org' }, { Origin: 'http://localhost:5000' },
    { Origin: origin + '.evil' }, { Host: 'game.molesunderthepitch.org' }, { Authorization: 'Bearer synthetic-denial' }, { Cookie: 'synthetic=denial' }])
    assert.equal(await probe('/browser/v2', override), 403);
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await probe('/browser/v2', {}, { version: 2, type: 'browse', requestId: 'dev-read-only' });
    assert.equal(reply.code, 'AUTHENTICATION_REQUIRED'); assert.equal(reply.matches, undefined);
  }
  const rejected = await probe('/browser/v2', {}, { version: 2, type: 'authenticate', requestId: 'dev-invalid', bearer: 'synthetic-invalid' });
  assert.equal(rejected.code, 'AUTHENTICATION_FAILED');
  console.log('PASS trusted public TLS, 20 route/header denials, 2 auth-gated connections, invalid bearer rejection.');
});

test('missing/foreign SNI and plaintext never upgrade', { timeout: 20000 }, async () => {
  for (const servername of ['', 'game.molesunderthepitch.org']) {
    await new Promise((resolve, reject) => {
      const socket = tlsConnect({ host, port: 443, servername });
      socket.setTimeout(5000, () => { socket.destroy(); reject(Error('TLS probe timeout')); });
      socket.on('error', error => { assert.equal(error.code, 'ERR_SSL_TLSV1_UNRECOGNIZED_NAME'); resolve(); });
      socket.on('secureConnect', () => { socket.destroy(); reject(Error('Unexpected SNI acceptance')); });
    });
  }
  await new Promise((resolve, reject) => {
    const socket = connect({ host, port: 443 }); let response = '';
    socket.setTimeout(5000, () => { socket.destroy(); reject(Error('Plaintext probe timeout')); });
    socket.on('error', reject);
    socket.on('connect', () => socket.write(`GET /browser/v2 HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));
    socket.on('data', data => { response += data.toString(); });
    socket.on('end', () => { try { assert.match(response, /^HTTP\/1.1 400/); resolve(); } catch (failure) { reject(failure); } });
  });
});

if (process.env.DEV_RELOAD_TEST === '1') test('renewal hook keeps existing WSS connection and JVM PID', { timeout: 30000 }, async () => {
  const reply = await probe('/browser/v2', {}, { version: 2, type: 'browse', requestId: 'dev-after-reload' }, () => {
    const result = execFileSync('C:/Program Files/PuTTY/plink.exe', ['-batch', '-hostkey',
      'SHA256:FhCH988zxP9JTmqwLLiCNVM2NgwcAxNGgZAft+fGIwQ', '-i', 'C:/Users/jaken/.ssh/google_compute_engine.ppk',
      '-P', '22339', 'jacob_thegrognardcodes_com@127.0.0.1',
      'before=$(systemctl show moles-game-v2-dev -p MainPID --value); sudo -n env RENEWED_LINEAGE=/etc/letsencrypt/live/game-dev.molesunderthepitch.org /etc/letsencrypt/renewal-hooks/deploy/moles-game && test "$before" = "$(systemctl show moles-game-v2-dev -p MainPID --value)" && echo PASS-reload-no-JVM-restart'],
      { encoding: 'utf8', timeout: 20000, windowsHide: true });
    assert.match(result, /PASS-reload-no-JVM-restart/);
  });
  assert.equal(reply.code, 'AUTHENTICATION_REQUIRED');
  assert.equal(reply.requestId, 'dev-after-reload');
});

test('public backend ports are unreachable', { timeout: 15000 }, async () => {
  for (const port of [22231, 3306]) {
    await new Promise((resolve, reject) => {
      const socket = connect({ host, port });
      socket.setTimeout(4000, () => { socket.destroy(); resolve(); });
      socket.on('error', () => resolve());
      socket.on('connect', () => { socket.destroy(); reject(Error('Private port reachable')); });
    });
  }
});
