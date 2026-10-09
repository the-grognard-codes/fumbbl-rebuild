import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { localValidationEnvironment, validateLocalBrowser } from '../validation/browser-local.mjs';

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
  const first = await validateLocalBrowser(root, { run, env: { GITHUB_SHA: 'wrong', VALIDATION_COMMIT: 'wrong', KEEP: 'yes' } });
  assert.equal(first.commit, sha);
  assert.equal(readdirSync(first.reportDirectory).length, 5);
  assert.equal(calls.filter(call => call.args.some(arg => arg.endsWith('browser-suites.mjs'))).length, 5);
  assert.ok(calls.every(call => call.options.env.GITHUB_SHA === undefined && call.options.env.VALIDATION_COMMIT === undefined));
  assert.ok(calls.every(call => call.options.env.KEEP === 'yes'));
  assert.ok(calls.findIndex(call => call.args.includes('ci')) < calls.findIndex(call => call.args.includes('install')));
  assert.ok(calls.findIndex(call => call.args.includes('install')) < calls.findIndex(call => call.args.includes('build')));
  const second = await validateLocalBrowser(root, { run });
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
  await assert.rejects(validateLocalBrowser(root, { run }), /npm ci failed/);
  assert.equal(suites, 0);
  await assert.rejects(validateLocalBrowser(root, { run: file => file === 'git' ? sha : '' }), /ENOENT/);
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
  await assert.rejects(validateLocalBrowser(root, { run: reportRun('stale', hosted) }), /invalid, failed, or stale report/);
  await assert.rejects(validateLocalBrowser(root, { run: reportRun(sha, []) }), /hosted shard 1 execution/);
});

test('local validation child environment removes inherited CI identity', () => {
  assert.deepEqual(localValidationEnvironment({ GITHUB_SHA: 'a', VALIDATION_COMMIT: 'b',
    NODE_TEST_CONTEXT: 'child', CUSTOM: 'retained' }), { CUSTOM: 'retained' });
});
