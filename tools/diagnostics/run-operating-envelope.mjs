import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, totalmem, release } from 'node:os';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { reviewMountSource } from '../review-mount-source.mjs';

// Run from the measured checkout. Only a newly created synthetic schema is owned.
const directory = resolve(process.argv[2] ?? '.tools/envelope-final');
mkdirSync(directory, { recursive: true });
if (existsSync(resolve(directory, 'measurement.json'))) throw Error('Choose a new capture directory');
const run = (program, args, options = {}) => execFileSync(program, args, { encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
const [db] = JSON.parse(run('docker', ['inspect', 'ffb-match-review-database-1']));
if (db.Config.Labels['com.docker.compose.project'] !== 'ffb-match-review') throw Error('Wrong database ownership');
const sql = input => run('docker', ['exec', '-i', db.Id, 'sh', '-c', 'export MYSQL_PWD; IFS= read -r MYSQL_PWD < /run/secrets/db_root_password; exec mariadb --user=root --batch --skip-column-names'], { input });
if (sql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='ffb_envelope_test'") !== '0') throw Error('Synthetic schema already exists; refusing to overwrite');
const manifest = {
  revision: run('git', ['rev-parse', 'HEAD']), status: run('git', ['status', '--porcelain']), started: new Date().toISOString(),
  os: release(), cpu: cpus()[0].model, logicalProcessors: cpus().length, hostMemoryBytes: totalmem(), node: process.version,
  databaseImage: db.Config.Image, databaseImageId: db.Image, containerMemoryLimit: db.HostConfig.Memory, containerNanoCpus: db.HostConfig.NanoCpus,
  database: 'isolated schema on shared idle dev-local MariaDB, TCP proxy loopback; unpooled Connector/J; connect500/socket1500/lock1000ms',
  command: 'tools/target-build.ps1 test -Module ffb-server -Test OperatingEnvelopeTest',
  cleanup: false,
};
writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
const resourceSamples = [];
const seedFile = resolve(process.env.ENVELOPE_SEED_FILE ?? '.tools/envelope-seed.json');
if (!existsSync(seedFile)) writeFileSync(seedFile, gunzipSync(readFileSync('ffb-server/src/test/resources/operating-envelope/synthetic-turn.json.gz')));
manifest.toolchain = JSON.parse(readFileSync('tools/target-build-toolchain.json', 'utf8'));
manifest.sourceHashes = Object.fromEntries([
  'ffb-server/src/test/java/com/fumbbl/ffb/server/match/OperatingEnvelopeTest.java',
  'ffb-server/src/test/java/com/fumbbl/ffb/server/match/EnvelopeDatabaseProxy.java',
  'ffb-server/src/test/java/com/fumbbl/ffb/server/local/EnvelopeTransportProbe.java',
  'ffb-server/src/test/resources/operating-envelope/synthetic-turn.json.gz',
  'tools/diagnostics/run-operating-envelope.mjs', 'tools/diagnostics/summarize-operating-envelope.mjs',
].map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
sql('CREATE DATABASE ffb_envelope_test CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');
let timer;
try {
  const env = { ...process.env, ENVELOPE_TEST_URL: 'jdbc:mariadb://127.0.0.1:23317/ffb_envelope_test',
    ENVELOPE_TEST_PASSWORD: readFileSync(reviewMountSource(db, '/run/secrets/db_root_password'), 'utf8').trim(),
    ENVELOPE_TEST_OUTPUT: resolve(directory, 'measurement.json'), ENVELOPE_SEED_FILE: seedFile };
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/target-build.ps1', 'test', '-Module', 'ffb-server', '-Test', 'OperatingEnvelopeTest'], { env, stdio: 'inherit', windowsHide: true });
  timer = setInterval(() => {
    const pidFile = resolve(directory, 'java-pid.txt'); if (!existsSync(pidFile)) return;
    const pid = readFileSync(pidFile, 'utf8').trim(); if (!/^\d+$/.test(pid)) throw Error('Invalid measurement PID');
    try {
      resourceSamples.push({ at: new Date().toISOString(), javaRssBytes: Number(run('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).WorkingSet64`])),
        database: JSON.parse(run('docker', ['stats', '--no-stream', '--format', '{{json .}}', db.Id])) });
    } catch { /* Process exit is recorded by child status; no fabricated sample. */ }
  }, 2000);
  manifest.exitCode = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', resolveExit); });
  process.exitCode = manifest.exitCode ?? 1;
} finally {
  clearInterval(timer); sql('DROP DATABASE ffb_envelope_test'); manifest.cleanup = true; manifest.finished = new Date().toISOString();
  writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(resolve(directory, 'external-resources.json'), JSON.stringify(resourceSamples, null, 2));
  console.log('Owned synthetic envelope schema removed');
}
