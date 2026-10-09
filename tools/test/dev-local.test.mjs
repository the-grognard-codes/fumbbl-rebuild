import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { composeEnvironment, prepareLocalStart, readManagedState, validateComputerPlayer, validateComputerStartup, waitForComputerPlayer } from '../dev-local.mjs';

test('browser failure prevents both start and restart from stopping local services', async () => {
  for (const restart of [false, true]) {
    const calls = [];
    await assert.rejects(prepareLocalStart(restart, {
      validate: async () => { calls.push('browser'); throw Error('browser failed'); },
      stopStack: async () => { calls.push('stack stop'); },
      stopProcesses: async () => { calls.push('process stop'); },
    }), /browser failed/);
    assert.deepEqual(calls, ['browser']);
  }
});

test('rejects unavailable computer prerequisites before restart can stop the running stack', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dev-local-preflight-test-'));
  const tokenFile = join(directory, 'service.key');
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../dev-local.mjs', import.meta.url)), '--restart'], {
      encoding: 'utf8', windowsHide: true,
      env: { ...process.env, FFB_COMPUTER_SERVICE_TOKEN_FILE: tokenFile },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /COMPUTER_TOKEN_FILE_UNAVAILABLE/);
    assert.equal(result.stdout, '', 'preflight must precede stop and build operations');
    writeFileSync(tokenFile, ' ');
    assert.throws(() => validateComputerStartup(tokenFile, '26.7.0'), /COMPUTER_TOKEN_FILE_INVALID/);
    writeFileSync(tokenFile, 'synthetic-test-token');
    assert.throws(() => validateComputerStartup(tokenFile, '24.0.0'), /COMPUTER_NODE_VERSION_UNSUPPORTED/);
    validateComputerStartup(tokenFile, '26.7.0');
  } finally {
    try { unlinkSync(tokenFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    rmdirSync(directory);
  }
});

test('only stops the recorded computer daemon from its owning checkout and local endpoint', () => {
  const owner = join(tmpdir(), 'dev-local-owner');
  const state = { pid: 42, script: join(owner, 'computer-player', 'src', 'daemon.mjs') };
  const command = `node "${state.script}" --url ws://127.0.0.1:22232/browser/v2 --origin http://localhost:5000`;
  validateComputerPlayer(state, owner, command);
  validateComputerPlayer(state, owner, ''); // An already stopped daemon needs no termination.
  assert.throws(() => validateComputerPlayer(state, join(tmpdir(), 'another-checkout'), command), /COMPUTER_STATE_MISMATCH/);
  assert.throws(() => validateComputerPlayer({ ...state, pid: -1 }, owner, command), /COMPUTER_STATE_MISMATCH/);
  assert.throws(() => validateComputerPlayer(state, owner, 'node unrelated.mjs'), /COMPUTER_STATE_MISMATCH/);
  assert.throws(() => validateComputerPlayer(state, owner, command.replace('22232', '22234')), /COMPUTER_STATE_MISMATCH/);
  assert.throws(() => validateComputerPlayer(state, owner, command.replace('localhost:5000', 'localhost:5173')), /COMPUTER_STATE_MISMATCH/);
  assert.throws(() => validateComputerPlayer(state, owner, command.replace('daemon.mjs', 'daemon.mjs.backup')), /COMPUTER_STATE_MISMATCH/);
  assert.throws(() => validateComputerPlayer(state, owner, command.replace('/browser/v2', '/browser/v2-extra')), /COMPUTER_STATE_MISMATCH/);
  assert.throws(() => validateComputerPlayer(state, owner, command.replace('localhost:5000', 'localhost:50001')), /COMPUTER_STATE_MISMATCH/);
});

test('waits for computer registration and rejects a failed process even with a ready log', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dev-local-computer-test-'));
  const log = join(directory, 'computer.log');
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  try {
    writeFileSync(log, 'Connecting...\n');
    const waiting = waitForComputerPlayer(child, log);
    writeFileSync(log, '[computer-daemon] Ready for computer matches; capacity 32.\n');
    await waiting;
    child.exitCode = 1;
    await assert.rejects(waitForComputerPlayer(child, log), /COMPUTER_START_FAILED/);
    child.exitCode = null;
    child.signalCode = 'SIGTERM';
    await assert.rejects(waitForComputerPlayer(child, log), /COMPUTER_START_FAILED/);
    child.signalCode = null;
    writeFileSync(log, 'Connecting...\n');
    const failed = waitForComputerPlayer(child, log);
    child.emit('error', Error('spawn failed'));
    await assert.rejects(failed, /COMPUTER_START_FAILED/);
  } finally {
    unlinkSync(log);
    rmdirSync(directory);
  }
});

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
