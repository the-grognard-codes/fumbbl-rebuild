import assert from 'node:assert/strict';
import test from 'node:test';
import { V2Client, v2PendingKey } from '../src/v2-client.ts';
import { canPlaceReserve, decodeSetupStateValue } from '../src/setup-protocol.ts';

const account = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const match = '12345678-1234-1234-1234-123456789abc';
const state = { matchId: match, revision: 2, callerRole: 'spectator', phase: 'SETUP', actor: 'home',
  prompt: { id: 'choice', actor: 'home', kind: 'coin', options: ['heads', 'tails'] },
  players: [{ id: 'p1', name: 'Captain', slot: 1, role: 'home', x: null, y: null, state: 'reserve' }],
  weather: 'Nice', homeRerolls: 2, awayRerolls: 1, actions: [], turn: 0, turnMode: 'setup', ball: null,
  activePlayerId: null, half: 1, homeTurn: 0, awayTurn: 0, homeScore: 0, awayScore: 0, drive: 1 };

class Socket {
  readyState = 1; sent: any[] = []; closed = false;
  onopen: (() => Promise<void>) | null = null; onmessage: ((event: any) => void) | null = null;
  onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  close() { this.closed = true; }
  reply(message: any) { this.onmessage?.({ data: JSON.stringify({ version: 2, ...message }) }); }
}
function fixture(storageData = new Map<string, string>()) {
  const sockets: Socket[] = []; const events: any[] = [];
  const storage = { getItem: (key: string) => storageData.get(key) ?? null, setItem: (key: string, value: string) => { storageData.set(key, value); }, removeItem: (key: string) => storageData.delete(key) } as Storage;
  const client = new V2Client({ url: 'ws://127.0.0.1/browser/v2', getToken: async () => 'secret-bearer',
    makeSocket: () => { const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; }, onChange: message => events.push(message), storage });
  async function connect() {
    client.connect(); const socket = sockets.at(-1)!; await socket.onopen!();
    socket.reply({ type: 'authentication', code: 'ACCEPTED', requestId: socket.sent[0].requestId, accountId: account }); return socket;
  }
  return { client, connect, sockets, events, storageData };
}

test('unavailable Firebase token reports a safe authentication error before disconnecting', async () => {
  const socket = new Socket(); const events: any[] = [];
  const client = new V2Client({ url: 'ws://127.0.0.1/browser/v2', getToken: async () => { throw Error('provider detail'); },
    makeSocket: () => socket as unknown as WebSocket, onChange: message => events.push(message) });
  client.connect(); await socket.onopen!();
  assert.equal(socket.closed, true);
  assert.deepEqual(events.slice(1).map(event => event.code), ['CONNECTING', 'AUTHENTICATION_TOKEN_UNAVAILABLE', 'DISCONNECTED']);
});

test('one authenticated socket browses and watches the shared state; spectator commands stay disabled', async () => {
  const { client, connect, sockets, storageData } = fixture(); const socket = await connect();
  assert.equal(sockets.length, 1); assert.deepEqual(socket.sent.slice(1).map(message => message.type), ['browse', 'savedTeam', 'catalog']);
  const requestId = client.open(match, true);
  socket.reply({ type: 'setupState', code: 'ACCEPTED', requestId, duplicate: false, state });
  assert.deepEqual(client.state, state);
  assert.equal(canPlaceReserve(client.state!, 'p1', 3, 4), false);
  assert.throws(() => client.request('setup', { matchId: match, operation: 'confirm' }, true), /read-only/);
  assert.equal(storageData.size, 0);
  assert.throws(() => decodeSetupStateValue(state)); // v1 does not silently accept the v2 seat value.
});

test('uncertain player intent survives reconnect and retries exactly once on explicit request', async () => {
  const { client, connect, storageData } = fixture(); let socket = await connect();
  let requestId = client.open(match, false);
  socket.reply({ type: 'setupState', code: 'ACCEPTED', requestId, duplicate: false, state: { ...state, callerRole: 'home' } });
  const intent = { matchId: match, operation: 'confirm', expectedRevision: 2 };
  requestId = client.request('setup', intent, true); const original = socket.sent.at(-1);
  assert.ok(storageData.has(v2PendingKey)); assert.ok(!storageData.get(v2PendingKey)!.includes('secret-bearer'));
  socket.reply({ type: 'error', requestId, code: 'MATCH_OUTCOME_UNKNOWN' }); assert.ok(client.pending);
  socket = await connect(); assert.equal(socket.sent.filter(message => message.operation === 'confirm').length, 0);
  client.retry(); assert.deepEqual(socket.sent.at(-1), original);
  socket.reply({ type: 'setupState', requestId, code: 'ACCEPTED', duplicate: true, state: { ...state, revision: 3, callerRole: 'home' } });
  assert.equal(client.pending, null); assert.equal(storageData.size, 0);
});

test('retired sockets and foreign match responses cannot clear retained intent', async () => {
  const { client, connect, storageData } = fixture(); const old = await connect();
  const requestId = client.request('preparedMatch', { operation: 'activate', matchId: match, expectedRevision: 2 }, true);
  const latest = await connect();
  old.reply({ type: 'preparedMatch', requestId, code: 'ACCEPTED' }); assert.ok(client.pending);
  const load = client.open(match, true);
  latest.reply({ type: 'setupState', code: 'ACCEPTED', requestId: load, state: { ...state, matchId: account } });
  assert.equal(client.accountId, ''); assert.equal(client.state, null); assert.ok(storageData.has(v2PendingKey));
});

test('authentication failure and replaced connection clear visible state', async () => {
  const { client, connect } = fixture(); const socket = await connect();
  const id = client.open(match, true); socket.reply({ type: 'setupState', code: 'ACCEPTED', requestId: id, state });
  socket.reply({ type: 'error', code: 'CONNECTION_REPLACED', requestId: null });
  assert.equal(client.state, null); assert.equal(client.accountId, ''); assert.ok(socket.closed);
});

test('wrong response family and malformed preparation cannot acknowledge a retained mutation', async () => {
  for (const type of ['browse', 'preparedMatch']) {
    const { client, connect, storageData } = fixture(); const socket = await connect();
    const requestId = client.request('preparedMatch', { operation: 'activate', matchId: match, expectedRevision: 2 }, true);
    socket.reply({ type, code: 'ACCEPTED', requestId, matches: [], document: { matchId: match } });
    assert.equal(client.accountId, ''); assert.ok(client.pending); assert.ok(storageData.has(v2PendingKey));
  }
});

test('page reload recovers the pending player selection before an explicit exact retry', async () => {
  const first = fixture(); const originalSocket = await first.connect();
  first.client.request('setup', { matchId: match, operation: 'confirm', expectedRevision: 2 }, true);
  const original = originalSocket.sent.at(-1);
  const reloaded = fixture(first.storageData); const socket = await reloaded.connect();
  assert.equal(socket.sent.at(-1).operation, 'load');
  assert.equal(socket.sent.filter(request => request.operation === 'confirm').length, 0);
  reloaded.client.retry(); assert.deepEqual(socket.sent.at(-1), original);
  socket.reply({ type: 'setupState', requestId: original.requestId, code: 'ACCEPTED', duplicate: true, state: { ...state, callerRole: 'home' } });
  assert.equal(reloaded.client.pending, null); assert.equal(reloaded.client.state?.matchId, match);
});
