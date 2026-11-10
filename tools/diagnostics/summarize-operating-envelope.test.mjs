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
