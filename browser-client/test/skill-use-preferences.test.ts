import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodeSkillUsePreferences, skillUseCases } from '../src/skill-use-preferences.ts';
import { assertV2Projection } from '../src/v2-projection.ts';

const defaults = Object.fromEntries(skillUseCases.map(([key, , mode]) => [key, mode]));
test('approved eighteen policies preserve separate movement/block and ball/bomb defaults', () => {
  assert.equal(skillUseCases.length, 18);
  assert.equal(new Set(skillUseCases.map(([key]) => key)).size, 18);
  assert.deepEqual(skillUseCases.filter(([, , mode]) => mode === 'always-ask').map(([key]) => key),
    ['fend', 'taunt', 'wrestle-attacker', 'wrestle-defender', 'stand-firm', 'pick-me-up']);
  assert.deepEqual(decodeSkillUsePreferences(defaults), defaults);
  assert.doesNotThrow(() => assertV2Projection({ version: 2, type: 'skillUsePreferences', requestId: 'prefs', code: 'ACCEPTED', preferences: defaults }));
});
test('published strict wire schema covers exactly the approved use cases and operations', () => {
  const schema = JSON.parse(readFileSync(new URL('../skill-use-preferences.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.$defs.useCase.enum, skillUseCases.map(([key]) => key));
  assert.deepEqual(schema.$defs.mode.enum, ['always-use', 'always-ask']);
  assert.equal(schema.$defs.preferences.minProperties, 18); assert.equal(schema.$defs.preferences.maxProperties, 18);
  for (const variant of schema.oneOf) assert.equal(variant.additionalProperties, false);
  assert.deepEqual(schema.oneOf[0].required, ['version', 'type', 'requestId', 'operation']);
  assert.deepEqual(schema.oneOf[1].required, ['version', 'type', 'requestId', 'operation', 'useCase', 'mode']);
});
test('preference projection rejects unknown missing and invalid values and private account fields', () => {
  const { catch: omitted, ...missing } = defaults;
  for (const preferences of [null, [], missing, { ...defaults, pro: 'always-use' }, { ...defaults, catch: 'never' }, { ...defaults, catch: true }])
    assert.throws(() => decodeSkillUsePreferences(preferences));
  const envelope = { version: 2, type: 'skillUsePreferences', requestId: 'prefs', code: 'ACCEPTED', preferences: defaults };
  for (const field of ['accountId', 'email', 'bearer', 'matchId', 'checkpoint'])
    assert.throws(() => assertV2Projection({ ...envelope, [field]: 'private-sentinel' }));
  assert.throws(() => assertV2Projection({ ...envelope, code: 'FAILED' }));
});
