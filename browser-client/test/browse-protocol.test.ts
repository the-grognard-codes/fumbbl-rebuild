import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeBrowseGames, filterLiveGames, gameLabel, searchReplayGames } from '../src/browse-protocol.ts';
import type { BrowseGame } from '../src/browse-protocol.ts';
import { assertV2Projection } from '../src/v2-projection.ts';

const game: BrowseGame = { matchId: '12345678-1234-1234-1234-123456789abc', label: 'Home vs Away', details: {
  home: { name: 'Deepdelve Miners', type: 'Human', teamValue: 1100000, coach: 'Grognard' },
  away: { name: "Bugman's Best", type: 'Orc', teamValue: 990000, coach: 'Coach Bugman - Random' },
  ruleset: 'BB2025', competition: null, phase: 'PLAY', half: 2, turn: 4, homeScore: 1, awayScore: 0, spectators: 3,
} };

test('browse accepts public match details and older entries, including unavailable live state', () => {
  assert.equal(gameLabel(decodeBrowseGames([game])[0]), "Deepdelve Miners vs. Bugman's Best");
  assert.doesNotThrow(() => assertV2Projection({ version: 2, type: 'browse', requestId: 'browse', code: 'ACCEPTED', matches: [game] }));
  const older = { matchId: game.matchId, label: 'Home vs Away' };
  assert.equal(gameLabel(decodeBrowseGames([older])[0]), 'Home vs Away');
  assert.doesNotThrow(() => decodeBrowseGames([{ ...game, details: { ...game.details, phase: null, half: null, turn: null, homeScore: null, awayScore: null } }]));
});

test('browse rejects private nested fields, malformed metadata, duplicate IDs and oversized lists', () => {
  for (const bad of [
    { ...game, email: 'private' },
    { ...game, details: { ...game.details, checkpoint: 'private' } },
    { ...game, details: { ...game.details, home: { ...game.details!.home, accountId: 'private' } } },
    { ...game, details: { ...game.details, homeScore: -1 } },
    { ...game, details: { ...game.details, spectators: 1.5 } },
    { ...game, details: { ...game.details, away: { ...game.details!.away, teamValue: '990k' } } },
    { ...game, matchId: '../../private' },
  ]) assert.throws(() => decodeBrowseGames([bad]));
  assert.throws(() => decodeBrowseGames([game, game]));
  assert.throws(() => decodeBrowseGames(Array(101).fill(game)));
});

test('live search matches partial IDs, names, roster types and multiple case-insensitive terms', () => {
  for (const query of ['', '  ', 'DEEPDELVE', 'grognard orc', '12345678', 'bb2025 human'])
    assert.deepEqual(filterLiveGames([game], query), [game]);
  assert.deepEqual(filterLiveGames([game], 'grognard skaven'), []);
});

test('replay placeholder normalizes filters and distinguishes unavailable archive from no matches', () => {
  assert.deepEqual(searchReplayGames({ gameId: ' 123 ', playerName: ' Coach ', teamName: ' Moles ', teamType: ' Human ' }), {
    games: [], available: false, filters: { gameId: '123', playerName: 'Coach', teamName: 'Moles', teamType: 'Human' },
  });
});
