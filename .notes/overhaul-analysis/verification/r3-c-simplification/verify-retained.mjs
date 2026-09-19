// Read-only comparison after additive synthetic marker-6 acceptance fixtures.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const root = new URL('./', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('marker6-copy-20260918/marker6-copy.json', root), 'utf8'));
const docker = resolve(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe');
function sql(container, query) {
  return new Promise((accept, reject) => {
    const child = spawn(docker, ['exec', '-i', container, 'sh', '-c', 'exec mariadb -uroot -p"$(cat /run/secrets/db_root_password)" --batch --raw --skip-column-names ffb_local'], { windowsHide: true });
    const chunks = []; child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', () => {});
    child.on('error', reject); child.on('close', code => code === 0 ? accept(Buffer.concat(chunks).toString().trim()) : reject(Error(`SQL exited ${code}`)));
    child.stdin.end(query);
  });
}
const query = 'SELECT match_id,document_version,SHA2(document_json,256) FROM ffb_prepared_matches ORDER BY match_id; SELECT team_id,document_version,SHA2(document_json,256) FROM ffb_saved_teams ORDER BY team_id; SELECT matchid,generation,SHA2(artifact_json,256) FROM ffb_match_recovery ORDER BY matchid;';
assert.equal(await sql(manifest.source, 'SELECT version FROM ffb_local_schema;'), '5');
assert.equal(await sql(manifest.target, 'SELECT version FROM ffb_local_schema;'), '6');
assert.equal(await sql(manifest.source, query), manifest.sourceDocumentFingerprints);
const target = new Set((await sql(manifest.target, query)).split('\n'));
const original = manifest.documentFingerprints.split('\n').filter(Boolean);
assert.ok(original.every(line => target.has(line)), 'Retained copied record is missing or changed');
await writeFile(new URL('retained-after-tests.json', root), JSON.stringify({ pass: true, source: manifest.source, target: manifest.target, originalRowsUnchanged: original.length, targetRows: target.size, additiveSyntheticFixturesRetained: true }, null, 2), { flag: 'wx' });
console.log('PASS source and all original copied documents unchanged; additive fixtures retained');
