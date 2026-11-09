export function serverTraceFixture() {
  return { version: 1, correlation: 'abcdef0123456789abcdef0123456789', requestType: 'setup', operation: 'movement', originUtcMs: 123456,
    queueMs: 2, handlingMs: 20, spans: [{ phase: 'DB_COMMIT', startMs: 10, durationMs: 5 }],
    totals: { DB_COMMIT: { ms: 5, count: 1 } }, values: { historyRequests: 128, storageInputBytes: 1024, storageOutputBytes: 128 },
    write: { status: 'completed', queueMs: 3, durationMs: 4, completedMs: 25 }, droppedSpans: 0,
    timing: { queueWaitMs: 2, handlingMs: 18, authorizationMs: 1, sessionApplyMs: 2, checkpointMs: 15, recoverySerializeMs: 5, checkpointSqlMs: 5 } };
}
