import { decodeDiagnosticDetails, clientPhases, serverPhases, traceRequests } from '../../browser-client/src/diagnostic-trace.ts';

export function analyzeDetails(raw, samples, window, invalid = false) {
  if (raw === undefined) return { status: invalid ? 'invalid' : 'unavailable', records: [], clientPhases: {}, serverPhases: {}, omittedRecords: 0 };
  if (invalid) throw Error('Inconsistent detail quality flag.');
  const details = decodeDiagnosticDetails(raw);
  if (!details) throw Error('Malformed diagnostic details.');
  const server = details.server.filter(row => row.at >= window.startMs && row.at <= window.endMs);
  const client = details.client.filter(row => row.at <= window.endMs && row.at + row.durationMs >= window.startMs);
  const stats = values => {
    const sorted = values.toSorted((a,b) => a-b);
    return { count: sorted.length, p50Ms: sorted.length ? sorted[Math.ceil(sorted.length * .5)-1] : null,
      p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * .95)-1] : null, maxMs: sorted.at(-1) ?? null };
  };
  const responses = [...new Map(samples.filter(sample => sample.kind === 'rtt' && sample.trace !== null && traceRequests.includes(sample.requestType))
    .map(sample => [sample.trace, sample])).values()];
  const traceGraceMs = 2000;
  const unknown = sample => sample.category === 'error' && sample.serverTraceExpected === undefined;
  const eligible = responses.filter(sample => sample.serverTraceExpected !== false && !unknown(sample));
  const observed = new Set(server.map(row => row.trace));
  const selected = server.toSorted((a,b) => Math.max(b.server.handlingMs, b.server.write.completedMs) - Math.max(a.server.handlingMs, a.server.write.completedMs)).slice(0, 8);
  return { status: details.status, serverRecords: server.length, clientRecords: client.length,
    missingServerResponses: details.status === 'enabled' ? eligible.filter(sample => !observed.has(sample.trace) && window.endMs - sample.at >= traceGraceMs).length : null,
    pendingServerResponses: details.status === 'enabled' ? eligible.filter(sample => !observed.has(sample.trace) && window.endMs - sample.at < traceGraceMs).length : null,
    notTracedServerResponses: responses.filter(sample => sample.serverTraceExpected === false).length, traceGraceMs,
    unknownTraceEligibilityResponses: responses.filter(unknown).length,
    droppedServer: details.droppedServer, droppedClient: details.droppedClient,
    truncatedServerSpans: server.reduce((sum,row) => sum + row.server.droppedSpans, 0), omittedRecords: server.length - selected.length,
    clientPhases: Object.fromEntries(clientPhases.map(phase => [phase, stats(client.filter(row => row.phase === phase).map(row => row.durationMs))])),
    serverPhases: Object.fromEntries(serverPhases.map(phase => [phase, stats(server.flatMap(row => row.server.totals[phase] ? [row.server.totals[phase].ms] : []))])),
    records: selected.map(row => { const spans = client.filter(span => span.trace === row.trace);
      return { ...row, client: spans.slice(0, 16), omittedClientSpans: Math.max(0, spans.length - 16) }; }) };
}
