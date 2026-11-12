import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function distribution(values) {
  if (!values.every(value => Number.isFinite(value) && value >= 0)) throw Error('Invalid latency sample');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = percentile => sorted.length ? sorted[Math.ceil(sorted.length * percentile) - 1] : null;
  return { count: sorted.length, p50: rank(.5), p95: rank(.95), p99: rank(.99), max: rank(1) };
}

export function summarize(data) {
  const samples = data.finalTransport.samples;
  const tasks = selection => ({ executionMs: distribution(selection.map(s => s.executionNanos / 1e6)),
    queueMs: distribution(selection.map(s => s.queueNanos / 1e6)), above250ms: selection.filter(s => s.executionNanos > 250e6).length,
    above2000ms: selection.filter(s => s.executionNanos > 2000e6).length });
  const summarizeRequests = rows => {
    const outcomes = {};
    for (const row of rows) outcomes[row.code] = (outcomes[row.code] ?? 0) + 1;
    const lobbyReads = rows.filter(row => ['browse', 'currentMatches'].includes(row.type));
    return {
      allOutcomesEndToEndMs: distribution(rows.map(row => row.endToEndMs)), outcomes,
      acceptedActionsMs: distribution(rows.filter(row => row.operation === 'action' && row.code === 'ACCEPTED').map(row => row.endToEndMs)),
      admittedLobbyReadsMs: distribution(lobbyReads.filter(row => row.code === 'ACCEPTED').map(row => row.endToEndMs)),
      rejectedLobbyReadsMs: distribution(lobbyReads.filter(row => row.code !== 'ACCEPTED').map(row => row.endToEndMs))
    };
  };
  const byPhase = {};
  for (const phase of new Set(data.requests.map(row => row.phase))) {
    byPhase[phase] = summarizeRequests(data.requests.filter(row => row.phase === phase));
  }
  const expected = data.finalTransport.metrics.workerTasks.reduce((sum, row) => sum + row.count, 0);
  const taskPhases = {};
  const boundaries = data.phaseBoundaries ?? [];
  for (let index = 0; index < boundaries.length; index++) {
    const start = boundaries[index].sequence, end = boundaries[index + 1]?.sequence ?? Infinity;
    taskPhases[boundaries[index].phase] = tasks(samples.filter(s => s.sequence >= start && s.sequence < end));
  }
  const healthyRanges = boundaries.flatMap((boundary, index) => /^healthy-[0-9]+$/.test(boundary.phase)
    ? [{ start: boundary.sequence, end: boundaries[index + 1]?.sequence ?? Infinity }] : []);
  const healthySamples = samples.filter(sample => healthyRanges.some(range => sample.sequence >= range.start && sample.sequence < range.end));
  const healthyRequests = data.requests.filter(row => /^healthy-[0-9]+$/.test(row.phase));
  return { allTasks: tasks(samples), kinds: Object.fromEntries([0, 1, 2, 3].map(kind => [kind, tasks(samples.filter(s => s.kind === kind))])),
    missingSamples: data.finalTransport.missingSamples, expectedTasks: expected, capturedTasks: samples.length,
    completeTaskCoverage: expected === samples.length && data.finalTransport.missingSamples === 0,
    byPhase, taskPhases, healthy: { tasks: tasks(healthySamples), requests: summarizeRequests(healthyRequests) }, reconnectMs: distribution(data.reconnectEndToEndMs === undefined ? [] : [data.reconnectEndToEndMs]),
    heapBytes: distribution(data.resources.map(s => s.heapBytes)),
    processCpuSeconds: data.resources.length > 1 ? (data.resources.at(-1).processCpuNanos - data.resources[0].processCpuNanos) / 1e9 : null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(process.argv[2]);
  const summary = summarize(JSON.parse(readFileSync(resolve(directory, 'measurement.json'), 'utf8')));
  writeFileSync(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ allTasks: summary.allTasks, completeTaskCoverage: summary.completeTaskCoverage }, null, 2));
}
