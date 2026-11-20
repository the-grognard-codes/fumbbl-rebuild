import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { assertV2Projection } from '../src/v2-projection.ts';

const messages = [
  { type: 'authentication', code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
  { type: 'error', code: 'AUTHENTICATION_REQUIRED' },
  { type: 'browse', code: 'ACCEPTED', matches: [{ matchId: '12345678-1234-1234-1234-123456789abc', label: 'Home vs Away' }] },
  { type: 'computer', code: 'READY' },
  { type: 'computerAuthentication', code: 'ACCEPTED' },
  { type: 'computerJobs', code: 'AVAILABLE', matches: ['12345678-1234-1234-1234-123456789abc'] },
  { type: 'preparationChanged', code: 'ACCEPTED', matchId: '12345678-1234-1234-1234-123456789abc' },
  { type: 'setupState', code: 'NOT_FOUND', duplicate: false, state: null },
  { type: 'matchResult', code: 'NOT_FOUND', result: null, event: null },
  { type: 'matchTranscript', code: 'ACCEPTED', matchId: '12345678-1234-1234-1234-123456789abc',
    page: { formatVersion: 2, from: 0, next: 0, total: 0, records: [] } },
  { type: 'preparedMatch', code: 'NOT_FOUND', duplicate: false, callerRole: null, document: null, recoveryMatchId: null },
  { type: 'savedTeam', code: 'NOT_FOUND', document: null, versionStatus: null, validation: null, teams: [] },
  JSON.parse(readFileSync(new URL('./fixtures/catalog-v1.json', import.meta.url), 'utf8')),
  { type: 'teamValidation', catalogVersion: 'fixture', ruleset: 'BB2025', draftVersion: 2, valid: false, budget: 0, skillPoints: 0, messages: [], total: null },
];

for (const body of messages) test(`${body.type}: explicit envelope accepts its fields and rejects private additions`, () => {
  const message = { ...body, version: 2, requestId: 'projection-contract' };
  assert.doesNotThrow(() => assertV2Projection(message));
  for (const field of ['bearer', 'uid', 'email', 'displayName', 'account', 'privateTeam', 'checkpoint', 'dice', 'requestHistory'])
    assert.throws(() => assertV2Projection({ ...message, [field]: 'private-sentinel' }));
  const { requestId, ...missing } = message;
  assert.throws(() => assertV2Projection(missing));
});

test('browse rejects nested identities; unknown future response families require a contract', () => {
  assert.throws(() => assertV2Projection({ version: 2, type: 'browse', requestId: 'browse', code: 'ACCEPTED',
    matches: [{ matchId: '12345678-1234-1234-1234-123456789abc', label: 'Home vs Away', email: 'private-sentinel' }] }));
  for (const type of ['profile', 'admin', 'replay', 'result', 'chat', '__proto__'])
    assert.throws(() => assertV2Projection({ version: 2, type, requestId: 'future', code: 'ACCEPTED' }));
});

test('computer job changes are unsolicited notices with a match revision and no state payload', () => {
  const notice = { version: 2, type: 'computerJobChanged', requestId: null, matchId: '12345678-1234-1234-1234-123456789abc',
    revision: 7, saveResumeChanged: false };
  assert.doesNotThrow(() => assertV2Projection(notice));
  for (const invalid of [{ requestId: 'reply' }, { matchId: 'invalid' }, { revision: -1 }, { revision: 1.5 },
    { saveResumeChanged: 'false' }, { state: {} }]) assert.throws(() => assertV2Projection({ ...notice, ...invalid }));
});

for (const type of ['computerJobEnded', 'computerJobSuspended']) {
  test(`${type} only exposes the match ID in an unsolicited notice`, () => {
    const notice = { version: 2, type, requestId: null, matchId: '12345678-1234-1234-1234-123456789abc' };
    assert.doesNotThrow(() => assertV2Projection(notice));
    for (const invalid of [{ requestId: 'reply' }, { matchId: 'invalid' }, { state: {} }])
      assert.throws(() => assertV2Projection({ ...notice, ...invalid }));
  });
}

test('only a ready dispatcher response can request inventory continuation', () => {
  const message = { version: 2, type: 'computer', requestId: 'register', code: 'READY', inventoryPending: true };
  assert.doesNotThrow(() => assertV2Projection(message));
  assert.throws(() => assertV2Projection({ ...message, inventoryPending: false }));
  assert.throws(() => assertV2Projection({ ...message, code: 'NOT_FOUND' }));
});
