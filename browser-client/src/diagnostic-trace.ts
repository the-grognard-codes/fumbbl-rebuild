/** Shared bounded schema for browser capture and offline analysis. No payload/SQL/identity fields. */
export const serverPhases = ['SESSION_APPLY','CHECKPOINT','AUTHORIZATION','FIREBASE_LOOKUP','RECOVERY_SERIALIZE','CHECKPOINT_STORE','STORAGE_ENCODE','CHECKPOINT_SQL','PUBLICATION','RECOVERY_RESTORE','LOCAL_AUTHORIZATION','FIREBASE_REUSE','RECOVERY_CURSOR','RECOVERY_FINGERPRINT','DB_CONNECT','DB_READ','DB_WRITE','DB_COMMIT','DB_ROLLBACK','STORAGE_DECODE','STORAGE_COMPRESSION','STORAGE_DECOMPRESSION','RESPONSE_SERIALIZE'] as const;
export const traceValues = ['revision','half','turn','historyRequests','events','nativeCommands','transcriptRecords','journalEntries','journalBytes','checkpointPath','storageInputBytes','storageOutputBytes','storageReadBytes','storageDecodedBytes','responseBytes','predecessorBytes','predecessorDropped','actionKind','responseAccepted','duplicate'] as const;
export const clientPhases = ['parse','validate','notify','transcript','receive','responseToCommit'] as const;
export const traceRequests = ['setup','routePreview','movementPreview','movementRange','matchTranscript','watch','currentMatches','browse','catalog','diagnostics'];
const traceOperations = ['load','action','choice','place','formation','confirm','route','movement','concede','saveRequest','saveAccept','saveReject','saveCancel','resumeRequest','resumeAccept','resumeReject','resumeCancel','read','probe'];
export type ClientPhase = typeof clientPhases[number];
export type ClientSpan = { at: number; phase: ClientPhase; durationMs: number; trace?: number; revision?: number };
export type ServerTrace = { version: 1; correlation: string; requestType: string; operation: string; originUtcMs: number; queueMs: number; handlingMs: number;
  spans: { phase: typeof serverPhases[number]; startMs: number; durationMs: number }[];
  totals: Partial<Record<typeof serverPhases[number], { ms: number; count: number }>>;
  values: Partial<Record<typeof traceValues[number], number>>;
  write: { status: 'completed'|'failed'|'closed'|'timeout'|'rejected'|'unavailable'; completedMs: number; queueMs?: number; durationMs?: number };
  droppedSpans: number; timing?: Record<string, number> };
export type ServerObservation = { at: number; trace: number; server: ServerTrace };
export type DiagnosticDetails = { version: 1; status: 'unavailable'|'negotiating'|'enabled'; server: ServerObservation[]; client: ClientSpan[]; droppedServer: number; droppedClient: number };

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function number(value: unknown, max = 3_600_000): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max; }
function count(value: unknown): value is number { return number(value, Number.MAX_SAFE_INTEGER) && Number.isSafeInteger(value); }
const timingFields = ['queueWaitMs','handlingMs','authorizationMs','sessionApplyMs','checkpointMs','recoverySerializeMs','checkpointSqlMs'];
export function decodeServerTrace(value: unknown): ServerTrace | null {
  if (!object(value) || !keys(value, ['version','correlation','requestType','operation','originUtcMs','queueMs','handlingMs','spans','totals','values','write','droppedSpans'], ['timing'])
    || value.version !== 1 || typeof value.correlation !== 'string' || !/^[a-f0-9]{32}$/.test(value.correlation)
    || typeof value.requestType !== 'string' || !traceRequests.includes(value.requestType) || typeof value.operation !== 'string' || !traceOperations.includes(value.operation)
    || !count(value.originUtcMs) || !number(value.queueMs) || !number(value.handlingMs) || !count(value.droppedSpans)
    || !Array.isArray(value.spans) || value.spans.length > 48 || !object(value.totals) || !object(value.values) || !object(value.write)) return null;
  for (const span of value.spans) if (!object(span) || !keys(span, ['phase','startMs','durationMs'])
    || !serverPhases.includes(span.phase as typeof serverPhases[number]) || !number(span.startMs) || !number(span.durationMs)) return null;
  for (const [phase, total] of Object.entries(value.totals)) if (!serverPhases.includes(phase as typeof serverPhases[number])
    || !object(total) || !keys(total, ['ms','count']) || !number(total.ms) || !count(total.count)) return null;
  for (const [key, item] of Object.entries(value.values)) if (!traceValues.includes(key as typeof traceValues[number]) || !count(item)) return null;
  for (const [key, maximum] of [['checkpointPath', 3], ['actionKind', 7], ['responseAccepted', 1], ['duplicate', 1], ['predecessorDropped', 1]] as const)
    if (value.values[key] !== undefined && (value.values[key] as number) > maximum) return null;
  const write = value.write;
  if (!keys(write, ['status','completedMs'], ['queueMs','durationMs'])
    || typeof write.status !== 'string' || !['completed','failed','closed','timeout','rejected','unavailable'].includes(write.status) || !number(write.completedMs)
    || ['queueMs','durationMs'].some(key => write[key] !== undefined && !number(write[key]))) return null;
  if (value.timing !== undefined && (!object(value.timing) || !keys(value.timing, timingFields) || Object.values(value.timing).some(item => !number(item)))) return null;
  // Explicitly project primitives; even a non-enumerable toJSON must never run.
  return { version: 1, correlation: value.correlation, requestType: value.requestType, operation: value.operation,
    originUtcMs: value.originUtcMs, queueMs: value.queueMs, handlingMs: value.handlingMs,
    spans: value.spans.map(span => ({ phase: span.phase, startMs: span.startMs, durationMs: span.durationMs })),
    totals: Object.fromEntries(Object.entries(value.totals).map(([phase, total]) => { const row = total as { ms: number; count: number }; return [phase, { ms: row.ms, count: row.count }]; })),
    values: Object.fromEntries(Object.entries(value.values).map(([key, item]) => [key, item as number])),
    write: { status: write.status as ServerTrace['write']['status'], completedMs: write.completedMs,
      ...(write.queueMs === undefined ? {} : { queueMs: write.queueMs as number }), ...(write.durationMs === undefined ? {} : { durationMs: write.durationMs as number }) },
    droppedSpans: value.droppedSpans, ...(value.timing === undefined ? {} : { timing: Object.fromEntries(timingFields.map(key => [key, (value.timing as Record<string, number>)[key]])) }) };
}
export function decodeDiagnosticDetails(value: unknown): DiagnosticDetails | null {
  if (!object(value) || !keys(value, ['version','status','server','client','droppedServer','droppedClient']) || value.version !== 1
    || typeof value.status !== 'string' || !['unavailable','negotiating','enabled'].includes(value.status) || !count(value.droppedServer) || !count(value.droppedClient)
    || !Array.isArray(value.server) || value.server.length > 64 || !Array.isArray(value.client) || value.client.length > 512) return null;
  const server: ServerObservation[] = [];
  for (const item of value.server) {
    if (!object(item) || !keys(item, ['at','trace','server']) || !number(item.at, Number.MAX_SAFE_INTEGER) || !count(item.trace)) return null;
    const trace = decodeServerTrace(item.server); if (!trace) return null;
    server.push({ at: item.at, trace: item.trace, server: trace });
  }
  const client: ClientSpan[] = [];
  for (const item of value.client) {
    if (!object(item) || !keys(item, ['at','phase','durationMs'], ['trace','revision']) || !number(item.at, Number.MAX_SAFE_INTEGER)
      || !clientPhases.includes(item.phase as ClientPhase) || !number(item.durationMs) || ['trace','revision'].some(key => item[key] !== undefined && !count(item[key]))) return null;
    client.push({ at: item.at, phase: item.phase as ClientPhase, durationMs: item.durationMs,
      ...(item.trace === undefined ? {} : { trace: item.trace as number }), ...(item.revision === undefined ? {} : { revision: item.revision as number }) });
  }
  return { version: 1, status: value.status as DiagnosticDetails['status'], server, client, droppedServer: value.droppedServer, droppedClient: value.droppedClient };
}
