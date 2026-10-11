import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { localBrowserWorkers, localValidationEnvironment, validateLocalBrowser } from '../validation/browser-local.mjs';

const sha = 'c'.repeat(40);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'browser-local-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const interactionShards = Array.from({ length: 4 }, (_, index) => [`browser-client/test/journey-${index + 1}-ui.mjs`]);
  const hosted = ['site/test/hosted-browser.test.mjs'];
  for (const path of [...interactionShards.flat(), ...hosted]) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), '');
  }
  mkdirSync(join(root, 'tools', 'validation'), { recursive: true });
  writeFileSync(join(root, 'tools', 'validation', 'browser-shards.json'), JSON.stringify({
    schemaVersion: 1, interactionShards, hosted, standalone: [],
  }));
  return { root, interactionShards, hosted };
}

test('local browser validation runs all shards, validates five fresh reports, and clears GitHub identity', async t => {
  const { root, interactionShards, hosted } = fixture(t);
  const calls = [];
  const run = (file, args, options) => {
    calls.push({ file, args, options });
    if (file === 'git') return `${sha}\n`;
    if (args.includes('browser-suites.mjs') || args.some(arg => arg.endsWith('browser-suites.mjs'))) {
      const family = args[args.indexOf('--family') + 1];
      const shard = Number(args[args.indexOf('--shard') + 1]);
      const reportDirectory = args[args.indexOf('--report-directory') + 1];
      const suites = family === 'hosted' ? hosted : interactionShards[shard - 1];
      writeFileSync(join(reportDirectory, `${family}-${shard}.json`), JSON.stringify({
        schemaVersion: 1, family, shard, commit: sha, passed: true,
        suites: suites.map(id => ({ id, durationMs: 1, tests: 1, failures: 0, errors: 0, skipped: 0 })),
      }));
    }
    return '';
  };
  let active = 0, peak = 0;
  const runShard = async (...args) => {
    active++; peak = Math.max(peak, active);
    await new Promise(done => setTimeout(done, 15));
    run(...args); active--;
  };
  const first = await validateLocalBrowser(root, { run, runShard,
    env: { GITHUB_SHA: 'wrong', VALIDATION_COMMIT: 'wrong', KEEP: 'yes', FFB_BROWSER_TEST_WORKERS: '2' } });
  assert.equal(first.commit, sha);
  assert.equal(readdirSync(first.reportDirectory).length, 5);
  assert.equal(calls.filter(call => call.args.some(arg => arg.endsWith('browser-suites.mjs'))).length, 5);
  assert.ok(calls.every(call => call.options.env.GITHUB_SHA === undefined && call.options.env.VALIDATION_COMMIT === undefined));
  assert.ok(calls.every(call => call.options.env.KEEP === 'yes'));
  assert.ok(calls.findIndex(call => call.args.includes('ci')) < calls.findIndex(call => call.args.includes('install')));
  assert.ok(calls.findIndex(call => call.args.includes('install')) < calls.findIndex(call => call.args.includes('build')));
  assert.equal(peak, 2, 'Shard execution overlaps without exceeding the configured limit');
  const shardCalls = calls.filter(call => call.args.some(arg => arg.endsWith('browser-suites.mjs')));
  assert.ok(calls.findIndex(call => call.args.includes('build')) < calls.indexOf(shardCalls[0]));
  assert.equal(new Set(shardCalls.map(call => call.options.env.FFB_BROWSER_TEST_CACHE_DIR)).size, 5);
  assert.ok(shardCalls.every(call => call.options.env.FFB_BROWSER_TEST_CACHE_DIR.startsWith(join(first.reportDirectory, 'vite-cache'))));
  const second = await validateLocalBrowser(root, { run, runShard, env: { FFB_BROWSER_TEST_WORKERS: '1' } });
  assert.notEqual(first.reportDirectory, second.reportDirectory);
});

test('missing, stale, or incomplete reports fail; an install failure prevents browser execution', async t => {
  const { root, interactionShards, hosted } = fixture(t);
  let suites = 0;
  const run = (file, args) => {
    if (file === 'git') return sha;
    if (args.includes('ci')) throw Error('npm ci failed');
    if (args.some(arg => arg.endsWith('browser-suites.mjs'))) suites++;
    return '';
  };
  await assert.rejects(validateLocalBrowser(root, { run, runShard: run, env: {} }), /npm ci failed/);
  assert.equal(suites, 0);
  await assert.rejects(validateLocalBrowser(root, { run: file => file === 'git' ? sha : '', runShard: () => '', env: {} }), /ENOENT/);
  const reportRun = (hostedCommit, hostedSuites) => (file, args) => {
    if (file === 'git') return sha;
    if (args.some(arg => arg.endsWith('browser-suites.mjs'))) {
      const family = args[args.indexOf('--family') + 1];
      const shard = Number(args[args.indexOf('--shard') + 1]);
      const directory = args[args.indexOf('--report-directory') + 1];
      const ids = family === 'hosted' ? hostedSuites : interactionShards[shard - 1];
      writeFileSync(join(directory, `${family}-${shard}.json`), JSON.stringify({
        schemaVersion: 1, family, shard, commit: family === 'hosted' ? hostedCommit : sha, passed: true,
        suites: ids.map(id => ({ id, durationMs: 1, tests: 1, failures: 0, errors: 0, skipped: 0 })),
      }));
    }
    return '';
  };
  const stale = reportRun('stale', hosted), incomplete = reportRun(sha, []);
  await assert.rejects(validateLocalBrowser(root, { run: stale, runShard: stale, env: {} }), /invalid, failed, or stale report/);
  await assert.rejects(validateLocalBrowser(root, { run: incomplete, runShard: incomplete, env: {} }), /hosted shard 1 execution/);
});

test('worker defaults respect available processors and invalid limits fail before preparation', async t => {
  assert.equal(localBrowserWorkers({}, 1), 1); assert.equal(localBrowserWorkers({}, 2), 2);
  assert.equal(localBrowserWorkers({}, 16), 4);
  assert.equal(localBrowserWorkers({ FFB_BROWSER_TEST_WORKERS: '1' }, 16), 1);
  const { root } = fixture(t);
  for (const value of ['0', '5', '2.5', '', ' 2', 'all']) {
    let calls = 0;
    await assert.rejects(validateLocalBrowser(root, { run: () => { calls++; },
      env: { FFB_BROWSER_TEST_WORKERS: value } }), /FFB_BROWSER_TEST_WORKERS/);
    assert.equal(calls, 0);
  }
});

test('real child failure stops queued shards and waits for active children before returning', async t => {
  const { root } = fixture(t);
  const trace = join(root, 'trace.jsonl');
  writeFileSync(join(root, 'tools', 'validation', 'browser-suites.mjs'), `
    import { appendFileSync } from 'node:fs';
    const args = process.argv.slice(2), shard = Number(args[args.indexOf('--shard') + 1]);
    const record = event => appendFileSync(${JSON.stringify(trace)}, JSON.stringify({event, shard,
      cache: process.env.FFB_BROWSER_TEST_CACHE_DIR, pid: process.pid})+'\\n');
    record('start');
    await new Promise(done => setTimeout(done, shard === 1 ? 10 : 400));
    record('end');
    process.exitCode = shard === 1 ? 7 : 0;
  `);
  await assert.rejects(validateLocalBrowser(root, { run: file => file === 'git' ? sha : '',
    env: { ...process.env, FFB_BROWSER_TEST_WORKERS: '2' } }), /Browser shard failed.*exit 7/);
  const records = readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(records.filter(record => record.event === 'start').map(record => record.shard).sort(), [1, 2]);
  assert.deepEqual(records.filter(record => record.event === 'end').map(record => record.shard).sort(), [1, 2],
    'Validation waits for the successful active child to finish');
  assert.equal(new Set(records.map(record => record.pid)).size, 2);
  assert.equal(new Set(records.map(record => record.cache)).size, 2);
});

test('local validation child environment removes inherited CI identity', () => {
  assert.deepEqual(localValidationEnvironment({ GITHUB_SHA: 'a', VALIDATION_COMMIT: 'b',
    NODE_TEST_CONTEXT: 'child', CUSTOM: 'retained' }), { CUSTOM: 'retained' });
});
