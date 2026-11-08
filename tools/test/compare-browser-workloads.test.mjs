import assert from 'node:assert/strict';
import test from 'node:test';
import { compareBrowserWorkloads, comparisonMarkdown } from '../diagnostics/compare-browser-workloads.mjs';

const metric = (value = 10) => ({ count: 12, p50: value, p95: value, max: value });
function fixture() {
  return { version: 1, production: true, errors: [], fixtureSha256: 'a'.repeat(64), artifactSha256: 'b'.repeat(64),
    browser: 'test-browser', cpu: 'test-cpu', viewport: [1440, 900], pixelRatio: 1, inputEvent: 'pointerdown',
    runs: [1, 2, 3].flatMap(repeat => ['off', 'counters', 'graph'].map(mode => ({ repeat, mode,
      feedbackMs: metric(), responseHandlerMs: metric(), responsePresentationMs: metric(), frameMs: metric(),
      gaps50: 0, gaps100: 0, pendingBeforeReply: true }))) };
}
test('keeps matched cohorts separate and applies the declared gates', () => {
  const before = fixture(), after = fixture(); after.runs[1].feedbackMs.p95 = 101;
  const report = compareBrowserWorkloads(before, after);
  assert.equal(report.passed, false); assert.equal(report.cohorts.length, 9);
  assert.equal(report.cohorts[0].passed, true); assert.equal(report.cohorts[1].passed, false);
  assert.match(comparisonMarkdown(report), /FAIL/);
  assert.equal(compareBrowserWorkloads(before, fixture()).passed, true);
  after.runs[1].feedbackMs.p95 = 10; after.runs[2].responsePresentationMs.p95 = 31;
  assert.equal(compareBrowserWorkloads(before, after).cohorts[2].passed, false);
});
test('rejects missing data, mismatched workloads, duplicates and small cohorts', () => {
  for (const change of [r => { r.cpu = 'different'; }, r => { r.runs[0].feedbackMs.p95 = null; },
    r => { r.runs[0].feedbackMs.count = 5; }, r => { r.runs[1].mode = 'off'; }, r => { r.production = false; },
    r => { r.pixelRatio = 2; }, r => { r.inputEvent = 'click'; }, r => { delete r.pixelRatio; }]) {
    const after = fixture(); change(after); assert.throws(() => compareBrowserWorkloads(fixture(), after));
  }
});
test('does not copy arbitrary input content or expose raw traces', () => {
  const before = fixture(), after = fixture(); after.untrusted = 'PRIVATE_PAYLOAD'; after.runs[0].raw = { secret: 'PRIVATE_PAYLOAD' };
  after.runs[0].feedbackMs.secret = 'PRIVATE_PAYLOAD';
  assert.equal(JSON.stringify(compareBrowserWorkloads(before, after)).includes('PRIVATE_PAYLOAD'), false);
});
