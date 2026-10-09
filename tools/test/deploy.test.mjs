import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import { assertGeneratedWorktree, chooseChecksRun, deploy, parseDeployArguments } from '../deploy.mjs';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const root = process.cwd();
const id = '11111111-1111-4111-8111-111111111111';

test('requires an explicit supported environment and a production release tag', () => {
  assert.deepEqual(parseDeployArguments(['--environment', 'dev-local']), { environment: 'dev-local' });
  assert.deepEqual(parseDeployArguments(['--environment', 'prod', '--release-tag', 'moles-v1.2.3']),
    { environment: 'prod', releaseTag: 'moles-v1.2.3' });
  for (const args of [[], ['--environment', 'stage'], ['--environment', 'prod'],
    ['--environment', 'dev-remote', '--release-tag', 'moles-v1'], ['--environment', 'prod', '--release-tag', 'v1'],
    ['--environment', 'prod', '--environment', 'dev-local'], ['--environment', 'dev-local', '--skip-validation']]) {
    assert.throws(() => parseDeployArguments(args));
  }
});

test('local restart failure stops command and production cannot dispatch without a tag', async () => {
  const calls = [];
  await assert.rejects(deploy({ environment: 'dev-local' }, { root, run(file, args) {
    calls.push([file, args]);
    throw Error('browser preflight failed');
  } }), /browser preflight failed/);
  assert.deepEqual(calls.map(call => call[1].at(-1)), ['--restart']);
  await assert.rejects(deploy({ environment: 'prod' }, { root, run() { throw Error('must not dispatch'); } }), /release-tag/);
  await deploy({ environment: 'prod', releaseTag: 'moles-v1.2.3' }, { root, run(file, args) {
    calls.push([file, args]);
    return '';
  } });
  assert.deepEqual(calls.at(-1), ['gh', ['workflow', 'run', 'firebase-deploy-prod.yml', '--ref', 'main',
    '-f', 'release_tag=moles-v1.2.3']]);
});

test('only a generated worktree under .tools is removable', () => {
  assert.equal(assertGeneratedWorktree(root, join(root, '.tools', `deploy-validation-${id}`)),
    join(root, '.tools', `deploy-validation-${id}`));
  assert.throws(() => assertGeneratedWorktree(root, root));
  assert.throws(() => assertGeneratedWorktree(root, join(root, '.tools', 'user-data')));
  assert.throws(() => assertGeneratedWorktree(root, join(root, '..', '.tools', `deploy-validation-${id}`)));
});

function remoteHarness({ main = sha, checks = [{ databaseId: 4, headSha: sha, headBranch: 'main',
  event: 'push', status: 'completed', conclusion: 'success' }], failValidation = false } = {}) {
  const calls = [];
  let mainReads = 0;
  const run = (file, args) => {
    calls.push({ file, args });
    if (file === 'gh' && args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'team/project' });
    if (file === 'gh' && args[0] === 'api') { mainReads++; return typeof main === 'function' ? main(mainReads) : main; }
    if (file === 'gh' && args[0] === 'run' && args[1] === 'list') return JSON.stringify(checks);
    return '';
  };
  const validate = async worktree => {
    calls.push({ file: 'validate', args: [worktree] });
    if (failValidation) throw Error('browser suite failed');
    return { commit: sha };
  };
  return { calls, options: { root, run, validate, makeId: () => id } };
}

test('remote DEV validates fetched exact SHA in detached worktree and cleans before dispatch', async () => {
  const fixture = remoteHarness();
  await deploy({ environment: 'dev-remote' }, fixture.options);
  const calls = fixture.calls;
  const index = (file, verb) => calls.findIndex(call => call.file === file && call.args[0] === verb);
  assert.ok(index('git', 'fetch') < index('git', 'worktree'));
  assert.deepEqual(calls.find(call => call.file === 'git' && call.args[0] === 'fetch').args,
    ['fetch', '--no-tags', 'https://github.com/team/project.git', sha]);
  const add = calls.find(call => call.file === 'git' && call.args[1] === 'add');
  assert.deepEqual(add.args.slice(0, 3), ['worktree', 'add', '--detach']);
  assert.equal(add.args.at(-1), sha);
  assert.equal(calls.find(call => call.file === 'validate').args[0], add.args[3]);
  const removeIndex = calls.findIndex(call => call.file === 'git' && call.args[1] === 'remove');
  const dispatchIndex = calls.findIndex(call => call.file === 'gh' && call.args[0] === 'workflow');
  assert.ok(removeIndex > calls.findIndex(call => call.file === 'validate'));
  assert.ok(dispatchIndex > removeIndex);
  assert.deepEqual(calls[dispatchIndex].args, ['workflow', 'run', 'firebase-deploy-dev.yml', '--ref', 'main',
    '-f', `validated_commit=${sha}`]);
});

test('remote validation failure cleans worktree and blocks dispatch', async () => {
  const fixture = remoteHarness({ failValidation: true });
  await assert.rejects(deploy({ environment: 'dev-remote' }, fixture.options), /browser suite failed/);
  assert.ok(fixture.calls.some(call => call.file === 'git' && call.args[1] === 'remove'));
  assert.ok(!fixture.calls.some(call => call.file === 'gh' && call.args[0] === 'workflow'));
});

test('remote main movement and absent passing Checks block dispatch', async () => {
  for (const harness of [
    remoteHarness({ main: count => count === 1 ? sha : other }),
    remoteHarness({ main: count => count < 3 ? sha : other }),
    remoteHarness({ checks: [] }),
    remoteHarness({ checks: [{ databaseId: 4, headSha: sha, headBranch: 'feature', event: 'push',
      status: 'completed', conclusion: 'success' }] }),
  ]) {
    await assert.rejects(deploy({ environment: 'dev-remote' }, harness.options));
    assert.ok(harness.calls.some(call => call.file === 'git' && call.args[1] === 'remove'));
    assert.ok(!harness.calls.some(call => call.file === 'gh' && call.args[0] === 'workflow'));
  }
});

test('an ongoing Checks run is watched and must pass before dispatch', async () => {
  const pending = { databaseId: 7, headSha: sha, headBranch: 'main', event: 'push', status: 'in_progress', conclusion: '' };
  assert.equal(chooseChecksRun([pending], sha), 7);
  assert.throws(() => chooseChecksRun([{ ...pending, status: 'completed', conclusion: 'failure' }], sha), /No successful Checks/);
  const harness = remoteHarness({ checks: [pending] });
  await assert.rejects(deploy({ environment: 'dev-remote' }, harness.options), /No successful Checks/);
  assert.ok(harness.calls.some(call => call.file === 'gh' && call.args[0] === 'run' && call.args[1] === 'watch'));
  assert.ok(!harness.calls.some(call => call.file === 'gh' && call.args[0] === 'workflow'));
});
