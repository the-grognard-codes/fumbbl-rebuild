import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [directory, ...flags] = process.argv.slice(2);
assert.ok(directory && flags.every(flag => flag === '--assert-flat'), 'Usage: node tools/diagnostics/analyze-history-scaling.mjs directory [--assert-flat]');
const read = name => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const provenance = read('provenance.json'), fixtures = read('fixtures.json'), verification = read('verification.json');
const runs = [1,2,3].map(index => read(`run-${index}.json`));
const retained = fixtures.fixtures.filter(fixture => fixture.file);
assert.ok(retained.length >= 2 && retained[0].addedDecisions === 0);
const expectedSamples = provenance.samplesPerCohort;
assert.ok(Number.isInteger(expectedSamples) && expectedSamples >= 2);
for (const [index, run] of runs.entries()) {
  assert.equal(run.repeat, index + 1); assert.equal(run.maxHeapBytes, 768 * 1024 * 1024);
  assert.equal(run.results.length, retained.length * 4);
}
assert.equal(new Set(runs.map(run => run.javaVersion)).size, 1);
assert.equal(verification.verified.length, retained.length * 4);
assert.ok(verification.verified.every(row => row.verified === true));
const stats = values => {
  assert.ok(values.length && values.every(value => Number.isFinite(value) && value >= 0));
  const sorted = [...values].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { count: sorted.length, median, p95: sorted[Math.ceil(sorted.length * .95)-1], max: sorted.at(-1) };
};
const rows = [];
for (const fixture of retained) for (const action of ['move','pass']) for (const storagePath of ['journal','compaction']) {
  const cohorts = runs.map(run => {
    const matches = run.results.filter(row => row.addedDecisions === fixture.addedDecisions && row.action === action && row.storagePath === storagePath);
    assert.equal(matches.length, 1); assert.equal(matches[0].samples.length, expectedSamples);
    return matches[0].samples;
  });
  const samples = cohorts.flat();
  const timing = field => stats(samples.map(sample => sample.timing[field]));
  rows.push({ addedDecisions: fixture.addedDecisions, action, storagePath, artifactBytes: fixture.artifactBytes,
    handlingMs: timing('handlingMs'), applyMs: timing('sessionApplyMs'), checkpointMs: timing('checkpointMs'),
    serializationMs: timing('recoverySerializeMs'), cursorMs: timing('recoveryCursorMs'), fingerprintMs: timing('recoveryFingerprintMs'),
    allocatedBytes: stats(samples.map(sample => sample.allocatedBytes)), loadMs: stats(samples.map(sample => sample.coldLoadMs)),
    cohortHandlingMedians: cohorts.map(cohort => stats(cohort.map(sample => sample.timing.handlingMs)).median) });
}
const longest = retained.at(-1).addedDecisions;
const comparisons = rows.filter(row => row.addedDecisions === longest).map(row => {
  const fresh = rows.find(candidate => candidate.addedDecisions === 0 && candidate.action === row.action && candidate.storagePath === row.storagePath);
  return { action: row.action, storagePath: row.storagePath, freshMedianMs: fresh.handlingMs.median, longMedianMs: row.handlingMs.median,
    ratio: row.handlingMs.median / fresh.handlingMs.median,
    growthSignal: row.handlingMs.median > fresh.handlingMs.median * 2 && row.handlingMs.median - fresh.handlingMs.median > 50 };
});
const summary = { version: 1, provenance, javaVersion: runs[0].javaVersion,
  verificationHeapBytes: verification.maxHeapBytes, startingFixtures: retained.map(({ file, source, receiver, role, ...metadata }) => metadata),
  reproductionGate: 'History-dependent slowdown signal: longest-history handling median exceeds fresh by both 2x and 50 ms; this is an experimental discriminator, not a product SLA',
  comparisons, rows, limitations: [...provenance.limitations,
    'Reported medians/p95/max use equal-count duration samples from three independent JVMs; absolute clocks are never aligned',
    'Twelve samples per cohort are too few for stable long-term tail estimates; per-run medians are retained',
    'Initial recovery verification uses a separate 2 GiB process to avoid duplicating live state in the measurement JVM',
    'This isolates history-length sensitivity, not elapsed turn number or live end-to-end latency'] };
writeFileSync(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2));
const lines = ['# Retained-history action scaling', '', `Source: \`${provenance.sourceCommit}\`; Java ${summary.javaVersion}; timed heap 768 MiB.`, '',
  '| Added decisions | MiB | Move journal median ms | Pass journal median ms | Move compaction median ms | Pass compaction median ms |',
  '| ---: | ---: | ---: | ---: | ---: | ---: |'];
for (const fixture of retained) {
  const value = (action, path) => rows.find(row => row.addedDecisions === fixture.addedDecisions && row.action === action && row.storagePath === path).handlingMs.median.toFixed(1);
  lines.push(`| ${fixture.addedDecisions} | ${(fixture.artifactBytes/1048576).toFixed(2)} | ${value('move','journal')} | ${value('pass','journal')} | ${value('move','compaction')} | ${value('pass','compaction')} |`);
}
lines.push('', summary.reproductionGate, '', ...comparisons.map(comparison => `- ${comparison.action}/${comparison.storagePath}: ${comparison.ratio.toFixed(2)}x; ${comparison.growthSignal ? 'GROWTH DETECTED' : 'gate not crossed'}`), '',
  '## Limits', '', ...summary.limitations.map(line => '- ' + line), '');
writeFileSync(resolve(directory, 'summary.md'), lines.join('\n'));
console.log(lines.slice(0, retained.length + 6).join('\n'));
console.log(comparisons.map(row => `${row.action}/${row.storagePath}: ${row.ratio.toFixed(2)}x ${row.growthSignal ? 'GROWTH DETECTED' : 'gate not crossed'}`).join('\n'));
if (flags.includes('--assert-flat') && comparisons.some(row => row.growthSignal)) process.exitCode = 1;
