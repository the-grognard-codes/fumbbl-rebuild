// Target-only marker-6 provisioning from an immutable marker-5 source. Never resets storage.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const run = promisify(execFile);
const docker = process.env.DOCKER_EXE ?? (process.platform === 'win32' ? resolve(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe') : 'docker');
const source = process.env.M6_SOURCE_CONTAINER;
const target = process.env.M6_TARGET_CONTAINER;
const evidence = process.env.M6_EVIDENCE_DIR && resolve(process.env.M6_EVIDENCE_DIR);
assert.ok(source && target && evidence, 'Set M6_SOURCE_CONTAINER, M6_TARGET_CONTAINER, and a new M6_EVIDENCE_DIR');
assert.notEqual(source, target, 'Source and target containers must differ');
const verify = process.argv[2] === 'verify';
assert.ok((verify && process.argv.length === 3) || (!verify && process.argv.length === 2), 'Usage: node tools/m6-provision-copy.mjs [verify]');
const options = { windowsHide: true, maxBuffer: 128 * 1024 * 1024 };
const dataDirectory = '/var/lib/mysql';
const sql = (container, input) => new Promise((resolveOutput, reject) => {
  const child = spawn(docker, ['exec', '-i', container, 'sh', '-c', 'exec mariadb -uroot -p"$(cat /run/secrets/db_root_password)" --batch --raw --skip-column-names ffb_local'], { windowsHide: true });
  const chunks = []; child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', () => {});
  child.on('error', reject); child.on('close', code => code === 0 ? resolveOutput(Buffer.concat(chunks).toString().trim()) : reject(Error(`SQL exited ${code}`)));
  child.stdin.end(input);
});
const fingerprintSql = 'SELECT match_id,document_version,SHA2(document_json,256) FROM ffb_prepared_matches ORDER BY match_id; SELECT team_id,document_version,SHA2(document_json,256) FROM ffb_saved_teams ORDER BY team_id; SELECT matchid,generation,SHA2(artifact_json,256) FROM ffb_match_recovery ORDER BY matchid;';
const marker6SchemaSql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'ffb_local' AND table_name IN ('ffb_v2_match_members', 'ffb_v2_account', 'ffb_v2_identity', 'ffb_v2_account_scope', 'ffb_v2_saved_teams', 'ffb_v2_preparation_invites', 'ffb_v2_preparation_requests') ORDER BY table_name; SELECT table_name,column_name,column_type,is_nullable,column_key FROM information_schema.columns WHERE table_schema = 'ffb_local' AND table_name IN ('ffb_v2_match_members', 'ffb_v2_account', 'ffb_v2_identity', 'ffb_v2_account_scope', 'ffb_v2_saved_teams', 'ffb_v2_preparation_invites', 'ffb_v2_preparation_requests') ORDER BY table_name,ordinal_position; SELECT table_name,index_name,non_unique,seq_in_index,column_name FROM information_schema.statistics WHERE table_schema = 'ffb_local' AND table_name IN ('ffb_v2_match_members', 'ffb_v2_account', 'ffb_v2_identity', 'ffb_v2_account_scope', 'ffb_v2_saved_teams', 'ffb_v2_preparation_invites', 'ffb_v2_preparation_requests') ORDER BY table_name,index_name,seq_in_index;";
const expectedMarker6Tables = 'ffb_v2_account\nffb_v2_account_scope\nffb_v2_identity\nffb_v2_match_members\nffb_v2_preparation_invites\nffb_v2_preparation_requests\nffb_v2_saved_teams';
const ddl = `${await readFile(resolve('ffb-server/src/main/resources/local-schema/006-v2-membership.sql'), 'utf8')}\n;\n${await readFile(resolve('ffb-server/src/main/resources/local-schema/006-v2-saved-teams.sql'), 'utf8')}\n;\n${await readFile(resolve('ffb-server/src/main/resources/local-schema/006-v2-invitations.sql'), 'utf8')}\n;\nUPDATE ffb_local_schema SET version=6 WHERE version=5;`;

const inspectContainers = async () => {
  const containers = JSON.parse((await run(docker, ['inspect', '--type', 'container', source, target], options)).stdout);
  assert.equal(containers.length, 2, 'Both source and target must resolve to containers');
  const byName = new Map(containers.map(container => [container.Name.replace(/^\//, ''), container]));
  const sourceContainer = byName.get(source) ?? containers.find(container => container.Id.startsWith(source));
  const targetContainer = byName.get(target) ?? containers.find(container => container.Id.startsWith(target));
  assert.ok(sourceContainer && targetContainer, 'Container names must resolve unambiguously');
  assert.notEqual(sourceContainer.Id, targetContainer.Id, 'Source and target resolve to the same container');
  assert.ok(sourceContainer.State?.Running, 'Source container must be running');
  assert.ok(targetContainer.State?.Running, 'Target container must be running');
  const dataMount = (container) => {
    const mounts = (container.Mounts ?? []).filter(mount => mount.Destination === dataDirectory);
    assert.equal(mounts.length, 1, `${container.Name} must have exactly one ${dataDirectory} mount`);
    const mount = mounts[0];
    assert.ok(mount.Name || mount.Source, `${container.Name} data mount has no inspectable source`);
    return { type: mount.Type, name: mount.Name ?? null, source: mount.Source ?? null, destination: mount.Destination };
  };
  const sourceDataMount = dataMount(sourceContainer);
  const targetDataMount = dataMount(targetContainer);
  const mountIdentity = mount => `${mount.type}:${mount.name ?? mount.source}`;
  assert.notEqual(mountIdentity(sourceDataMount), mountIdentity(targetDataMount), 'Source and target use the same MariaDB data mount');
  if (sourceDataMount.source && targetDataMount.source) assert.notEqual(sourceDataMount.source, targetDataMount.source, 'Source and target alias the same data path');
  return { sourceContainerId: sourceContainer.Id, targetContainerId: targetContainer.Id, sourceDataMount, targetDataMount };
};

const schemaEvidence = async () => {
  const result = await sql(target, marker6SchemaSql);
  assert.ok(result.startsWith(expectedMarker6Tables), 'Marker-6 tables are missing from target schema');
  return result;
};

if (verify) {
  const before = JSON.parse(await readFile(resolve(evidence, 'marker6-copy.json'), 'utf8'));
  assert.equal(before.source, source, 'Evidence source name does not match');
  assert.equal(before.target, target, 'Evidence target name does not match');
  assert.equal(before.marker, 6, 'Evidence is not a marker-6 copy manifest');
  const binding = await inspectContainers();
  assert.equal(binding.sourceContainerId, before.sourceContainerId, 'Evidence source container binding does not match');
  assert.equal(binding.targetContainerId, before.targetContainerId, 'Evidence target container binding does not match');
  assert.deepEqual(binding.sourceDataMount, before.sourceDataMount, 'Evidence source data-mount binding does not match');
  assert.deepEqual(binding.targetDataMount, before.targetDataMount, 'Evidence target data-mount binding does not match');
  assert.equal(await sql(target, 'SELECT version FROM ffb_local_schema;'), '6');
  assert.equal(await sql(target, fingerprintSql), before.documentFingerprints);
  assert.equal(await sql(source, fingerprintSql), before.sourceDocumentFingerprints);
  assert.equal(await schemaEvidence(), before.marker6SchemaEvidence, 'Marker-6 schema no longer matches copy evidence');
  await writeFile(resolve(evidence, 'marker6-verified.json'), JSON.stringify({ pass: true, source, target, marker: 6, sourceContainerId: binding.sourceContainerId, targetContainerId: binding.targetContainerId, documentFingerprintsUnchanged: true }, null, 2), { flag: 'wx' });
  console.log('PASS marker-6 target verified; source and copied R2 bytes are unchanged');
} else {
  const binding = await inspectContainers();
  assert.equal(await sql(source, 'SELECT version FROM ffb_local_schema;'), '5', 'Source must be an accepted marker-5 database');
  assert.equal(await sql(target, 'SHOW TABLES;'), '', 'Target is not empty; refusing to overwrite or recreate it');
  await mkdir(evidence);
  await writeFile(resolve(evidence, 'marker6-preflight.json'), JSON.stringify({ source, target, marker: 6, ...binding, targetWasEmpty: true }, null, 2), { flag: 'wx' });
  const sourceDocumentFingerprintsBefore = await sql(source, fingerprintSql);
  const dump = (await run(docker, ['exec', source, 'sh', '-c', 'exec mariadb-dump -uroot -p"$(cat /run/secrets/db_root_password)" --single-transaction --skip-lock-tables --skip-add-drop-table --skip-add-locks --hex-blob ffb_local'], options)).stdout;
  assert.ok(!/^\s*(DROP|TRUNCATE|DELETE)\b/im.test(dump), 'Unexpected destructive statement in source snapshot');
  const sourceDocumentFingerprints = await sql(source, fingerprintSql);
  assert.equal(sourceDocumentFingerprints, sourceDocumentFingerprintsBefore, 'Source documents changed during dump; source must be quiescent or retry after it is stable');
  await sql(target, dump);
  assert.equal(await sql(target, 'SELECT version FROM ffb_local_schema;'), '5');
  assert.equal(await sql(target, fingerprintSql), sourceDocumentFingerprints, 'Copied R2 bytes differ before marker-6 provisioning');
  await sql(target, ddl);
  assert.equal(await sql(target, 'SELECT version FROM ffb_local_schema;'), '6');
  const marker6SchemaEvidence = await schemaEvidence();
  await writeFile(resolve(evidence, 'marker6-copy.json'), JSON.stringify({ source, target, marker: 6, ...binding, snapshotSha256: createHash('sha256').update(dump).digest('hex'), snapshotBytes: Buffer.byteLength(dump), sourceDocumentFingerprints, documentFingerprints: await sql(target, fingerprintSql), marker6SchemaEvidence }, null, 2), { flag: 'wx' });
  console.log('PASS marker-5 source copied into an empty marker-6 target; source storage was read only');
}
