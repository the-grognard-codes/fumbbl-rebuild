import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { validateLocalBrowser } from './validation/browser-local.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));

function execute(file, args, options) {
  return execFileSync(file, args, { encoding: 'utf8', windowsHide: true, ...options })?.trim() ?? '';
}

export function parseDeployArguments(args) {
  if (args.length !== 2 && args.length !== 4) throw Error('Usage: node tools/deploy.mjs --environment dev-local|dev-remote|prod [--release-tag moles-v...]');
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = { '--environment': 'environment', '--release-tag': 'releaseTag' }[args[i]];
    if (!key || options[key] !== undefined || !args[i + 1]) throw Error('Invalid deploy options');
    options[key] = args[i + 1];
  }
  if (!['dev-local', 'dev-remote', 'prod'].includes(options.environment)) throw Error('Invalid deploy environment');
  if (options.environment === 'prod') {
    if (!/^moles-v[0-9A-Za-z][0-9A-Za-z._-]*$/.test(options.releaseTag ?? '')) {
      throw Error('Production requires --release-tag moles-v...');
    }
  } else if (options.releaseTag !== undefined) throw Error('--release-tag is only valid for prod');
  return options;
}

function parseJson(value, label) {
  try { return JSON.parse(value); }
  catch { throw Error(`Invalid ${label} response`); }
}

export function chooseChecksRun(runs, commit, { allowPending = true } = {}) {
  if (!Array.isArray(runs)) throw Error('Invalid Checks run response');
  const applicable = runs.filter(run => run.headSha === commit && run.headBranch === 'main'
    && ['push', 'workflow_dispatch'].includes(run.event));
  if (applicable.some(run => run.status === 'completed' && run.conclusion === 'success')) return null;
  const running = applicable.find(run => run.status !== 'completed' && Number.isSafeInteger(run.databaseId));
  if (running && allowPending) return running.databaseId;
  throw Error(`No successful Checks run on main for ${commit}; run Checks for that commit before deploying DEV`);
}

export function assertGeneratedWorktree(root, candidate) {
  const base = resolve(root, '.tools');
  const target = resolve(candidate);
  const comparable = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!comparable(target).startsWith(comparable(base + sep)) ||
      !/^deploy-validation-[0-9a-f-]{36}$/.test(target.slice(base.length + 1))) {
    throw Error('Refusing to remove an unrecognized validation worktree');
  }
  return target;
}

export async function deploy(options, { root = repository, run = execute, validate = validateLocalBrowser,
  makeId = randomUUID } = {}) {
  const { environment, releaseTag } = parseDeployArguments([
    '--environment', options.environment, ...(options.releaseTag === undefined ? [] : ['--release-tag', options.releaseTag]),
  ]);
  root = resolve(root);
  const command = (file, args, cwd = root) => run(file, args, { cwd, stdio: 'pipe' });
  if (environment === 'dev-local') {
    run(process.execPath, [join(root, 'tools', 'dev-local.mjs'), '--restart'], { cwd: root, stdio: 'inherit' });
    return;
  }
  if (environment === 'prod') {
    command('gh', ['workflow', 'run', 'firebase-deploy-prod.yml', '--ref', 'main', '-f', `release_tag=${releaseTag}`]);
    console.log(`Production deployment dispatched for ${releaseTag}`);
    return;
  }

  const repo = parseJson(command('gh', ['repo', 'view', '--json', 'nameWithOwner']), 'repository');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.nameWithOwner ?? '')) throw Error('Cannot identify GitHub repository');
  const mainSha = command('gh', ['api', `repos/${repo.nameWithOwner}/commits/main`, '--jq', '.sha']);
  if (!/^[a-f0-9]{40}$/.test(mainSha)) throw Error('Cannot identify remote main commit');
  command('git', ['fetch', '--no-tags', `https://github.com/${repo.nameWithOwner}.git`, mainSha]);
  const worktree = assertGeneratedWorktree(root, join(root, '.tools', `deploy-validation-${makeId()}`));
  await mkdir(join(root, '.tools'), { recursive: true });
  let added = false;
  try {
    command('git', ['worktree', 'add', '--detach', worktree, mainSha]);
    added = true;
    const result = await validate(worktree);
    if (result.commit !== mainSha) throw Error('Browser validation did not cover remote main commit');
  } finally {
    if (added) command('git', ['worktree', 'remove', '--force', assertGeneratedWorktree(root, worktree)]);
  }
  const currentMain = command('gh', ['api', `repos/${repo.nameWithOwner}/commits/main`, '--jq', '.sha']);
  if (currentMain !== mainSha) throw Error(`Remote main moved from ${mainSha} to ${currentMain}; rerun validation`);
  const runs = () => parseJson(command('gh', ['run', 'list', '--workflow', 'maven-verify.yml', '--branch', 'main',
    '--commit', mainSha, '--json', 'databaseId,headSha,headBranch,status,conclusion,event', '--limit', '100']), 'Checks runs');
  const pending = chooseChecksRun(runs(), mainSha);
  if (pending !== null) {
    command('gh', ['run', 'watch', String(pending), '--exit-status']);
    chooseChecksRun(runs(), mainSha, { allowPending: false });
  }
  if (command('gh', ['api', `repos/${repo.nameWithOwner}/commits/main`, '--jq', '.sha']) !== mainSha) {
    throw Error('Remote main moved after Checks validation; rerun deployment');
  }
  command('gh', ['workflow', 'run', 'firebase-deploy-dev.yml', '--ref', 'main', '-f', `validated_commit=${mainSha}`]);
  console.log(`DEV deployment dispatched for validated main commit ${mainSha}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await deploy(parseDeployArguments(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
