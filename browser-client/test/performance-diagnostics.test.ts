import assert from 'node:assert/strict';
import test from 'node:test';
import { PerformanceDiagnostics, diagnosticsAvailable, decodeServerTiming, distribution, histogram, loadDiagnosticPreferences } from '../src/performance-diagnostics.ts';
import { serverTraceFixture } from './diagnostic-trace-fixture.ts';
import { V2Client } from '../src/v2-client.ts';
import { assertV2Projection } from '../src/v2-projection.ts';

function fixture() {
  let at = 0;
  const service = new PerformanceDiagnostics(() => at);
  return { service, advance: (milliseconds: number) => { at += milliseconds; } };
}
test('environment policy fails closed and stored collection mode cannot turn diagnostics on', () => {
  for (const environment of ['prod', '', undefined, 'production', 'DEV']) assert.equal(diagnosticsAvailable(environment), false);
  for (const environment of ['dev', 'local-dev', 'local']) assert.equal(diagnosticsAvailable(environment), true);
  const preferences = loadDiagnosticPreferences({ getItem: () => JSON.stringify({ mode: 'graph', window: 123, frameBudget: -10, latencyBudget: Infinity, tracks: { frame: false }, opacity: 10, textScale: 'large' }) });
  assert.equal(preferences.window, 30); assert.equal(preferences.frameBudget, 1); assert.equal(preferences.opacity, 1); assert.equal(preferences.tracks.frame, false);
  assert.equal(new PerformanceDiagnostics(undefined, preferences).mode, 'off');
});
test('statistics preserve spikes, count samples and use nearest-rank percentiles and labelled bins', () => {
  assert.deepEqual(distribution([]), { count: 0, latest: null, p50: null, p95: null, max: null });
  assert.deepEqual(distribution([10, 10, 10, 120]), { count: 4, latest: 120, p50: 10, p95: 120, max: 120 });
  const bins = histogram([0, 8.34, 16.67, 50, 1001]);
  assert.equal(bins[0].count, 2); assert.equal(bins[1].count, 1); assert.equal(bins[3].count, 1); assert.equal(bins.at(-1)?.count, 1);
});
test('off collects nothing; reset clears retained samples, traffic and correlations', () => {
  const { service, advance } = fixture();
  service.sample('frame', 99); service.payload('in', 100); service.sent('private', 'setup', 'action', true);
  assert.equal(service.snapshot().samples.length, 0); assert.equal(service.snapshot().totalIn, 0);
  service.setMode('graph'); service.sample('frame', 99); service.payload('in', 100); service.sent('private', 'setup', 'action', true); advance(30);
  service.reset(); const snapshot = service.snapshot();
  assert.equal(snapshot.samples.length, 0); assert.equal(snapshot.totalIn, 0); assert.equal(snapshot.pending, 0);
  assert.deepEqual(snapshot.markers.map(marker => marker.kind), ['reset']);
  service.setMode('off'); service.sample('frame', 300); assert.equal(service.snapshot().samples.length, 0);
});
test('request, transcript, feedback and next-frame opportunity have distinct measured boundaries', () => {
  const { service, advance } = fixture(); service.setMode('graph'); service.input(); advance(5);
  service.sent('secret-request', 'setup', 'action', true); advance(10); service.feedback(); service.frame(); advance(85);
  service.response('secret-request', 42); advance(60); service.transcript(42); advance(40);
  service.presented(42, 42, false, false, false, 'live', 1); service.frame(16);
  const values = Object.fromEntries(service.snapshot().samples.map(sample => [sample.kind, sample.value]));
  assert.equal(values.rtt, 95); assert.equal(values.feedback, 15); assert.equal(values.transcript, 60); assert.equal(values.presentation, 40); assert.equal(values.inputPresentation, 200);
  const capture = service.export(); assert.equal(capture.includes('secret-request'), false); assert.ok(capture.includes('"trace":1'));
});
test('unsolicited messages, errors, retries and idle traffic keep honest units and correlations', () => {
  const { service, advance } = fixture(); service.setMode('counters'); service.connection(true);
  const bytes = new TextEncoder().encode('é🏈').length; service.payload('out', bytes); service.payload('in', 100);
  service.sent('retry-id', 'setup', 'action', true); advance(100); service.sent('retry-id', 'setup', 'action', true); advance(20);
  service.response('retry-id', undefined, true); service.response(null); service.response('unrelated');
  assert.equal(service.snapshot().totalOut, 6); assert.equal(service.snapshot().totalIn, 100);
  assert.equal(service.snapshot().samples[0].value, 20); assert.equal(service.snapshot().samples[0].category, 'error');
  advance(1200); service.poll(); const snapshot = service.snapshot(); assert.equal(snapshot.traffic.at(-1)?.incoming, 0); assert.equal(snapshot.connected, true);
});
test('first committed beat is timed before a multi-beat revision finishes, while backlog remains visible', () => {
  const { service, advance } = fixture(); service.setMode('graph'); service.sent('route', 'setup', 'movement', true); advance(100);
  service.response('route', 12); advance(20); service.transcript(12); advance(16);
  service.presented(12, 11, true, false, false, 'live', 1, 12); service.frame(16);
  let snapshot = service.snapshot(); assert.equal(snapshot.playback.backlog, 1); assert.equal(snapshot.samples.find(sample => sample.kind === 'presentation')?.value, 16);
  advance(500); service.presented(12, 12, false, false, false, 'live', 1, 12); service.frame(16);
  snapshot = service.snapshot(); assert.equal(snapshot.samples.filter(sample => sample.kind === 'presentation').length, 1, 'Animation completion does not replace first-presentation timing');
});
test('timeouts do not invent RTT samples or mutate gameplay correlations; probes are bounded', () => {
  const { service, advance } = fixture(); let probes = 0, mutations = false;
  service.attach({ configure: () => {}, probe: () => { probes++; service.sent('probe', 'diagnostics', 'probe', false); }, buffered: () => 0, pendingMutation: () => mutations });
  service.setMode('graph'); service.connection(true); service.server = 'enabled'; service.preferences.probes = true;
  service.sent('gameplay', 'setup', 'action', true); service.poll(); assert.equal(probes, 1);
  advance(1000); service.poll(); assert.equal(probes, 1); advance(4000); service.poll(true);
  assert.equal(service.snapshot().pending, 1); assert.equal(service.snapshot().samples.length, 0);
  assert.ok(service.snapshot().markers.some(marker => marker.kind === 'probe-timeout'));
  mutations = true; service.poll(); assert.equal(probes, 1); mutations = false; service.poll(); assert.equal(probes, 2);
  service.connection(false); advance(1000); service.poll(); assert.equal(probes, 2);
});
test('reconnect and context changes invalidate correlations while preserving bounded incident history', () => {
  const { service, advance } = fixture(); service.setMode('graph'); service.sent('old', 'setup', 'action', true); service.mark('incident');
  service.connection(false); service.connection(true); advance(500); service.response('old', 7); assert.equal(service.snapshot().samples.length, 0);
  service.sent('next', 'setup', 'action', true); service.context(); service.response('next', 8); assert.equal(service.snapshot().samples.length, 0);
  assert.ok(service.snapshot().markers.some(marker => marker.kind === 'incident'));
});
test('frozen traffic buckets are immutable while live traffic keeps arriving in the same quarter-second', () => {
  const { service } = fixture(); service.setMode('graph'); service.payload('in', 32);
  const frozen = service.snapshot(); service.payload('in', 64); service.payload('out', 16);
  assert.equal(frozen.traffic[0].incoming, 32); assert.equal(frozen.traffic[0].outgoing, 0);
  assert.equal(service.snapshot().traffic[0].incoming, 96); assert.equal(service.snapshot().traffic[0].outgoing, 16);
});
test('ring, traffic and correlation caps hold under sustained high rate, expiry and export stay bounded', () => {
  const { service, advance } = fixture(); service.setMode('graph');
  for (let index = 0; index < 20_000; index++) { service.sample('frame', index % 100); service.sample('rtt', index % 500, 'read'); service.sent(`private-${index}`, 'browse', null, false); service.payload('in', 10); advance(5); }
  const snapshot = service.snapshot(60);
  assert.ok(snapshot.samples.length <= 10_240); assert.ok(snapshot.traffic.length <= 241); assert.equal(snapshot.pending, 128); assert.ok(snapshot.dropped > 0);
  assert.ok(new TextEncoder().encode(service.export(snapshot)).length < 2 * 1024 * 1024);
  advance(61_000); assert.equal(service.snapshot().samples.length, 0); assert.equal(service.snapshot().traffic.length, 0);
});
test('timing projection only accepts finite bounded durations with exactly the seven allowlisted fields', () => {
  const valid = { queueWaitMs: 2, handlingMs: 4, authorizationMs: 1, sessionApplyMs: 1, checkpointMs: 2, recoverySerializeMs: 1, checkpointSqlMs: 1 };
  assert.deepEqual(decodeServerTiming(valid), valid);
  for (const value of [{ ...valid, privateGame: 'secret' }, { ...valid, handlingMs: -1 }, { ...valid, handlingMs: Infinity }, { ...valid, queueWaitMs: 3_600_001 }, {}]) assert.equal(decodeServerTiming(value), null);
  assert.throws(() => assertV2Projection({ version: 2, type: 'diagnosticsTiming', requestId: 'id', code: 'ACCEPTED', timing: { ...valid, secret: true } }));
});

class Socket {
  readyState = 1; bufferedAmount = 0; closed = false; sent: Record<string, any>[] = [];
  onopen?: () => void; onmessage?: (event: { data: string }) => void; onclose?: () => void; onerror?: () => void;
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  close() { this.closed = true; }
  reply(message: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify({ version: 2, ...message }) }); }
}
async function clientFixture(notificationDuration = 0) {
  const { service, advance } = fixture(); const sockets: Socket[] = []; const events: Record<string, any>[] = [];
  const client = new V2Client({ url: 'ws://test', getToken: async () => 'never-export-bearer', diagnostics: service,
    makeSocket: () => { const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; }, onChange: event => {
      events.push(event); if (event.type === 'browse') advance(notificationDuration);
    } });
  client.connect(); const socket = sockets.at(-1)!; socket.onopen?.(); await Promise.resolve();
  socket.reply({ type: 'authentication', requestId: socket.sent[0].requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
  return { client, service, advance, socket, events };
}
test('detailed negotiation preserves legacy timing and isolates optional trace failures', async () => {
  const { service, client, socket, advance } = await clientFixture();
  service.update({ ...service.preferences, details: true }); service.setMode('counters');
  const configure = socket.sent.at(-1)!; assert.equal(configure.detailVersion, 1);
  socket.reply({ type: 'diagnostics', requestId: configure.requestId, code: 'ACCEPTED', enabled: true, detailVersion: 1 });
  assert.equal(service.detailStatus, 'enabled');
  const id = client.request('browse'); advance(20); socket.reply({ type: 'browse', requestId: id, code: 'ACCEPTED', matches: [] });
  const trace = { ...serverTraceFixture(), requestType: 'browse', operation: 'read' };
  socket.reply({ type: 'diagnosticsTrace', requestId: id, code: 'ACCEPTED', trace });
  socket.reply({ type: 'diagnosticsTrace', requestId: id, code: 'ACCEPTED', trace });
  assert.equal(service.snapshot().details?.server.length, 1, 'Duplicate optional observations do not skew the report');
  assert.ok(service.snapshot().details?.client.some(span => span.phase === 'parse'));
  assert.ok(service.snapshot().details?.client.some(span => span.phase === 'validate'));
  assert.ok(service.snapshot().details?.client.some(span => span.phase === 'notify'));
  assert.ok(service.snapshot().samples.some(sample => sample.kind === 'handling' && sample.value === 18));
  socket.reply({ type: 'diagnosticsTrace', requestId: id, code: 'ACCEPTED', trace: { ...trace, privateGame: true } });
  assert.equal(socket.closed, false); assert.equal(service.snapshot().details?.server.length, 1);
  service.update({ ...service.preferences, details: false });
  assert.equal(socket.sent.at(-1)?.detailVersion, undefined);
});
test('old servers can accept lightweight fallback without stranding a pending gameplay request', async () => {
  const { service, client, socket } = await clientFixture(); service.update({ ...service.preferences, details: true }); service.setMode('counters');
  socket.reply({ type: 'error', requestId: socket.sent.at(-1)!.requestId, code: 'MALFORMED_MESSAGE' });
  const fallback = socket.sent.at(-1)!; assert.equal(fallback.detailVersion, undefined);
  socket.reply({ type: 'diagnostics', requestId: fallback.requestId, code: 'ACCEPTED', enabled: true });
  assert.equal(service.server, 'enabled'); assert.equal(service.detailStatus, 'unavailable');
  const request = client.request('browse'); socket.reply({ type: 'browse', requestId: request, code: 'ACCEPTED', matches: [] });
  assert.equal(socket.closed, false);
});

test('browser processing measures actual synchronous notification duration and enclosing receive', async () => {
  const { service, client, socket } = await clientFixture(7);
  service.update({ ...service.preferences, details: true }); service.setMode('counters');
  socket.reply({ type: 'diagnostics', requestId: socket.sent.at(-1)!.requestId, code: 'ACCEPTED', enabled: true, detailVersion: 1 });
  const id = client.request('browse'); socket.reply({ type: 'browse', requestId: id, code: 'ACCEPTED', matches: [] });
  const spans = service.snapshot().details!.client.filter(row => row.trace !== undefined);
  assert.equal(spans.find(row => row.phase === 'notify')?.durationMs, 7);
  assert.equal(spans.find(row => row.phase === 'receive')?.durationMs, 7);
  assert.equal(spans.find(row => row.phase === 'parse')?.durationMs, 0);
  assert.equal(spans.find(row => row.phase === 'validate')?.durationMs, 0);
});
test('enabling details after lightweight collection or an Off cycle renegotiates the capability', async () => {
  const { service, socket } = await clientFixture(); service.setMode('counters');
  socket.reply({ type: 'diagnostics', requestId: socket.sent.at(-1)!.requestId, code: 'ACCEPTED', enabled: true });
  service.update({ ...service.preferences, details: true }); assert.equal(socket.sent.at(-1)!.detailVersion, 1);
  socket.reply({ type: 'diagnostics', requestId: socket.sent.at(-1)!.requestId, code: 'ACCEPTED', enabled: true, detailVersion: 1 });
  service.setMode('off'); socket.reply({ type: 'diagnostics', requestId: socket.sent.at(-1)!.requestId, code: 'ACCEPTED', enabled: false });
  service.setMode('counters'); assert.equal(socket.sent.at(-1)!.detailVersion, 1);
});
test('old-server unsupported negotiation and malformed optional telemetry never disrupt ordinary gameplay', async () => {
  const { service, client, socket, advance, events } = await clientFixture();
  service.update({ ...service.preferences, details: true });
  assert.equal(socket.sent.some(message => message.type === 'diagnostics'), false);
  service.setMode('graph'); const configure = socket.sent.at(-1)!; assert.equal(configure.type, 'diagnostics');
  socket.reply({ type: 'error', requestId: configure.requestId, code: 'UNSUPPORTED_MESSAGE' });
  const legacyConfigure = socket.sent.at(-1)!;
  assert.equal(legacyConfigure.detailVersion, undefined);
  socket.reply({ type: 'error', requestId: legacyConfigure.requestId, code: 'UNSUPPORTED_MESSAGE' });
  assert.equal(service.server, 'unavailable'); assert.equal(socket.closed, false); assert.equal(events.some(event => event.code === 'UNSUPPORTED_MESSAGE'), false);
  const read = client.request('browse'); advance(100); socket.reply({ type: 'browse', requestId: read, code: 'ACCEPTED', matches: [] });
  assert.equal(socket.closed, false); assert.ok(service.snapshot().samples.some(sample => sample.kind === 'rtt' && sample.value === 100));
  socket.reply({ type: 'diagnosticsTiming', requestId: read, code: 'ACCEPTED', timing: { secret: 'drop' } });
  assert.equal(socket.closed, false); assert.equal(service.export().includes('never-export-bearer'), false);
  socket.reply({ type: 'browse', requestId: client.request('browse'), code: 'ACCEPTED', matches: [], privateGame: true });
  assert.equal(socket.closed, true, 'Ordinary invalid projections remain fatal');
});
test('negotiated own-request durations survive response order, off stops probes, late optional replies are harmless', async () => {
  const { service, client, socket, advance } = await clientFixture(); service.setMode('graph');
  socket.reply({ type: 'diagnostics', requestId: socket.sent.at(-1)!.requestId, code: 'ACCEPTED', enabled: true }); assert.equal(service.server, 'enabled');
  const read = client.request('browse'); advance(30);
  socket.reply({ type: 'diagnosticsTiming', requestId: read, code: 'ACCEPTED', timing: { queueWaitMs: 2, handlingMs: 8, authorizationMs: 1, sessionApplyMs: 1, checkpointMs: 2, recoverySerializeMs: 1, checkpointSqlMs: 1 } });
  socket.reply({ type: 'browse', requestId: read, code: 'ACCEPTED', matches: [] });
  assert.ok(service.snapshot().samples.some(sample => sample.kind === 'queue' && sample.value === 2));
  service.setMode('off'); const disable = socket.sent.at(-1)!; assert.equal(disable.enabled, false);
  socket.reply({ type: 'diagnostics', requestId: disable.requestId, code: 'ACCEPTED', enabled: false });
  socket.reply({ type: 'diagnostics', requestId: 'late-expired', code: 'ACCEPTED', enabled: true });
  assert.equal(service.enabled, false); assert.equal(socket.closed, false);
});
test('rapid toggles always deliver the final Off request and lost negotiation becomes unavailable', async () => {
  const { service, socket, advance } = await clientFixture();
  service.setMode('graph'); service.setMode('off'); service.setMode('counters'); service.setMode('off');
  assert.equal(socket.sent.at(-1)!.enabled, false); assert.equal(service.enabled, false);
  const requests = socket.sent.filter(message => message.type === 'diagnostics'); assert.equal(requests.length, 4);
  for (const request of requests) socket.reply({ type: 'diagnostics', requestId: request.requestId, code: 'ACCEPTED', enabled: request.enabled });
  assert.equal(socket.closed, false); assert.equal(service.enabled, false);
  service.setMode('graph'); assert.equal(service.server, 'negotiating'); advance(5001); service.poll();
  assert.equal(service.server, 'unavailable'); assert.equal(service.snapshot().pending, 3, 'The three pre-capture startup reads remain pending');
  assert.equal(service.snapshot().oldestPending, null, 'An unobserved pre-capture send time remains unavailable');
});
test('optional diagnostic envelopes enforce V2 without breaking the ordinary connection', async () => {
  const { service, socket } = await clientFixture(); service.setMode('graph');
  const configure = socket.sent.at(-1)!;
  socket.reply({ version: 1, type: 'diagnostics', requestId: configure.requestId, code: 'ACCEPTED', enabled: true });
  assert.equal(service.server, 'unavailable'); assert.equal(socket.closed, false); assert.equal(service.snapshot().samples.length, 0);
  service.server = 'enabled'; service.sent('timed', 'browse', null, false);
  socket.reply({ version: 1, type: 'diagnosticsTiming', requestId: 'timed', code: 'ACCEPTED', timing: { queueWaitMs: 2, handlingMs: 8, authorizationMs: 1, sessionApplyMs: 1, checkpointMs: 2, recoverySerializeMs: 1, checkpointSqlMs: 1 } });
  assert.equal(service.snapshot().samples.length, 0); assert.equal(socket.closed, false);
});
