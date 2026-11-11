import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './summarize-operating-envelope.mjs';
import { envelopeLocalStack } from './envelope-local-stack.mjs';

const [baseline, integrated, output] = process.argv.slice(2);
if (!baseline || !integrated || !output || process.argv.length !== 5) {
  throw Error('Usage: node tools/diagnostics/run-operating-envelope-series.mjs <baseline-checkout> <integrated-checkout> <new-output-directory>');
}
const checkouts = { baseline: resolve(baseline), integrated: resolve(integrated) };
const directory = resolve(output);
if (existsSync(directory)) throw Error('Choose a new series directory');
const run = (program, args, options = {}) => execFileSync(program, args,
  { encoding: 'utf8', windowsHide: true, ...options }).trim();
const revisions = Object.fromEntries(Object.entries(checkouts).map(([role, checkout]) =>
  [role, run('git', ['rev-parse', 'HEAD'], { cwd: checkout })]));
const order = ['baseline', 'integrated', 'integrated', 'baseline', 'baseline', 'integrated', 'integrated', 'baseline'];
const { project, database, port: databasePort } = envelopeLocalStack();
const containers = run('docker', ['ps', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.ID}}'])
  .split(/\r?\n/).filter(Boolean);
if (containers.length === 0) throw Error('The dev-local stack must be running');
const dockerStats = () => run('docker', ['stats', '--no-stream', '--format', '{{json .}}', ...containers])
  .split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const series = {
  started: new Date().toISOString(), revisions, order,
  dockerProject: project, databaseContainer: database.Name.slice(1), databaseHostPort: databasePort,
  runnerSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  workloadWarmupRepetitions: 1, measuredRepetitions: 3, captures: [], completed: false
};
mkdirSync(directory, { recursive: true });
const save = () => writeFileSync(resolve(directory, 'series.json'), JSON.stringify(series, null, 2));
let expectedHashes;
let expectedSeed;
save();
try {
  for (const [index, role] of order.entries()) {
    const name = `${String(index + 1).padStart(2, '0')}-${role}`;
    const captureDirectory = resolve(directory, name);
    const capture = { role, directory: name, started: new Date().toISOString(), beforeDockerStats: dockerStats() };
    series.captures.push(capture);
    save();
    console.log(`ENVELOPE_SERIES ${name} starting`);
    const result = spawnSync(process.execPath, [resolve(checkouts[role], 'tools/diagnostics/run-operating-envelope.mjs'), captureDirectory],
      { cwd: checkouts[role], env: process.env, stdio: 'inherit', windowsHide: true });
    capture.exitCode = result.status;
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(`Capture ${name} failed with status ${result.status}`);
    const manifest = JSON.parse(readFileSync(resolve(captureDirectory, 'manifest.json'), 'utf8'));
    const measurement = JSON.parse(readFileSync(resolve(captureDirectory, 'measurement.json'), 'utf8'));
    const summary = summarize(measurement);
    writeFileSync(resolve(captureDirectory, 'summary.json'), JSON.stringify(summary, null, 2));
    if (manifest.revision !== revisions[role] || manifest.exitCode !== 0 || !manifest.cleanup || !summary.completeTaskCoverage) {
      throw Error(`Capture ${name} has incomplete revision, timing or cleanup evidence`);
    }
    const hashes = JSON.stringify(manifest.sourceHashes);
    expectedHashes ??= hashes;
    expectedSeed ??= measurement.seedSha256;
    if (hashes !== expectedHashes || measurement.seedSha256 !== expectedSeed) throw Error('Harness or seed changed during series');
    if (measurement.workloadWarmupRepetitions !== 1 || summary.healthy.requests.acceptedActionsMs.count !== 24
      || summary.healthy.requests.admittedLobbyReadsMs.count !== 48 || summary.healthy.requests.rejectedLobbyReadsMs.count !== 0) {
      throw Error(`Capture ${name} has incomplete measured healthy work`);
    }
    capture.revision = manifest.revision;
    capture.healthyAllTaskP99Ms = summary.healthy.tasks.executionMs.p99;
    capture.healthyActionP99Ms = summary.healthy.requests.acceptedActionsMs.p99;
    capture.healthyReadP99Ms = summary.healthy.requests.admittedLobbyReadsMs.p99;
    capture.afterDockerStats = dockerStats();
    capture.finished = new Date().toISOString();
    save();
    console.log(`ENVELOPE_SERIES ${name} complete`);
  }
  series.seedSha256 = expectedSeed;
  series.completed = true;
} finally {
  series.finished = new Date().toISOString();
  save();
}
