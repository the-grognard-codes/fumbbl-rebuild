import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { validateRecoveryTarget, decodeRecoveryRecord, recoveryComparable, terminalRecoveryViews, retainedRecoveryResults } from '../../browser-client/test/v2-process-recovery.mjs';

test('recovery refuses review/production containers and nonisolated storage or ports', () => {
  const database = { Name: '/ffb-v2-acceptance-database-1', Config: { Labels: {
    'com.docker.compose.project': 'ffb-v2-acceptance', 'com.docker.compose.service': 'database',
  } }, Mounts: [{ Destination: '/var/lib/mysql', Type: 'volume', Name: 'ffb-v2-acceptance_database' }] };
  validateRecoveryTarget(database, 'database');
  assert.throws(() => validateRecoveryTarget({ ...database, Name: '/ffb-match-review-database-1' }, 'database'));
  assert.throws(() => validateRecoveryTarget({ ...database, Mounts: [{ ...database.Mounts[0], Name: 'production' }] }, 'database'));
  const server = { Name: '/ffb-v2-acceptance-server-1', Config: { Labels: {
    'com.docker.compose.project': 'ffb-v2-acceptance', 'com.docker.compose.service': 'server',
  } }, HostConfig: { PortBindings: { '22227/tcp': [{ HostIp: '127.0.0.1', HostPort: '22235' }] } } };
  validateRecoveryTarget(server, 'server');
  server.HostConfig.PortBindings['22227/tcp'][0].HostIp = '0.0.0.0';
  assert.throws(() => validateRecoveryTarget(server, 'server'));
});

test('reads retained plain and compressed recovery metadata while rejecting unsupported envelopes', () => {
  const raw = JSON.stringify({ payload: { pendingTerminal: true, homeView: { revision: 12 } } });
  const packed = { $codec: 'ffb-match-gzip-json', version: 1, decodedBytes: Buffer.byteLength(raw), payload: gzipSync(raw).toString('base64') };
  assert.deepEqual(decodeRecoveryRecord(raw), decodeRecoveryRecord(JSON.stringify(packed)));
  assert.throws(() => decodeRecoveryRecord(JSON.stringify({ ...packed, version: 2 })));
  assert.throws(() => decodeRecoveryRecord(JSON.stringify({ ...packed, decodedBytes: 1 })));
});

test('comparison preserves authoritative state and role while ignoring sampled timing', () => {
  const view = { revision: 4, callerRole: 'home', clock: { now: 1 }, reaction: { serverNow: 1, deadline: 42 }, players: [] };
  assert.deepEqual(recoveryComparable(view), { revision: 4, callerRole: 'home', reaction: { deadline: 42 }, players: [] });
  assert.equal(view.reaction.serverNow, 1);
});

test('terminal checkpoint comparison includes the restored public save/resume projection', () => {
  const payload = { pendingTerminal: true, homeView: { phase: 'FULL_TIME', callerRole: 'home' },
    awayView: { phase: 'FULL_TIME', callerRole: 'away' }, saveResume: { suspendedAt: -1, abandoned: false, proposal: null } };
  const views = terminalRecoveryViews(payload);
  assert.deepEqual(views[0].saveResume, { status: 'ACTIVE', proposalId: null, proposer: null, expiresAt: null });
  assert.equal(views[1].callerRole, 'away');
  assert.equal(payload.homeView.saveResume, undefined);
  assert.throws(() => terminalRecoveryViews({ ...payload, pendingTerminal: false }));
});

test('resume refuses recovery evidence from another match or incomplete assertions', () => {
  const matchId = '00000000-0000-0000-0000-000000000001';
  const record = { matchId, point: 'pending-decision', exitCode: 137, exactRetry: true,
    participantsRestored: 2, storageUnchanged: true, storageFingerprint: 'a'.repeat(64) };
  assert.deepEqual(retainedRecoveryResults([record], matchId), [record]);
  assert.throws(() => retainedRecoveryResults([record], '00000000-0000-0000-0000-000000000002'));
  assert.throws(() => retainedRecoveryResults([{ ...record, exactRetry: false }], matchId));
  assert.throws(() => retainedRecoveryResults([record, record], matchId));
});
