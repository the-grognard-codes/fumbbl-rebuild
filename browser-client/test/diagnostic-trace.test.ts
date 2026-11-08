import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodeServerTrace, decodeDiagnosticDetails, serverPhases, traceValues } from '../src/diagnostic-trace.ts';
import { PerformanceDiagnostics } from '../src/performance-diagnostics.ts';

import { serverTraceFixture } from './diagnostic-trace-fixture.ts';
test('browser and native phase vocabulary shares the checked contract', () => {
  const contract = JSON.parse(readFileSync(new URL('./fixtures/diagnostic-contract.json', import.meta.url), 'utf8'));
  assert.deepEqual(serverPhases, contract.serverPhases); assert.deepEqual(traceValues, contract.traceValues);
});
test('detail schema rejects private fields, unsupported versions, invalid metrics and oversized spans', () => {
  const valid = serverTraceFixture(); assert.deepEqual(decodeServerTrace(valid), valid);
  for (const invalid of [{ ...valid, version: 2 }, { ...valid, secret: 'bearer' }, { ...valid, values: { matchId: 123 } },
    { ...valid, spans: Array(49).fill(valid.spans[0]) }, { ...valid, write: { ...valid.write, status: 'unknown' } },
    { ...valid, totals: { DB_COMMIT: { ms: -1, count: 1 } } }, { ...valid, operation: 'private-token' },
    { ...valid, values: { checkpointPath: 4 } }, { ...valid, values: { actionKind: 8 } }, { ...valid, values: { duplicate: 2 } }]) assert.equal(decodeServerTrace(invalid), null);
});
test('explicit projection does not call nested or root toJSON hooks', () => {
  const valid = serverTraceFixture();
  for (const object of [valid, valid.values, valid.spans[0], valid.write, valid.totals.DB_COMMIT])
    Object.defineProperty(object, 'toJSON', { value: () => { throw Error('secret serialization hook'); }, enumerable: false });
  assert.doesNotThrow(() => JSON.stringify(decodeServerTrace(valid)));
});
test('collector details are opt-in, bounded, redacted and retain matching post-response traces', () => {
  let now = 0; const service = new PerformanceDiagnostics(() => now);
  service.setMode('counters'); service.processing('unknown', 'parse', 0, 1);
  assert.equal(service.snapshot().details?.client.length, 0, 'Lightweight mode collects no detail spans');
  service.update({ ...service.preferences, details: true }); service.detailStatus = 'enabled'; service.server = 'enabled';
  for (let index = 0; index < 80; index++) {
    const id = `private-request-${index}`; service.sent(id, 'setup', 'movement', true); now++;
    service.response(id, index); service.serverTrace(id, serverTraceFixture()); service.processing(id, 'notify', now, 3, index); service.commit(index);
  }
  for (let index = 0; index < 600; index++) service.processing(null, 'parse', now, 0);
  const snapshot = service.snapshot();
  assert.equal(snapshot.details?.server.length, 64); assert.equal(snapshot.details?.droppedServer, 16);
  assert.equal(snapshot.details?.client.length, 512); assert.ok(snapshot.details!.droppedClient > 0);
  const exported = service.export(snapshot), decoded = JSON.parse(exported);
  assert.equal(decoded.formatVersion, 2); assert.ok(decodeDiagnosticDetails(decoded.capture.details));
  assert.equal(exported.includes('private-request'), false);
  assert.ok(decoded.capture.details.server.every((entry: { trace: number }) => Number.isSafeInteger(entry.trace)));
  service.setMode('off'); service.serverTrace('private-request-79', serverTraceFixture()); service.processing(null, 'parse', now, 1);
  assert.equal(service.snapshot().details?.client.length, 512); service.reset(); assert.equal(service.snapshot().details?.server.length, 0);
});
test('malformed capture detail shapes fail closed', () => {
  assert.equal(decodeDiagnosticDetails({ version: 1, status: 'enabled', server: [], client: [{ at: 0, phase: 'parse', durationMs: 1, payload: 'secret' }], droppedServer: 0, droppedClient: 0 }), null);
});
