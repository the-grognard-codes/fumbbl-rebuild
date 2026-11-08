import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Compare independent, matched cohorts; never align clocks or pool their percentiles. */
export function compareBrowserWorkloads(before, after) {
  for (const report of [before, after]) {
    if (report?.version !== 1 || report.production !== true || !Array.isArray(report.runs) || report.runs.length !== 9
      || !Array.isArray(report.errors) || report.errors.length) throw Error('Require complete production workloads without browser errors');
    if (![report.artifactSha256, report.fixtureSha256].every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)))
      throw Error('Invalid artifact identity');
    if (!Number.isFinite(report.pixelRatio) || report.pixelRatio < 1 || report.pixelRatio > 4
      || !['pointerdown', 'click'].includes(report.inputEvent)) throw Error('Missing input/display metadata');
  }
  for (const field of ['fixtureSha256', 'browser', 'cpu'])
    if (!before[field] || before[field] !== after[field]) throw Error(`Unmatched workload ${field}`);
  if (JSON.stringify(before.viewport) !== JSON.stringify(after.viewport)) throw Error('Unmatched viewport');
  if (before.pixelRatio !== after.pixelRatio || before.inputEvent !== after.inputEvent || before.overlayCorner !== after.overlayCorner)
    throw Error('Unmatched input/display conditions');
  const cohorts = [];
  const metric = value => ({ count: value.count, p50: value.p50, p95: value.p95, max: value.max,
    ...(Number.isFinite(value.mean) ? { mean: value.mean } : {}) });
  for (let repeat = 1; repeat <= 3; repeat++) for (const mode of ['off', 'counters', 'graph']) {
    const find = report => {
      const matches = report.runs.filter(run => run.repeat === repeat && run.mode === mode);
      if (matches.length !== 1) throw Error('Missing or duplicate cohort');
      const run = matches[0];
      for (const key of ['feedbackMs', 'responseHandlerMs', 'responsePresentationMs', 'frameMs']) {
        const metric = run[key];
        if (!metric || !Number.isInteger(metric.count) || metric.count < 1
          || !['p50', 'p95', 'max'].every(name => Number.isFinite(metric[name]) && metric[name] >= 0)) throw Error('Missing cohort metrics');
      }
      if (run.feedbackMs.count !== 12 || run.responseHandlerMs.count !== 12 || run.responsePresentationMs.count !== 12
        || ![run.gaps50, run.gaps100].every(value => Number.isInteger(value) && value >= 0)) throw Error('Unmatched sample count');
      return run;
    };
    const baseline = find(before), corrected = find(after);
    cohorts.push({ repeat, mode, samples: 12, feedbackBefore: metric(baseline.feedbackMs), feedbackAfter: metric(corrected.feedbackMs),
      responseBefore: metric(baseline.responsePresentationMs), responseAfter: metric(corrected.responsePresentationMs),
      handlerBefore: metric(baseline.responseHandlerMs), handlerAfter: metric(corrected.responseHandlerMs),
      frameBefore: metric(baseline.frameMs), frameAfter: metric(corrected.frameMs),
      gaps50Before: baseline.gaps50, gaps50After: corrected.gaps50,
      gaps100Before: baseline.gaps100, gaps100After: corrected.gaps100,
      passed: corrected.pendingBeforeReply === true && corrected.feedbackMs.p95 <= 100
        && corrected.responsePresentationMs.p95 <= baseline.responsePresentationMs.p95 + 20 });
  }
  return { version: 1, passed: cohorts.every(cohort => cohort.passed),
    artifacts: { before: before.artifactSha256, after: after.artifactSha256, fixture: before.fixtureSha256 },
    gates: 'Pending visible before held reply; feedback p95 <=100 ms; response presentation p95 <= baseline +20 ms per cohort',
    limitations: ['12 actions per cohort is insufficient for stable long-term tail claims',
      'Native-board controlled-response replay, not native server RTT or physical-device acceptance',
      'rAF opportunities are not actual display latency; independent cohort clocks are not merged'], cohorts };
}

export function comparisonMarkdown(report) {
  const lines = ['# Matched browser workload comparison', '', `Declared workload gates: **${report.passed ? 'PASS' : 'FAIL'}**.`, '', report.gates, '',
    '| Repeat | Mode | Actions | Feedback p95 before/after ms | Response p95 before/after ms | Gaps >=50 ms before/after | Gate |',
    '| ---: | --- | ---: | ---: | ---: | ---: | --- |'];
  for (const c of report.cohorts) lines.push(`| ${c.repeat} | ${c.mode} | ${c.samples} | ${c.feedbackBefore.p95}/${c.feedbackAfter.p95} | ${c.responseBefore.p95}/${c.responseAfter.p95} | ${c.gaps50Before}/${c.gaps50After} | ${c.passed ? 'PASS' : 'FAIL'} |`);
  lines.push('', '## Limits', '', ...report.limitations.map(limit => `- ${limit}`), '', '## Artifact identity', '',
    `- Baseline bundle SHA256: ${report.artifacts.before}`, `- Corrected bundle SHA256: ${report.artifacts.after}`, `- Native fixture SHA256: ${report.artifacts.fixture}`, '');
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [beforeFile, afterFile, output, ...extra] = process.argv.slice(2);
  if (!beforeFile || !afterFile || !output || extra.length || [beforeFile, afterFile].some(file => resolve(file) === resolve(output)))
    throw Error('Usage: node tools/diagnostics/compare-browser-workloads.mjs before.json after.json output.md');
  const read = async file => {
    const text = await readFile(file, 'utf8');
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw Error('Workload report exceeds 2 MiB');
    return JSON.parse(text);
  };
  const report = compareBrowserWorkloads(await read(beforeFile), await read(afterFile));
  await writeFile(output, comparisonMarkdown(report), { flag: 'wx' });
  console.log(`Matched browser workload gates: ${report.passed ? 'PASS' : 'FAIL'}`);
  if (!report.passed) process.exitCode = 1;
}
