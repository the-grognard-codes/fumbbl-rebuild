import assert from 'node:assert/strict';
import test from 'node:test';
import { distribution, summarizeGameplayPerformance } from './gameplay-performance-observer.mjs';
test('distributions retain incomplete cohorts and negative transcript ordering', () => {
  assert.deepEqual(distribution([]), { count: 0, mean: null, p50: null, p95: null, max: null });
  assert.deepEqual(distribution([3, 1, 2, NaN]), { count: 3, mean: 2, p50: 2, p95: 3, max: 3 });
  const report = summarizeGameplayPerformance([
    { kind: 'trace', documentId: 'one', requestId: 'a', phase: 'PLAY', operation: 'action', actionKind: 'move', sentAt: 100,
      responseAt: 120, transcriptAt: 110, movementPaintAt: 150, code: 'ACCEPTED' },
    { kind: 'trace', documentId: 'two', requestId: 'a', phase: 'PLAY', operation: 'action', actionKind: 'block', sentAt: 200 },
    { kind: 'motion', documentId: 'one', requestId: 'a', at: 130, x: 10, y: 20 },
  ]);
  assert.equal(report.traces.length, 2, 'Reloaded documents cannot collide');
  assert.equal(report.coverage.blocks.accepted, 0);
  assert.equal(report.coverage.rolls.requested, 0);
  assert.deepEqual(report.routeMotion[0].samples, [[130, 10, 20]]);
  assert.equal(report.distributionsMs['PLAY/action/move'].responseToTranscriptMs.mean, -10);
  assert.equal(report.distributionsMs['PLAY/action/move'].requiredDataToMovementPaintOpportunityMs.mean, 30);
});
