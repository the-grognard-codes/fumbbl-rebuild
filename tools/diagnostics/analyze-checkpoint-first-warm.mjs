// Privacy-safe companion to the native history workload. Never emits fixture payloads or identities.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [directory, ...options] = process.argv.slice(2);
assert.ok(directory && options.every(option => /^--checkpoint-ceiling-ms=[1-9][0-9]*$/.test(option)),
  'Usage: node tools/diagnostics/analyze-checkpoint-first-warm.mjs <directory> [--checkpoint-ceiling-ms=1000]');
assert.ok(options.length <= 1);
const read = name => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const provenance = read('provenance.json');
const verification = read('verification.json');
const runs = [1, 2, 3].map(index => read(`run-${index}.json`));
runs.forEach((run, index) => { assert.equal(run.repeat, index + 1); assert.equal(run.maxHeapBytes, 768 * 1048576); assert.equal(run.javaVersion, runs[0].javaVersion); assert.equal(run.results.length, runs[0].results.length); });
const stats = values => {
  assert.ok(values.length && values.every(value => Number.isFinite(value) && value >= 0));
  const sorted = values.toSorted((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return { count: sorted.length, median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
};
const fields = ['handlingMs', 'sessionApplyMs', 'checkpointMs', 'recoverySerializeMs', 'recoveryCursorMs',
  'recoveryFingerprintMs', 'checkpointStoreMs'];
const rows = [];
for (const cohort of runs[0].results) {
  const matching = runs.map(run => run.results.find(row => row.addedDecisions === cohort.addedDecisions
    && row.action === cohort.action && row.storagePath === cohort.storagePath));
  assert.ok(matching.every(row => row?.firstSample && row.samples.length === provenance.samplesPerCohort));
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
  verifiedCombinations: verification.verified.length, analyzerSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  processFirst: processFirst.map((timing, index) => ({ addedDecisions: runs[index].results[0].addedDecisions, action: runs[index].results[0].action, storagePath: runs[index].results[0].storagePath, phases: Object.fromEntries(fields.map(field => [field, timing[field]])) })),
  rows, limitations: [
    'Cohort-first is the first action of a history/action/storage cohort within a JVM; it is not a separate cold JVM for every row.',
    'processFirst contains the first measured action from each of three fresh JVMs; native fixture construction and restore precede the action.',
    'Every sample cold-restores its retained fixture; warm means action-path/JIT warm, not a resident recovery load.',
    'In-memory repositories exclude JDBC, provider, compression/store implementation, socket and browser latency; checkpointStoreMs measures only the repository seam.',
    'Nested phase durations overlap and must not be summed. Small first-sample counts are descriptive, not stable tail estimates.',
    'Synthetic legal setup history and forced compaction isolate history cost; they do not establish the cause or frequency of a live end-match spike.' ] };
assert.ok(verification.verified.every(row => row.verified));
writeFileSync(resolve(directory, 'first-warm-summary.json'), JSON.stringify(summary, null, 2));
const lines = ['# Checkpoint cohort-first and warm measurements', '',
  `Source ${provenance.sourceCommit}; Java ${summary.javaVersion}; heap ${summary.maxHeapBytes / 1048576} MiB.`, '',
  '| Decisions | Action | Path | Temperature | n | Checkpoint median / p95 / max ms | Serialize median ms | Cursor median ms |',
  '| ---: | --- | --- | --- | ---: | --- | ---: | ---: |'];
for (const row of rows) { const phase = row.phases.checkpointMs;
  lines.push(`| ${row.addedDecisions} | ${row.action} | ${row.storagePath} | ${row.temperature} | ${phase.count} | ${phase.median.toFixed(2)} / ${phase.p95.toFixed(2)} / ${phase.max.toFixed(2)} | ${row.phases.recoverySerializeMs.median.toFixed(2)} | ${row.phases.recoveryCursorMs.median.toFixed(2)} |`); }
lines.push('', ...summary.limitations.map(value => '- ' + value), '');
writeFileSync(resolve(directory, 'first-warm-summary.md'), lines.join('\n'));
console.log(lines.join('\n'));
if (options.length) {
  const ceiling = Number(options[0].split('=')[1]);
  const exceeded = rows.filter(row => row.phases.checkpointMs.max > ceiling);
  console.log(`Checkpoint ${ceiling} ms discriminator: ${exceeded.length ? 'EXCEEDED' : 'not reproduced'} (${exceeded.length} cohorts).`);
  if (exceeded.length) process.exitCode = 1;
}
