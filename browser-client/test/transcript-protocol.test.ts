import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeTranscript } from '../src/transcript-protocol.ts';

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
