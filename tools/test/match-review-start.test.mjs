import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { recoverCredential } from '../match-review-start.mjs';

const credential = refresh_token => JSON.stringify({ type: 'authorized_user', client_id: 'test-client',
  client_secret: 'test-secret', refresh_token });
const verify = async text => JSON.parse(text).refresh_token === 'valid' ? 'OK' : 'SESSION_EXPIRED';

function files(t, mounted, standard) {
  const directory = mkdtempSync(join(tmpdir(), 'match-review-adc-test-'));
  const target = join(directory, 'mounted.json');
  const source = join(directory, 'standard.json');
  writeFileSync(target, mounted);
  writeFileSync(source, standard);
  t.after(() => { unlinkSync(target); unlinkSync(source); rmdirSync(directory); });
  return { target, source };
}

test('valid mounted ADC starts without replacing it or opening sign-in', async t => {
  const { target, source } = files(t, credential('valid'), credential('expired'));
  const before = readFileSync(target, 'utf8');
  assert.equal(await recoverCredential(target, { source, verify, login: () => { throw Error('unexpected login'); } }), false);
  assert.equal(readFileSync(target, 'utf8'), before);
});

test('valid standard ADC replaces an expired mount and sets the dev quota project', async t => {
  const { target, source } = files(t, credential('expired'), credential('valid'));
  assert.equal(await recoverCredential(target, { source, verify, login: () => { throw Error('unexpected login'); } }), true);
  const updated = JSON.parse(readFileSync(target, 'utf8'));
  assert.equal(updated.refresh_token, 'valid');
  assert.equal(updated.quota_project_id, 'dev-moles-under-the-pitch-org');
});

test('interactive login runs only when both ADC files have expired', async t => {
  const { target, source } = files(t, credential('expired'), credential('expired'));
  let prompts = 0;
  assert.equal(await recoverCredential(target, { source, verify, login: () => { prompts++; writeFileSync(source, credential('valid')); } }), true);
  assert.equal(prompts, 1);
  assert.equal(JSON.parse(readFileSync(target, 'utf8')).refresh_token, 'valid');
});

test('failed renewal preserves the mounted credential', async t => {
  const { target, source } = files(t, credential('expired'), credential('expired'));
  const before = readFileSync(target, 'utf8');
  await assert.rejects(recoverCredential(target, { source, verify, login: () => {} }), /ADC_RENEWAL_INVALID/);
  assert.equal(readFileSync(target, 'utf8'), before);
});

test('network failures do not trigger needless Google sign-in', async t => {
  const { target, source } = files(t, credential('expired'), credential('expired'));
  const before = readFileSync(target, 'utf8');
  await assert.rejects(recoverCredential(target, { source, verify: async () => 'REFRESH_UNAVAILABLE',
    login: () => { throw Error('unexpected login'); } }), /ADC_REFRESH_UNAVAILABLE/);
  assert.equal(readFileSync(target, 'utf8'), before);
});
