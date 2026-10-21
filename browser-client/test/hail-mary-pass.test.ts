import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { activeMenuAction, playerActionMenu } from '../src/player-action-menu.ts';
import { passingLegend, passingSquare } from '../src/passing-presentation.ts';
import { decodeTranscript } from '../src/transcript-protocol.ts';
import { playbackBeats } from '../src/pitch-playback.ts';
import { matchLogLines } from '../src/match-log.ts';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/hail-mary-workflow.json', import.meta.url), 'utf8'));

test('native HMP ball and bomb ranges, active modes and weather boundaries decode for either coach and spectators', () => {
  for (const journey of journeys) {
    for (const frame of journey.frames) {
      const view = decodeSetupStateValue(frame.actor);
      assert.deepEqual(decodeSetupStateValue({ ...frame.actor, callerRole: 'spectator' }, true).passing, view.passing);
      if (!['declared', 'moved', 'hail-mary'].includes(frame.checkpoint)) continue;
      assert.equal(activeMenuAction(view, 'actor'), journey.bomb ? 'hailMaryBomb' : 'hailMaryPass');
      const guidance = view.passing!;
      assert.equal(guidance.version, 3);
      assert.equal(passingSquare(guidance, 14, 7).code, 'B');
      assert.equal(passingSquare(guidance, 25, 7).code, journey.weather === 'BLIZZARD' ? '-' : 'B');
      assert.match(passingSquare(guidance, 14, 7).description, /Hail Mary.*Long Bomb.*inaccurate.*cannot be intercepted/);
      assert.deepEqual(passingLegend(guidance).map(item => item.text), ['Hail Mary: Long Bomb difficulty; inaccurate at best']);
      const companion = playerActionMenu(view, 'actor').find(item => item.key === (journey.bomb ? 'hailMaryBomb' : 'hailMaryPass'))!;
      assert.equal(companion.spent, false, 'The reserved allowance does not disable switching the current mode');
      assert.equal(companion.actions.length, 1);
    }
  }
});

test('HMP controls use server eligibility and are absent for unskilled players and non-bombardiers', () => {
  for (const journey of journeys) {
    const view = decodeSetupStateValue(journey.frames[0].actor);
    assert.ok(playerActionMenu(view, 'actor').some(item => item.key === 'hailMaryPass'));
    assert.equal(playerActionMenu(view, 'actor').some(item => item.key === 'hailMaryBomb'), journey.bomb);
    assert.ok(!playerActionMenu(view, 'mate').some(item => item.key.startsWith('hailMary')));
  }
});

test('HMP guidance rejects mixed distance bands, wrong action families and private fields', () => {
  const view = journeys[0].frames[1].actor;
  for (const change of [{ hailMary: 'yes' }, { action: 'throwTeamMate' }, { secret: true },
    { ranges: ['Q'.repeat(15), ...view.passing.ranges.slice(1)] }]) {
    assert.throws(() => decodeSetupStateValue({ ...view, passing: { ...view.passing, ...change } }));
  }
  assert.throws(() => decodeSetupStateValue({ ...view, passing: { ...view.passing, rangeLimited: true,
    ranges: Array.from({ length: 26 }, () => '-'.repeat(15)) } }));
});

test('new HMP transcripts retain PA facts and native dice during replay', () => {
  for (const journey of journeys) {
    const records = decodeTranscript(JSON.stringify({ version: 2, type: 'matchTranscript', requestId: 'hmp-replay',
      code: 'ACCEPTED', matchId: journey.frames[0].actor.matchId,
      page: { formatVersion: 2, from: 0, next: journey.records.length, total: journey.records.length, records: journey.records } })).page.records;
    assert.ok(records.flatMap(playbackBeats).some(beat => beat.kind === 'dice'));
    const lines = matchLogLines(records).map(line => line.text);
    assert.ok(lines.some(line => /passes.*6 vs 6\+ \(base 3\+.*-3 net modifier.*inaccurate/i.test(line)), lines.join('\n'));
    assert.ok(!lines.some(line => /interception roll/i.test(line)));
  }
});
