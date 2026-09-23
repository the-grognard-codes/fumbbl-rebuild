import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EXPECTED_ENGINE, EXPECTED_RECOVERY_FORMAT, EXPECTED_REPLAY_FORMAT, EXPECTED_RUNTIME, EXPECTED_TABLES, MANIFEST_FORMAT, BackupContractError, assertNewDestination, manifestDigest, validateManifest, writeFailedOutput } from '../r5-backup-lib.mjs';

async function completeFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'r5-backup-'));
  const raw = Buffer.from('CREATE TABLE ffb_local_schema (version INT);\nINSERT INTO ffb_local_schema VALUES (6);\n');
  await writeFile(join(directory, 'database.sql'), raw);
  const manifest = {
    format: MANIFEST_FORMAT, status: 'COMPLETE', runtime: { adapter: EXPECTED_RUNTIME, engine: EXPECTED_ENGINE },
    formats: { replay: EXPECTED_REPLAY_FORMAT, recovery: EXPECTED_RECOVERY_FORMAT, browserProtocol: '/browser/v2' }, schema: { marker: 6 }, boundary: { tables: EXPECTED_TABLES },
    fixtures: [{ kind: 'paused-server-decision' }, { kind: 'completed-match' }], files: [{ name: 'database.sql', bytes: raw.length, sha256: (await import('../r5-backup-lib.mjs')).sha256(raw) }]
  };
  manifest.manifestSha256 = manifestDigest(manifest);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  return { directory, manifest };
}

test('accepts a complete current-runtime manifest', async () => {
  const { directory } = await completeFixture();
  assert.equal((await validateManifest(join(directory, 'manifest.json'))).status, 'COMPLETE');
});

test('rejects corruption and truncation', async () => {
  const { directory } = await completeFixture();
  await writeFile(join(directory, 'database.sql'), 'corrupt');
  await assert.rejects(validateManifest(join(directory, 'manifest.json')), BackupContractError);
  const { directory: truncated } = await completeFixture();
  await writeFile(join(truncated, 'database.sql'), (await readFile(join(truncated, 'database.sql'))).subarray(0, 4));
  await assert.rejects(validateManifest(join(truncated, 'manifest.json')), BackupContractError);
});

test('rejects unsupported runtime versions', async () => {
  const { directory, manifest } = await completeFixture();
  manifest.runtime.adapter = 'ffb-unknown'; manifest.manifestSha256 = manifestDigest(manifest);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(validateManifest(join(directory, 'manifest.json')), BackupContractError);
});

test('refuses existing output destinations', async () => {
  const { directory } = await completeFixture();
  await assert.rejects(assertNewDestination(directory), BackupContractError);
});

test('failed output is never a complete manifest', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'r5-failed-'));
  const directory = join(parent, 'failed');
  await writeFailedOutput(directory, 'simulated dump failure');
  const failed = JSON.parse(await readFile(join(directory, 'FAILED.json'), 'utf8'));
  assert.equal(failed.status, 'FAILED');
  await assert.rejects(validateManifest(join(directory, 'manifest.json')));
});
