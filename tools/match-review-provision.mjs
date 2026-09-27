// One-time, target-only provision of the isolated signed-in match review database.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const source = 'ffb-current-dev-database-1';
const target = 'ffb-match-review-database-1';
const sql = 'exec mariadb -uroot -p"$(cat /run/secrets/db_root_password)" --batch --raw --skip-column-names ffb_local';
const query = async (container, statement) => (await run('docker', ['exec', container, 'sh', '-c', `${sql} -e '${statement}'`],
  { windowsHide: true, maxBuffer: 1024 * 1024 })).stdout.trim();

if (process.argv.length !== 2) throw Error('Usage: node tools/match-review-provision.mjs');
const inspect = JSON.parse((await run('docker', ['inspect', '--type', 'container', source, target],
  { windowsHide: true, maxBuffer: 1024 * 1024 })).stdout);
const byName = new Map(inspect.map(container => [container.Name.slice(1), container]));
const oldContainer = byName.get(source), newContainer = byName.get(target);
assert.ok(oldContainer?.State?.Running && newContainer?.State?.Running, 'Both exact database containers must be running');
const dataMount = container => {
  const mounts = container.Mounts.filter(mount => mount.Destination === '/var/lib/mysql');
  assert.equal(mounts.length, 1, 'Each database must have one inspectable data volume');
  assert.equal(mounts[0].Type, 'volume', 'Review data must be in a named volume');
  return mounts[0].Name;
};
assert.notEqual(dataMount(oldContainer), dataMount(newContainer), 'Source and target volumes must differ');
assert.match(dataMount(newContainer), /^ffb-match-review_database$/, 'Target is not the isolated review volume');
assert.equal(await query(source, 'SELECT version FROM ffb_local_schema'), '7', 'Source must be marker 7');
assert.equal(await query(target, 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()'), '0',
  'Review target must be empty; never overwrite a provisioned database');
const dump = spawn('docker', ['exec', source, 'sh', '-c',
  'exec mariadb-dump -uroot -p"$(cat /run/secrets/db_root_password)" --single-transaction --quick --skip-lock-tables --hex-blob ffb_local'],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const importDb = spawn('docker', ['exec', '-i', target, 'sh', '-c', sql],
    { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
dump.stdout.pipe(importDb.stdin);
let dumpError = '', importError = '';
dump.stderr.on('data', chunk => { dumpError += chunk.toString().slice(0, 2000); });
importDb.stderr.on('data', chunk => { importError += chunk.toString().slice(0, 2000); });
const exit = child => new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve(code));
});
const [dumpCode, importCode] = await Promise.all([exit(dump), exit(importDb)]);
assert.equal(dumpCode, 0, `Source snapshot failed: ${dumpError}`);
assert.equal(importCode, 0, `Review import failed: ${importError}`);
assert.equal(await query(target, 'SELECT version FROM ffb_local_schema'), '7', 'Imported schema marker mismatch');

// Only the verified new volume is changed. Keep identities/scopes and saved teams;
// old match documents and checkpoints stay solely in the retained source database.
const hasConsent = await query(target, 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name="ffb_match_spectator_consent"') === '1';
await query(target, `START TRANSACTION;
DELETE FROM ffb_match_recovery;
${hasConsent ? 'DELETE FROM ffb_match_spectator_consent;' : ''}
DELETE FROM ffb_v2_preparation_requests;
DELETE FROM ffb_v2_preparation_invites;
DELETE FROM ffb_v2_match_members;
DELETE FROM ffb_prepared_matches;
COMMIT;`);
const counts = await query(target, `SELECT
  (SELECT COUNT(*) FROM ffb_match_recovery),
  (SELECT COUNT(*) FROM ffb_v2_preparation_requests),
  (SELECT COUNT(*) FROM ffb_v2_preparation_invites),
  (SELECT COUNT(*) FROM ffb_v2_match_members),
  (SELECT COUNT(*) FROM ffb_prepared_matches)`);
assert.equal(counts, '0\t0\t0\t0\t0', 'Review match tables were not cleared');
if (hasConsent) assert.equal(await query(target, 'SELECT COUNT(*) FROM ffb_match_spectator_consent'), '0');
console.log('Isolated review schema verified at marker 7; match tables empty; accounts and teams retained.');
