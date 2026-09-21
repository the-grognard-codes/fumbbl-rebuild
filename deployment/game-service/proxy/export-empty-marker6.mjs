// Export schema only from a verified local marker-6 reference. Never export rows.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [docker, destination] = process.argv.slice(2);
assert.ok(docker && destination && process.argv.length === 4);
const container = 'ffb-setup-test-db-20260920';
const marker = execFileSync(docker, ['exec', container, 'sh', '-c', 'exec mariadb -uroot -p"$(cat /run/secrets/db_root_password)" -N -B ffb_local -e "SELECT version FROM ffb_local_schema"'], { encoding: 'utf8' }).trim();
assert.equal(marker, '6');
const schema = execFileSync(docker, ['exec', container, 'sh', '-c', 'exec mariadb-dump -uroot -p"$(cat /run/secrets/db_root_password)" --no-data --skip-add-drop-table --skip-add-locks --skip-comments --skip-triggers ffb_local'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
assert.doesNotMatch(schema, /\b(?:DROP|TRUNCATE|INSERT|REPLACE|DELETE|CREATE DATABASE|USE)\s/i);
assert.equal((schema.match(/CREATE TABLE /g) ?? []).length, 17);
writeFileSync(destination, schema, { flag: 'wx' });
console.log(JSON.stringify({ schemaOnly: true, tables: 17, sha256: createHash('sha256').update(schema).digest('hex') }));
