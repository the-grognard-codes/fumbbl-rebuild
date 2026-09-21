// Render the reviewed DEV installation procedure with explicit PROD bindings.
// Creates a fresh artifact directory; never reads/copies secrets or database rows.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const verify = process.argv[2] === '--verify';
assert.ok(process.argv.length === 2 || verify && process.argv.length === 3);
const output = resolve('.tools/prod-release-20260921');
if (!verify) { await mkdir(output); await mkdir(resolve(output, 'checks')); }
const substitutions = new Map([
  ['/dev/null', '/dev/null'],
  ['dev-moles-under-the-pitch-org', 'molesunderthepitch-dotorg'],
  ['molesunderthepitch-dotorg', 'dev-moles-under-the-pitch-org'],
  ['game-dev.molesunderthepitch.org', 'game.molesunderthepitch.org'],
  ['game.molesunderthepitch.org', 'game-dev.molesunderthepitch.org'],
  ['https://dev.molesunderthepitch.org', 'https://molesunderthepitch.org'],
  ['https://molesunderthepitch.org', 'https://dev.molesunderthepitch.org'],
  ['SHA256:FhCH988zxP9JTmqwLLiCNVM2NgwcAxNGgZAft+fGIwQ', 'SHA256:PNZPt68IIoJWgc+xWTiN/CTIUI4yx6+8fGrOzUmsRlQ'],
  ['22339', '22340'], ['DEV', 'PROD'], ['Dev', 'Prod'], ['dev', 'prod']
]);
const pattern = new RegExp([...substitutions.keys()].map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const names = ['provision-dev-database.py', 'test-provision-dev.py', 'stage-dev-runtime.sh',
  'activate-dev-proxy.sh', 'inspect-retained-dev.sh', 'dev-cert-renewal.sh', 'dev-mariadb.cnf',
  'moles-game-v2-dev.service', 'DevIdentityMigration.java', 'DevIdentityMigrationTest.java',
  'check-dev-adc.py', 'check-dev-private-logs.py', 'live-dev-test.mjs', 'live-dev-client-test.mjs'];
const hashes = {};
for (const name of names) {
  const target = name.replaceAll('dev', 'prod').replaceAll('Dev', 'Prod');
  let source = (await readFile(new URL(name, import.meta.url), 'utf8')).replace(pattern, value => substitutions.get(value));
  if (name === 'inspect-retained-dev.sh') source = source.replace(' SELECT COUNT(*) AS INVITATION_COUNT FROM GAME_INVITATION;', '');
  if (verify) assert.equal(await readFile(resolve(output, 'checks', target), 'utf8'), source, target);
  else await writeFile(resolve(output, 'checks', target), source, { flag: 'wx' });
  hashes[target] = createHash('sha256').update(source).digest('hex');
}
let nginx = await readFile('.tools/dev-release-20260921/nginx.conf', 'utf8');
nginx = nginx.replace(pattern, value => substitutions.get(value));
assert.ok(nginx.includes('error_log /dev/null;') && !nginx.includes('game-dev.molesunderthepitch.org'));
if (verify) assert.equal(await readFile(resolve(output, 'nginx.conf'), 'utf8'), nginx);
else await writeFile(resolve(output, 'nginx.conf'), nginx, { flag: 'wx' });
hashes['nginx.conf'] = createHash('sha256').update(nginx).digest('hex');
for (const name of ['schema.sql', 'temurin21.tar.gz']) {
  if (verify) assert.deepEqual(await readFile(resolve('.tools/dev-release-20260921', name)), await readFile(resolve(output, name)));
  else await copyFile(resolve('.tools/dev-release-20260921', name), resolve(output, name), 1);
}
const manifestPath = resolve(output, verify ? 'render-verified-manifest.json' : 'render-manifest.json');
const manifest = JSON.stringify({ environment: 'prod', source: 'reviewed DEV procedures', hashes }, null, 2);
if (verify) {
  let existing;
  try { existing = await readFile(manifestPath, 'utf8'); }
  catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
  if (existing !== undefined) assert.equal(existing, manifest, 'Retained verification manifest differs');
  else await writeFile(manifestPath, manifest, { flag: 'wx' });
} else await writeFile(manifestPath, manifest, { flag: 'wx' });
console.log(`${verify ? 'Verified' : 'Rendered'} isolated PROD procedures, negative tests, empty schema and pinned Java; no credentials or user data copied.`);
