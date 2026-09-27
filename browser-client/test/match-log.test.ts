import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchLogLines } from '../src/match-log.ts';
import type { SetupState } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

const player = { id: 'runner', name: 'Runner', role: 'home' as const, slot: 1, x: 4, y: 7,
  state: 'standing', ag: 3, pa: 4 };
const state = (revision: number, x: number): SetupState => ({ matchId: '12345678-1234-1234-1234-123456789abc',
  revision, callerRole: 'home', phase: 'PLAY', actor: 'home', prompt: null, players: [{ ...player, x }],
  weather: 'NICE', homeRerolls: 2, awayRerolls: 2, actions: [], turn: 1, turnMode: 'REGULAR', ball: null,
  activePlayerId: 'runner', half: 1, homeTurn: 1, awayTurn: 1, homeScore: 0, awayScore: 0, drive: 1 });
const start: TranscriptRecord = { index: 0, revision: 0, kind: 'START', actor: 'system', at: 100,
  decision: null, native: [], state: state(0, 4) };

test('logs raw dodge target, net modifier, reroll, block dice and one coordinate span', () => {
  const action: TranscriptRecord = { index: 1, revision: 1, kind: 'ACTION', actor: 'home', at: 101,
    decision: { operation: 'action', actionId: '1:move:runner' },
    native: [{ commandNr: 1, reportList: { reports: [
      { reportId: 'dodgeRoll', playerId: 'runner', roll: 4, minimumRoll: 5, rollModifiers: ['Diving Tackle'], successful: false, reRolled: false },
      { reportId: 'reRoll', playerId: 'runner', reRollSource: 'Dodge', roll: 5, successful: true },
      { reportId: 'blockRoll', blockRoll: [4, 6], choosingTeamId: 'home' },
      { reportId: 'blockChoice', defenderId: 'runner', blockRoll: [4, 6], diceIndex: 1, blockResult: 'PUSHBACK' },
    ] } }], state: state(1, 10) };
  const lines = matchLogLines([start, action]).map(line => line.text);
  assert.ok(lines.some(line => line.includes('4 vs 5+ (base 3+ · -2 net modifier)') && line.includes('failure')));
  assert.ok(lines.some(line => line.includes('re roll') && line.includes('Dodge')));
  assert.ok(lines.some(line => line.includes('dice [4, 6]')));
  assert.ok(lines.some(line => line.includes('selected die 2: PUSHBACK')));
  assert.equal(lines.filter(line => line.includes('(4, 7) → (10, 7)')).length, 1);
});
