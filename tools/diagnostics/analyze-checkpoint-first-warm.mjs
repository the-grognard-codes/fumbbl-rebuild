// Privacy-safe companion to the native history workload. Never emits fixture payloads or identities.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [directory, ...options] = process.argv.slice(2);
assert.ok(directory && options.length <= 1 && options.every(option => /^--checkpoint-ceiling-ms=[1-9][0-9]*$/.test(option)),
  'Usage: node tools/diagnostics/analyze-checkpoint-first-warm.mjs <directory> [--checkpoint-ceiling-ms=1000]');
const read = name => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const provenance = read('provenance.json');
const verification = read('verification.json');
const runs = [1, 2, 3].map(index => read(`run-${index}.json`));
const fixtures = read('fixtures.json').fixtures;
assert.ok(Array.isArray(fixtures) && fixtures.length >= 2, 'At least two retained fixtures are required');
assert.ok(fixtures.every(fixture => typeof fixture?.file === 'string' && fixture.file.trim().length > 0),
  'Every fixture must name its artifact file');
const zeroDecisionFixture = fixtures.find(fixture => fixture.addedDecisions === 0);
assert.ok(zeroDecisionFixture, 'A zero-decision fixture is required');
assert.equal(new Set(fixtures.map(fixture => fixture.addedDecisions)).size, fixtures.length,
  'Fixture decision counts must be unique');
const expectedSamples = provenance.samplesPerCohort;
assert.ok(Number.isInteger(expectedSamples) && expectedSamples >= 2, 'samplesPerCohort must be an integer >= 2');
const expectedCohorts = fixtures.length * 4;
assert.equal(verification.verified.length, expectedCohorts, 'One verification row per cohort is required');
assert.ok(verification.verified.every(row => row.verified === true));
runs.forEach((run, index) => { assert.equal(run.repeat, index + 1); assert.equal(run.maxHeapBytes, 768 * 1048576); assert.equal(run.javaVersion, runs[0].javaVersion); assert.equal(run.results.length, expectedCohorts); });
const stats = values => {
  assert.ok(values.length && values.every(value => Number.isFinite(value) && value >= 0));
  const sorted = values.toSorted((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return { count: sorted.length, median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted.length >= 20 ? sorted[Math.ceil(sorted.length * .95) - 1] : null, max: sorted.at(-1) };
};
const fields = ['handlingMs', 'sessionApplyMs', 'checkpointMs', 'recoverySerializeMs', 'recoveryCursorMs',
  'recoveryFingerprintMs', 'checkpointStoreMs'];
const rows = [];
for (const fixture of fixtures) for (const action of ['move', 'pass']) for (const storagePath of ['journal', 'compaction']) {
  const cohort = { addedDecisions: fixture.addedDecisions, action, storagePath };
  const verified = verification.verified.filter(row => row.addedDecisions === cohort.addedDecisions
    && row.action === action && row.journal === (storagePath === 'journal'));
  assert.equal(verified.length, 1, 'Exactly one verification per cohort is required');
  const matching = runs.map(run => {
    const matches = run.results.filter(row => row.addedDecisions === cohort.addedDecisions
      && row.action === action && row.storagePath === storagePath);
    assert.equal(matches.length, 1, 'Exactly one row per history/action/storage cohort is required');
    assert.ok(matches[0].firstSample, 'A cohort-first sample is required');
    assert.equal(matches[0].samples.length, expectedSamples, 'Warm sample count must match provenance');
    return matches[0];
  });
  for (const temperature of ['cohort-first', 'warm']) {
    const samples = matching.flatMap(row => temperature === 'warm' ? row.samples : [row.firstSample]);
    const slow = samples.toSorted((a, b) => b.timing.checkpointMs - a.timing.checkpointMs)[0];
    rows.push({ addedDecisions: cohort.addedDecisions, action: cohort.action, storagePath: cohort.storagePath, temperature,
      phases: Object.fromEntries(fields.map(field => [field, stats(samples.map(sample => sample.timing[field]))])),
      coldRestoreMs: stats(samples.map(sample => sample.coldLoadMs)), allocatedBytes: stats(samples.map(sample => sample.allocatedBytes)),
      slowestCheckpoint: Object.fromEntries(fields.map(field => [field, slow.timing[field]])) });
  }
}
const processFirst = runs.map(run => run.results[0].firstSample.timing);
const summary = { version: 1, provenance, javaVersion: runs[0].javaVersion, maxHeapBytes: runs[0].maxHeapBytes,
  startingFixtures: fixtures.map(({ addedDecisions, revision, artifactBytes, sha256, nativeCommands, transcriptRecords }) => ({ addedDecisions, revision, artifactBytes, sha256, nativeCommands, transcriptRecords })),
  verifiedCombinations: verification.verified.length, analyzerSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  processFirst: processFirst.map((timing, index) => ({ addedDecisions: runs[index].results[0].addedDecisions, action: runs[index].results[0].action, storagePath: runs[index].results[0].storagePath, phases: Object.fromEntries(fields.map(field => [field, timing[field]])) })),
  rows, limitations: [
    'Cohort-first is the first action of a history/action/storage cohort within a JVM; it is not a separate cold JVM for every row.',
    'processFirst contains the first measured action from each of three fresh JVMs; native fixture construction and restore precede the action.',
    'Every sample cold-restores its retained fixture; warm means action-path/JIT warm, not a resident recovery load.',
    'In-memory repositories exclude JDBC, provider, compression/store implementation, socket and browser latency; checkpointStoreMs measures only the repository seam.',
    'Nested phase durations overlap and must not be summed. p95 is null / n/a below 20 samples; small tails are not stable estimates.',
    'Synthetic legal setup history and forced compaction isolate history cost; they do not establish the cause or frequency of a live end-match spike.' ] };
writeFileSync(resolve(directory, 'first-warm-summary.json'), JSON.stringify(summary, null, 2));
const lines = ['# Checkpoint cohort-first and warm measurements', '',
  `Source ${provenance.sourceCommit}; Java ${summary.javaVersion}; heap ${summary.maxHeapBytes / 1048576} MiB.`, '',
  '| Decisions | Action | Path | Temperature | n | Checkpoint median / p95 / max ms | Serialize median ms | Cursor median ms |',
  '| ---: | --- | --- | --- | ---: | --- | ---: | ---: |'];
for (const row of rows) { const phase = row.phases.checkpointMs;
  lines.push(`| ${row.addedDecisions} | ${row.action} | ${row.storagePath} | ${row.temperature} | ${phase.count} | ${phase.median.toFixed(2)} / ${phase.p95 === null ? 'n/a' : phase.p95.toFixed(2)} / ${phase.max.toFixed(2)} | ${row.phases.recoverySerializeMs.median.toFixed(2)} | ${row.phases.recoveryCursorMs.median.toFixed(2)} |`); }
lines.push('', ...summary.limitations.map(value => '- ' + value), '');
writeFileSync(resolve(directory, 'first-warm-summary.md'), lines.join('\n'));
console.log(lines.join('\n'));
if (options.length) {
  const ceiling = Number(options[0].split('=')[1]);
  const exceeded = rows.filter(row => row.phases.checkpointMs.max > ceiling);
  console.log(`Checkpoint ${ceiling} ms discriminator: ${exceeded.length ? 'EXCEEDED' : 'not reproduced'} (${exceeded.length} cohorts).`);
  if (exceeded.length) process.exitCode = 1;
}
