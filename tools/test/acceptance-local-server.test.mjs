import assert from 'node:assert/strict';
import test from 'node:test';

import { acceptanceUids, retainedAcceptanceUids, verifiedAcceptanceAdc } from '../acceptance-local-server.mjs';

test('acceptance run creates three distinct Firebase identity UIDs', () => {
  let id = 0;
  const values = acceptanceUids(() => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`);
  assert.deepEqual(values, [
    'acceptance-home-00000000-0000-4000-8000-000000000001',
    'acceptance-away-00000000-0000-4000-8000-000000000002',
    'acceptance-spectator-00000000-0000-4000-8000-000000000003'
  ]);
  assert.equal(new Set(values).size, 3);
});

test('acceptance uses only a verified ADC path and never surfaces credential contents', async () => {
  const source = 'C:/Users/test/AppData/Roaming/gcloud/application_default_credentials.json';
  const secretText = 'sensitive credential payload';
  const verifiedPath = await verifiedAcceptanceAdc({ source, read: () => secretText,
    verify: async value => value === secretText ? 'OK' : 'INVALID_ADC_FILE' });
  assert.equal(verifiedPath, source);
  await assert.rejects(verifiedAcceptanceAdc({ source, read: () => secretText,
    verify: async () => 'SESSION_EXPIRED' }), error => {
    assert.equal(error.message, 'ACCEPTANCE_ADC_SESSION_EXPIRED');
    assert.doesNotMatch(error.message, /sensitive credential payload/);
    return true;
  });
  await assert.rejects(verifiedAcceptanceAdc({ source, read: () => { throw Error(secretText); },
    verify: async () => 'OK' }), error => error.message === 'ACCEPTANCE_ADC_UNAVAILABLE');
});

test('retained identities reject private accounts and swapped coach roles before server mutation', () => {
  const roles = ['home', 'away', 'spectator'];
  const values = acceptanceUids(() => '00000000-0000-4000-8000-000000000001');
  const records = Object.fromEntries(roles.map((role, index) => [role, { uid: values[index], token: 'ignored-secret' }]));
  assert.deepEqual(retainedAcceptanceUids(JSON.stringify(records)), values);
  for (const bad of ['{}', '{', JSON.stringify({ ...records, home: { uid: 'real-private-account' } }),
    JSON.stringify({ ...records, home: records.away })]) {
    assert.throws(() => retainedAcceptanceUids(bad), error => error.message === 'ACCEPTANCE_IDENTITIES_INVALID');
  }
});
