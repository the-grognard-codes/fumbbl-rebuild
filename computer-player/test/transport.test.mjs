import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';

const matchId = '00000000-0000-0000-0000-000000000001';
const secondMatchId = '00000000-0000-0000-0000-000000000002';
const origin = 'http://127.0.0.1:5173';
const state = {
  projectionVersion: 3, matchId, revision: 0, callerRole: 'home', phase: 'PRE_MATCH', actor: 'home',
  prompt: { id: 'coin-0', actor: 'home', kind: 'coin', options: ['heads', 'tails'] },
  players: [], weather: 'NICE', homeRerolls: 0, awayRerolls: 0, actions: [], turn: 0,
  turnMode: 'REGULAR', ball: null, activePlayerId: null, half: 1, homeTurn: 0, awayTurn: 0,
  homeScore: 0, awayScore: 0, drive: 1
};

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = once(child, 'exit');
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else child.kill();
  } catch (error) {
    try { process.kill(child.pid, 0); }
    catch (probeError) { if (probeError.code === 'ESRCH') { await stopped; return; } }
    throw error;
  }
  await stopped;
}

function send(socket, object) {
  const body = Buffer.from(JSON.stringify(object));
  const header = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
  socket.write(Buffer.concat([header, body]));
}
function response(requestId, next) {
  return { version: 2, type: 'setupState', requestId, code: 'ACCEPTED', duplicate: false, state: next };
}
function readFrames(socket, onMessage) {
  let bytes = Buffer.alloc(0);
  socket.on('data', chunk => {
    bytes = Buffer.concat([bytes, chunk]);
    while (bytes.length >= 6) {
      const opcode = bytes[0] & 15;
      let length = bytes[1] & 127;
      let offset = 2;
      if (length === 126) { if (bytes.length < 8) return; length = bytes.readUInt16BE(2); offset = 4; }
      if (length === 127 || bytes.length < offset + 4 + length) return;
      const mask = bytes.subarray(offset, offset + 4);
      const payload = Buffer.from(bytes.subarray(offset + 4, offset + 4 + length));
      bytes = bytes.subarray(offset + 4 + length);
      if (opcode === 8) { socket.end(Buffer.from([0x88, 0x00])); return; }
      if (opcode !== 1) continue;
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      onMessage(JSON.parse(payload.toString()));
    }
  });
}

test('authenticates over the browser route and acts from received state', { timeout: 15000 }, async () => {
  const seen = [];
  let choices = 0;
  const server = createServer();
  server.on('upgrade', (request, socket) => {
    socket.on('error', () => {});
    assert.equal(request.url, '/browser/v2');
    assert.equal(request.headers.origin, origin);
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket, requestBody => {
      seen.push(requestBody);
      if (requestBody.type === 'authenticateComputer') {
        send(socket, { version: 2, type: 'computerAuthentication', requestId: requestBody.requestId, code: 'ACCEPTED' });
      } else if (requestBody.operation === 'load') {
        send(socket, response(requestBody.requestId, state));
      } else if (requestBody.operation === 'choice') {
        choices++;
        if (choices === 1) { socket.destroy(); return; } // The first action committed but its acknowledgement was lost.
        send(socket, { ...response(requestBody.requestId, { ...state, revision: 1, phase: 'PLAY', prompt: null,
          actions: [{ id: '1:end', label: 'End turn', actor: 'home', kind: 'endTurn', target: null }] }), duplicate: true });
      } else if (requestBody.operation === 'action') {
        send(socket, response(requestBody.requestId, { ...state, revision: 2, phase: 'FULL_TIME', prompt: null }));
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const child = spawn(process.execPath, ['src/main.mjs', '--match', matchId, '--url', `ws://127.0.0.1:${server.address().port}/browser/v2`, '--origin', origin], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  });
  let errors = '';
  let output = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  child.stdout.on('data', chunk => { output += chunk; });
  let timer;
  try {
    const [code] = await Promise.race([
      once(child, 'exit'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`Timed out: ${output}\n${errors}\n${JSON.stringify(seen)}`)), 8000); })
    ]);
    assert.equal(code, 0, errors);
    assert.deepEqual(seen.map(request => request.type === 'authenticateComputer' ? 'authenticateComputer' : request.operation), ['authenticateComputer', 'load', 'choice', 'authenticateComputer', 'choice', 'action']);
    assert.ok(['heads', 'tails'].includes(seen[2].optionId));
    assert.equal(seen[2].expectedRevision, 0);
    assert.deepEqual(seen[4], seen[2], 'uncertain action must be retried with the exact request ID and body');
    assert.equal(seen[5].actionId, '1:end');
    assert.equal(seen[5].expectedRevision, 1);
  } finally {
    clearTimeout(timer);
    try { await stopChild(child); }
    finally { server.closeAllConnections(); server.close(); }
  }
});

test('detached daemon starts concurrent computer clients without visible Windows consoles', { timeout: 15000 }, async () => {
  const seen = [];
  const pendingLoads = [];
  const server = createServer();
  let resolveLoads;
  const bothLoaded = new Promise(resolve => { resolveLoads = resolve; });
  server.on('upgrade', (request, socket) => {
    socket.on('error', () => {});
    assert.equal(request.url, '/browser/v2');
    assert.equal(request.headers.origin, origin);
    const accept = createHash('sha1').update(
      `${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket, requestBody => {
      seen.push(requestBody);
      if (requestBody.type === 'authenticateComputer') {
        send(socket, { version: 2, type: 'computerAuthentication', requestId: requestBody.requestId, code: 'ACCEPTED' });
      } else if (requestBody.type === 'computer' && requestBody.operation === 'register') {
        send(socket, { version: 2, type: 'computer', requestId: requestBody.requestId, code: 'READY' });
        send(socket, { version: 2, type: 'computerJobs', requestId: null, code: 'AVAILABLE',
          matches: [matchId, secondMatchId] });
      } else if (requestBody.operation === 'load') {
        pendingLoads.push({ socket, requestBody });
        if (seen.filter(item => item.operation === 'load').length === 2) resolveLoads();
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const child = spawn(process.execPath, ['src/daemon.mjs', '--url',
    `ws://127.0.0.1:${server.address().port}/browser/v2`, '--origin', origin], {
    cwd: new URL('..', import.meta.url), detached: true, windowsHide: true,
    env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  let timer;
  try {
    await Promise.race([bothLoaded, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`Timed out: ${output}`)), 9000);
    })]);
    if (process.platform === 'win32') {
      const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ComputerConsoleProbe {
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool AttachConsole(uint processId);
  [DllImport("kernel32.dll")] public static extern bool FreeConsole();
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
}
'@
$clients = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${child.pid} AND Name = 'node.exe'")
$visible = 0
foreach ($client in $clients) {
  [void][ComputerConsoleProbe]::FreeConsole()
  if ([ComputerConsoleProbe]::AttachConsole($client.ProcessId)) {
    if ([ComputerConsoleProbe]::IsWindowVisible([ComputerConsoleProbe]::GetConsoleWindow())) { $visible++ }
    [void][ComputerConsoleProbe]::FreeConsole()
  } elseif ([Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 6) {
    throw 'Unable to inspect computer client console'
  }
}
@{ clients = $clients.Count; visible = $visible } | ConvertTo-Json -Compress`;
      const counts = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `$ErrorActionPreference = 'Stop'; ${script}`], { encoding: 'utf8', windowsHide: true }));
      assert.equal(counts.clients, 2, 'both match clients must still be running during the console check');
      assert.equal(counts.visible, 0, 'computer match clients must not open visible console windows');
    }
    for (const { socket, requestBody } of pendingLoads) {
      send(socket, response(requestBody.requestId, { ...state, matchId: requestBody.matchId, callerRole: 'away',
        actor: 'away', phase: 'FULL_TIME', prompt: null }));
    }
    assert.deepEqual(seen.filter(item => item.operation === 'load').map(item => item.matchId).sort(),
      [matchId, secondMatchId].sort());
    assert.equal(seen.filter(item => item.type === 'authenticateComputer').length, 3);
    assert.equal(seen.filter(item => item.operation === 'register').length, 1);
  } finally {
    clearTimeout(timer);
    try { await stopChild(child); }
    finally { server.closeAllConnections(); server.close(); }
  }
});

test('daemon rediscovers an active match and retries after its client exits before an apothecary choice', { timeout: 15000 }, async () => {
  const server = createServer();
  let registrations = 0;
  let loads = 0;
  let resolveAction;
  const actionReceived = new Promise(resolve => { resolveAction = resolve; });
  server.on('upgrade', (request, socket) => {
    socket.on('error', () => {});
    const accept = createHash('sha1').update(
      `${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket, body => {
      if (body.type === 'authenticateComputer') {
        send(socket, { version: 2, type: 'computerAuthentication', requestId: body.requestId, code: 'ACCEPTED' });
      } else if (body.type === 'computer' && body.operation === 'register') {
        registrations++;
        send(socket, { version: 2, type: 'computer', requestId: body.requestId, code: 'READY' });
        if (registrations > 1) send(socket, { version: 2, type: 'computerJobs', requestId: null,
          code: 'AVAILABLE', matches: [matchId] });
      } else if (body.operation === 'load') {
        loads++;
        if (loads === 1) {
          send(socket, { version: 2, type: 'setupState', requestId: body.requestId,
            code: 'SESSION_UNAVAILABLE', duplicate: false, state: null });
        } else {
          send(socket, response(body.requestId, { ...state, revision: 26, callerRole: 'away',
            actor: 'away', phase: 'PLAY', prompt: null,
            actions: [{ id: '26:apothecary:TEAM', label: 'Use TEAM', actor: 'away', kind: 'apothecary', target: null },
              { id: '26:apothecary:no', label: 'Decline apothecary', actor: 'away', kind: 'apothecary', target: null }] }));
        }
      } else if (body.operation === 'action') {
        resolveAction(body);
        send(socket, response(body.requestId, { ...state, revision: 27, callerRole: 'away',
          actor: 'away', phase: 'FULL_TIME', prompt: null }));
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const child = spawn(process.execPath, ['src/daemon.mjs', '--url',
    `ws://127.0.0.1:${server.address().port}/browser/v2`, '--origin', origin, '--refresh-ms', '1000'], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  let timer;
  try {
    const action = await Promise.race([actionReceived, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`Timed out: ${output}`)), 9000);
    })]);
    assert.ok(['26:apothecary:TEAM', '26:apothecary:no'].includes(action.actionId));
    assert.equal(action.expectedRevision, 26);
    assert.equal(loads, 2);
    assert.ok(registrations >= 3);
  } finally {
    clearTimeout(timer);
    try { await stopChild(child); }
    finally { server.closeAllConnections(); server.close(); }
  }
});
