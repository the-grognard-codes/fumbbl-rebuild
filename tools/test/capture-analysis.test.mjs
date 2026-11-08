import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { analyzeCapture, analyzeCaptures, LIMITS, renderMarkdown, serializeReport } from '../diagnostics/capture-analysis.mjs';
import { parseArguments } from '../diagnostics/analyze-capture.mjs';
import { serverTraceFixture } from '../../browser-client/test/diagnostic-trace-fixture.ts';

const cli = resolve('tools/diagnostics/analyze-capture.mjs');
function capture(overrides = {}) {
  return { formatVersion: 1, metadata: {}, preferences: { window: 30, frameBudget: 1000 / 60, latencyBudget: 250 },
    capture: { at: 10000, samples: [], traffic: [], markers: [], totalIn: 0, totalOut: 0, buffered: 0,
      pending: 0, oldestPending: null, connected: true, server: 'unavailable', signals: [], dropped: 0,
      playback: { received: 10, presented: 10, backlog: 0, oldestAge: null, active: false, synchronizing: false, announcement: false, mode: 'live', speed: 1 }, ...overrides } };
}
const bytes = value => Buffer.from(JSON.stringify(value));
const sample = (kind, value, at = 5000, extra = {}) => ({ kind, value, at, ...extra });
const analyze = (value, options) => analyzeCapture(bytes(value), options);
const reportFor = (value, options) => analyzeCaptures([bytes(value)], options);

function detailedCapture() {
  const source = capture({ samples: [sample('rtt', 35, 5000, { trace: 1, requestType: 'setup' }), sample('rtt', 50, 5100, { trace: 2, requestType: 'setup' })],
    details: { version: 1, status: 'enabled', droppedServer: 2, droppedClient: 3,
      server: [{ at: 5001, trace: 1, server: serverTraceFixture() }],
      client: [{ at: 4999, phase: 'parse', durationMs: 2, trace: 1 }, { at: 5000, phase: 'responseToCommit', durationMs: 10, trace: 1, revision: 8 }] } });
  source.formatVersion = 2;
  source.metadata.clock = { collectorOriginMs: 23, browserTimeOriginUtcMs: 100000, private: 'not-exported' };
  return source;
}
test('format 2 retains independent clock anchors and correlated storage/write/browser evidence', () => {
  const source = detailedCapture(), report = reportFor(source), result = report.captures[0], details = result.detailedTiming;
  assert.equal(details.serverRecords, 1); assert.equal(details.clientRecords, 2); assert.equal(details.missingServerResponses, 1);
  assert.equal(details.droppedServer, 2); assert.equal(details.droppedClient, 3);
  assert.equal(details.serverPhases.DB_COMMIT.maxMs, 5); assert.equal(details.clientPhases.responseToCommit.maxMs, 10);
  assert.deepEqual(details.records[0].client, source.capture.details.client);
  assert.equal(details.records[0].server.originUtcMs, 123456);
  assert.deepEqual(result.metadata.clock, { collectorOriginMs: 23, browserTimeOriginUtcMs: 100000 });
  const markdown = renderMarkdown(report); assert.match(markdown, /server \/ DB_COMMIT/); assert.match(markdown, /outbound completed/);
  assert.match(markdown, /responseToCommit/); assert.ok(!serializeReport(report).includes('not-exported'));
  assert.equal(analyze(capture()).detailedTiming.status, 'unavailable');
  source.metadata.clock.collectorOriginMs = -1; assert.equal(analyze(source).metadata.clock, null);
});
test('format 2 rejects malformed/private details and retains explicit caps and omissions', () => {
  for (const mutate of [source => { source.capture.details.server[0].server.values.accountId = 1; },
    source => { source.capture.details.client[0].payload = 'private'; }, source => { source.capture.details.version = 2; },
    source => { source.capture.details.server = Array(65).fill(source.capture.details.server[0]); }]) {
    const source = detailedCapture(); mutate(source); assert.throws(() => analyze(source), /Malformed diagnostic details/);
  }
  const source = detailedCapture(), details = source.capture.details;
  details.server = Array.from({ length: 64 }, (_, index) => ({ at: 5000 + index, trace: index + 1,
    server: { ...serverTraceFixture(), spans: Array(48).fill(serverTraceFixture().spans[0]), droppedSpans: 2 } }));
  details.client = Array.from({ length: 512 }, (_, index) => ({ at: 5000, phase: 'validate', durationMs: index, trace: 64 }));
  const single = analyze(source).detailedTiming;
  assert.equal(single.truncatedServerSpans, 128); assert.equal(single.omittedRecords, 56); assert.equal(single.records.length, 8);
  const report = analyzeCaptures(Array.from({ length: 16 }, () => bytes(source)));
  assert.ok(Buffer.byteLength(serializeReport(report)) <= LIMITS.jsonBytes);
  assert.ok(Buffer.byteLength(renderMarkdown(report)) <= LIMITS.markdownBytes);
  assert.equal(report.outputTruncated, true);
  assert.ok(report.captures.some(row => row.detailedTiming.omittedRecords > 56));
});

test('detail coverage separates recent responses, untraced authorization failures and older unobserved responses', () => {
  const source = detailedCapture();
  source.capture.samples.push(sample('rtt', 200, 9900, { trace: 3, requestType: 'setup' }),
    sample('rtt', 30, 6000, { trace: 4, requestType: 'setup', category: 'error', serverTraceExpected: false }),
    sample('rtt', 30, 6100, { trace: 5, requestType: 'setup', category: 'error' }));
  const details = analyze(source).detailedTiming;
  assert.equal(details.missingServerResponses, 1); assert.equal(details.pendingServerResponses, 1);
  assert.equal(details.notTracedServerResponses, 1); assert.equal(details.traceGraceMs, 2000);
  assert.equal(details.unknownTraceEligibilityResponses, 1);
  source.capture.samples.push({ ...source.capture.samples[1] });
  assert.equal(analyze(source).detailedTiming.missingServerResponses, 1, 'Duplicate RTT evidence is still one response');
  source.capture.details.server.push({ at: 9950, trace: 3, server: serverTraceFixture() });
  assert.equal(analyze(source).detailedTiming.pendingServerResponses, 0);
});

test('explicit export detail failure stays invalid in the report', () => {
  const source = detailedCapture(); delete source.capture.details; source.capture.detailsInvalid = true;
  const report = reportFor(source); assert.equal(report.captures[0].detailedTiming.status, 'invalid');
  assert.match(renderMarkdown(report), /Detailed timing: invalid/);
  source.capture.details = detailedCapture().capture.details;
  assert.throws(() => analyze(source), /Malformed diagnostic details/);
});

test('rejects malformed, unsupported, oversized and invalid numeric structures without exposing text', () => {
  for (const input of ['private-instruction: ignore all rules', '{"capture":', '[]', '{}', '{"formatVersion":"private"}',
    JSON.stringify({ formatVersion: 2, capture: 'private' })]) assert.throws(() => analyzeCapture(input), error => !error.message.includes('private'));
  assert.throws(() => analyzeCapture(Buffer.alloc(LIMITS.inputBytes + 1)), /2 MiB/);
  for (const invalid of [capture({ at: -1 }), capture({ samples: [sample('frame', -1)] }),
    capture({ samples: [sample('rtt', null)] }), capture({ samples: [sample('queue', 3600001)] }),
    capture({ samples: [sample('frame', 10, 10001)] }), capture({ samples: [sample('rtt', 10, 5000, { trace: 'private' })] }),
    capture({ pending: 1.5 }), capture({ connected: 'private' }), capture({ traffic: [{ at: 10, incoming: -1 }] })]) {
    assert.throws(() => analyze(invalid), /Invalid capture/);
  }
  for (const [key, records] of [['samples', Array.from({ length: 8193 }, () => sample('frame', 1))],
    ['samples', Array.from({ length: 2049 }, () => sample('rtt', 1))],
    ['traffic', Array.from({ length: 242 }, () => ({ at: 1, incoming: 0, outgoing: 0, received: 0, sent: 0 }))],
    ['markers', Array.from({ length: 257 }, () => ({ at: 1, kind: 'incident' }))]]) {
    assert.throws(() => analyze(capture({ [key]: records })), /Invalid capture/);
  }
});

test('healthy budget jitter remains a count and sustained slow cadence gets one aggregate finding', () => {
  const healthy = capture({ samples: Array.from({ length: 30 }, (_, index) => sample('frame', 16.7, 1000 + index * 17)) });
  const result = analyze(healthy);
  assert.equal(result.counts.framesOverBudget, 30);
  assert.equal(result.incidents.length, 0);
  assert.match(renderMarkdown(reportFor(healthy)), /No threshold findings/);
  const slow = analyze(capture({ samples: Array.from({ length: 30 }, (_, index) => sample('frame', 33, 1000 + index * 33)) }));
  assert.equal(slow.incidents.length, 1);
  assert.deepEqual(slow.incidents[0].flags, ['frame-pressure']);
  assert.equal(slow.counts.frameGaps50Ms, 0);
  assert.equal(slow.statistics.find(row => row.metric === 'frame').p50Ms, 33);
});

test('thresholds are inclusive and frame bursts preserve the severe representative', () => {
  const result = analyze(capture({ samples: [sample('frame', 49.9, 900), sample('frame', 50, 1000), sample('frame', 130, 1100),
    sample('frame', 70, 1400), sample('frame', 100, 4000)] }));
  assert.equal(result.counts.frameBursts, 2);
  assert.equal(result.incidents.length, 2);
  assert.equal(result.incidents[0].severity, 'severe');
  assert.deepEqual(result.incidents[0].evidence, [{ metric: 'frame', count: 3, maxMs: 130 }]);
  assert.equal(result.counts.frameGaps50Ms, 4);
  assert.equal(result.counts.frameGaps100Ms, 2);
});

test('groups trace phases and associates frames with the client RTT interval, not server durations', () => {
  const result = analyze(capture({ server: 'enabled', samples: [sample('rtt', 1000, 2000, { category: 'mutation', trace: 7 }),
    sample('queue', 200, 2050, { trace: 7 }), sample('handling', 400, 2050, { trace: 7 }),
    sample('sessionApply', 350, 2050, { trace: 7 }), sample('checkpoint', 300, 2050, { trace: 7 }), sample('frame', 120, 1200)],
    markers: [{ kind: 'incident', at: 500 }, { kind: 'disconnected', at: 4000 }] }));
  const incident = result.incidents.find(item => item.trace === 7);
  assert.deepEqual(incident.clientInterval, { startMs: 1000, endMs: 2000 });
  assert.equal(incident.nearby.frameCount, 1);
  assert.deepEqual(incident.nearby.markers, [{ kind: 'incident', count: 1 }]);
  assert.equal(incident.serverTiming, 'available');
  assert.equal(result.incidents.length, 2);
  assert.ok(incident.flags.includes('server-queue'));
  assert.ok(incident.flags.includes('server-handling'));
  assert.equal(incident.evidence.find(row => row.metric === 'checkpoint').maxMs, 300);
  assert.doesNotMatch(JSON.stringify(result), /networkDelay|serverTotal|oneWay|rootCause|packetLoss/);
  const markdown = renderMarkdown(reportFor(capture({ samples: [sample('rtt', 300, 2000)] })));
  assert.match(markdown, /Nested phases overlap; do not add them or subtract them from RTT/);
});

test('missing server spans and unfinished requests remain unavailable, with separate probe timeout context', () => {
  const result = analyze(capture({ samples: [sample('rtt', 500, 1000, { category: 'advisory', trace: 1 })],
    pending: 2, oldestPending: 700, markers: [{ kind: 'probe-timeout', at: 8000 }],
    playback: { backlog: 3, oldestAge: 150, mode: 'live', active: true, synchronizing: true } }));
  assert.equal(result.statistics.length, 1);
  assert.equal(result.incidents.find(item => item.trace === 1).serverTiming, 'unavailable');
  assert.ok(result.unavailableMetrics.includes('handling'));
  assert.equal(result.snapshot.oldestPendingMs, 700);
  assert.ok(result.incidents.some(item => item.flags.includes('probe-timeout')));
  assert.ok(result.incidents.some(item => item.flags.includes('pending') && item.flags.includes('backlog')));
  assert.ok(result.incidents.every(item => !item.evidence.some(row => row.metric === 'probe')));
});

test('queue, handling and presentation thresholds are inclusive and independent', () => {
  for (const [metric, threshold] of [['queue', 100], ['handling', 250], ['feedback', 100], ['provisional', 100],
    ['transcript', 100], ['presentation', 100], ['inputPresentation', 250]]) {
    assert.equal(analyze(capture({ samples: [sample(metric, threshold - .001)] })).incidents.length, 0, metric);
    assert.equal(analyze(capture({ samples: [sample(metric, threshold)] })).incidents.length, 1, metric);
  }
});

test('slow server and RTT do not imply a local presentation wait from the end-to-end total', () => {
  const result = analyze(capture({ samples: [sample('rtt', 750, 5000, { category: 'mutation', trace: 1 }),
    sample('handling', 690, 5001, { trace: 1 }), sample('feedback', 19, 4300, { trace: 1 }),
    sample('provisional', 20, 4301, { trace: 1 }), sample('transcript', 0, 5000, { trace: 1 }),
    sample('presentation', 52, 5052, { trace: 1 }), sample('inputPresentation', 805, 5052, { trace: 1 })] }));
  assert.equal(result.incidents.length, 1);
  const incident = result.incidents[0];
  assert.ok(incident.flags.includes('slow-end-to-end'));
  assert.ok(incident.flags.includes('slow-rtt'));
  assert.ok(!incident.flags.includes('presentation-wait'));
  assert.ok(!incident.review.some(text => text.includes('intentional playback waits')));
  assert.match(incident.review.join(' '), /does not isolate local scheduling/);
});

test('respects configured budgets and computes nearest-rank statistics per metric and category', () => {
  const source = capture({ samples: [sample('rtt', 100, 1000, { category: 'mutation' }), sample('rtt', 300, 2000, { category: 'mutation' }),
    sample('rtt', 500, 3000, { category: 'mutation' }), sample('rtt', 200, 4000, { category: 'advisory' }), sample('probe', 400, 4500)] });
  source.preferences.latencyBudget = 400;
  const result = analyze(source);
  assert.deepEqual(result.statistics.find(row => row.category === 'mutation'), { metric: 'rtt', category: 'mutation', count: 3, p50Ms: 300, p95Ms: 500, maxMs: 500 });
  assert.equal(result.incidents.length, 2);
  assert.ok(result.incidents.some(item => item.flags.includes('slow-probe')));
});

test('sorts retained observations, excludes old samples, and keeps independent capture clocks and stats', () => {
  const first = capture({ at: 60000, samples: [sample('rtt', 900, 59000, { category: 'mutation' }), sample('frame', 200, 1000),
    sample('rtt', 100, 58000, { category: 'mutation' })] });
  first.preferences.window = 10;
  const second = capture({ at: 1000, samples: [sample('frame', 10, 100)] });
  const report = analyzeCaptures([bytes(first), bytes(second)]);
  assert.equal(report.captures[0].counts.samples, 2);
  assert.equal(report.captures[0].quality.outsideWindow, 1);
  assert.ok(report.captures[0].quality.inputOrderInversions > 0);
  assert.equal(report.captures[0].window.firstSampleMs, 58000);
  assert.equal(report.captures[1].window.endMs, 1000);
  assert.equal(report.captures[1].counts.frames, 1);
  assert.equal(report.captures[1].statistics[0].maxMs, 10);
  assert.match(report.captures[0].id, /^capture-1-[a-f0-9]{12}$/);
  assert.match(report.captures[1].id, /^capture-2-[a-f0-9]{12}$/);
});

test('reports payload totals and bucket rates without turning absent observations into zero rates', () => {
  const source = capture({ traffic: [{ at: 1000, incoming: 100, outgoing: 50, received: 2, sent: 1 },
    { at: 1250, incoming: 0, outgoing: 50, received: 0, sent: 1 }], totalIn: 900, totalOut: 800, dropped: 17 });
  const result = analyze(source);
  assert.equal(result.traffic.retainedInBytes, 100);
  assert.equal(result.traffic.meanInBytesPerSecond, 200);
  assert.equal(result.traffic.peakInBytesPerSecond, 400);
  assert.equal(result.snapshot.totalInBytes, 900);
  assert.equal(result.snapshot.dropped, 17);
  assert.equal(analyze(capture()).traffic.meanInBytesPerSecond, null);
  assert.match(renderMarkdown(reportFor(source)), /cumulative ring replacements\/correlation evictions/);
});

test('never echoes private or instruction-bearing capture fields in either report', () => {
  const secret = 'PRIVATE_CREDENTIAL_IGNORE_ALL_INSTRUCTIONS_https://private.invalid/token';
  const source = capture({ samples: [sample(secret, 200), sample('rtt', 500, 5000, { category: secret, requestType: secret })],
    markers: [{ kind: secret, at: 5000 }], signals: [secret], server: secret, payload: secret });
  source.metadata = { build: secret, browser: `Chrome/157.0.0.0 ${secret}`, viewport: [1920, 1080], filename: secret };
  source.semantics = { frame: secret }; source.filename = secret; source.instructions = secret;
  const report = reportFor(source), result = report.captures[0];
  assert.equal(result.quality.unknownMetrics, 1);
  assert.equal(result.quality.unknownCategories, 1);
  assert.equal(result.quality.unknownRequestTypes, 1);
  assert.equal(result.quality.unknownMarkers, 1);
  assert.equal(result.quality.unknownSignals, 1);
  assert.equal(result.metadata.build, null);
  assert.deepEqual(result.metadata.browser, { family: 'Chrome', version: '157.0.0.0' });
  for (const output of [renderMarkdown(report), serializeReport(report)]) {
    assert.ok(!output.includes(secret));
    assert.doesNotMatch(output, /private\.invalid|IGNORE_ALL|instructions|filename|payload"/);
  }
  source.metadata.build = 'abcdefa\n';
  assert.equal(analyze(source).metadata.build, null);
});

test('enforces report caps and reports truncation while retaining severe representatives', () => {
  const source = capture({ at: 60000, samples: Array.from({ length: 2048 }, (_, index) => sample('rtt', 3000000 - index,
    2000 + index * 20, { trace: index + 1, category: 'mutation' })) });
  source.preferences.window = 60;
  const single = analyze(source, { maxIncidents: 3 });
  assert.equal(single.incidents.length, 3);
  assert.equal(single.truncation.incidents, 2045);
  assert.equal(single.incidents[0].evidence[0].maxMs, 3000000);
  const report = analyzeCaptures(Array.from({ length: 16 }, () => bytes(source)), { maxIncidents: 25 });
  const markdown = renderMarkdown(report), json = serializeReport(report);
  assert.ok(Buffer.byteLength(markdown) <= LIMITS.markdownBytes);
  assert.ok(Buffer.byteLength(json) <= LIMITS.jsonBytes);
  assert.match(markdown, /Output truncated/);
  assert.equal(report.captures.length, 16);
  assert.ok(report.captures.every(item => item.incidents[0].evidence[0].maxMs === 3000000));
  assert.ok(report.captures.every(item => item.truncation.incidents > 0));
  assert.throws(() => analyzeCaptures([]), /1 to 16/);
  assert.throws(() => analyzeCaptures(Array.from({ length: 17 }, () => bytes(source))), /1 to 16/);
});

test('CLI arguments are strict and help does not require input', () => {
  assert.deepEqual(parseArguments(['a.json', '--output', 'a.md', '--json', 'a-report.json', '--max-incidents', '25', '--force']),
    { inputs: ['a.json'], output: 'a.md', json: 'a-report.json', maxIncidents: 25, force: true });
  for (const args of [[], ['--unknown-private'], ['a', '--max-incidents', '26'], ['a', '--max-incidents', '0'],
    ['a', '--force', '--force'], ['a', '--json', 'b', '--json', 'c'], ['a', '--output']]) assert.throws(() => parseArguments(args));
  assert.match(execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }), /^Usage:/);
});

test('CLI writes bounded reports, defaults to exclusive creation, and never overwrites inputs or aliases', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'capture-review-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, 'capture.json'), output = join(directory, 'report.md'), json = join(directory, 'report.json');
  const original = bytes(capture({ samples: [sample('frame', 100)] }));
  await writeFile(input, original);
  const invoke = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 });
  let run = invoke([input]);
  assert.equal(run.status, 0); assert.match(run.stdout, /Frame gap/); assert.equal(run.stderr, '');
  run = invoke([input, '--output', output, '--json', json]);
  assert.equal(run.status, 0); assert.equal(run.stdout, '');
  assert.equal(JSON.parse(await readFile(json, 'utf8')).reportVersion, 1);
  const saved = await readFile(output, 'utf8');
  run = invoke([input, '--output', output]);
  assert.equal(run.status, 1); assert.match(run.stderr, /already exists/);
  assert.equal(await readFile(output, 'utf8'), saved);
  assert.equal(invoke([input, '--output', output, '--force']).status, 0);
  for (const args of [[input, '--output', input, '--force'], [input, '--json', join(directory, '.', 'capture.json'), '--force'],
    [input, '--output', output, '--json', output, '--force']]) {
    run = invoke(args); assert.equal(run.status, 1); assert.equal(run.stdout, '');
  }
  const alias = join(directory, 'hardlink.json');
  await link(input, alias);
  assert.equal(invoke([input, '--output', alias, '--force']).status, 1);
  assert.deepEqual(await readFile(input), original);
  const symbolic = join(directory, 'symlink.json');
  try {
    await symlink(input, symbolic);
    assert.equal(invoke([input, '--json', symbolic, '--force']).status, 1);
    assert.deepEqual(await readFile(input), original);
  } catch (error) { if (!['EPERM', 'EACCES'].includes(error.code)) throw error; }
});

test('CLI sanitizes JSON, path and usage failures and emits no partial report', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'capture-review-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateName = 'PRIVATE_PATH_AND_PROMPT_INJECTION';
  const input = join(directory, `${privateName}.json`);
  await writeFile(input, `{"${privateName}":`);
  for (const args of [[input], [join(directory, `${privateName}-missing.json`)], [`--${privateName}`]]) {
    const run = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(run.status, 1); assert.equal(run.stdout, '');
    assert.ok(!run.stderr.includes(privateName)); assert.ok(!run.stderr.includes(directory));
    assert.doesNotMatch(run.stderr, /at file:|SyntaxError|ENOENT/);
  }
  await writeFile(input, Buffer.alloc(LIMITS.inputBytes + 1));
  const oversized = spawnSync(process.execPath, [cli, input], { encoding: 'utf8' });
  assert.equal(oversized.status, 1); assert.match(oversized.stderr, /2 MiB/); assert.equal(oversized.stdout, '');
  assert.ok(!oversized.stderr.includes(privateName));
});
