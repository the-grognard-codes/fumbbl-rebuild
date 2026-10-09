import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertDependencies, assertShards, loadBrowserManifest, validateReports } from '../validation/coverage.mjs';
import { executeShard, parseArguments, parseTestSummary, runNode } from '../validation/browser-suites.mjs';
import { resolveBrowserCommit } from '../validation/resolve-browser-commit.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const shards = [['suite1'], ['suite2'], ['suite3'], ['suite4']];
const reports = () => shards.map((suites, index) => ({ schemaVersion: 1, family: 'native', shard: index + 1,
  commit: 'current', passed: true, suites: suites.map(id => ({ id, tests: 2, durationMs: 10, failures: 0, errors: 0, skipped: 0 })) }));
const configuration = { family: 'native', shards, commit: 'current' };
const tap = '# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

test('browser source resolver accepts only its own workflow source or exact verified main history', () => {
  const workflow = 'a'.repeat(40);
  const main = 'b'.repeat(40);
  const ancestor = 'c'.repeat(40);
  assert.equal(resolveBrowserCommit(workflow, workflow, [main, ancestor]), workflow);
  assert.equal(resolveBrowserCommit(ancestor, workflow, [main, ancestor]), ancestor);
  for (const requested of ['d'.repeat(40), 'main', ancestor.slice(0, 8), '', `${main};echo injected`]) {
    assert.throws(() => resolveBrowserCommit(requested, workflow, [main, ancestor]));
  }
  assert.throws(() => resolveBrowserCommit(main, workflow, []));
  assert.throws(() => resolveBrowserCommit(main, workflow, ['main']));
});

test('coverage rejects missing, duplicate, misassigned, stale, failed, and empty executions', () => {
  assert.equal(validateReports(reports(), configuration).length, 4);
  for (const mutate of [
    value => value.pop(),
    value => value.push(value[0]),
    value => { value[0].suites = value[1].suites; },
    value => { value[0].suites.push(value[0].suites[0]); },
    value => { value[0].commit = 'old'; },
    value => { value[0].passed = false; },
    value => { value[0].suites[0].tests = 0; },
    value => { value[0].suites[0].failures = 1; },
    value => { value[0].suites[0].errors = 1; },
    value => { value[0].suites[0].durationMs = NaN; },
  ]) {
    const value = reports(); mutate(value);
    assert.throws(() => validateReports(value, configuration));
  }
});

test('only existing exact opt-in skip identities and reasons may pass coverage', () => {
  const value = reports();
  value[0].suites[0].skipped = 1;
  value[0].suites[0].skippedTests = [{ name: 'requiresIsolatedDatabase', reason: 'Assumption failed: isolated database required' }];
  const allowedSkips = { suite1: { requiresIsolatedDatabase: 'Assumption failed: isolated database required' } };
  assert.equal(validateReports(value, { ...configuration, allowedSkips }).length, 4);
  assert.throws(() => validateReports(value, configuration), /unexpected skip/);
  value[0].suites[0].skippedTests[0].reason = 'New accidental assumption';
  assert.throws(() => validateReports(value, { ...configuration, allowedSkips }), /unexpected skip/);
  delete value[0].suites[0].skippedTests[0].reason;
  assert.throws(() => validateReports(value, configuration), /unexpected skip/);
  value[0].suites[0].skippedTests = [];
  assert.throws(() => validateReports(value, { ...configuration, allowedSkips }), /accounting mismatch/);
});

test('aggregate job gate rejects skipped, cancelled, failed, and absent dependencies', () => {
  assertDependencies({ build: { result: 'success' }, browser: { result: 'success' } }, ['build', 'browser']);
  for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
    assert.throws(() => assertDependencies({ build: { result } }, ['build']), /Required job/);
  }
  assert.throws(() => assertDependencies({}, ['build']), /missing=build/);
});

test('manifest cannot duplicate a suite or silently omit a new browser harness', async () => {
  assert.throws(() => assertShards([['one'], ['one'], ['three'], ['four']], 'test'), /duplicate/);
  const directory = await mkdtemp(join(tmpdir(), 'validation-inventory-'));
  try {
    for (const path of ['tools/validation', 'browser-client/test', 'site/test']) await mkdir(join(directory, path), { recursive: true });
    const manifest = { schemaVersion: 1, interactionShards: shards, hosted: ['site/test/hosted-browser.test.mjs'], standalone: [] };
    manifest.interactionShards = shards.map((_, index) => [`browser-client/test/suite${index + 1}-ui.mjs`]);
    for (const path of manifest.interactionShards.flat().concat(manifest.hosted)) await writeFile(join(directory, path), '');
    await writeFile(join(directory, 'tools/validation/browser-shards.json'), JSON.stringify(manifest));
    await loadBrowserManifest(directory);
    await writeFile(join(directory, 'browser-client/test/new-ui.mjs'), '');
    await assert.rejects(loadBrowserManifest(directory), /new-ui\.mjs/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('hosted test summaries reject zero tests, skips, cancellations, and absent totals', () => {
  assert.equal(parseTestSummary(tap).tests, 2);
  for (const output of ['', tap.replace('tests 2', 'tests 0'), tap.replace('skipped 0', 'skipped 1'),
    tap.replace('cancelled 0', 'cancelled 1'), tap.replace('fail 0', 'fail 1'),
    tap.replace('todo 0', 'todo 1'), tap.replace('pass 2', 'pass 1')]) assert.throws(() => parseTestSummary(output));
});

test('CLI cannot select a nonexistent shard or silently ignore options', () => {
  assert.deepEqual(parseArguments(['--family', 'interaction', '--shard', '2']), { family: 'interaction', shard: 2 });
  for (const args of [[], ['--family', 'hosted', '--shard', '2'], ['--family', 'interaction', '--shard', '0'],
    ['--family', 'interaction', '--unknown', 'yes'], ['--family', 'interaction', '--shard'],
    ['--family', 'interaction', '--family', 'hosted']]) assert.throws(() => parseArguments(args));
});

test('real child process failure propagates and stops later suites without a stale passing report', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'validation-runner-'));
  try {
    await writeFile(join(directory, 'fails.mjs'), 'process.exitCode = 7;');
    await writeFile(join(directory, 'later.mjs'), "throw new Error('later suite must not run');");
    await writeFile(join(directory, 'interaction-1.json'), JSON.stringify({ passed: true }));
    const visited = [];
    await assert.rejects(executeShard({ root: directory, family: 'interaction', shard: 1,
      suites: ['fails.mjs', 'later.mjs'], commit: 'current', reportDirectory: directory,
      run: async (args, cwd) => { visited.push(args.at(-1)); return runNode(args, cwd); } }), /exit 7/);
    assert.deepEqual(visited, ['fails.mjs']);
    await assert.rejects(readFile(join(directory, 'interaction-1.json')), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('real hosted Node test writes its observed counts and exact execution identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'validation-hosted-'));
  try {
    await writeFile(join(directory, 'sample.test.mjs'), "import test from 'node:test'; test('first',()=>{}); test('second',()=>{});");
    const result = await executeShard({ root: directory, family: 'hosted', shard: 1, suites: ['sample.test.mjs'],
      commit: 'current', reportDirectory: directory });
    assert.equal(result.suites[0].tests, 2);
    assert.equal(result.suites[0].id, 'sample.test.mjs');
    assert.equal(JSON.parse(await readFile(join(directory, 'hosted-1.json'), 'utf8')).commit, 'current');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('project browser inventory covers every harness with an explicit CI or standalone assignment', async () => {
  await loadBrowserManifest(root);
});

test('actual CI gate accepts complete reports and rejects missing artifacts or failed matrix dependencies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'validation-gate-'));
  try {
    const native = JSON.parse(await readFile(join(root, 'tools/validation/native-shards.json'), 'utf8'));
    for (const [index, ids] of native.shards.entries()) {
      const report = { schemaVersion: 1, family: 'native', shard: index + 1, commit: 'current', passed: true,
        suites: ids.map(id => ({ id, tests: 1, durationMs: 0, failures: 0, errors: 0, skipped: 0 })) };
      await writeFile(join(directory, `native-${index + 1}.json`), JSON.stringify(report));
    }
    const runGate = result => spawnSync(process.execPath, ['tools/validation/coverage-gate.mjs', 'native', directory], {
      cwd: root, encoding: 'utf8', windowsHide: true,
      env: { ...process.env, GITHUB_SHA: 'current', GITHUB_STEP_SUMMARY: '',
        VALIDATION_NEEDS: JSON.stringify({ 'target-shards': { result } }) },
    });
    const passed = runGate('success');
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /PASS complete native validation coverage/);
    assert.match(runGate('cancelled').stderr, /Required job target-shards: cancelled/);
    await rm(join(directory, 'native-4.json'));
    const missing = runGate('success');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /missing=native-4.json/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('release browser gate uses the release commit and rejects stale, partial, or cancelled execution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'release-browser-gate-'));
  try {
    const manifest = await loadBrowserManifest(root);
    const groups = [
      { family: 'interaction', shards: manifest.interactionShards },
      { family: 'hosted', shards: [manifest.hosted] },
    ];
    for (const { family, shards: assigned } of groups) {
      for (const [index, ids] of assigned.entries()) {
        await writeFile(join(directory, `${family}-${index + 1}.json`), JSON.stringify({
          schemaVersion: 1, family, shard: index + 1, commit: 'release', passed: true,
          suites: ids.map(id => ({ id, tests: 1, durationMs: 0, failures: 0, errors: 0, skipped: 0 })),
        }));
      }
    }
    const runGate = (commit = 'release', result = 'success') => spawnSync(process.execPath,
      ['tools/validation/coverage-gate.mjs', 'browser', directory], {
        cwd: root, encoding: 'utf8', windowsHide: true,
        env: { ...process.env, GITHUB_SHA: 'workflow-main', VALIDATION_COMMIT: commit, GITHUB_STEP_SUMMARY: '',
          VALIDATION_NEEDS: JSON.stringify({ resolve: { result: 'success' },
            'hosted-browser': { result: 'success' }, 'browser-interactions': { result } }) },
      });
    const passed = runGate();
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /PASS complete browser validation coverage for release/);
    assert.equal(runGate('workflow-main').status, 1);
    assert.match(runGate('release', 'cancelled').stderr, /Required job browser-interactions: cancelled/);
    await rm(join(directory, 'interaction-4.json'));
    assert.match(runGate().stderr, /missing=interaction-4.json/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('DEV static gate requires actual fast-job success without claiming browser execution', () => {
  const runGate = needs => spawnSync(process.execPath, ['tools/validation/static-gate.mjs'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, VALIDATION_NEEDS: JSON.stringify(needs) },
  });
  const passed = runGate({ 'static-checks': { result: 'success' } });
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /browser inventory/);
  for (const result of ['failure', 'cancelled', 'skipped']) {
    assert.match(runGate({ 'static-checks': { result } }).stderr, /Required job static-checks/);
  }
  assert.match(runGate({}).stderr, /missing=static-checks/);
});

test('browser runner refuses a release identity that differs from its checkout', () => {
  const result = spawnSync(process.execPath, ['tools/validation/browser-suites.mjs', '--family', 'hosted'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, VALIDATION_COMMIT: 'different-commit' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Checkout does not match the validation commit/);
});
