import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { appendMatchLogLines, matchLogLines } from '../src/match-log.ts';
import { blockFace, blockFaceLabel, reportedDice } from '../src/dice-presentation.ts';
import { decodeLogBlock, decodeLogOutcomes } from '../src/log-presentation.ts';
import { decodeTranscript } from '../src/transcript-protocol.ts';
import { matchTeamName } from '../src/match-team-name.ts';
import type { LogBlock, LogOutcome } from '../src/log-presentation.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

type Case = { name: string; records: TranscriptRecord[] };
const read = (name: string): Case[] => JSON.parse(readFileSync(new URL(`./fixtures/match-log-block-${name}.json`, import.meta.url), 'utf8'));
function decode(input: Case): TranscriptRecord[] {
  return input.records.flatMap((_, from) => from % 8 ? [] : decodeTranscript(JSON.stringify({ version: 2, type: 'matchTranscript', requestId: 'blocks', code: 'ACCEPTED',
    matchId: input.records[0].state.matchId, page: { formatVersion: 2, from, next: Math.min(from + 8, input.records.length), total: input.records.length,
      records: input.records.slice(from, from + 8) } })).page.records);
}
const reports = (records: TranscriptRecord[]) => records.flatMap(record => record.native.flatMap(command =>
  (command.reportList as { reports: Record<string, unknown>[] }).reports));

test('all native block faces and selected dice have images, names and the frozen final chooser under all settings', () => {
  for (const family of ['faces', 'skills', 'rerolls', 'pro-test']) for (const input of read(family)) {
    const records = decode(input), native = reports(records), choice = native.find(report => report.reportId === 'blockChoice')!;
    const context = choice.logBlock as LogBlock;
    assert.equal(context.attackerId, 'actor'); assert.equal(context.defenderId, 'opponent');
    if (input.name.includes('uphill')) assert.equal(context.chooser, input.name.startsWith('home') ? 'away' : 'home');
    for (const debug of [false, true]) for (const movement of [false, true]) for (const rollModifiers of [false, true]) {
      const lines = matchLogLines(records, { debug, movement, rollModifiers });
      const dice = lines.filter(line => line.dice);
      const rolls = native.filter(report => ['blockRoll', 'blockChoice', 'blockReRoll'].includes(String(report.reportId)));
      assert.equal(dice.length, rolls.length, input.name);
      for (const [index, report] of rolls.entries()) {
        assert.deepEqual(dice[index].dice!.faces, (report.blockRoll as number[]).map(value => blockFace(value)));
        for (const face of dice[index].dice!.faces) assert.ok(dice[index].text.includes(blockFaceLabel(face)!), input.name);
      }
      const selected = dice.find(line => line.dice?.selected !== null)!;
      assert.equal(selected.dice!.selected, choice.diceIndex);
      assert.ok(selected.text.startsWith(matchTeamName(records.at(-1)!.state, context.chooser!)), input.name);
      assert.equal(lines.some(line => line.debug), debug);
      assert.ok(lines.every(line => !/block-die:|block-reroll:|homeTeam:|awayTeam:/.test(line.text)));
    }
  }
});

test('native skill decisions and each pushed, standing, knocked down or Wrestle-prone player remain separate', () => {
  for (const input of read('skills')) {
    const records = decode(input), lines = matchLogLines(records).map(line => line.text);
    if (input.name.endsWith('both-block') || input.name.endsWith('wrestle-decline')) {
      assert.ok(lines.includes('Runner remains standing with Block.')); assert.ok(lines.includes('Opponent remains standing with Block.'));
      assert.ok(!lines.some(line => line.includes('is knocked down')));
    }
    if (/wrestle-(attacker|defender)$/.test(input.name)) {
      assert.ok(lines.includes('Runner becomes prone.')); assert.ok(lines.includes('Opponent becomes prone.'));
      const owner = input.name.endsWith('attacker') ? 'Runner' : 'Opponent';
      assert.ok(lines.some(line => line.startsWith(`${owner} chooses to use Wrestle`)));
      assert.ok(lines.some(line => line.startsWith(`${owner} uses Wrestle to bring `)));
      assert.ok(!lines.some(line => line.includes('armor ')));
    }
    if (input.name.endsWith('wrestle-decline')) assert.ok(lines.some(line => line.includes('chooses to decline skills')));
    if (input.name.endsWith('dodge')) { assert.ok(lines.some(line => line.includes('Opponent uses Dodge'))); assert.ok(!lines.includes('Opponent is knocked down.')); }
    if (input.name.endsWith('tackle')) { assert.ok(lines.includes("Runner uses Tackle to cancel Opponent's Dodge.")); assert.ok(lines.includes('Opponent is knocked down.')); }
    if (input.name.endsWith('chain')) {
      const mate = lines.findIndex(line => line.startsWith('Catcher is pushed to ')), target = lines.findIndex(line => line.startsWith('Opponent is pushed to '));
      const follow = lines.findIndex(line => line.startsWith('Runner follows up to ')); assert.ok(mate >= 0 && target > mate && follow > target);
    }
    for (const command of records.flatMap(record => record.native)) for (const outcome of (command.logOutcomes as { events: LogOutcome[] } | undefined)?.events ?? []) {
      const player = records.at(-1)!.state.players.find(player => player.id === outcome.playerId)!;
      assert.ok(lines.some(line => line.startsWith(player.name)), input.name);
    }
  }
});

test('native original blocks, Pro/Brawler sources and new dice preserve chronology through incremental replay and legacy omission', () => {
  for (const family of ['rerolls', 'pro-test']) for (const input of read(family)) {
    const records = decode(input), lines = matchLogLines(records), text = lines.map(line => line.text);
    const initial = text.findIndex(line => line.includes('Both down, Skull'));
    const source = text.findIndex(line => /used (Pro|Brawler) reroll/.test(line));
    const retry = text.findIndex(line => line.includes('rerolls block dice'));
    const selected = text.findIndex(line => line.includes('chooses die'));
    assert.ok(initial >= 0 && source > initial && retry > source && selected > retry, input.name);
    if (family === 'pro-test') {
      const failed = text.findIndex(line => line.includes('tests Pro: 1'));
      const team = text.findIndex(line => line.includes('used Team reroll.'));
      const testRetry = text.findIndex(line => line.includes('rerolls Pro: 6'));
      assert.ok(failed > source && team > failed && testRetry > team && retry > testRetry);
    }
    const incremental: typeof lines = []; for (const record of records) appendMatchLogLines(incremental, record);
    assert.deepEqual(incremental, lines); appendMatchLogLines(incremental, records.at(-1)!); assert.deepEqual(incremental, lines);
    const legacy = structuredClone(input);
    for (const command of legacy.records.flatMap(record => record.native)) {
      delete command.logOutcomes;
      for (const report of (command.reportList as { reports: Record<string, unknown>[] }).reports) delete report.logBlock;
    }
    assert.ok(matchLogLines(decode(legacy)).some(line => line.dice?.selected !== null && line.text.startsWith('Coach chooses')));
    assert.equal(reportedDice({ reportId: 'blockReRoll', blockRoll: [3], reRollSource: 'Pro' })?.faces[0], 'PUSHBACK');
  }
});

test('optional block context and outcome shapes are bounded and reject unknown roles, kinds, fields and coordinates', () => {
  const block = { version: 1, attackerId: 'actor', defenderId: 'opponent', chooser: 'away' };
  assert.equal(decodeLogBlock(block).chooser, 'away');
  for (const change of [{ chooser: 'attacker' }, { version: 2 }, { attackerId: '' }, { private: true }]) assert.throws(() => decodeLogBlock({ ...block, ...change }));
  const event = { playerId: 'opponent', kind: 'push', from: { x: 11, y: 7 }, to: { x: 12, y: 7 }, skill: null };
  assert.equal(decodeLogOutcomes({ version: 1, events: [event] }).events[0].kind, 'push');
  for (const change of [{ kind: 'turnover' }, { playerId: '' }, { to: { x: 26, y: 7 } }, { guessed: true }])
    assert.throws(() => decodeLogOutcomes({ version: 1, events: [{ ...event, ...change }] }));
  assert.throws(() => decodeLogOutcomes({ version: 1, events: Array(257).fill(event) }));
  const input = read('faces')[0]; input.records.at(-1)!.native[0].logOutcomes = { version: 1, events: [{ ...event, kind: 'guessed' }] };
  assert.throws(() => decode(input));
});
