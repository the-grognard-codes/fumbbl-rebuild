import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { composeEnvironment } from '../dev-local.mjs';

test('reuses only the existing read-only review mount sources', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dev-local-test-'));
  try {
    const source = destination => {
      const file = join(directory, destination.split('/').at(-1));
      writeFileSync(file, 'fixture');
      return { Destination: destination, Type: 'bind', RW: false, Source: file };
    };
    const server = { Mounts: [
      source('/run/adc/application_default_credentials.json'),
      source('/run/secrets/db_password'),
      source('/run/secrets/admin_password'),
      source('/run/secrets/coach_password'),
    ] };
    const database = { Mounts: [source('/run/secrets/db_root_password')] };
    const environment = composeEnvironment(server, database);
    assert.equal(environment.M6_ADC_FILE, server.Mounts[0].Source);
    assert.equal(environment.M6_DB_ROOT_PASSWORD_FILE, database.Mounts[0].Source);
    assert.equal(Object.keys(environment).length, 5);
    server.Mounts[0].RW = true;
    assert.throws(() => composeEnvironment(server, database), /REVIEW_MOUNT_UNAVAILABLE/);
  } finally {
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});
