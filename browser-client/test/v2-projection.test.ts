import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { assertV2Projection } from '../src/v2-projection.ts';

const messages = [
  { type: 'authentication', code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
  { type: 'error', code: 'AUTHENTICATION_REQUIRED' },
  { type: 'browse', code: 'ACCEPTED', matches: [{ matchId: '12345678-1234-1234-1234-123456789abc', label: 'Home vs Away' }] },
  { type: 'preparationChanged', code: 'ACCEPTED', matchId: '12345678-1234-1234-1234-123456789abc' },
  { type: 'setupState', code: 'NOT_FOUND', duplicate: false, state: null },
  { type: 'preparedMatch', code: 'NOT_FOUND', duplicate: false, callerRole: null, document: null, recoveryMatchId: null },
  { type: 'savedTeam', code: 'NOT_FOUND', document: null, versionStatus: null, validation: null, teams: [] },
  JSON.parse(readFileSync(new URL('./fixtures/catalog-v1.json', import.meta.url), 'utf8')),
  { type: 'teamValidation', catalogVersion: 'fixture', ruleset: 'BB2025', valid: false, budget: 0, skillPoints: 0, messages: [], total: null },
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
