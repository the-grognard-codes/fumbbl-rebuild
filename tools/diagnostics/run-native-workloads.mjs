// Explicit local-only evidence runner. Uses empty dedicated test schemas, never ffb_local.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewMountSource } from '../review-mount-source.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, process.env.CAPTURE_WORKLOAD_OUTPUT ?? '.tools/performance-followup/native');
if (process.env.CAPTURE_CHECKPOINT_INITIAL) assert.ok(existsSync(resolve(process.env.CAPTURE_CHECKPOINT_INITIAL)),
  'An explicitly selected starting artifact must already exist; refuse to create an unmatched baseline');
mkdirSync(output, { recursive: true });
const [database] = JSON.parse(execFileSync('docker', ['inspect', '--type', 'container', 'ffb-match-review-database-1'], { encoding: 'utf8', windowsHide: true }));
assert.equal(database.Config.Labels['com.docker.compose.project'], 'ffb-match-review');
assert.equal(database.Config.Labels['com.docker.compose.service'], 'database');
assert.equal(database.State.Running, true);
assert.deepEqual(database.HostConfig.PortBindings['3306/tcp'], [{ HostIp: '127.0.0.1', HostPort: '23317' }]);
const query = input => execFileSync('docker', ['exec', '-i', database.Id, 'sh', '-c',
  'export MYSQL_PWD; IFS= read -r MYSQL_PWD < /run/secrets/db_root_password; exec mariadb --user=root --batch --skip-column-names'],
{ input, encoding: 'utf8', windowsHide: true }).trim();
for (const name of ['ffb_capture_auth_test', 'ffb_recovery_journal_test']) {
  assert.equal(query(`SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${name}';`), '0', 'Dedicated test schema must be empty');
  query(`CREATE DATABASE IF NOT EXISTS ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`);
}
const password = readFileSync(reviewMountSource(database, '/run/secrets/db_root_password'), 'utf8').trim();
const env = { ...process.env, CAPTURE_AUTH_TEST_JDBC_URL: 'jdbc:mariadb://127.0.0.1:23317/ffb_capture_auth_test',
  CAPTURE_AUTH_TEST_PASSWORD: password, CAPTURE_AUTH_TEST_OUTPUT: resolve(output, 'authorization.json'),
  RECOVERY_JOURNAL_TEST_JDBC_URL: 'jdbc:mariadb://127.0.0.1:23317/ffb_recovery_journal_test', RECOVERY_JOURNAL_TEST_PASSWORD: password,
  CAPTURE_CHECKPOINT_INITIAL: resolve(process.env.CAPTURE_CHECKPOINT_INITIAL ?? resolve(output, 'initial-checkpoint.json')),
  CAPTURE_CHECKPOINT_OUTPUT: resolve(output, 'checkpoint.json'),
  CAPTURE_BROWSER_FIXTURE: resolve(output, 'native-board.json'), CAPTURE_CHECKPOINT_CEILING_MS: '1000' };
const test = 'CaptureCheckpointWorkloadTest,JdbcAuthorizationMariaDbTest,RecoveryJournalMariaDbTest';
const result = spawnSync(process.env.CAPTURE_POWERSHELL ?? 'powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(root, 'tools/target-build.ps1'),
  'test', '-Module', 'ffb-server', '-Test', test], { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.error) throw Error('Native workload process did not start');
process.exitCode = result.status ?? 1;
