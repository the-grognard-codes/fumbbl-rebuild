import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAdc } from '../match-review-adc-check.mjs';

const credential = JSON.stringify({ type: 'authorized_user', client_id: 'client', client_secret: 'secret', refresh_token: 'refresh' });
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('expired review ADC identifies reauthentication without exposing credential fields', async () => {
  let calls = 0;
  const result = await checkAdc(credential, async () => { calls++; return reply(400, { error: 'invalid_grant' }); });
  assert.equal(result, 'REAUTHENTICATION_REQUIRED');
  assert.equal(calls, 1);
  assert.doesNotMatch(result, /client|secret|refresh/);
});

test('Google session-control subtype is distinguished from other invalid grants', async () => {
  const result = await checkAdc(credential, async () => reply(400,
    { error: 'invalid_grant', error_subtype: 'invalid_rapt' }));
  assert.equal(result, 'SESSION_EXPIRED');
});

test('valid review ADC must also reach Firebase Auth for the dev quota project', async () => {
  const calls = [];
  const result = await checkAdc(credential, async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? reply(200, { access_token: 'private-token' }) : reply(200, {});
  });
  assert.equal(result, 'OK');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers['x-goog-user-project'], 'dev-moles-under-the-pitch-org');
  assert.doesNotMatch(result, /private-token/);
});

test('refresh alone does not pass when Firebase Admin access is denied', async () => {
  let calls = 0;
  const result = await checkAdc(credential, async () => ++calls === 1
    ? reply(200, { access_token: 'private-token' }) : reply(403, {}));
  assert.equal(result, 'FIREBASE_HTTP_403');
});
