import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { appendMatchLogLines, matchLogLines } from '../src/match-log.ts';
import { decodeTranscript } from '../src/transcript-protocol.ts';
import { decodeLogPresentation, decodeLogRoll } from '../src/log-presentation.ts';
import { defaultMatchLogPreferences, readMatchLogPreferences, saveMatchLogPreferences } from '../src/match-log-preferences.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

type Case = { name: string; records: TranscriptRecord[] };
const cases: Case[] = ['movement', 'interrupted', 'primary'].flatMap(name => JSON.parse(readFileSync(new URL(`./fixtures/match-log-${name}.json`, import.meta.url), 'utf8')));
function decoded(input: Case): TranscriptRecord[] {
  const all: TranscriptRecord[] = [];
  for (let from = 0; from < input.records.length; from += 8) {
    const records = input.records.slice(from, from + 8);
    all.push(...decodeTranscript(JSON.stringify({ version: 2, type: 'matchTranscript', requestId: 'log-test', code: 'ACCEPTED',
      matchId: records[0].state.matchId, page: { formatVersion: 2, from, next: from + records.length, total: input.records.length, records } })).page.records);
  }
  return all;
}

test('native committed movement, interrupted plans and primary rolls honor every setting combination', () => {
  for (const input of cases) {
    const records = decoded(input);
    for (const debug of [false, true]) for (const movement of [false, true]) for (const rollModifiers of [false, true]) {
      const preferences = { debug, movement, rollModifiers }, lines = matchLogLines(records, preferences);
      assert.ok(lines.some(line => line.text.includes('declares a')), input.name);
      assert.equal(lines.some(line => line.debug), debug, input.name);
      assert.equal(lines.some(line => /net modifier/.test(line.text)), rollModifiers && input.name.startsWith('pass-'), input.name);
      if (!debug) assert.ok(lines.every(line => !line.debug && !/chose .*:|request |[0-9a-f]{8}-[0-9a-f]{4}-/.test(line.text)), input.name);
      const moves = lines.filter(line => line.key.startsWith('movement:'));
      const expected = !movement || input.name.startsWith('pass-') ? 0 : input.name.endsWith('separate') ? 4 : 1;
      assert.equal(moves.length, expected, input.name);
      if (input.name.endsWith('plan') && movement) assert.match(moves[0].text, /\(10, 7\) → \(14, 7\)/);
      if (input.name === 'pickup-failed') {
        assert.ok(lines.some(line => /picks up the ball.*1 vs 3\+.*failure/.test(line.text)));
        if (movement) assert.match(moves[0].text, /\(10, 7\) → \(11, 7\)\./);
      }
      if (input.name === 'pickup-reroll') {
        assert.equal(lines.filter(line => /picks up the ball:|picks up the ball at/.test(line.text)).length, 2);
        if (movement) assert.match(moves[0].text, /\(10, 7\) → \(12, 7\)\./);
      }
      if (input.name === 'secure-ball') assert.ok(lines.some(line => /secures the ball.*6 vs 2\+ \(base 2\+/.test(line.text)));
      if (input.name.startsWith('pass-')) {
        const roll = input.name.slice(5), result = roll === '6' ? 'accurate' : roll === '3' ? 'inaccurate' : 'fumble';
        assert.ok(lines.some(line => line.text.startsWith(`Runner passes to (14, 7): ${roll} vs 4+ (base 3+`) && line.text.endsWith(` · ${result}`)), input.name);
      }
      const incremental: ReturnType<typeof matchLogLines> = [];
      records.forEach(record => appendMatchLogLines(incremental, record, preferences));
      assert.deepEqual(incremental, lines);
      appendMatchLogLines(incremental, records.at(-1)!, preferences);
      assert.deepEqual(incremental, lines, 'Exact transcript retry stays idempotent');
    }
  }
});

test('versioned native log presentation rejects future fields and invalid targets while legacy history remains readable', () => {
  const present = cases[0].records.find(record => record.decision?.logPresentation)?.decision?.logPresentation;
  assert.doesNotThrow(() => decodeLogPresentation(present, 1));
  assert.throws(() => decodeLogPresentation({ ...(present as object), privateState: {} }, 1));
  assert.throws(() => decodeLogPresentation({ version: 2, action: null, movement: null }, 1));
  assert.throws(() => decodeLogRoll({ version: 1, base: 2, target: 7, modifier: 0, square: null }));
  const legacy = structuredClone(cases.find(input => input.name === 'secure-ball')!);
  for (const record of legacy.records) {
    if (record.decision) delete record.decision.logPresentation;
    for (const sync of record.native) for (const report of (sync.reportList as { reports: Record<string, unknown>[] }).reports) delete report.logRoll;
  }
  const lines = matchLogLines(decoded(legacy));
  assert.ok(lines.some(line => /declares a Secure the Ball action/.test(line.text)));
  assert.ok(lines.some(line => /secures the ball.*base 2\+/.test(line.text)));
});

test('log preferences restore defaults, persist all controls and tolerate denied or malformed storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let saved: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } } });
  try {
    assert.deepEqual(readMatchLogPreferences(), defaultMatchLogPreferences);
    const preferences = { debug: true, movement: true, rollModifiers: false };
    saveMatchLogPreferences(preferences); assert.deepEqual(readMatchLogPreferences(), preferences);
    saved = '{bad'; assert.deepEqual(readMatchLogPreferences(), defaultMatchLogPreferences);
    saved = '{"debug":"yes","movement":true}'; assert.deepEqual(readMatchLogPreferences(), { ...defaultMatchLogPreferences, movement: true });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw Error('Denied'); } });
    assert.deepEqual(readMatchLogPreferences(), defaultMatchLogPreferences);
    assert.doesNotThrow(() => saveMatchLogPreferences(preferences));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
