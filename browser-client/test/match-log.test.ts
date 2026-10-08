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
  activePlayerId: 'runner', half: 1, homeTurn: 1, awayTurn: 1, homeScore: 0, awayScore: 0, drive: 1,
  homeTeamName: 'Tusk Love Dugout', awayTeamName: "Bugman's Best Dugout" });
const start: TranscriptRecord = { index: 0, revision: 0, kind: 'START', actor: 'system', at: 100,
  decision: null, native: [], state: state(0, 4) };

test('logs raw dodge target, net modifier, reroll and block dice without coordinate debug lines', () => {
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
  assert.ok(lines.some(line => line.includes('used Dodge reroll.')));
  assert.ok(lines.some(line => line.includes('dice [4, 6]')));
  assert.ok(lines.some(line => line.includes('selected die 2: PUSHBACK')));
  assert.ok(lines.every(line => !line.includes('(4, 7) → (10, 7)')));
});

test('renders retained injury, apothecary, foul rulings, rerolls and KO recovery from native fields', () => {
  const detailedState = { ...state(1, 4), players: [{ ...player, av: 9 }] };
  const action: TranscriptRecord = { index: 1, revision: 1, kind: 'ACTION', actor: 'home', at: 101,
    decision: { operation: 'action', actionId: 'block-runner' }, native: [{ commandNr: 1, reportList: { reports: [
      { reportId: 'injury', defenderId: 'runner', armorRoll: [5, 5], armorBroken: true,
        armorModifiers: ['Mighty Blow'], injuryRoll: [4, 6], injury: 'BADLY_HURT',
        casualtyRoll: [3, 4], seriousInjury: 'BROKEN_ARM', casualtyModifiers: [] },
      { reportId: 'apothecaryRoll', playerId: 'runner', casualtyRoll: [2, 3], seriousInjury: 'RECOVERED' },
      { reportId: 'apothecaryChoice', playerId: 'runner', playerState: 'BADLY_HURT' },
      { reportId: 'regenerationRoll', playerId: 'runner', roll: 5, minimumRoll: 4, successful: true },
      { reportId: 'argueTheCall', playerId: 'runner', roll: 5, biasedRefs: 1, friendsWithRef: false, successful: true },
      { reportId: 'bribesRoll', playerId: 'runner', roll: 2, successful: true },
      { reportId: 'referee', foulingPlayerBanned: true, underScrutiny: true },
      { reportId: 'secretWeaponBan', playerIds: ['runner'], rolls: [1], banArray: [true] },
      { reportId: 'briberyAndCorruptionReRoll', teamId: 'home', briberyAncCorruptionAction: 'REROLL_BRIBE' },
      { reportId: 'reRoll', playerId: 'runner', reRollSource: 'TEAM_RE_ROLL', roll: 3, successful: true },
      { reportId: 'blockReRoll', playerId: 'runner', reRollSource: 'BRAWLER', blockRoll: [2, 6] },
      { reportId: 'turnEnd', knockoutRecoveryArray: [
        { playerId: 'runner', roll: 3, bloodweiserBabes: 1, bugmansXXXXXXModifier: 0, recovering: true },
        { playerId: 'runner', roll: 1, bloodweiserBabes: 0, bugmansXXXXXXModifier: 0, recovering: false },
      ] },
    ] } }], state: detailedState };
  const lines = matchLogLines([start, action]).map(line => line.text);
  assert.ok(lines.some(line => /armor 5 \+ 5 = 10 vs base AV 9\+ · broken/.test(line) && line.includes('Mighty Blow')));
  assert.ok(lines.some(line => line.includes('injury 4 + 6 = 10') && line.includes('casualty 3 · serious injury die 4')));
  assert.ok(lines.some(line => line.includes('apothecary roll') && line.includes('casualty 2 · serious injury die 3')));
  assert.ok(lines.some(line => line.includes('tests Regeneration') && line.includes('5 vs 4+')));
  assert.ok(lines.some(line => line.includes('argue the call') && line.includes('5 vs 5+')));
  assert.ok(lines.some(line => line.includes('bribes roll') && line.includes('2 vs 2+')));
  assert.ok(lines.some(line => line.includes('fouling player sent off') && line.includes('under scrutiny')));
  assert.ok(lines.some(line => line.includes('Secret weapon · Runner: roll 1 · sent off')));
  assert.ok(lines.some(line => line.includes('bribery and corruption re roll') && line.includes('reroll bribe')));
  assert.ok(lines.some(line => line.includes('used Team reroll.')));
  assert.ok(lines.some(line => line.includes('block re roll') && line.includes('source Brawler')));
  assert.equal(lines.filter(line => line.startsWith('KO recovery · Runner')).length, 2);
});

test('uses team names for kickoff choices and hides setup bookkeeping, team IDs, and placement changes', () => {
  const teamId = '39395928-d9e7-318a-b54f-719989a4ca68';
  const choice: TranscriptRecord = { index: 1, revision: 1, kind: 'SELECTION', actor: 'away', at: 101,
    decision: { operation: 'choice', optionId: 'kick' }, native: [{ commandNr: 1, reportList: { reports: [
      { reportId: 'receiveChoice', teamId, receiveChoice: false },
      { reportId: 'startHalf', half: 1 },
      { reportId: 'fanFactor', teamId, dedicatedFans: 2, dedicatedFansResult: 3, dedicatedFansRoll: 1 },
    ] } }], state: state(1, 13) };
  const placement: TranscriptRecord = { index: 2, revision: 2, kind: 'ACTION', actor: 'away', at: 102,
    decision: { operation: 'place', playerId: 'runner', to: { x: 13, y: 6 } }, native: [], state: state(2, 13) };
  const lines = matchLogLines([start, choice, placement]).map(line => line.text);
  assert.ok(lines.includes("Bugman's Best Dugout chooses to kick."));
  assert.ok(lines.some(line => line.startsWith('fan factor:')));
  assert.ok(lines.every(line => !line.includes(teamId) && !line.startsWith('receive choice')
    && !line.startsWith('start half') && !line.includes('off pitch') && !line.includes('placed Runner')));
});

test('attributes simultaneous home and away fan rolls without exposing native team IDs', () => {
  const homeId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', awayId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const view = { ...state(1, 4), players: [
    { ...player, id: `${homeId}:runner`, role: 'home' as const },
    { ...player, id: `${awayId}:opponent`, role: 'away' as const }
  ] };
  const record: TranscriptRecord = { index: 1, revision: 1, kind: 'ACTION', actor: 'home', at: 101,
    decision: { operation: 'action', actionId: 'spectators' }, state: view, native: [{ commandNr: 1, reportList: { reports: [
      { reportId: 'fanFactor', teamId: homeId, dedicatedFansRoll: 1 },
      { reportId: 'fanFactor', teamId: awayId, dedicatedFansRoll: 3 }
    ] } }] };
  const lines = matchLogLines([record]).map(line => line.text);
  assert.ok(lines.some(line => line.includes('fan factor · Tusk Love Dugout: dedicated fans roll 1')));
  assert.ok(lines.some(line => line.includes("fan factor · Bugman's Best Dugout: dedicated fans roll 3")));
  assert.ok(lines.every(line => !line.includes(homeId) && !line.includes(awayId)));
});
