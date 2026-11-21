import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { solidDefenceState } from '../../browser-client/test/fixtures/solid-defence-state.ts';
import { idleWorkerExitCode, observeWorkerClose, persistenceUnavailableExitCode } from '../src/worker-lifecycle.mjs';

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

test('worker exit can precede the final idle revision on the IPC channel', () => {
  const child = new EventEmitter();
  const outcomes = [];
  observeWorkerClose(child, (code, revision) => outcomes.push([code, revision]));
  child.emit('exit', idleWorkerExitCode);
  assert.deepEqual(outcomes, []);
  child.emit('message', { type: 'idle', revision: 42 });
  child.emit('disconnect');
  child.emit('close', idleWorkerExitCode);
  assert.deepEqual(outcomes, [[idleWorkerExitCode, 42]]);
});

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
  let header;
  if (body.length < 126) header = Buffer.from([0x81, body.length]);
  else if (body.length <= 65535) header = Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(body.length), 2); }
  socket.write(Buffer.concat([header, body]));
}
function response(requestId, next) {
  return { version: 2, type: 'setupState', requestId, code: 'ACCEPTED', duplicate: false, state: next };
}
function registeredJobs(socket, requestId, batches) {
  for (const matches of batches) {
    send(socket, { version: 2, type: 'computerJobs', requestId, code: 'AVAILABLE', matches });
  }
  send(socket, { version: 2, type: 'computer', requestId, code: 'READY' });
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

for (const coach of ['bogruk','gobbo']) test(`${coach} normal transport repairs a rejected casualty formation`,{timeout:15000},async t=>{
  const captured=JSON.parse(await readFile(new URL('./fixtures/casualty-setup.json',import.meta.url),'utf8'));
  const current={...state,phase:'SETUP',turnMode:'SETUP',prompt:null,players:captured.players,savedFormations:captured.savedFormations,
    homeTeamName:'Home',awayTeamName:'Away',homeResources:captured.homeResources,awayResources:captured.awayResources};
  current.matchId=matchId;current.callerRole='away';current.actor='away';current.projectionVersion=4;
  for(const player of current.players) { player.role=player.role==='home'?'away':'home';if(player.x!==null)player.x=25-player.x; }
  current.computer={opponentId:coach==='bogruk'?'coach-bogruk-weak':'coach-bugman-random',policyVersion:coach==='bogruk'?'bogruk-v1':'random-v1',
    seed:43,attackDirection:-1,movement:null,policyState:null,progress:{turnKey:'1:2:away:4',stalledTurns:0}};
  const sockets=new Set();let confirmations=0,placements=0;
  const server=createServer();
  server.on('upgrade',(request,socket)=>{
    sockets.add(socket);socket.on('error',()=>{});
    const accept=createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket,body=>{
      if(body.type==='authenticateComputer') return send(socket,{version:2,type:'computerAuthentication',requestId:body.requestId,code:'ACCEPTED'});
      if(body.operation==='confirm') {
        confirmations++;
        if(confirmations===1) return send(socket,{...response(body.requestId,current),code:'ILLEGAL_SETUP'});
        const placed=current.players.filter(p=>p.role==='away' && p.x!==null);
        assert.equal(placed.length,10);assert.equal(placed.filter(p=>p.x===13).length,3);
        current.phase='FULL_TIME';delete current.savedFormations;
      } else if(body.operation==='place') {
        const player=current.players.find(p=>p.id===body.playerId);assert.notEqual(player.offPitch,'casualty');
        player.x=body.to?.x??null;player.y=body.to?.y??null;player.offPitch=body.to?'pitch':'reserve';placements++;
      }
      if(body.operation!=='load')current.revision++;
      send(socket,response(body.requestId,current));
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const child=spawn(process.execPath,['src/main.mjs','--match',matchId,'--url',`ws://127.0.0.1:${server.address().port}/browser/v2`,'--origin',origin],{
    cwd:new URL('..',import.meta.url),windowsHide:true,env:{...process.env,FFB_COMPUTER_SERVICE_TOKEN:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}});
  t.after(async()=>{await stopChild(child);for(const socket of sockets)socket.destroy();server.close();});
  let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
  const [code]=await once(child,'exit');assert.equal(code,0,errors);assert.equal(confirmations,2);assert.ok(placements>0 && placements<=22);
});

for (const failureCode of ['PERSISTENCE_FAILED', 'COMPLETION_PENDING']) {
  test(`computer worker yields ${failureCode} to the daemon after one load`, { timeout: 5000 }, async t => {
    const server = createServer();
    const sockets = new Set();
    let loads = 0;
    server.on('upgrade', (request, socket) => {
      sockets.add(socket); socket.on('error', () => {});
      const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      readFrames(socket, body => {
        if (body.type === 'authenticateComputer') send(socket, { version: 2, type: 'computerAuthentication', requestId: body.requestId, code: 'ACCEPTED' });
        else {
          loads++;
          send(socket, { version: 2, type: 'setupState', requestId: body.requestId, code: failureCode, duplicate: false, state: null });
        }
      });
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const child = spawn(process.execPath, ['src/main.mjs', '--match', matchId,
      '--url', `ws://127.0.0.1:${server.address().port}/browser/v2`, '--origin', origin], {
      cwd: new URL('..', import.meta.url), windowsHide: true,
      env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
    });
    t.after(async () => { await stopChild(child); for (const socket of sockets) socket.destroy(); server.close(); });
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    const [code] = await once(child, 'close');
    assert.equal(code, persistenceUnavailableExitCode, errors);
    assert.equal(loads, 1);
    assert.equal(errors, '', 'The daemon owns the one diagnostic per backoff cycle');
  });
}

for (const broadcast of [false, true]) {
  test('computer worker exits cleanly after a size stop ' + (broadcast ? 'broadcast' : 'on its action'), { timeout: 5000 }, async t => {
    const server = createServer();
    const sockets = new Set();
    let actions = 0;
    server.on('upgrade', (request, socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
      readFrames(socket, body => {
        if (body.type === 'authenticateComputer') {
          send(socket, { version: 2, type: 'computerAuthentication', requestId: body.requestId, code: 'ACCEPTED' });
        } else if (body.operation === 'load') {
          send(socket, response(body.requestId, state));
        } else {
          actions++;
          const terminal = { ...state, revision: 1, phase: 'FULL_TIME', prompt: null, stopReason: 'MATCH_SIZE_LIMIT' };
          if (broadcast) {
            send(socket, { ...response(null, null), code: 'MATCH_SIZE_LIMIT' });
            send(socket, response(null, terminal));
          } else send(socket, { ...response(body.requestId, terminal), code: 'MATCH_SIZE_LIMIT' });
        }
      });
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const child = spawn(process.execPath, ['src/main.mjs', '--match', matchId,
      '--url', 'ws://127.0.0.1:' + server.address().port + '/browser/v2', '--origin', origin], {
      cwd: new URL('..', import.meta.url), windowsHide: true,
      env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
    });
    t.after(async () => { await stopChild(child); for (const socket of sockets) socket.destroy(); server.close(); });
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    const [code] = await once(child, 'close');
    assert.equal(code, 0, errors);
    assert.equal(actions, 1);
  });
}

test('computer worker reloads a delayed large Solid Defence state while waiting for its opponent', { timeout: 10000 }, async () => {
  const sockets = new Set(); let loads = 0;
  const server = createServer();
  const next = { ...solidDefenceState(matchId), callerRole: 'away' };
  assert.ok(Buffer.byteLength(JSON.stringify(response('load', next))) > 256 * 1024);
  server.on('upgrade', (request, socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket, body => {
      if (body.type === 'authenticateComputer') send(socket, { version: 2, type: 'computerAuthentication', requestId: body.requestId, code: 'ACCEPTED' });
      else if (body.operation === 'load') {
        send(socket, response(body.requestId, next));
        if (++loads === 1) send(socket, { version:2,type:'publicationDelayed',requestId:null,code:'PUBLICATION_DELAYED',matchId,family:'STATE' });
      }
      else assert.fail('A waiting worker must not submit a gameplay decision');
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const child = spawn(process.execPath, ['src/main.mjs', '--match', matchId, '--url', `ws://127.0.0.1:${server.address().port}/browser/v2`,
    '--origin', origin, '--idle-timeout-ms', '100'], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  let timer;
  try {
    const [code] = await Promise.race([once(child, 'exit'), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`Timed out: ${output}`)), 7000);
    })]);
    assert.equal(code, idleWorkerExitCode, output);
    assert.equal(loads, 2, "The delayed publication triggers a fresh read");
    assert.match(output, /waiting for the human coach; yielding worker capacity/);
    assert.doesNotMatch(output, /Oversized response|aaaaaaaaaa/);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) await stopChild(child);
    for (const socket of sockets) socket.destroy();
    server.close();
  }
});

test('Bogruk retries a gameplay checkpoint and save/resume controls preserve it without metadata', { timeout: 15000 }, async () => {
  const sockets = new Set(), seen = [];
  let lost = false;
  const computer = { opponentId: 'coach-bogruk-weak', policyVersion: 'bogruk-v1', seed: 42, attackDirection: -1,
    movement: null, progress: { turnKey: '1:1:away:1', stalledTurns: 1 },
    policyState: { version: 1, turnKey: '1:1:away:1', actions: 7, mistakeUsed: true, plan: null } };
  let resumeTimer;
  let current = { ...state, callerRole: 'away', actor: 'away', prompt: { ...state.prompt, actor: 'away' },
    projectionVersion: 4, computer, homeTeamName: 'Home', awayTeamName: 'Away',
    homeResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 }, awayResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 } };
  const server = createServer();
  server.on('upgrade', (request, socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket, body => {
      if (body.type === 'authenticateComputer') send(socket, { version: 2, type: 'computerAuthentication', requestId: body.requestId, code: 'ACCEPTED' });
      else if (body.operation === 'load') send(socket, response(body.requestId, current));
      else if (body.operation === 'choice') {
        seen.push(body);
        if (!lost) {
          current = { ...current, revision: 1, phase: 'PLAY', prompt: null,
            saveResume: { status: 'SAVE_PENDING', proposalId: matchId, proposer: 'home', expiresAt: 1000 },
            computer: { ...computer, policyState: body.computerDecision.nextPolicyState },
            actions: [] };
          lost = true; socket.destroy(); return;
        }
        send(socket, { ...response(body.requestId, current), duplicate: true });
      } else if (body.operation === 'saveAccept') {
        seen.push(body);
        current = { ...current, revision: 2,
          saveResume: { status: 'SUSPENDED', proposalId: null, proposer: null, expiresAt: null } };
        send(socket, response(body.requestId, current));
        resumeTimer = setTimeout(() => {
          current = { ...current, revision: 3, saveResume: { status: 'RESUME_PENDING', proposalId: secondMatchId, proposer: 'home', expiresAt: 2000 } };
          send(socket, response(null, current));
        }, 100);
      } else if (body.operation === 'resumeAccept') {
        seen.push(body);
        send(socket, response(body.requestId, { ...current, revision: 4, phase: 'FULL_TIME', actions: [],
          saveResume: { status: 'ACTIVE', proposalId: null, proposer: null, expiresAt: null } }));
      }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const child = spawn(process.execPath, ['src/main.mjs', '--match', matchId, '--url', `ws://127.0.0.1:${server.address().port}/browser/v2`, '--origin', origin], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  let timer;
  try {
    const [code] = await Promise.race([once(child, 'exit'), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`Timed out: ${output}`)), 9000);
    })]);
    assert.equal(code, 0, output);
    assert.equal(seen.length, 4);
    assert.deepEqual(seen[0], seen[1], 'uncertain retry includes the identical reason and policy checkpoint');
    assert.equal(seen[0].computerDecision.policyVersion, 'bogruk-v1');
    assert.equal(seen[0].computerDecision.nextPolicyState.actions, 8);
    assert.equal(current.computer.policyState.actions, 8, 'duplicates and save controls must preserve the gameplay counter');
    assert.equal(current.computer.policyState.mistakeUsed, true);
    assert.equal(seen[2].operation, 'saveAccept');
    assert.equal(seen[3].operation, 'resumeAccept');
    assert.equal(Object.hasOwn(seen[2], 'computerDecision'), false);
    assert.equal(Object.hasOwn(seen[3], 'computerDecision'), false);
    assert.match(output, /Accept the human coach's save request/);
    assert.doesNotMatch(output, /aaaaaaaaaa/);
  } finally {
    clearTimeout(timer);
    clearTimeout(resumeTimer);
    if (child.exitCode === null && child.signalCode === null) await stopChild(child);
    for (const socket of sockets) socket.destroy();
    server.close();
  }
});

test('multi-injury apothecary treatment survives a lost acknowledgement and advances to fresh choices', { timeout: 15000 }, async () => {
  const seen = [];
  const sockets = new Set();
  let lost = false;
  const offers = ['50:apothecaries:p1:TEAM', '51:injury:new', '52:apothecaries:p2:WANDERING', '53:injury:old', '54:apothecaries:no'];
  let index = 0;
  const view = () => ({ ...state, revision: 50 + index, phase: index === offers.length ? 'FULL_TIME' : 'PLAY', prompt: null,
    actions: index === offers.length ? [] : [{ id: offers[index], label: 'Apothecary decision', actor: 'home', kind: 'apothecary', target: null }] });
  const server = createServer();
  server.on('upgrade', (request, socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket, body => {
      if (body.type === 'authenticateComputer') send(socket, { version: 2, type: 'computerAuthentication', requestId: body.requestId, code: 'ACCEPTED' });
      else if (body.operation === 'load') send(socket, response(body.requestId, view()));
      else if (body.operation === 'action') {
        seen.push(body);
        if (!lost) { lost = true; socket.destroy(); return; }
        assert.equal(body.actionId, offers[index]);
        assert.equal(body.expectedRevision, 50 + index);
        index++;
        send(socket, { ...response(body.requestId, view()), duplicate: seen.length === 2 });
      }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const child = spawn(process.execPath, ['src/main.mjs', '--match', matchId, '--url', `ws://127.0.0.1:${server.address().port}/browser/v2`, '--origin', origin], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  let timer;
  try {
    const [code] = await Promise.race([once(child, 'exit'), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`Timed out: ${output}`)), 8000);
    })]);
    assert.equal(code, 0, output);
    assert.deepEqual(seen[0], seen[1], 'retry preserves the complete uncertain treatment request');
    assert.deepEqual(seen.slice(1).map(body => body.actionId), offers);
    assert.equal(new Set(seen.slice(1).map(body => body.requestId)).size, offers.length);
  } finally {
    clearTimeout(timer);
    for (const socket of sockets) socket.destroy();
    server.close();
    if (child.exitCode === null && child.signalCode === null) await stopChild(child);
  }
});

test('default daemon leaves browser slots and starts queued matches when a worker completes', { timeout: 15000 }, async () => {
  const jobs = Array.from({ length: 20 }, (_, index) => `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`);
  const loaded = [];
  const sockets = new Set();
  const server = createServer();
  server.on('upgrade', (request, socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket, requestBody => {
      if (requestBody.type === 'authenticateComputer') send(socket, { version: 2, type: 'computerAuthentication', requestId: requestBody.requestId, code: 'ACCEPTED' });
      else if (requestBody.operation === 'register') {
        send(socket, { version: 2, type: 'computer', requestId: requestBody.requestId, code: 'READY' });
        send(socket, { version: 2, type: 'computerJobs', requestId: null, code: 'AVAILABLE', matches: jobs });
      } else if (requestBody.operation === 'load') loaded.push({ socket, requestBody });
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const child = spawn(process.execPath, ['src/daemon.mjs', '--url', `ws://127.0.0.1:${server.address().port}/browser/v2`, '--origin', origin], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const waitFor = async predicate => {
    const deadline = Date.now() + 6000;
    while (!predicate() && Date.now() < deadline) await new Promise(done => setTimeout(done, 25));
    assert.ok(predicate(), output);
  };
  try {
    await waitFor(() => loaded.length >= 4);
    // Give all workers time to connect; an oversized default admits the entire backlog.
    await new Promise(done => setTimeout(done, 400));
    assert.equal(loaded.length, 4, 'only four match clients may hold slots while a backlog waits');
    assert.equal(sockets.size, 5, 'dispatcher plus four workers leave eleven of sixteen slots for browsers');
    const first = loaded[0];
    send(first.socket, response(first.requestBody.requestId, { ...state, matchId: first.requestBody.matchId, phase: 'FULL_TIME', prompt: null }));
    await waitFor(() => loaded.length === 5);
    assert.equal(loaded[4].requestBody.matchId, jobs[4], 'the next queued match replaces the completed worker');
  } finally {
    await stopChild(child);
    for (const socket of sockets) socket.destroy();
    server.close();
  }
});

test('idle human-turn matches yield capacity, ignore refreshes and wake on a new revision', { timeout: 12000 }, async () => {
  const sockets = new Set(), actions = [], loads = [];
  let dispatcher, registrations = 0, homeActed = false;
  const server = createServer();
  server.on('upgrade', (request, socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket, body => {
      if (body.type === 'authenticateComputer') send(socket, { version: 2, type: 'computerAuthentication', requestId: body.requestId, code: 'ACCEPTED' });
      else if (body.operation === 'register') {
        dispatcher = socket;
        registrations++;
        registeredJobs(socket, body.requestId, [[matchId], [secondMatchId]]);
      } else if (body.operation === 'load') {
        loads.push(body.matchId);
        const waiting = body.matchId === matchId && !homeActed;
        send(socket, response(body.requestId, { ...state, matchId: body.matchId, callerRole: 'away',
          revision: homeActed ? 1 : 0, actor: waiting ? 'home' : 'away',
          prompt: { ...state.prompt, actor: waiting ? 'home' : 'away' } }));
      } else if (body.operation === 'choice') {
        actions.push(body);
        send(socket, response(body.requestId, { ...state, matchId: body.matchId, callerRole: 'away', phase: 'FULL_TIME', prompt: null }));
      }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const child = spawn(process.execPath, ['src/daemon.mjs', '--url', `ws://127.0.0.1:${server.address().port}/browser/v2`,
    '--origin', origin, '--max-matches', '1', '--idle-timeout-ms', '150', '--refresh-ms', '1000'], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  try {
    const deadline = Date.now() + 6000;
    const otherWorkerFinished = () => output.includes(`Match ${secondMatchId} completed.`);
    while ((!otherWorkerFinished() || registrations < 2) && Date.now() < deadline) await new Promise(done => setTimeout(done, 25));
    assert.ok(otherWorkerFinished() && registrations >= 2, output);
    // Give an incorrectly restarted child time to connect and send its load.
    await new Promise(done => setTimeout(done, 750));
    assert.equal(output.split(`Started match ${matchId};`).length - 1, 1, `The idle worker restarted before a change.\n${output}`);
    assert.deepEqual(loads, [matchId, secondMatchId], 'yielding and refreshing must not reload the waiting match');
    homeActed = true;
    send(dispatcher, { version: 2, type: 'computerJobChanged', requestId: null, matchId, revision: 1, saveResumeChanged: false });
    while (actions.length < 2 && Date.now() < deadline) await new Promise(done => setTimeout(done, 25));
    assert.deepEqual(actions.map(action => action.matchId), [secondMatchId, matchId], output);
    assert.deepEqual(loads, [matchId, secondMatchId, matchId]);
    assert.equal(actions[1].expectedRevision, 1, 'resumed worker loads fresh authoritative state');
  } finally {
    await stopChild(child);
    for (const socket of sockets) socket.destroy();
    server.close();
  }
});

async function dispatcherHarness(t, handle, nodeArgs = [], refreshMs = 1000) {
  const sockets = new Set();
  const server = createServer();
  server.on('upgrade', (request, socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket, body => {
      if (body.type === 'authenticateComputer')
        send(socket, { version: 2, type: 'computerAuthentication', requestId: body.requestId, code: 'ACCEPTED' });
      else handle(socket, body);
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const child = spawn(process.execPath, [...nodeArgs, 'src/daemon.mjs', '--url', `ws://127.0.0.1:${server.address().port}/browser/v2`,
    '--origin', origin, '--max-matches', '1', '--idle-timeout-ms', '150', '--refresh-ms', String(refreshMs)], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => {
    try { await stopChild(child); }
    finally {
      for (const socket of sockets) socket.destroy();
      server.close();
    }
  });
  return {
    async waitFor(predicate) {
      const deadline = Date.now() + 4500;
      while (!predicate(output) && Date.now() < deadline) await new Promise(done => setTimeout(done, 25));
      assert.ok(predicate(output), output);
    }
  };
}

test('dispatcher reconnect staggers parked loads and recovers a missed human publication', { timeout: 9000 }, async t => {
  let dispatcher, loads = 0, action, homeActed = false, reconnectedAt, retryAt;
  const { waitFor } = await dispatcherHarness(t, (socket, body) => {
    if (body.operation === 'register') {
      dispatcher = socket;
      if (homeActed) reconnectedAt ??= performance.now();
      registeredJobs(socket, body.requestId, [[matchId]]);
      if (homeActed) send(socket, { version: 2, type: 'computerJobChanged', requestId: null,
        matchId, revision: 0, saveResumeChanged: false });
    } else if (body.operation === 'load') {
      loads++;
      if (homeActed) retryAt = performance.now();
      const actor = homeActed ? 'away' : 'home';
      send(socket, response(body.requestId, { ...state, callerRole: 'away', actor,
        revision: homeActed ? 1 : 0, prompt: { ...state.prompt, actor } }));
    } else if (body.operation === 'choice') {
      action = body;
      send(socket, response(body.requestId, { ...state, callerRole: 'away', revision: 2,
        phase: 'FULL_TIME', prompt: null }));
    }
  // Freeze only the dispatcher's wall clock. The monotonic retry timer must still start the worker.
  }, ['--import', 'data:text/javascript,Date.now%20%3D%20()%20%3D%3E%20100000']);
  await waitFor(output => output.includes('yielded its idle worker'));
  dispatcher.destroy();
  homeActed = true;
  await waitFor(() => action);
  assert.equal(action.expectedRevision, 1);
  assert.equal(loads, 2);
  assert.ok(retryAt - reconnectedAt >= 950, "registration must not immediately reload a parked match");
});

test('an empty registration prunes parked jobs before a later job announcement', { timeout: 9000 }, async t => {
  let dispatcher, advertised = true, emptySnapshot = false, loads = 0;
  const { waitFor } = await dispatcherHarness(t, (socket, body) => {
    if (body.operation === 'register') {
      dispatcher = socket;
      registeredJobs(socket, body.requestId, [advertised ? [matchId] : []]);
      if (!advertised) emptySnapshot = true;
    } else if (body.operation === 'load') {
      loads++;
      send(socket, response(body.requestId, { ...state, callerRole: 'away' }));
    }
  });
  await waitFor(output => output.includes('yielded its idle worker'));
  advertised = false;
  await waitFor(() => emptySnapshot);
  assert.equal(loads, 1);
  advertised = true;
  send(dispatcher, { version: 2, type: 'computerJobs', requestId: null, code: 'AVAILABLE', matches: [matchId] });
  await waitFor(() => loads === 2);
});

test('dispatcher negotiates change notices again after a legacy registration fallback', { timeout: 9000 }, async t => {
  const watchAttempts = [];
  let dispatcher, readyWithWatch = false, loads = 0;
  const { waitFor } = await dispatcherHarness(t, (socket, body) => {
    if (body.operation === 'register') {
      watchAttempts.push(body.watchChanges);
      if (watchAttempts.length <= 2) {
        send(socket, { version: 2, type: 'error', requestId: body.requestId, code: 'MALFORMED_MESSAGE' });
      } else if (!body.watchChanges) {
        send(socket, { version: 2, type: 'computer', requestId: body.requestId, code: 'READY' });
        send(socket, { version: 2, type: 'computerJobs', requestId: null, code: 'AVAILABLE', matches: [matchId] });
      } else {
        dispatcher = socket;
        registeredJobs(socket, body.requestId, [[matchId]]);
        readyWithWatch = true;
      }
    } else if (body.operation === 'load') {
      loads++;
      send(socket, response(body.requestId, { ...state, callerRole: 'away' }));
    }
  });
  await waitFor(output => readyWithWatch && output.includes('yielded its idle worker'));
  assert.deepEqual(watchAttempts.slice(0, 3), [true, true, undefined]);
  assert.equal(loads, 1);
  send(dispatcher, { version: 2, type: 'computerJobChanged', requestId: null, matchId, revision: 1, saveResumeChanged: false });
  await waitFor(() => loads === 2);
});

test('a saved match releases its slot and the computer accepts a resume proposed during reconnect', { timeout: 12000 }, async t => {
  const suspended = { ...state, projectionVersion: 4, callerRole: 'home', actor: 'home',
    computer: { opponentId: 'coach-bogruk-weak', policyVersion: 'bogruk-v1', seed: 42, attackDirection: 1,
      movement: null, progress: { turnKey: '1:1:1', stalledTurns: 0 }, policyState: null },
    saveResume: { status: 'SUSPENDED', proposalId: null, proposer: null, expiresAt: null },
    homeTeamName: 'Home', awayTeamName: 'Away',
    homeResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 },
    awayResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 } };
  let dispatcher, initialDispatcher, suspendedJob = false, registrations = 0, loads = 0, proposal, accepted;
  const { waitFor } = await dispatcherHarness(t, (socket, body) => {
    if (body.operation === 'register') {
      dispatcher = socket;
      initialDispatcher ??= socket;
      assert.equal(body.watchSuspension, true);
      const pending = proposal && Date.now() < proposal.expiresAt;
      registeredJobs(socket, body.requestId, [!suspendedJob || pending ? [matchId] : []]);
      registrations++;
    } else if (body.operation === 'load') {
      loads++;
      send(socket, response(body.requestId, { ...suspended, saveResume: proposal ?? suspended.saveResume }));
    } else if (body.operation === 'resumeAccept') {
      accepted = { proposalId: body.proposalId, at: Date.now() };
      send(socket, response(body.requestId, { ...suspended, phase: 'FULL_TIME', prompt: null, saveResume: null }));
    }
  });
  await waitFor(output => output.includes('releasing worker capacity'));
  suspendedJob = true;
  send(dispatcher, { version: 2, type: 'computerJobSuspended', requestId: null, matchId });
  const until = registrations + 2;
  await waitFor(() => registrations >= until);
  assert.equal(loads, 1);
  dispatcher.destroy(); // The proposal is committed while the change notice cannot reach the dispatcher.
  proposal = { status: 'RESUME_PENDING', proposalId: secondMatchId, proposer: 'away', expiresAt: Date.now() + 5 * 60_000 };
  await waitFor(() => accepted);
  assert.notEqual(dispatcher, initialDispatcher);
  assert.equal(loads, 2);
  assert.equal(accepted.proposalId, proposal.proposalId);
  assert.ok(accepted.at < proposal.expiresAt);
});

test('a resume announced while the suspended worker is closing starts a fresh worker', { timeout: 9000 }, async t => {
  let dispatcher, loads = 0;
  const { waitFor } = await dispatcherHarness(t, (socket, body) => {
    if (body.operation === 'register') {
      dispatcher = socket;
      registeredJobs(socket, body.requestId, [[matchId]]);
    } else if (body.operation === 'load') {
      loads++;
      if (loads === 1) {
        send(dispatcher, { version: 2, type: 'computerJobSuspended', requestId: null, matchId });
        send(dispatcher, { version: 2, type: 'computerJobs', requestId: null, code: 'AVAILABLE', matches: [matchId] });
      } else send(socket, response(body.requestId, { ...state, phase: 'FULL_TIME', prompt: null }));
    }
  });
  await waitFor(output => output.includes(`Match ${matchId} completed.`));
  assert.equal(loads, 2);
});

test('dispatcher continues a partial inventory before its regular refresh', { timeout: 9000 }, async t => {
  let registrations = 0;
  const { waitFor } = await dispatcherHarness(t, (socket, body) => {
    if (body.operation === 'register') {
      registrations++;
      send(socket, { version: 2, type: 'computerJobs', requestId: body.requestId, code: 'AVAILABLE', matches: [] });
      send(socket, { version: 2, type: 'computer', requestId: body.requestId, code: 'READY',
        ...(registrations === 1 ? { inventoryPending: true } : {}) });
    }
  }, [], 30000);
  await waitFor(() => registrations === 2);
});

test('older change-capable servers can readvertise a saved match without respawning its worker', { timeout: 9000 }, async t => {
  let dispatcher, registrations = 0, loads = 0;
  const { waitFor } = await dispatcherHarness(t, (socket, body) => {
    if (body.operation === 'register') {
      if (body.watchSuspension) {
        send(socket, { version: 2, type: 'error', requestId: body.requestId, code: 'MALFORMED_MESSAGE' });
        return;
      }
      dispatcher = socket;
      registeredJobs(socket, body.requestId, [[matchId]]);
      registrations++;
    } else if (body.operation === 'load') {
      loads++;
      send(socket, response(body.requestId, { ...state, saveResume: { status: 'SUSPENDED',
        proposer: null, proposalId: null, expiresAt: null } }));
    }
  });
  await waitFor(() => registrations >= 3);
  assert.equal(loads, 1);
  send(dispatcher, { version: 2, type: 'computerJobChanged', requestId: null, matchId, revision: 0, saveResumeChanged: true });
  await waitFor(() => loads === 2);
});

test('abandonment stops both a parked job and a worker that sees a durable abandoned match', { timeout: 9000 }, async t => {
  let dispatcher, registrations = 0;
  const loads = [];
  const { waitFor } = await dispatcherHarness(t, (socket, body) => {
    if (body.operation === 'register') {
      dispatcher = socket;
      registeredJobs(socket, body.requestId, [[matchId, secondMatchId]]);
      registrations++;
    } else if (body.operation === 'load') {
      loads.push(body.matchId);
      if (body.matchId === matchId) send(socket, response(body.requestId, { ...state, callerRole: 'away' }));
      else send(socket, { version: 2, type: 'setupState', requestId: body.requestId, code: 'MATCH_ABANDONED',
        duplicate: false, state: null });
    }
  });
  await waitFor(output => output.includes(`Match ${secondMatchId} was abandoned.`));
  send(dispatcher, { version: 2, type: 'computerJobEnded', requestId: null, matchId });
  send(dispatcher, { version: 2, type: 'computerJobChanged', requestId: null, matchId, revision: 1, saveResumeChanged: false });
  const nextRegistration = registrations + 1;
  await waitFor(() => registrations >= nextRegistration);
  await new Promise(done => setTimeout(done, 300));
  assert.deepEqual(loads, [matchId, secondMatchId]);
});

test('idle lease never discards an unanswered gameplay request', { timeout: 10000 }, async () => {
  const sockets = new Set(), timers = [];
  let choices = 0, acknowledged = false, closedBeforeAcknowledgement = false;
  const humanTurn = { ...state, callerRole: 'away' };
  const server = createServer();
  server.on('upgrade', (request, socket) => {
    sockets.add(socket); socket.on('error', () => {});
    socket.on('close', () => { sockets.delete(socket); if (choices && !acknowledged) closedBeforeAcknowledgement = true; });
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    readFrames(socket, body => {
      if (body.type === 'authenticateComputer') send(socket, { version: 2, type: 'computerAuthentication', requestId: body.requestId, code: 'ACCEPTED' });
      else if (body.operation === 'load') {
        send(socket, response(body.requestId, humanTurn));
        timers.push(setTimeout(() => send(socket, response(null, { ...humanTurn, revision: 1,
          actor: 'away', prompt: { ...state.prompt, actor: 'away' } })), 50));
      } else if (body.operation === 'choice') {
        choices++;
        // A human-turn broadcast can arrive before this request's acknowledgement.
        send(socket, response(null, { ...humanTurn, revision: 2 }));
        timers.push(setTimeout(() => { acknowledged = true; send(socket, response(body.requestId, { ...humanTurn, revision: 2 })); }, 350));
      }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const child = spawn(process.execPath, ['src/main.mjs', '--match', matchId, '--url', `ws://127.0.0.1:${server.address().port}/browser/v2`,
    '--origin', origin, '--idle-timeout-ms', '150'], { cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  let timeout;
  try {
    const [code] = await Promise.race([once(child, 'exit'), new Promise((_, reject) => {
      timeout = setTimeout(() => reject(Error(`Worker did not yield safely: ${output}`)), 5000);
    })]);
    assert.equal(code, 75, output);
    assert.equal(choices, 1, 'the pending mutation is not duplicated or replaced');
    assert.equal(acknowledged, true);
    assert.equal(closedBeforeAcknowledgement, false);
  } finally {
    clearTimeout(timeout); timers.forEach(clearTimeout);
    await stopChild(child);
    for (const socket of sockets) socket.destroy();
    server.close();
  }
});

test('authenticates over the browser route and acts from received state', { timeout: 15000 }, async () => {
  const seen = [];
  let choices = 0;
  const event = solidDefenceState(matchId);
  const playerId = event.players[0].id;
  const placeId = "1:solid-place:" + playerId + ":8:7";
  const staging = { ...event, revision: 1, callerRole: 'home', actor: 'home',
    actions: [
      { id: placeId, kind: 'kickoffMove', label: 'Place player', actor: 'home',
        sourcePlayerId: playerId, target: { x: 8, y: 7 } }
    ] };
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
        send(socket, { ...response(requestBody.requestId, staging), duplicate: true });
      } else if (requestBody.actionId === placeId) {
        send(socket, response(requestBody.requestId, { ...staging, stageSeq: 1,
          actions: [{ id: '1:confirm-solid-defence', kind: 'kickoffChoice', label: 'Confirm Solid Defence',
            actor: 'home', target: null, sourcePlayerId: null }] }));
      } else if (requestBody.actionId === '1:confirm-solid-defence') {
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
    assert.deepEqual(seen.map(request => request.type === 'authenticateComputer' ? 'authenticateComputer' : request.operation), ['authenticateComputer', 'load', 'choice', 'authenticateComputer', 'choice', 'action', 'action']);
    assert.ok(['heads', 'tails'].includes(seen[2].optionId));
    assert.equal(seen[2].expectedRevision, 0);
    assert.deepEqual(seen[4], seen[2], 'uncertain action must be retried with the exact request ID and body');
    assert.equal(seen[5].actionId, placeId);
    assert.equal(seen[5].expectedRevision, 1);
    assert.equal(seen[6].actionId, '1:confirm-solid-defence');
    assert.equal(seen[6].expectedRevision, 1, 'A staged acknowledgement permits another action at the same revision');
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

for (const persistenceUnavailable of [false, true]) {
  test(`daemon retries an active match after ${persistenceUnavailable ? 'a persistence failure' : 'a failed worker'}`, { timeout: 18000 }, async () => {
    const server = createServer();
    let registrations = 0;
    let loads = 0;
    const rejectedLoads = persistenceUnavailable ? 3 : 1;
    const loadTimes = [];
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
          loads++; loadTimes.push(Date.now());
          if (loads <= rejectedLoads) {
            send(socket, { version: 2, type: 'setupState', requestId: body.requestId,
              code: persistenceUnavailable ? 'PERSISTENCE_FAILED' : 'SESSION_UNAVAILABLE', duplicate: false, state: null });
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
    let output = '', errors = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    let timer;
    try {
      const action = await Promise.race([actionReceived, new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(`Timed out: ${output}\n${errors}`)), 14000);
      })]);
      assert.ok(['26:apothecary:TEAM', '26:apothecary:no'].includes(action.actionId));
      assert.equal(action.expectedRevision, 26);
      assert.equal(loads, rejectedLoads + 1);
      assert.ok(registrations >= 3);
      if (persistenceUnavailable) {
        assert.equal(errors, '');
        assert.equal((output.match(/persistence unavailable/g) ?? []).length, 3);
        assert.ok(loadTimes[1] - loadTimes[0] >= 900);
        assert.ok(loadTimes[2] - loadTimes[1] >= 1900);
        assert.ok(loadTimes[3] - loadTimes[2] >= 3900);
        assert.match(output, /retrying active match .* after 1000 ms/);
      }
    } finally {
      clearTimeout(timer);
      try { await stopChild(child); }
      finally { server.closeAllConnections(); server.close(); }
    }
  });
}
