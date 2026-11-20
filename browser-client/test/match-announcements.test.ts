import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { decodeMatchAnnouncements, syncAnnouncements, announcementReadingDuration, announcementHeadline } from '../src/match-announcements.ts';
import { playbackBeats, withConfirmedPlayerChanges, withConfirmedMove, withConfirmedBallChanges } from '../src/pitch-playback.ts';
import { matchLogLines } from '../src/match-log.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';
import type { MatchAnnouncementEvent } from '../src/match-announcements.ts';
import { resolvePlayerArt } from '../src/player-art.ts';

const state = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const turnover: MatchAnnouncementEvent = { kind: 'turnover', team: 'home', turn: 2, half: 1, reason: 'Runner failed to pick up the ball.' };
const record = (native: Record<string, unknown>[]): TranscriptRecord => ({ index: 1, revision: 1, kind: 'ACTION', actor: 'home', at: 1,
  decision: null, native, state: { ...state, revision: 1, homeTeamName: 'Blue Badgers', awayTeamName: 'Green Giants', homeTeamArt: { rosterId: 'human' } } });
const sync = (events = [turnover]) => ({ commandNr: 12, matchAnnouncements: { version: 1, events } });

test('validates the authoritative event contract and rejects invalid roles, versions, reasons and numbers', () => {
  assert.deepEqual(decodeMatchAnnouncements(sync().matchAnnouncements), [turnover]);
  for (const patch of [{ team: 'spectator' }, { team: ['home'] }, { kind: ['touchdown'] }, { kind: 'rollFailure' }, { turn: -1 }, { half: 0 }, { reason: '' }, { extra: true }])
    assert.throws(() => decodeMatchAnnouncements({ version: 1, events: [{ ...turnover, ...patch }] }));
  assert.throws(() => decodeMatchAnnouncements({ version: 2, events: [] }));
});

test('stable event identities include match, revision, command and event position', () => {
  const input = record([sync()]);
  const events = syncAnnouncements(input, sync());
  assert.equal(events[0].id, `${state.matchId}:1:12:0`);
  assert.deepEqual(syncAnnouncements(input, sync()), events);
  assert.equal(events[0].teamName, 'Blue Badgers');
  assert.equal(events[0].helmet, 'human');
  input.state.homeTeamArt = { rosterId: 'orc', league: null };
  assert.equal(syncAnnouncements(input, sync())[0].helmet, 'orc');
  input.state.homeTeamArt.rosterId = 'skaven';
  assert.equal(syncAnnouncements(input, sync())[0].helmet, 'human');
});

test('failed dice and ordinary turn-end reports never manufacture an announcement', () => {
  const input = record([{ commandNr: 1, reportList: { reports: [
    { reportId: 'dodgeRoll', roll: 1, successful: false, playerId: state.players[0].id },
    { reportId: 'turnEnd', playerIdTouchdown: null } ] } }]);
  assert.equal(playbackBeats(input).filter(beat => beat.kind === 'announcement').length, 0);
});

test('causative dice, ball and injury resolution precede turnover and the next numbered start', () => {
  const start: MatchAnnouncementEvent = { kind: 'turnStart', team: 'away', turn: 3, half: 2, reason: null };
  const input = record([{ ...sync(), reportList: { reports: [{ reportId: 'pickUpRoll', roll: 1, successful: false,
    playerId: state.players[0].id }] }, modelChangeList: { modelChangeArray: [
    { modelChangeId: 'fieldModelSetBallCoordinate', modelChangeValue: [8, 7] },
    { modelChangeId: 'fieldModelSetPlayerState', modelChangeKey: state.players[0].id, modelChangeValue: 4 }] } },
    { commandNr: 13, matchAnnouncements: { version: 1, events: [start] } }]);
  const beats = playbackBeats(input);
  assert.deepEqual(beats.map(beat => beat.kind), ['dice', 'player', 'ball', 'announcement', 'announcement']);
  const injury = beats.find(beat => beat.kind === 'player')!;
  assert.equal(withConfirmedPlayerChanges(input.state, injury.playerId, injury.changes).players[0].status, 'Stunned');
  const stunned = { ...withConfirmedPlayerChanges(input.state, injury.playerId, injury.changes).players[0], art: { rosterId: 'human', positionId: 'lineman' } };
  assert.equal(resolvePlayerArt(stunned, { end: 'home' })?.body.pose, 'stunned');
  assert.deepEqual(beats.filter(beat => beat.kind === 'announcement').map(beat => beat.announcement.turn), [2, 3]);
});

test('native removal and re-placement within one sync preserve the final on-pitch player', () => {
  const input = record([{ ...sync([ { ...turnover, kind: 'turnStart', reason: null } ]), modelChangeList: { modelChangeArray: [
    { modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: state.players[0].id, modelChangeValue: [-1, 0] },
    { modelChangeId: 'fieldModelSetPlayerState', modelChangeKey: state.players[0].id, modelChangeValue: 9 },
    { modelChangeId: 'fieldModelSetPlayerState', modelChangeKey: state.players[0].id, modelChangeValue: 1 },
    { modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: state.players[0].id, modelChangeValue: [7, 7] }
  ] } }]);
  let view = input.state;
  for (const beat of playbackBeats(input)) {
    if (beat.kind === 'move') view = withConfirmedMove(view, beat.move);
    if (beat.kind === 'player') view = withConfirmedPlayerChanges(view, beat.playerId, beat.changes);
  }
  assert.equal(view.players[0].x, 7); assert.equal(view.players[0].y, 7);
  assert.equal(view.players[0].offPitch, 'pitch'); assert.equal(view.players[0].state, 'is standing');
});

test('announcements retain readable causes in the log and deduplicate stable identities', () => {
  const input = record([sync(), sync()]);
  const lines = matchLogLines([input]).filter(line => line.key.includes(state.matchId));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'Blue Badgers — TURNOVER. Runner failed to pick up the ball.');
  assert.equal(announcementReadingDuration(turnover, 1), 3000);
  assert.equal(announcementReadingDuration({ ...turnover, kind: 'turnStart' }, 2), 750);
});

test('native friendly throw collision resolves both players before the turnover splash', () => {
  // Generated by MatchAnnouncementPresentationTest.friendlyThrowCollisionUsesConfirmedVictimAndRetainsResolutionOrder.
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/match-announcement-ttm-native.json', import.meta.url), 'utf8'));
  const input: TranscriptRecord = { ...record(fixture.native), state: fixture.state };
  let view = fixture.initialState;
  const announcements: string[] = [];
  for (const beat of playbackBeats(input, view.ball)) {
    if (beat.kind === 'player') view = withConfirmedPlayerChanges(view, beat.playerId, beat.changes);
    if (beat.kind === 'move') {
      view = withConfirmedMove(view, beat.move);
      if (beat.ballChanges) view = withConfirmedBallChanges(view, beat.ballChanges);
    }
    if (beat.kind === 'ball') view = withConfirmedBallChanges(view, beat.ballChanges);
    if (beat.kind === 'announcement') {
      announcements.push(beat.announcement.kind);
      if (beat.announcement.kind !== 'turnover') continue;
      assert.equal(beat.announcement.team, 'away');
      assert.match(beat.announcement.reason!, /player3.*thrown player player2/);
      for (const suffix of ['player2', 'player3']) {
        const id = `00000000-0000-0000-0000-000000000012:${suffix}`;
        const actual = view.players.find((player: { id: string }) => player.id === id);
        const expected = fixture.state.players.find((player: { id: string }) => player.id === id);
        assert.equal(actual.state, 'is prone');
        assert.equal(actual.x, expected.x); assert.equal(actual.y, expected.y);
      }
      assert.deepEqual(view.ball, fixture.state.ball);
    }
  }
  assert.deepEqual(announcements, ['turnover', 'turnStart']);
});

test('extended authoritative kinds retain ordering and rate-scaled durations', () => {
  const facts: MatchAnnouncementEvent[] = [
    { ...turnover, kind: 'weather', code: 'NICE', headline: 'Nice Weather', reason: 'No additional weather effects.' },
    { ...turnover, kind: 'kickoff', code: 'WEATHER_CHANGE', headline: 'Weather Change', teamSpecific: false,
      weather: { code: 'BLIZZARD', headline: 'Blizzard', reason: 'No rush beyond the first square without a penalty.' } },
    { ...turnover, kind: 'weather', code: 'BLIZZARD', headline: 'Blizzard' },
    { ...turnover, kind: 'turnStart', team: 'away' },
    { ...turnover, kind: 'touchdown' },
    { ...turnover, kind: 'halfTime' },
    { ...turnover, kind: 'fullTime', code: 'CONCEDED', headline: 'MATCH CONCEDED' }
  ];
  const native = sync(facts);
  assert.deepEqual(syncAnnouncements(record([native]), native).map(event => event.kind), facts.map(event => event.kind));
  assert.deepEqual(facts.map(event => announcementReadingDuration(event, 2)), [1150, 1150, 1150, 750, 1500, 1400, 1900]);
  for (const patch of [{ code: 'INTRO' }, { code: 'unknown' }, { headline: '' }, { headline: 7 }]) {
    assert.throws(() => decodeMatchAnnouncements({ version: 1, events: [{ ...facts[0], ...patch }] }));
  }
});

test('completed match replays use the new title and concessions keep their own title', () => {
  for (const code of ['WIN', 'DRAW', 'CONCEDED']) {
    const headline = code === 'CONCEDED' ? 'MATCH CONCEDED' : 'END OF MATCH';
    const event: MatchAnnouncementEvent = { ...turnover, kind: 'fullTime', code, headline };
    assert.equal(announcementHeadline(event), headline);
    assert.ok(matchLogLines([record([sync([event])])]).some(line => line.text.includes(headline)));
  }
});

test('structured scorer and kickoff metadata reject invalid payloads', () => {
  const touchdown = { ...turnover, kind: 'touchdown', scorer: { name: 'A player — Jr.', number: 8 }, reason: 'Badgers 1 – 0 Giants' };
  const native = sync([touchdown as MatchAnnouncementEvent]);
  assert.ok(matchLogLines([record([native])]).some(line => line.text.includes('A player — Jr. #8 — Badgers 1 – 0 Giants')));
  for (const event of [
    { ...touchdown, scorer: null },
    { ...touchdown, scorer: { name: 'Player', number: '8' } },
    { ...touchdown, teamSpecific: true },
    { ...turnover, kind: 'kickoff', code: 'WEATHER_CHANGE', headline: 'Weather Change' },
    { ...turnover, kind: 'kickoff', code: 'WEATHER_CHANGE', headline: 'Weather Change', teamSpecific: false,
      weather: { code: 'INTRO', headline: 'Intro', reason: 'Invalid weather' } },
  ]) assert.throws(() => decodeMatchAnnouncements({ version: 1, events: [event] }));
});

test('browser consumes all engine-generated kickoff and weather facts', () => {
  const facts: MatchAnnouncementEvent[] = JSON.parse(readFileSync(new URL('./fixtures/match-splash-events.json', import.meta.url), 'utf8'));
  assert.equal(facts.filter(event => event.kind === 'kickoff').length, 11);
  assert.equal(facts.filter(event => event.kind === 'weather').length, 5);
  for (const fact of facts) {
    assert.deepEqual(decodeMatchAnnouncements({ version: 1, events: [fact] }), [fact]);
    const native = sync([fact]);
    assert.equal(playbackBeats(record([native])).filter(beat => beat.kind === 'announcement').length, 1);
    assert.ok(matchLogLines([record([native])]).some(line => line.text.includes(fact.headline!.toUpperCase())));
  }
});
