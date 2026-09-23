// R5 restore adapter. Imports only a validated backup into a new, empty, isolated target.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { BackupContractError, EXPECTED_ENGINE, EXPECTED_RECOVERY_FORMAT, EXPECTED_REPLAY_FORMAT, EXPECTED_RUNTIME } from './r5-backup-lib.mjs';
import { EXPECTED_TABLES, assertCompatibleRuntime, assertDistinctMounts, assertDumpParity, assertEmptyDestination, rawBackup, sanitizedTableDigest } from './r5-restore-lib.mjs';

const run = promisify(execFile);
const docker = process.env.DOCKER_EXE ?? (process.platform === 'win32' ? resolve(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe') : 'docker');
const sourceDatabase = process.env.R5_SOURCE_DATABASE_CONTAINER;
const destinationDatabase = process.env.R5_RESTORE_DATABASE_CONTAINER;
const destinationApplication = process.env.R5_RESTORE_APPLICATION_CONTAINER;
const backupDirectory = process.env.R5_BACKUP_DIRECTORY && resolve(process.env.R5_BACKUP_DIRECTORY);
const evidenceDirectory = process.env.R5_RESTORE_EVIDENCE && resolve(process.env.R5_RESTORE_EVIDENCE);
assert.ok(sourceDatabase && destinationDatabase && destinationApplication && backupDirectory && evidenceDirectory, 'Set R5_SOURCE_DATABASE_CONTAINER, R5_RESTORE_DATABASE_CONTAINER, R5_RESTORE_APPLICATION_CONTAINER, R5_BACKUP_DIRECTORY, and a new R5_RESTORE_EVIDENCE');
assert.equal(process.argv.length, 2, 'Usage: node tools/r5-restore.mjs');
assert.notEqual(sourceDatabase, destinationDatabase, 'Source and restore database containers must differ');
const options = { windowsHide: true, maxBuffer: 8 * 1024 * 1024 };
const lines = value => value ? value.split(/\r?\n/) : [];
const inspect = async (kind, name) => JSON.parse((await run(docker, ['inspect', '--type', kind, name], options)).stdout)[0];
const sql = async (container, statement) => (await run(docker, ['exec', container, 'sh', '-c', `exec mariadb -uroot -p"$(cat /run/secrets/db_root_password)" --batch --raw --skip-column-names ffb_local -e ${JSON.stringify(statement)}`], options)).stdout.trim();
const databaseMounts = container => (container.Mounts ?? []).filter(mount => mount.Destination === '/var/lib/mysql');
const backupMounts = container => (container.Mounts ?? []).filter(mount => mount.Destination === '/data/backup');

async function dump(container) {
  return await new Promise((resolveDump, rejectDump) => {
    const child = spawn(docker, ['exec', container, 'sh', '-c', 'exec mariadb-dump -uroot -p"$(cat /run/secrets/db_root_password)" --databases ffb_local --single-transaction --skip-lock-tables --routines --events --triggers --hex-blob --skip-comments'], { windowsHide: true });
    const output = []; const errors = [];
    child.stdout.on('data', chunk => output.push(chunk)); child.stderr.on('data', chunk => errors.push(chunk)); child.on('error', rejectDump);
    child.on('close', code => code === 0 ? resolveDump(Buffer.concat(output)) : rejectDump(new BackupContractError(`Post-restore dump failed (${code}): ${Buffer.concat(errors).toString('utf8').slice(0, 200)}`)));
  });
}

async function importDatabase(raw) {
  await new Promise((resolveImport, rejectImport) => {
    const child = spawn(docker, ['exec', '-i', destinationDatabase, 'sh', '-c', 'exec mariadb -uroot -p"$(cat /run/secrets/db_root_password)"'], { windowsHide: true });
    const errors = []; child.stderr.on('data', chunk => errors.push(chunk)); child.on('error', rejectImport);
    child.on('close', code => code === 0 ? resolveImport() : rejectImport(new BackupContractError(`Database import failed (${code}): ${Buffer.concat(errors).toString('utf8').slice(0, 200)}`)));
    child.stdin.end(raw);
  });
}

async function provisionRuntimeDatabaseUser() {
  const existing = await sql(destinationDatabase, "SELECT COUNT(*) FROM mysql.user WHERE user='ffb_m6_runtime';");
  if (existing !== '0') throw new BackupContractError('Restore destination already has the runtime database user');
  await sql(destinationDatabase, "CREATE USER 'ffb_m6_runtime'@'%' IDENTIFIED BY '$(cat /run/secrets/db_password)'; GRANT SELECT, INSERT, UPDATE, DELETE ON ffb_local.* TO 'ffb_m6_runtime'@'%'; FLUSH PRIVILEGES;");
}

async function verifyRestoredSchema() {
  if (await sql(destinationDatabase, 'SELECT version FROM ffb_local_schema;') !== '6') throw new BackupContractError('Restored schema marker differs');
  const tables = lines(await sql(destinationDatabase, "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY table_name;"));
  if (tables.join('|') !== EXPECTED_TABLES.join('|')) throw new BackupContractError('Restored database has an unsupported table set');
  const runtime = lines(await sql(destinationDatabase, "SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(artifact_json, '$.payload.runtimeVersion')),JSON_UNQUOTE(JSON_EXTRACT(artifact_json, '$.payload.engineVersion')),JSON_UNQUOTE(JSON_EXTRACT(artifact_json, '$.payload.recoveryVersion')),JSON_UNQUOTE(JSON_EXTRACT(artifact_json, '$.payload.replayVersion')) FROM ffb_match_recovery ORDER BY 1,2,3,4;"));
  const expected = `${EXPECTED_RUNTIME}\t${EXPECTED_ENGINE}\t${EXPECTED_RECOVERY_FORMAT}\t${EXPECTED_REPLAY_FORMAT}`;
  if (runtime.length !== 1 || runtime[0] !== expected) throw new BackupContractError('Restored recovery compatibility identifiers differ');
  return { tableDigest: sanitizedTableDigest(tables), runtimeDigest: sanitizedTableDigest(runtime) };
}

const manifestPath = resolve(backupDirectory, 'manifest.json');
const { manifest, raw } = await rawBackup(manifestPath);
await mkdir(dirname(evidenceDirectory), { recursive: true });
await mkdir(evidenceDirectory, { recursive: false });
try {
  const [source, destination, application, image] = await Promise.all([
    inspect('container', sourceDatabase), inspect('container', destinationDatabase), inspect('container', destinationApplication), inspect('image', manifest.runtime.artifact.image)
  ]);
  if (!source.State?.Running || !destination.State?.Running) throw new BackupContractError('Both source and destination database containers must be running for storage checks');
  if (application.State?.Running) throw new BackupContractError('Restore application must be stopped until parity passes');
  const sourceStorage = [...databaseMounts(source), ...backupMounts(await inspect('container', process.env.R5_SOURCE_APPLICATION_CONTAINER ?? 'ffb-local-m6-server-1'))];
  const destinationStorage = [...databaseMounts(destination), ...backupMounts(application)];
  if (databaseMounts(source).length !== 1 || databaseMounts(destination).length !== 1 || backupMounts(application).length !== 1) throw new BackupContractError('Unsupported source or restore storage layout');
  assertDistinctMounts(sourceStorage, destinationStorage);
  assertEmptyDestination(lines(await sql(destinationDatabase, 'SHOW TABLES;')));
  assertCompatibleRuntime(manifest, image.RepoTags?.[0] ?? manifest.runtime.artifact.image, image.Id, await sql(destinationDatabase, 'SELECT VERSION();'));
  const startedAtUtc = new Date().toISOString(); const start = process.hrtime.bigint();
  await importDatabase(raw);
  const endedAtUtc = new Date().toISOString(); const elapsedMilliseconds = Number(process.hrtime.bigint() - start) / 1e6;
  await provisionRuntimeDatabaseUser();
  const direct = await verifyRestoredSchema();
  assertDumpParity(await dump(destinationDatabase), manifest);
  const evidence = {
    format: 'ffb-current-runtime-restore-evidence/v1', status: 'COMPLETE', startedAtUtc, endedAtUtc, elapsedMilliseconds,
    sourceBackupManifestSha256: manifest.manifestSha256, restoredPayloadSha256: manifest.files[0].sha256,
    schemaMarker: manifest.schema.marker, runtime: { adapter: manifest.runtime.adapter, engine: manifest.runtime.engine, catalog: manifest.runtime.catalog, image: manifest.runtime.artifact.image, imageId: manifest.runtime.artifact.imageId },
    formats: manifest.formats, fixtures: manifest.fixtures, directParity: { dumpSha256: manifest.files[0].sha256, tableDigest: direct.tableDigest, recoveryRuntimeDigest: direct.runtimeDigest },
    configurationReferences: manifest.configuration.secretReferences.map(reference => reference.includes('/') ? reference.split('/').at(-1) : reference)
  };
  await writeFile(resolve(evidenceDirectory, 'restore.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  console.log(`PASS R5 restore imported and direct database parity passed in ${elapsedMilliseconds.toFixed(3)} ms`);
} catch (error) {
  await writeFile(resolve(evidenceDirectory, 'FAILED.json'), `${JSON.stringify({ format: 'ffb-current-runtime-restore-evidence/v1', status: 'FAILED', reason: String(error.message).replace(/[\r\n]/g, ' ').slice(0, 300) }, null, 2)}\n`, { flag: 'wx' }).catch(() => {});
  throw error;
}
