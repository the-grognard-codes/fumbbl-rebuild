import assert from 'node:assert/strict';
import test from 'node:test';
import { currentMatchStatus, decodeCurrentMatches } from '../src/current-matches-protocol.ts';
import { assertV2Projection } from '../src/v2-projection.ts';

const match = { matchId: '12345678-1234-1234-1234-123456789abc', callerRole: 'home' as const,
  lifecycle: 'ACTIVATED' as const, homeTeamName: 'Orcs 4 Hire', awayTeamName: "Bugman's Best", phase: 'PLAY' };

test('current match pages include owned preparations, active matches and unavailable entries', () => {
  for (const lifecycle of ['WAITING_FOR_OPPONENT', 'AWAITING_SETUP', 'ACTIVATED', 'UNAVAILABLE']) {
    const row = { ...match, lifecycle, awayTeamName: lifecycle === 'WAITING_FOR_OPPONENT' ? null : match.awayTeamName };
    assert.deepEqual(decodeCurrentMatches([row], null), [row]);
  }
  assert.deepEqual(decodeCurrentMatches([], null), []);
  assert.equal(currentMatchStatus(match), 'In progress');
  assert.equal(currentMatchStatus({ ...match, phase: 'SETUP' }), 'Awaiting kickoff');
  for (const phase of ['PRE_MATCH', 'READY_FOR_KICKOFF'])
    assert.equal(currentMatchStatus({ ...match, phase }), 'Awaiting kickoff');
});

test('current match disclosure rejects identities, completed games, malformed names and invalid cursors', () => {
  const envelope = { version: 2, type: 'currentMatches', requestId: 'list', code: 'ACCEPTED', matches: [match], next: null };
  assert.doesNotThrow(() => assertV2Projection(envelope));
  for (const addition of ['owner', 'accountId', 'email', 'invitationCode', 'checkpoint']) {
    assert.throws(() => assertV2Projection({ ...envelope, [addition]: 'private' }));
    assert.throws(() => decodeCurrentMatches([{ ...match, [addition]: 'private' }], null));
  }
  for (const change of [{ lifecycle: 'COMPLETED' }, { callerRole: 'spectator' }, { homeTeamName: null },
    { awayTeamName: null }, { homeTeamName: '' }, { phase: 1 }])
    assert.throws(() => decodeCurrentMatches([{ ...match, ...change }], null));
  assert.throws(() => decodeCurrentMatches([match, match], null));
  assert.throws(() => decodeCurrentMatches([match], '00000000-0000-0000-0000-000000000000'));
  assert.throws(() => decodeCurrentMatches([], 'not-a-match'));
  assert.throws(() => decodeCurrentMatches(Array.from({ length: 101 }, () => match), null));
});
