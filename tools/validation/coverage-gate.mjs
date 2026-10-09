import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDependencies, assertExact, assertShards, loadBrowserManifest, summarize, validateReports } from './coverage.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const [family, directory, ...extra] = process.argv.slice(2);
const commit = process.env.VALIDATION_COMMIT || process.env.GITHUB_SHA;
if (!['static', 'browser', 'native'].includes(family) || !directory || extra.length || !commit || !process.env.VALIDATION_NEEDS) {
  throw new Error('Use coverage-gate.mjs static|browser|native report-directory with a validation commit and VALIDATION_NEEDS');
}
const needs = JSON.parse(process.env.VALIDATION_NEEDS);
const dependencies = {
  native: ['target-shards'],
  static: ['static-checks', 'hosted-browser', 'browser-interactions'],
  browser: ['resolve', 'hosted-browser', 'browser-interactions'],
};
assertDependencies(needs, dependencies[family]);
const configurations = [];
if (family !== 'native') {
  const manifest = await loadBrowserManifest(repository);
  configurations.push({ family: 'interaction', shards: manifest.interactionShards }, { family: 'hosted', shards: [manifest.hosted] });
} else {
  const manifest = JSON.parse(await readFile(join(repository, 'tools/validation/native-shards.json'), 'utf8'));
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported native manifest');
  assertShards(manifest.shards, 'Native manifest');
  configurations.push({ family: 'native', shards: manifest.shards, allowedSkips: manifest.allowedSkips });
}
const reportDirectory = resolve(repository, directory);
const files = (await readdir(reportDirectory)).filter(name => name.endsWith('.json'));
const expected = configurations.flatMap(config => config.shards.map((_, index) => `${config.family}-${index + 1}.json`));
assertExact(files, expected, 'Report files');
const suites = [];
for (const config of configurations) {
  const reports = await Promise.all(config.shards.map((_, index) => readFile(join(reportDirectory, `${config.family}-${index + 1}.json`), 'utf8').then(JSON.parse)));
  suites.push(...validateReports(reports, { ...config, commit }));
}
await summarize(suites, process.env.GITHUB_STEP_SUMMARY);
console.log(`PASS complete ${family} validation coverage for ${commit}`);
