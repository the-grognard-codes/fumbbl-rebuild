import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeTranscript } from '../src/transcript-protocol.ts';
import { TranscriptHistory } from '../src/transcript-history.ts';

const matchId = '12345678-1234-1234-1234-123456789abc';
const state = { matchId, revision: 0, callerRole: 'home', phase: 'PLAY', actor: 'home', prompt: null,
  players: [], weather: 'NICE', homeRerolls: 0, awayRerolls: 0, actions: [], turn: 0,
  turnMode: 'REGULAR', ball: null, activePlayerId: null, half: 1, homeTurn: 0, awayTurn: 0,
  homeScore: 0, awayScore: 0, drive: 1 };
const start = { index: 0, revision: 0, kind: 'START', actor: 'system', at: 100,
  decision: null, native: [], state };
const page = { formatVersion: 2, from: 0, next: 1, total: 1, records: [start] };
const response = { version: 2, type: 'matchTranscript', requestId: 'history', code: 'ACCEPTED', matchId, page };

test('decodes the bounded public transcript and its authoritative snapshot', () => {
  assert.equal(decodeTranscript(JSON.stringify(response)).page.records[0].state.matchId, matchId);
  const action = { index: 1, revision: 1, kind: 'ACTION', actor: 'home', at: 101,
    decision: { actionId: '1:move' }, native: [{ commandNr: 2, reportList: { reports: [{ roll: 4 }] } }],
    state: { ...state, revision: 1 } };
  assert.equal(decodeTranscript(JSON.stringify({ ...response, page: { ...page, from: 1, next: 2, total: 2, records: [action] } }))
    .page.records[0].native[0].commandNr, 2);
});

test('rejects gaps, foreign board state, and unsolicited transcript fields', () => {
  assert.throws(() => decodeTranscript(JSON.stringify({ ...response, page: { ...page, next: 2 } })));
  assert.throws(() => decodeTranscript(JSON.stringify({ ...response, page: { ...page, records: [{ ...start, state: { ...state, matchId: 'other' } }] } })));
  assert.throws(() => decodeTranscript(JSON.stringify({ ...response, privateField: true })));
});

test('live public history requires explicit negotiation and one latest record', () => {
  const live = { ...response, requestId: null };
  assert.throws(() => decodeTranscript(JSON.stringify(live)));
  assert.equal(decodeTranscript(JSON.stringify(live), true).page.records.length, 1);
  assert.throws(() => decodeTranscript(JSON.stringify({ ...live, page: { ...page, total: 2 } }), true));
  assert.throws(() => decodeTranscript(JSON.stringify({ ...live, page: { ...page, records: [], next: 0, total: 0 } }), true));
});

test('live history and delayed recovery pages merge without loss across duplicates, overlap and gaps', () => {
  const history = new TranscriptHistory();
  const records = [start, ...[1, 2].map(revision => ({ index: revision, revision, kind: 'ACTION', actor: 'home',
    at: 100 + revision, decision: { actionId: `move:${revision}` }, native: [{ commandNr: revision }], state: { ...state, revision } }))];
  const read = (from: number, next: number) => decodeTranscript(JSON.stringify({ ...response,
    page: { ...page, from, next, total: 3, records: records.slice(from, next) } })).page;
  assert.equal(history.accept(read(0, 1)), true);
  assert.equal(history.accept(read(2, 3)), false, 'A missing predecessor requires a paged catch-up');
  assert.equal(history.records.length, 1);
  assert.equal(history.accept(read(0, 2)), true, 'A delayed page may overlap a live record');
  assert.equal(history.accept(read(2, 3)), true);
  assert.equal(history.accept(read(0, 2)), true, 'A stale read never removes newer live records');
  const reordered = JSON.parse(JSON.stringify(read(1, 2)));
  reordered.records[0] = Object.fromEntries(Object.entries(reordered.records[0]).reverse());
  assert.equal(history.accept(reordered), true, 'JSON object property order is immaterial');
  assert.deepEqual(history.records.map(record => record.revision), [0, 1, 2]);
  const conflicting = JSON.parse(JSON.stringify(read(1, 2)));
  conflicting.records[0].decision.actionId = 'conflicting';
  assert.throws(() => history.accept(conflicting), /Conflicting/);
  assert.equal(history.records[1].decision?.actionId, 'move:1');
});

test('recovery pages cannot move public command order or time backward across a page boundary', () => {
  for (const backwards of ['command', 'time']) {
    const history = new TranscriptHistory();
    history.accept(decodeTranscript(JSON.stringify(response)).page);
    const action = (revision: number, commandNr: number, at: number) => decodeTranscript(JSON.stringify({ ...response,
      page: { ...page, from: revision, next: revision + 1, total: revision + 1, records: [{
        ...start, index: revision, revision, kind: 'ACTION', actor: 'home', at, decision: {},
        native: [{ commandNr }], state: { ...state, revision }
      }] } })).page;
    history.accept(action(1, 2, 200));
    assert.throws(() => history.accept(action(2, backwards === 'command' ? 1 : 3, backwards === 'time' ? 150 : 201)), /backward/);
    assert.equal(history.records.length, 2, 'Invalid pages leave the accepted prefix untouched');
  }
});
