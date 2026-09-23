// R5 current-runtime backup adapter. It never starts/stops containers or overwrites storage.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { BackupContractError, EXPECTED_ENGINE, EXPECTED_RECOVERY_FORMAT, EXPECTED_REPLAY_FORMAT, EXPECTED_RUNTIME, EXPECTED_SCHEMA_MARKER, EXPECTED_TABLES, MANIFEST_FORMAT, assertNewDestination, fileDigest, manifestDigest, sha256, validateManifest, writeFailedOutput } from './r5-backup-lib.mjs';

const run = promisify(execFile);
const docker = process.env.DOCKER_EXE ?? (process.platform === 'win32' ? resolve(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe') : 'docker');
const database = process.env.R5_DATABASE_CONTAINER;
const application = process.env.R5_APPLICATION_CONTAINER;
const destination = process.env.R5_BACKUP_DESTINATION && resolve(process.env.R5_BACKUP_DESTINATION);
assert.ok(database && application && destination, 'Set R5_DATABASE_CONTAINER, R5_APPLICATION_CONTAINER, and a new R5_BACKUP_DESTINATION');
assert.equal(process.argv.length, 2, 'Usage: node tools/r5-backup.mjs');
assert.notEqual(database, application, 'Database and application containers must differ');
const options = { windowsHide: true, maxBuffer: 8 * 1024 * 1024 };
const secretCommand = command => ['exec', database, 'sh', '-c', command];
const sql = async statement => (await run(docker, secretCommand(`exec mariadb -uroot -p"$(cat /run/secrets/db_root_password)" --batch --raw --skip-column-names ffb_local -e ${JSON.stringify(statement)}`), options)).stdout.trim();
const inspect = async name => JSON.parse((await run(docker, ['inspect', '--type', 'container', name], options)).stdout)[0];
const lines = value => value ? value.split(/\r?\n/) : [];

async function dump(path) {
  await new Promise((resolveDump, rejectDump) => {
    const child = spawn(docker, secretCommand('exec mariadb-dump -uroot -p"$(cat /run/secrets/db_root_password)" --databases ffb_local --single-transaction --skip-lock-tables --routines --events --triggers --hex-blob --skip-comments'), { windowsHide: true });
    const output = []; const errors = [];
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.on('data', chunk => errors.push(chunk));
    child.on('error', rejectDump);
    child.on('close', async code => {
      if (code !== 0) return rejectDump(new BackupContractError(`Database dump failed (${code}): ${Buffer.concat(errors).toString('utf8').slice(0, 200)}`));
      try {
        const data = Buffer.concat(output);
        if (data.length === 0 || !data.includes(Buffer.from('CREATE TABLE'))) throw new BackupContractError('Database dump is incomplete');
        await writeFile(path, data, { flag: 'wx' });
        resolveDump();
      } catch (error) { rejectDump(error); }
    });
  });
}

async function preflight() {
  const [db, app] = await Promise.all([inspect(database), inspect(application)]);
  if (!db.State?.Running) throw new BackupContractError('Database container is not running');
  if (app.State?.Running) throw new BackupContractError('Writes are not quiesced: stop the application container before backup');
  const dbMounts = (db.Mounts ?? []).filter(mount => mount.Destination === '/var/lib/mysql');
  if (dbMounts.length !== 1) throw new BackupContractError('Database container has an unsupported storage layout');
  if (await sql('SELECT version FROM ffb_local_schema;') !== String(EXPECTED_SCHEMA_MARKER)) throw new BackupContractError('Unsupported database schema marker');
  const tables = lines(await sql("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY table_name;"));
  if (tables.join('|') !== EXPECTED_TABLES.join('|')) throw new BackupContractError('Unknown or unsupported database tables');
  if (await sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type <> 'BASE TABLE'; SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=DATABASE(); SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema=DATABASE(); SELECT COUNT(*) FROM information_schema.events WHERE event_schema=DATABASE();") !== '0\n0\n0\n0') throw new BackupContractError('Unsupported schema object exists');
  const runtimeRows = lines(await sql("SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(artifact_json, '$.payload.runtimeVersion')), JSON_UNQUOTE(JSON_EXTRACT(artifact_json, '$.payload.engineVersion')), JSON_UNQUOTE(JSON_EXTRACT(artifact_json, '$.payload.recoveryVersion')), JSON_UNQUOTE(JSON_EXTRACT(artifact_json, '$.payload.replayVersion')) FROM ffb_match_recovery ORDER BY 1,2,3,4;"));
  const runtimeTuple = `${EXPECTED_RUNTIME}\t${EXPECTED_ENGINE}\t${EXPECTED_RECOVERY_FORMAT}\t${EXPECTED_REPLAY_FORMAT}`;
  if (runtimeRows.length !== 1 || runtimeRows[0] !== runtimeTuple) throw new BackupContractError('Unknown recovery runtime, engine, recovery, or replay version');
  // Do not extract native/dice/decision values: these non-sensitive flags establish a resumable, non-terminal server-owned decision boundary.
  const fixtures = lines(await sql("SELECT r.matchid, r.generation, JSON_UNQUOTE(JSON_EXTRACT(r.artifact_json, '$.payload.pendingTerminal')), JSON_CONTAINS_PATH(r.artifact_json, 'one', '$.payload.native') FROM ffb_match_recovery r JOIN ffb_prepared_matches p ON p.match_id=r.matchid WHERE p.document_version=3 ORDER BY r.generation DESC;"));
  const paused = fixtures.find(row => row.endsWith('\tfalse\t1'));
  const completed = lines(await sql("SELECT match_id, JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.formatVersion')), JSON_CONTAINS_PATH(document_json, 'one', '$.completion') FROM ffb_prepared_matches WHERE document_version=4 ORDER BY match_id;")).find(row => row.endsWith('\t2\t1'));
  if (!paused || !completed) throw new BackupContractError('Required current-version paused/completed fixture is absent');
  return {
    database: { containerId: db.Id, image: db.Config?.Image, dataMount: dbMounts[0].Name ?? dbMounts[0].Source ?? null, mariadb: await sql('SELECT VERSION();') },
    application: { containerId: app.Id, image: app.Config?.Image, imageId: app.Image },
    fixtures: [
      { kind: 'paused-server-decision', matchIdSha256: sha256(paused.split('\t')[0]), recoveryGeneration: Number(paused.split('\t')[1]) },
      { kind: 'completed-match', matchIdSha256: sha256(completed.split('\t')[0]) }
    ]
  };
}

await mkdir(dirname(destination), { recursive: true });
await assertNewDestination(destination);
try {
  const boundary = await preflight();
  await mkdir(destination, { recursive: false });
  const partial = resolve(destination, 'database.sql.partial');
  await dump(partial);
  const raw = resolve(destination, 'database.sql');
  await rename(partial, raw);
  const rawStat = await stat(raw);
  const configPaths = ['containers/local/compose.current-dev.yaml', 'containers/local/server.marker6.ini', 'ffb-server/src/main/resources/local-schema/004-completed-matches.sql', 'ffb-server/src/main/resources/local-schema/005-match-recovery.sql', 'ffb-server/src/main/resources/local-schema/006-v2-membership.sql', 'ffb-server/src/main/resources/local-schema/006-v2-saved-teams.sql', 'ffb-server/src/main/resources/local-schema/006-v2-invitations.sql'];
  const config = await Promise.all(configPaths.map(async path => ({ path, sha256: await fileDigest(resolve(path)) })));
  const manifest = {
    format: MANIFEST_FORMAT, status: 'COMPLETE', createdAtUtc: new Date().toISOString(),
    runtime: { adapter: EXPECTED_RUNTIME, engine: EXPECTED_ENGINE, catalog: 'bb2025-human-2026-09-08.1', artifact: boundary.application },
    formats: { replay: EXPECTED_REPLAY_FORMAT, recovery: EXPECTED_RECOVERY_FORMAT, browserProtocol: '/browser/v2' },
    schema: { marker: EXPECTED_SCHEMA_MARKER, database: boundary.database },
    boundary: { writeQuiesced: true, tables: EXPECTED_TABLES, includes: ['identities-and-scopes', 'memberships-and-invitations', 'frozen-teams', 'prepared-and-completed-matches', 'replay', 'pending-decisions', 'recovery-and-retry'] },
    configuration: { publicFiles: config, secretReferences: ['containers/local/.secrets/db_password', 'containers/local/.secrets/db_root_password', 'containers/local/.secrets/admin_password', 'containers/local/.secrets/coach_password', 'M6_ADC_FILE'] },
    fixtures: boundary.fixtures,
    files: [{ name: 'database.sql', bytes: rawStat.size, sha256: await fileDigest(raw) }]
  };
  manifest.manifestSha256 = manifestDigest(manifest);
  const manifestPath = resolve(destination, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  await validateManifest(manifestPath);
  console.log(`PASS complete R5 backup created at ${destination}`);
} catch (error) {
  try { await writeFailedOutput(destination, error.message); } catch (failedOutputError) { if (!(error instanceof BackupContractError) && failedOutputError.code !== 'EEXIST') throw failedOutputError; }
  throw error;
}
