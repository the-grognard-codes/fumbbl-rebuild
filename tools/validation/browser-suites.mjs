import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { loadBrowserManifest, summarize } from './coverage.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));

export function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = { '--family': 'family', '--shard': 'shard', '--report-directory': 'reportDirectory' }[args[index]];
    if (!key || options[key] !== undefined || !args[index + 1]) throw new Error('Invalid browser suite arguments');
    options[key] = args[index + 1];
  }
  if (!['interaction', 'hosted'].includes(options.family)) throw new Error('Use --family interaction|hosted');
  if (options.shard !== undefined) {
    if (!/^[1-4]$/.test(options.shard) || (options.family === 'hosted' && options.shard !== '1')) throw new Error('Invalid shard');
    options.shard = Number(options.shard);
  }
  return options;
}

export function parseTestSummary(output) {
  const metric = name => Number(output.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] ?? NaN);
  const metrics = { tests: metric('tests'), failures: metric('fail'), errors: 0, skipped: metric('skipped') };
  if (!Number.isInteger(metrics.tests) || metrics.tests < 1 || metric('pass') !== metrics.tests ||
      metrics.failures !== 0 || metrics.skipped !== 0 || metric('cancelled') !== 0 || metric('todo') !== 0) {
    throw new Error('Hosted browser test did not complete a nonempty passing suite without skips');
  }
  return metrics;
}

export function runNode(args, root) {
  return new Promise((resolveRun, reject) => {
    // Each suite owns its test runner, even when this orchestrator is invoked by a tooling test.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { process.stdout.write(chunk); output += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 && !signal ? resolveRun(output) : reject(new Error(`Suite failed: ${args.at(-1)} (exit ${code}, signal ${signal})`)));
  });
}

export async function executeShard({ root, family, shard, suites, commit, reportDirectory, run = runNode }) {
  const reportPath = join(reportDirectory, `${family}-${shard}.json`);
  await mkdir(reportDirectory, { recursive: true });
  await rm(reportPath, { force: true });
  const executed = [];
  for (const id of suites) {
    console.log(`\n[${family} ${shard}] ${id}`);
    const started = performance.now();
    const hosted = id.endsWith('.test.mjs');
    const args = hosted ? ['--test', '--test-reporter=tap', id] : ['--experimental-strip-types', id];
    const output = await run(args, root);
    const metrics = hosted ? parseTestSummary(output) : { tests: 1, failures: 0, errors: 0, skipped: 0 };
    executed.push({ id, durationMs: performance.now() - started, ...metrics });
  }
  const report = { schemaVersion: 1, family, shard, commit, passed: true, suites: executed };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await summarize(executed.map(suite => ({ ...suite, family, shard })));
  return report;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = await loadBrowserManifest(repository);
  const identity = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', windowsHide: true });
  if (identity.status !== 0) throw new Error('Cannot identify the validation commit');
  const commit = process.env.VALIDATION_COMMIT || process.env.GITHUB_SHA || identity.stdout.trim();
  if (commit !== identity.stdout.trim()) throw new Error('Checkout does not match the validation commit');
  const shards = options.family === 'interaction' ? manifest.interactionShards : [manifest.hosted];
  for (const [index, suites] of shards.entries()) {
    if (options.shard === undefined || options.shard === index + 1) {
      await executeShard({ root: repository, family: options.family, shard: index + 1, suites, commit,
        reportDirectory: resolve(repository, options.reportDirectory ?? '.tools/validation') });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
