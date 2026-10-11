import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { loadBrowserManifest, validateReports } from './coverage.mjs';

const npm = process.platform === 'win32'
  ? { file: process.execPath, args: [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')] }
  : { file: 'npm', args: [] };

function execute(file, args, options) {
  return execFileSync(file, args, { encoding: 'utf8', stdio: 'inherit', windowsHide: true, ...options });
}

function executeAsync(file, args, options) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(file, args, { stdio: 'inherit', windowsHide: true, ...options });
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 && !signal ? resolveRun()
      : reject(new Error(`Browser shard failed (exit ${code}, signal ${signal}): ${args.join(' ')}`)));
  });
}

export function localBrowserWorkers(env = process.env, processors = availableParallelism()) {
  const configured = env.FFB_BROWSER_TEST_WORKERS;
  if (configured !== undefined && !/^[1-4]$/.test(configured)) {
    throw Error('FFB_BROWSER_TEST_WORKERS must be an integer from 1 to 4');
  }
  return configured === undefined ? Math.min(4, Math.max(1, processors)) : Number(configured);
}

export function localValidationEnvironment(source = process.env) {
  const env = { ...source };
  delete env.GITHUB_SHA;
  delete env.VALIDATION_COMMIT;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

export async function validateLocalBrowser(root, { run = execute, runShard = executeAsync, env = process.env } = {}) {
  root = resolve(root);
  const childEnv = localValidationEnvironment(env);
  const workers = localBrowserWorkers(childEnv);
  const commit = run('git', ['rev-parse', 'HEAD'], { cwd: root, env: childEnv, stdio: 'pipe' }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Cannot identify the validation checkout commit');
  const manifest = await loadBrowserManifest(root);
  await mkdir(join(root, '.tools', 'validation'), { recursive: true });
  const reportDirectory = await mkdtemp(join(root, '.tools', 'validation', 'local-browser-'));
  const invoke = (file, args, cwd = root) => run(file, args, { cwd, env: childEnv, stdio: 'inherit' });
  invoke(npm.file, [...npm.args, 'ci', '--prefix', 'browser-client']);
  invoke(process.execPath, [join(root, 'browser-client', 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'],
    join(root, 'browser-client'));
  invoke(npm.file, [...npm.args, 'run', 'build', '--prefix', 'site']);
  // Start the longer interaction groups first. Each group keeps its suites sequential.
  const jobs = manifest.interactionShards.map((_, index) => ({ family: 'interaction', shard: index + 1 }))
    .concat({ family: 'hosted', shard: 1 });
  console.log(`Running browser validation with ${workers} workers; reports: ${reportDirectory}`);
  const started = performance.now();
  let next = 0, failure;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (!failure && next < jobs.length) {
      const { family, shard } = jobs[next++];
      const cacheDirectory = join(reportDirectory, 'vite-cache', `${family}-${shard}`);
      try {
        await runShard(process.execPath, [join(root, 'tools', 'validation', 'browser-suites.mjs'), '--family', family,
          '--shard', String(shard), '--report-directory', reportDirectory],
        { cwd: root, env: { ...childEnv, FFB_BROWSER_TEST_CACHE_DIR: cacheDirectory }, stdio: 'inherit' });
      } catch (error) {
        // Let active shards close their browsers and servers; do not dispatch more work.
        failure ??= error instanceof Error ? error : new Error(String(error));
      }
    }
  }));
  if (failure) throw failure;
  const readReports = async (family, count) => Promise.all(Array.from({ length: count }, async (_, index) =>
    JSON.parse(await readFile(join(reportDirectory, `${family}-${index + 1}.json`), 'utf8'))));
  validateReports(await readReports('hosted', 1), { family: 'hosted', shards: [manifest.hosted], commit });
  validateReports(await readReports('interaction', 4), { family: 'interaction', shards: manifest.interactionShards, commit });
  const durationMs = performance.now() - started;
  console.log(`Browser validation passed for ${commit} in ${(durationMs / 1000).toFixed(1)}s with ${workers} workers; reports: ${reportDirectory}`);
  return { commit, reportDirectory, durationMs };
}
