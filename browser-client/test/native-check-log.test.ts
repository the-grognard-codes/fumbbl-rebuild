import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { appendMatchLogLines, matchLogLines } from '../src/match-log.ts';
import { decodeTranscript } from '../src/transcript-protocol.ts';
import { decodeLogActors, decodeLogTest } from '../src/log-presentation.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

type Case = { name: string; records: TranscriptRecord[] };
const read = (name: string): Case[] => JSON.parse(readFileSync(new URL(`./fixtures/match-log-${name}.json`, import.meta.url), 'utf8'));
function decode(input: Case): TranscriptRecord[] {
  return decodeTranscript(JSON.stringify({ version: 2, type: 'matchTranscript', requestId: 'checks', code: 'ACCEPTED',
    matchId: input.records[0].state.matchId, page: { formatVersion: 2, from: 0, next: input.records.length,
      total: input.records.length, records: input.records } })).page.records;
}
const reports = (records: TranscriptRecord[]) => records.flatMap(record => record.native.flatMap(command =>
  (command.reportList as { reports: Record<string, unknown>[] }).reports));

test('native activation traits retain their own bases, conditions and every attempt under all log controls', () => {
  for (const input of read('traits')) {
    const records = decode(input), roll = reports(records).find(report => report.reportId === 'confusionRoll' || report.reportId === 'bloodLustRoll')!;
    const facts = roll.logRoll as { base: number; target: number; modifier: number };
    assert.notEqual(facts.base, 5, input.name);
    for (const debug of [false, true]) for (const movement of [false, true]) for (const rollModifiers of [false, true]) {
      const lines = matchLogLines(records, { debug, movement, rollModifiers });
      const check = lines.filter(line => line.text.includes('tests ') && line.text.includes(`: ${roll.roll} vs ${facts.target}+`));
      assert.equal(check.length, 1, input.name);
      assert.ok(check[0].text.includes(`base ${facts.base}+`));
      assert.equal(check[0].text.includes('net modifier'), rollModifiers && facts.modifier !== 0);
      assert.equal(lines.some(line => line.debug), debug);
      if (!debug) assert.ok(lines.every(line => !line.debug && !/request |[0-9a-f]{8}-[0-9a-f]{4}-/.test(line.text)));
    }
  }
});

test('native original attempts, automatic/manual sources, Pro test retries and follow-up rolls stay in order on replay', () => {
  for (const name of ['trait-rerolls', 'automatic', 'pro-test', 'follow-up']) for (const input of read(name)) {
    const records = decode(input), lines = matchLogLines(records), text = lines.map(line => line.text);
    const index = (fragment: string, after = -1) => text.findIndex((line, ordinal) => ordinal > after && line.includes(fragment));
    if (name === 'trait-rerolls') {
      const first = index('tests Bone head'); const source = index('used Team reroll.', first); const second = index('tests Bone head', source);
      assert.ok(first >= 0 && source > first && second > source, input.name);
      assert.ok(text[first].includes('failure') && text[second].includes('success'));
    }
    if (name === 'automatic') {
      const first = index('dodges'); const source = index('used Dodge reroll.', first); const second = index('dodges', source); const pickup = index('picks up the ball', second);
      assert.ok(first >= 0 && source > first && second > source && pickup > second, input.name);
      assert.equal(text.filter(line => line.includes('dodges')).length, 2);
    }
    if (name === 'pro-test') {
      const original = index('picks up the ball'); const proSource = index('used Pro reroll.', original); const failedPro = index('tests Pro: 1 vs 3+', proSource);
      const team = index('used Team reroll.', failedPro); const loner = index('tests Loner: 6 vs 4+', team);
      const newPro = index('rerolls Pro: 6 vs 3+', loner); const pickup = index('picks up the ball', newPro);
      assert.ok(original >= 0 && proSource > original && failedPro > proSource && team > failedPro && loner > team && newPro > loner && pickup > newPro, input.name);
      assert.equal(text.filter(line => line.includes('used Pro reroll.')).length, 1);
      assert.ok(text[failedPro].includes('original roll unchanged'));
      assert.ok(!text.slice(0, pickup).some(line => /turnover|Turn ends/.test(line)));
    }
    if (name === 'follow-up') {
      const pass = index('passes'); const firstCatch = index('catches', pass); const source = index('used Catch reroll.', firstCatch); const secondCatch = index('catches', source);
      assert.ok(pass >= 0 && firstCatch > pass && source > firstCatch && secondCatch > source, input.name);
    }
    const incremental: ReturnType<typeof matchLogLines> = [];
    records.forEach(record => appendMatchLogLines(incremental, record));
    assert.deepEqual(incremental, lines);
    appendMatchLogLines(incremental, records.at(-1)!); assert.deepEqual(incremental, lines);
    assert.deepEqual(matchLogLines(decode(input)), lines, 'Fresh replay only reads the frozen transcript');
  }
});

test('frozen reaction actors and source-test metadata are strict and remain optional on legacy reports', () => {
  assert.deepEqual(decodeLogActors({ version: 1, actorId: 'owner', targetId: 'runner' }), { version: 1, actorId: 'owner', targetId: 'runner' });
  assert.deepEqual(decodeLogTest({ version: 1, rerolled: true }), { version: 1, rerolled: true });
  for (const bad of [{ version: 2, actorId: 'owner', targetId: null }, { version: 1, actorId: '', targetId: null }, { version: 1, actorId: 'owner', targetId: null, extra: 1 }]) assert.throws(() => decodeLogActors(bad));
  for (const bad of [{ version: 2, rerolled: true }, { version: 1, rerolled: 'yes' }, { version: 1, rerolled: true, extra: 1 }]) assert.throws(() => decodeLogTest(bad));
  const input = structuredClone(read('pro-test')[0]);
  for (const report of reports(input.records)) { delete report.logRoll; delete report.logTest; delete report.logActors; }
  assert.doesNotThrow(() => decode(input));
  assert.ok(matchLogLines(decode(input)).some(line => line.text.includes('tests Pro: 1')));
});
