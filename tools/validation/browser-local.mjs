import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { loadBrowserManifest, validateReports } from './coverage.mjs';

const npm = process.platform === 'win32'
  ? { file: process.execPath, args: [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')] }
  : { file: 'npm', args: [] };

function execute(file, args, options) {
  return execFileSync(file, args, { encoding: 'utf8', stdio: 'inherit', windowsHide: true, ...options });
}

export function localValidationEnvironment(source = process.env) {
  const env = { ...source };
  delete env.GITHUB_SHA;
  delete env.VALIDATION_COMMIT;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

export async function validateLocalBrowser(root, { run = execute, env = process.env } = {}) {
  root = resolve(root);
  const childEnv = localValidationEnvironment(env);
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
  for (const [family, count] of [['hosted', 1], ['interaction', 4]]) {
    for (let shard = 1; shard <= count; shard++) {
      invoke(process.execPath, [join(root, 'tools', 'validation', 'browser-suites.mjs'), '--family', family,
        '--shard', String(shard), '--report-directory', reportDirectory]);
    }
  }
  const readReports = async (family, count) => Promise.all(Array.from({ length: count }, async (_, index) =>
    JSON.parse(await readFile(join(reportDirectory, `${family}-${index + 1}.json`), 'utf8'))));
  validateReports(await readReports('hosted', 1), { family: 'hosted', shards: [manifest.hosted], commit });
  validateReports(await readReports('interaction', 4), { family: 'interaction', shards: manifest.interactionShards, commit });
  console.log(`Browser validation passed for ${commit}; reports: ${reportDirectory}`);
  return { commit, reportDirectory };
}
