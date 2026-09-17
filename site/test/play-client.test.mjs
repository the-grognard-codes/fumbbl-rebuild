import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadClient() {
  const source = await readFile(new URL('../src/assets/play.js', import.meta.url), 'utf8');
  const module = source
    .replace(/^import .*\n/gm, '')
    .replace(/if \(typeof document[\s\S]*$/, '');
  return import(`data:text/javascript,${encodeURIComponent(module)}`);
}

class MockSocket {
  static OPEN = 1;
  constructor() { this.readyState = MockSocket.OPEN; this.sent = []; }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.onclose?.({ code: 1000 }); }
  open() { this.onopen(); }
  message(value) { this.onmessage({ data: JSON.stringify(value) }); }
}

test('SessionClient authenticates with a freshly requested token before session commands', async () => {
  globalThis.WebSocket = MockSocket;
  const { SessionClient } = await loadClient();
  const sockets = [];
  const client = new SessionClient({
    url: 'wss://game.example/session/v1', getToken: async force => { assert.equal(force, true); return 'fresh-token'; },
    makeSocket: () => { const socket = new MockSocket(); sockets.push(socket); return socket; },
    onStatus: () => {}, onSession: () => {}, onEvent: () => {}, onReauthenticate: () => {}
  });
  client.connect();
  sockets[0].open();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sockets[0].sent, [{ type: 'authenticate', token: 'fresh-token' }]);
  assert.equal(client.send({ type: 'create' }), false);
  sockets[0].message({ type: 'authenticated' });
  assert.equal(client.send({ type: 'create' }), true);
  assert.deepEqual(sockets[0].sent.at(-1), { type: 'create' });
});

test('SessionClient stops after a duplicate-session close', async () => {
  globalThis.WebSocket = MockSocket;
  const { SessionClient } = await loadClient();
  const socket = new MockSocket();
  const statuses = [];
  const client = new SessionClient({
    url: 'wss://game.example/session/v1', getToken: async () => 'token', makeSocket: () => socket,
    onStatus: value => statuses.push(value), onSession: () => {}, onEvent: () => {}, onReauthenticate: () => {}, schedule: () => assert.fail('duplicate sessions must not retry')
  });
  client.connect();
  socket.onclose({ code: 4009 });
  assert.equal(client.stopped, true);
  assert.match(statuses.at(-1), /rejected/);
});

test('SessionClient refreshes an expired token once then requires a fresh sign-in', async () => {
  globalThis.WebSocket = MockSocket;
  const { SessionClient } = await loadClient();
  const sockets = [];
  let reauthenticated = 0;
  const client = new SessionClient({
    url: 'wss://game.example/session/v1', getToken: async () => `token-${sockets.length}`,
    makeSocket: () => { const socket = new MockSocket(); sockets.push(socket); return socket; },
    onStatus: () => {}, onSession: () => {}, onEvent: () => {}, onReauthenticate: () => { reauthenticated += 1; }
  });
  client.connect();
  sockets[0].open();
  await new Promise(resolve => setImmediate(resolve));
  sockets[0].message({ type: 'error', code: 'expired' });
  sockets[1].open();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sockets[1].sent[0], { type: 'authenticate', token: 'token-2' });
  sockets[1].message({ type: 'error', code: 'expired' });
  assert.equal(reauthenticated, 1);
  assert.equal(client.stopped, true);
});

test('SessionClient rejoins its retained session after a reconnect', async () => {
  globalThis.WebSocket = MockSocket;
  const { SessionClient } = await loadClient();
  const sockets = [];
  let retry;
  const client = new SessionClient({
    url: 'wss://game.example/session/v1', getToken: async () => 'token',
    makeSocket: () => { const socket = new MockSocket(); sockets.push(socket); return socket; },
    onStatus: () => {}, onSession: () => {}, onEvent: () => {}, onReauthenticate: () => {}, schedule: callback => { retry = callback; }
  });
  client.connect();
  sockets[0].open();
  await new Promise(resolve => setImmediate(resolve));
  sockets[0].message({ type: 'authenticated' });
  sockets[0].message({ type: 'session', code: '0123456789abcdef0123456789abcdef', slots: [] });
  sockets[0].onclose({ code: 1006 });
  retry();
  sockets[1].open();
  await new Promise(resolve => setImmediate(resolve));
  // The previous server-side presence may still be timing out after a network loss.
  sockets[1].onclose({ code: 4009 });
  assert.equal(client.stopped, false);
  retry();
  sockets[2].open();
  await new Promise(resolve => setImmediate(resolve));
  sockets[2].message({ type: 'authenticated' });
  assert.deepEqual(sockets[2].sent.at(-1), { type: 'join', code: '0123456789abcdef0123456789abcdef' });
});

test('SessionClient invokes the native retry scheduler with the global receiver', async () => {
  globalThis.WebSocket = MockSocket;
  const originalSetTimeout = globalThis.setTimeout;
  let scheduled;
  globalThis.setTimeout = function(callback, delay) {
    assert.equal(this, globalThis);
    assert.equal(delay, 1000);
    scheduled = callback;
    return 1;
  };
  try {
    const { SessionClient } = await loadClient();
    const client = new SessionClient({
      url: 'wss://game.example/session/v1', getToken: async () => 'token', makeSocket: () => new MockSocket(),
      onStatus: () => {}, onSession: () => {}, onEvent: () => {}, onReauthenticate: () => {}
    });
    client.retry();
    assert.equal(typeof scheduled, 'function');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});
