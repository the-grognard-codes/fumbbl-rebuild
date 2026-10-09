import { appendFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export function assertExact(actual, expected, label) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) throw new Error(`${label}: expected arrays`);
  const duplicate = actual.find((id, index) => actual.indexOf(id) !== index);
  const missing = expected.filter(id => !actual.includes(id));
  const extra = actual.filter(id => !expected.includes(id));
  if (duplicate !== undefined || missing.length || extra.length) {
    throw new Error(`${label}: duplicate=${duplicate ?? 'none'} missing=${missing.join(',')} extra=${extra.join(',')}`);
  }
}

export function assertShards(shards, label) {
  if (!Array.isArray(shards) || shards.length !== 4 || shards.some(shard =>
    !Array.isArray(shard) || !shard.length || shard.some(id => typeof id !== 'string' || !id))) {
    throw new Error(`${label}: expected four nonempty shards`);
  }
  const ids = shards.flat();
  assertExact(ids, [...new Set(ids)], label);
}

async function discover(directory, prefix, pattern) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await discover(join(directory, entry.name), path, pattern));
    else if (entry.isFile() && pattern.test(entry.name)) paths.push(path);
  }
  return paths;
}

export async function loadBrowserManifest(root) {
  const manifest = JSON.parse(await readFile(join(root, 'tools/validation/browser-shards.json'), 'utf8'));
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported browser manifest');
  assertShards(manifest.interactionShards, 'Interaction manifest');
  if (!Array.isArray(manifest.hosted) || !manifest.hosted.length ||
      !Array.isArray(manifest.standalone) || manifest.standalone.some(entry => !entry.path || !entry.reason)) {
    throw new Error('Invalid hosted/standalone browser inventory');
  }
  const inventory = manifest.interactionShards.flat().concat(manifest.hosted, manifest.standalone.map(entry => entry.path));
  const discovered = (await discover(join(root, 'browser-client/test'), 'browser-client/test', /-ui\.mjs$/))
    .concat(await discover(join(root, 'site/test'), 'site/test', /-browser\.test\.mjs$/));
  assertExact(inventory, discovered, 'Browser inventory');
  return manifest;
}

export function assertDependencies(needs, expected) {
  assertExact(Object.keys(needs), expected, 'Required jobs');
  for (const [name, job] of Object.entries(needs)) {
    if (job.result !== 'success') throw new Error(`Required job ${name}: ${job.result}`);
  }
}

export function validateReports(reports, { family, shards, commit, allowedSkips = {} }) {
  assertExact(reports.map(report => report.shard), shards.map((_, index) => index + 1), `${family} reports`);
  for (const report of reports) {
    if (report.schemaVersion !== 1 || report.family !== family || report.commit !== commit || report.passed !== true) {
      throw new Error(`${family} shard ${report.shard}: invalid, failed, or stale report`);
    }
    if (!Array.isArray(report.suites)) throw new Error(`${family}: missing execution records`);
    assertExact(report.suites.map(suite => suite.id), shards[report.shard - 1], `${family} shard ${report.shard} execution`);
    for (const suite of report.suites) {
      if (!Number.isFinite(suite.durationMs) || suite.durationMs < 0 || !Number.isInteger(suite.tests) || suite.tests < 1 ||
          suite.failures !== 0 || suite.errors !== 0 || !Number.isInteger(suite.skipped) || suite.skipped < 0) {
        throw new Error(`${suite.id}: invalid metrics, empty suite, or failed tests`);
      }
      const skippedTests = suite.skippedTests ?? [];
      if (!Array.isArray(skippedTests) || skippedTests.length !== suite.skipped || suite.skipped > suite.tests) {
        throw new Error(`${suite.id}: skipped-test accounting mismatch`);
      }
      assertExact(skippedTests.map(test => test.name), [...new Set(skippedTests.map(test => test.name))], 'Skipped tests');
      for (const test of skippedTests) {
        if (typeof test.name !== 'string' || typeof test.reason !== 'string' || !test.reason ||
            !Object.hasOwn(allowedSkips[suite.id] ?? {}, test.name) || allowedSkips[suite.id][test.name] !== test.reason) {
          throw new Error(`${suite.id}: unexpected skip ${test.name}`);
        }
      }
    }
  }
  return reports.flatMap(report => report.suites.map(suite => ({ ...suite, family, shard: report.shard })));
}

export async function summarize(suites, output) {
  const lines = ['## Validation suite timings', '', '| Family | Shard | Suite | Seconds | Tests | Opt-in skips |',
    '| --- | ---: | --- | ---: | ---: | ---: |'];
  for (const suite of suites.toSorted((a, b) => b.durationMs - a.durationMs)) {
    lines.push(`| ${suite.family} | ${suite.shard} | ${suite.id} | ${(suite.durationMs / 1000).toFixed(2)} | ${suite.tests} | ${suite.skipped} |`);
  }
  const summary = `${lines.join('\n')}\n`;
  console.log(summary);
  if (output) await appendFile(output, summary);
}
