// Post-import R5 direct parity. Reads both databases, emits only sanitized counts/identifiers and hashes.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { sha256 } from './r5-backup-lib.mjs';

const run = promisify(execFile);
const docker = process.env.DOCKER_EXE ?? (process.platform === 'win32' ? resolve(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe') : 'docker');
const source = process.env.R5_SOURCE_DATABASE_CONTAINER;
const restored = process.env.R5_RESTORE_DATABASE_CONTAINER;
const output = process.env.R5_PARITY_EVIDENCE && resolve(process.env.R5_PARITY_EVIDENCE);
assert.ok(source && restored && output, 'Set R5_SOURCE_DATABASE_CONTAINER, R5_RESTORE_DATABASE_CONTAINER, and a new R5_PARITY_EVIDENCE');
assert.notEqual(source, restored, 'Source and restored databases must differ');
assert.equal(process.argv.length, 2, 'Usage: node tools/r5-parity.mjs');
const options = { windowsHide: true, maxBuffer: 32 * 1024 * 1024 };

const sql = async (container, statement) => (await run(docker, ['exec', container, 'sh', '-c',
  `exec mariadb -uroot -p"$(cat /run/secrets/db_root_password)" --batch --raw --skip-column-names ffb_local -e ${JSON.stringify(statement.replace(/\s+/g, ' ').trim())}`], options)).stdout.trim();

async function tableData(container, tables) {
  return await new Promise((resolveDump, rejectDump) => {
    const command = `exec mariadb-dump -uroot -p"$(cat /run/secrets/db_root_password)" --no-create-info --skip-comments --compact --skip-extended-insert --hex-blob ffb_local ${tables.join(' ')}`;
    const child = spawn(docker, ['exec', container, 'sh', '-c', command], { windowsHide: true });
    const outputChunks = []; const errors = [];
    child.stdout.on('data', chunk => outputChunks.push(chunk));
    child.stderr.on('data', chunk => errors.push(chunk));
    child.on('error', rejectDump);
    child.on('close', code => code === 0 ? resolveDump(Buffer.concat(outputChunks))
      : rejectDump(new Error(`Categorized parity dump failed (${code}): ${Buffer.concat(errors).toString('utf8').slice(0, 200)}`)));
  });
}

const categories = {
  identitiesMembershipAndInvitations: ['ffb_v2_account', 'ffb_v2_account_scope', 'ffb_v2_identity', 'ffb_v2_match_members', 'ffb_v2_preparation_invites', 'ffb_v2_preparation_requests'],
  savedAndFrozenTeams: ['ffb_saved_teams', 'ffb_v2_saved_teams'],
  completedResultReplayAndRequests: ['ffb_prepared_matches'],
  pendingDecisionAndRecovery: ['ffb_match_recovery']
};
const digests = {};
for (const [name, tables] of Object.entries(categories)) {
  const [before, after] = await Promise.all([tableData(source, tables), tableData(restored, tables)]);
  assert.deepEqual(after, before, `${name} differs between source and restored databases`);
  digests[name] = { bytes: before.length, sha256: sha256(before) };
}

const facetsSql = `
SELECT 'accounts',COUNT(*) FROM ffb_v2_account
UNION ALL SELECT 'accountScopes',COUNT(*) FROM ffb_v2_account_scope
UNION ALL SELECT 'identities',COUNT(*) FROM ffb_v2_identity
UNION ALL SELECT 'memberships',COUNT(*) FROM ffb_v2_match_members
UNION ALL SELECT 'invitations',COUNT(*) FROM ffb_v2_preparation_invites
UNION ALL SELECT 'preparationRequests',COUNT(*) FROM ffb_v2_preparation_requests
UNION ALL SELECT 'savedTeams',COUNT(*) FROM ffb_v2_saved_teams;
SELECT JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.lifecycle')),COUNT(*) FROM ffb_prepared_matches GROUP BY 1 ORDER BY 1;
SELECT p.document_version,JSON_UNQUOTE(JSON_EXTRACT(p.document_json,'$.lifecycle')),r.generation,
 JSON_UNQUOTE(JSON_EXTRACT(r.artifact_json,'$.payload.runtimeVersion')),
 JSON_UNQUOTE(JSON_EXTRACT(r.artifact_json,'$.payload.engineVersion')),
 JSON_UNQUOTE(JSON_EXTRACT(r.artifact_json,'$.payload.recoveryVersion')),
 JSON_UNQUOTE(JSON_EXTRACT(r.artifact_json,'$.payload.replayVersion')),
 JSON_UNQUOTE(JSON_EXTRACT(r.artifact_json,'$.payload.revision')),
 JSON_LENGTH(JSON_EXTRACT(r.artifact_json,'$.payload.history')),
 JSON_LENGTH(JSON_EXTRACT(p.document_json,'$.requests'))
 FROM ffb_prepared_matches p JOIN ffb_match_recovery r ON r.matchid=p.match_id ORDER BY 2,1;
SELECT document_version,JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.lifecycle')),
 JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.completion.engineVersion')),
 JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.completion.formatVersion')),
 JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.completion.finalRevision')),
 JSON_LENGTH(JSON_EXTRACT(document_json,'$.completion.events'))
 FROM ffb_prepared_matches WHERE document_version=4;
SELECT JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.home.ruleset')),
 JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.home.catalogVersion')),
 JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.home.presetVersion')),
 JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.away.ruleset')),
 JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.away.catalogVersion')),
 JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.away.presetVersion'))
 FROM ffb_prepared_matches WHERE document_version IN (3,4) ORDER BY document_version;`;
const [sourceFacets, restoredFacets] = await Promise.all([sql(source, facetsSql), sql(restored, facetsSql)]);
assert.equal(restoredFacets, sourceFacets, 'Sanitized compatibility and fixture facets differ');

const evidence = {
  format: 'ffb-current-runtime-direct-parity/v1', status: 'COMPLETE',
  comparedAtUtc: new Date().toISOString(), categories: digests,
  sanitizedFacets: sourceFacets.split(/\r?\n/).map(row => row.split('\t')),
  facetsSha256: sha256(sourceFacets)
};
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log('PASS R5 categorized direct data parity');
