import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import test from 'node:test';

import { composeEnvironment, readManagedState } from '../dev-local.mjs';

test('finds a managed browser stack started from another checkout of the same repository', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dev-local-state-test-'));
  const first = join(directory, 'first');
  const second = join(directory, 'second');
  const legacy = join(first, '.tools', 'dev-local-state.json');
  const shared = join(directory, 'shared-state.json');
  mkdirSync(join(first, '.tools'), { recursive: true });
  mkdirSync(second);
  try {
    writeFileSync(legacy, JSON.stringify({ schema: 1, root: first, proxy: { pid: 42 } }));
    assert.equal(readManagedState(shared, [first, second]).file, legacy);
    assert.equal(readManagedState(shared, [first, second]).state.root, first);
    assert.equal(readManagedState(shared, [second]), null);
    writeFileSync(shared, JSON.stringify({ schema: 1, root: second }));
    assert.throws(() => readManagedState(shared, [first, second]), /DEV_LOCAL_STATE_AMBIGUOUS/);
  } finally {
    if (readdirSync(directory).includes('shared-state.json')) unlinkSync(shared);
    unlinkSync(legacy);
    rmdirSync(join(first, '.tools'));
    rmdirSync(first);
    rmdirSync(second);
    rmdirSync(directory);
  }
});

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

test('reuses Windows files reported as Docker Desktop Linux mount sources', { skip: process.platform !== 'win32' }, t => {
  const directory = mkdtempSync(join(tmpdir(), 'dev-local-desktop-test-'));
  t.after(() => {
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  });
  const source = destination => {
    const file = join(directory, destination.split('/').at(-1));
    writeFileSync(file, 'fixture');
    return { Destination: destination, Type: 'bind', RW: false,
      Source: `/run/desktop/mnt/host/${file[0].toLowerCase()}/${file.slice(parse(file).root.length).replaceAll('\\', '/')}` };
  };
  const server = { Mounts: [
    source('/run/adc/application_default_credentials.json'),
    source('/run/secrets/db_password'),
    source('/run/secrets/admin_password'),
    source('/run/secrets/coach_password'),
  ] };
  const database = { Mounts: [source('/run/secrets/db_root_password')] };
  const environment = composeEnvironment(server, database);
  assert.equal(environment.M6_ADC_FILE, join(directory, 'application_default_credentials.json'));
  assert.equal(environment.M6_DB_PASSWORD_FILE, join(directory, 'db_password'));
  assert.equal(environment.M6_DB_ROOT_PASSWORD_FILE, join(directory, 'db_root_password'));
  assert.equal(environment.M6_ADMIN_PASSWORD_FILE, join(directory, 'admin_password'));
  assert.equal(environment.M6_COACH_PASSWORD_FILE, join(directory, 'coach_password'));
  server.Mounts[0].RW = true;
  assert.throws(() => composeEnvironment(server, database), /REVIEW_MOUNT_UNAVAILABLE/);
});
