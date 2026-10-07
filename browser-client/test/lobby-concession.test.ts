import assert from 'node:assert/strict';
import test from 'node:test';
import { LobbyConcession } from '../src/lobby-concession.ts';
import type { ConcessionStatus } from '../src/lobby-concession.ts';
import type { PendingIntent, V2Message } from '../src/v2-client.ts';

const matchId = '12345678-1234-1234-1234-123456789abc';
function fixture(retained: PendingIntent | null = null) {
  const sent: V2Message[] = [], notices: ConcessionStatus[] = [];
  const transport = { pending: retained,
    open(id: string, watch: boolean) { sent.push({ operation: 'load', matchId: id, watch }); return 'read'; },
    restorePreparation(id: string) { return this.request('preparedMatch', { operation: 'load', matchId: id }); },
    request(type: string, fields: V2Message, mutation = false) {
      const request = { ...fields, type, version: 2, requestId: mutation ? 'mutation' : 'restore' };
      sent.push({ ...request, mutation });
      if (mutation) transport.pending = { accountId: matchId, request };
      return request.requestId;
    } };
  return { flow: new LobbyConcession(transport, status => notices.push(status)), transport, sent, notices };
}
const loaded = (phase = 'PRE_MATCH') => ({ type: 'setupState', requestId: 'read', code: 'ACCEPTED', state: { phase, revision: 41 } });

test('confirmed concession reads native revision then submits exactly one retained mutation', () => {
  const { flow, sent, transport, notices } = fixture();
  assert.equal(sent.length, 0);
  flow.begin(matchId);
  assert.deepEqual(sent[0], { operation: 'load', matchId, watch: false });
  assert.throws(() => flow.begin(matchId));
  assert.equal(flow.receive({ ...loaded(), requestId: 'foreign' }), false);
  assert.equal(sent.length, 1);
  assert.equal(flow.receive(loaded()), false);
  assert.deepEqual(sent[1], { type: 'setup', version: 2, requestId: 'mutation', operation: 'concede', matchId, expectedRevision: 41, mutation: true });
  flow.receive(loaded()); assert.equal(sent.length, 2);
  transport.pending = null;
  assert.equal(flow.receive({ ...loaded('FULL_TIME'), requestId: 'mutation' }), true);
  assert.match(notices.at(-1).text, /Concession accepted/);
});

test('completed and unavailable reads never submit concession, and a disconnect cancels only the read', () => {
  for (const reply of [loaded('FULL_TIME'), { type: 'error', requestId: 'read', code: 'NOT_FOUND' },
    { type: 'setupState', requestId: 'read', code: 'SESSION_UNAVAILABLE', state: null },
    { type: 'status', code: 'DISCONNECTED' }]) {
    const { flow, sent, notices } = fixture(); flow.begin(matchId); flow.receive(reply);
    assert.equal(sent.length, 1); assert.equal(notices.at(-1).busy, false);
    flow.receive(loaded()); assert.equal(sent.length, 1);
  }
});

test('uncertain concession survives reload and disconnect without automatic replay or a fresh request', () => {
  const { flow, sent, transport, notices } = fixture(); flow.begin(matchId); flow.receive(loaded());
  const retained = transport.pending;
  flow.receive({ type: 'setupState', requestId: 'mutation', code: 'MATCH_OUTCOME_UNKNOWN', state: null });
  assert.equal(transport.pending, retained); assert.equal(sent.length, 2); assert.throws(() => flow.begin(matchId));
  const restarted = fixture(retained);
  restarted.flow.receive({ type: 'status', code: 'DISCONNECTED' });
  restarted.flow.receive(loaded()); assert.equal(restarted.sent.length, 0);
  restarted.transport.pending = null;
  assert.equal(restarted.flow.receive({ ...loaded('FULL_TIME'), requestId: 'mutation', duplicate: true }), true);
  assert.match(restarted.notices.at(-1).text, /Concession accepted/);
  assert.match(notices.at(-1).text, /unconfirmed/);
});

test('stale revisions do not retry a changed concession automatically', () => {
  const { flow, sent, transport, notices } = fixture(); flow.begin(matchId); flow.receive(loaded('PLAY'));
  transport.pending = null;
  assert.equal(flow.receive({ type: 'setupState', requestId: 'mutation', code: 'STALE_REVISION', state: null }), true);
  assert.equal(sent.length, 2); assert.match(notices.at(-1).text, /STALE REVISION/);
  flow.begin(matchId); assert.equal(sent.length, 3);
});

test('restores the displayed preparation after failure, uncertain outcome, and exact retry', () => {
  const preparation = '12345678-1234-1234-1234-123456789abd';
  const { flow, sent, transport, notices } = fixture();
  flow.begin(matchId, preparation);
  flow.receive({ type: 'error', requestId: 'read', code: 'NOT_FOUND' });
  assert.equal(sent.at(-1).type, 'preparedMatch');
  assert.equal(sent.at(-1).matchId, preparation);
  assert.equal(notices.at(-1).busy, true);
  flow.receive({ type: 'preparedMatch', requestId: 'restore', code: 'ACCEPTED' });
  assert.equal(notices.at(-1).busy, false);
  flow.begin(matchId, preparation); flow.receive(loaded());
  const retained = transport.pending;
  flow.receive({ type: 'setupState', requestId: 'mutation', code: 'MATCH_OUTCOME_UNKNOWN', state: null });
  assert.equal(transport.pending, retained);
  flow.receive({ type: 'preparedMatch', requestId: 'restore', code: 'ACCEPTED' });
  transport.pending = null;
  flow.receive({ ...loaded('FULL_TIME'), requestId: 'mutation' });
  assert.equal(sent.filter(request => request.type === 'preparedMatch').length, 3);
  assert.equal(sent.filter(request => request.operation === 'concede').length, 1);
});
