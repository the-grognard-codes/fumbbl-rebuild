import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribution, summarize } from './summarize-operating-envelope.mjs';

test('nearest rank includes maxima, small samples and empty groups', () => {
  assert.deepEqual(distribution([10, 1, 4, 2]), { count: 4, p50: 2, p95: 10, p99: 10, max: 10 });
  assert.equal(distribution([]).p99, null);
  assert.throws(() => distribution([NaN]));
});
test('control work, failures and missing ring samples remain visible', () => {
  const result = summarize({ finalTransport: { samples: [{ kind: 0, executionNanos: 10e6, queueNanos: 2e6 },
    { kind: 3, executionNanos: 2100e6, queueNanos: 3e6 }], missingSamples: 1, metrics: { workerTasks: [{ count: 3 }] } },
    requests: [{ phase: 'outage', code: 'PERSISTENCE_FAILED', operation: 'load', endToEndMs: 1800 },
      { phase: 'outage', code: 'TIMEOUT_OR_CLOSED', operation: 'load', endToEndMs: 10000 }], resources: [], reconnectEndToEndMs: 125 });
  assert.equal(result.completeTaskCoverage, false);
  assert.equal(result.allTasks.executionMs.p99, 2100);
  assert.equal(result.kinds[3].above2000ms, 1);
  assert.equal(result.byPhase.outage.allOutcomesEndToEndMs.count, 2);
  assert.equal(result.byPhase.outage.outcomes.TIMEOUT_OR_CLOSED, 1);
  assert.deepEqual(result.reconnectMs, { count: 1, p50: 125, p95: 125, p99: 125, max: 125 });
});


test('admitted lobby latency excludes throttled work without hiding its outcomes', () => {
  const result = summarize({ finalTransport: { samples: [], missingSamples: 0, metrics: { workerTasks: [] } }, resources: [],
    requests: [{ phase: 'healthy', type: 'browse', code: 'ACCEPTED', endToEndMs: 200 },
      { phase: 'healthy', type: 'currentMatches', code: 'RATE_LIMITED', endToEndMs: 1 }] });
  assert.equal(result.byPhase.healthy.admittedLobbyReadsMs.p99, 200);
  assert.equal(result.byPhase.healthy.rejectedLobbyReadsMs.count, 1);
  assert.equal(result.byPhase.healthy.allOutcomesEndToEndMs.count, 2);
  assert.equal(result.byPhase.healthy.outcomes.RATE_LIMITED, 1);
});


test('workload warmup remains in full accounting and is excluded from measured healthy distributions', () => {
  const samples = [{ sequence: 1, kind: 0, executionNanos: 1500e6, queueNanos: 0 },
    { sequence: 2, kind: 0, executionNanos: 10e6, queueNanos: 0 }];
  const result = summarize({ finalTransport: { samples, missingSamples: 0, metrics: { workerTasks: [{ count: 2 }] } }, resources: [],
    phaseBoundaries: [{ phase: 'workload-warmup', sequence: 1 }, { phase: 'healthy-0', sequence: 2 }],
    requests: [{ phase: 'workload-warmup', type: 'setup', operation: 'action', code: 'ACCEPTED', endToEndMs: 1600 },
      { phase: 'healthy-0', type: 'setup', operation: 'action', code: 'ACCEPTED', endToEndMs: 20 }] });
  assert.equal(result.allTasks.executionMs.p99, 1500);
  assert.equal(result.healthy.tasks.executionMs.p99, 10);
  assert.equal(result.healthy.requests.acceptedActionsMs.p99, 20);
  assert.equal(result.byPhase['workload-warmup'].acceptedActionsMs.p99, 1600);
  assert.equal(result.completeTaskCoverage, true);
});
