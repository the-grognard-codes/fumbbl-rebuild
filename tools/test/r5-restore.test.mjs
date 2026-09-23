import assert from 'node:assert/strict';
import test from 'node:test';
import { BackupContractError, EXPECTED_TABLES } from '../r5-backup-lib.mjs';
import { assertCompatibleRuntime, assertDistinctMounts, assertDumpParity, assertEmptyDestination } from '../r5-restore-lib.mjs';

const manifest = { schema: { marker: 6, database: { mariadb: '11.8.9-MariaDB-ubu2404' } }, runtime: { artifact: { image: 'ffb-server:3.4.0-current-dev-20260922.1', imageId: 'sha256:runtime' } }, files: [{ bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }] };

test('requires an empty restore destination', () => {
  assert.doesNotThrow(() => assertEmptyDestination([]));
  assert.throws(() => assertEmptyDestination(EXPECTED_TABLES), BackupContractError);
});

test('rejects a runtime or database version different from the manifest', () => {
  assert.doesNotThrow(() => assertCompatibleRuntime(manifest, 'ffb-server:3.4.0-current-dev-20260922.1', 'sha256:runtime', '11.8.9-MariaDB-ubu2404'));
  assert.throws(() => assertCompatibleRuntime(manifest, 'ffb-server:other', 'sha256:runtime', '11.8.9-MariaDB-ubu2404'), BackupContractError);
  assert.throws(() => assertCompatibleRuntime(manifest, 'ffb-server:3.4.0-current-dev-20260922.1', 'sha256:runtime', '11.8.8'), BackupContractError);
});

test('rejects aliased storage and non-identical restored dumps', () => {
  assert.throws(() => assertDistinctMounts([{ type: 'volume', name: 'retained' }], [{ type: 'volume', name: 'retained' }]), BackupContractError);
  assert.doesNotThrow(() => assertDistinctMounts([{ type: 'volume', name: 'retained' }], [{ type: 'volume', name: 'restore' }]));
  assert.doesNotThrow(() => assertDumpParity(Buffer.from('abc'), manifest));
  assert.throws(() => assertDumpParity(Buffer.from('ab'), manifest), BackupContractError);
});
