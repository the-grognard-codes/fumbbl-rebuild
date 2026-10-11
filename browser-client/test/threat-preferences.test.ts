import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { defaultThreatPreferences, readThreatPreferences, saveThreatPreferences } from '../src/threat-preferences.ts';

const stored = new Map<string, string>();
function storage() {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value),
  } });
}
afterEach(() => { storage(); saveThreatPreferences({ ...defaultThreatPreferences }); stored.clear(); delete globalThis.localStorage; });
test('missing, corrupt and partially invalid preferences retain enabled defaults', () => {
  storage(); assert.deepEqual(readThreatPreferences(), defaultThreatPreferences);
  for (const value of ['[false]', 'null', '{', '{"enabled":"off","tackle":false,"unknown":false}']) {
    stored.set('ffb.match.threat.preferences', value);
    assert.deepEqual(readThreatPreferences(), { ...defaultThreatPreferences, ...(value.includes('"tackle":false') ? { tackle: false } : {}) });
  }
});
test('all independent choices persist and master changes retain individual choices', () => {
  storage(); const choices = { ...defaultThreatPreferences, zoneColors: false, tentacles: false };
  saveThreatPreferences(choices); assert.deepEqual(readThreatPreferences(), choices);
  saveThreatPreferences({ ...choices, enabled: false }); assert.equal(readThreatPreferences().tentacles, false);
  saveThreatPreferences({ ...readThreatPreferences(), enabled: true }); assert.deepEqual(readThreatPreferences(), choices);
});
test('unavailable storage keeps changes in this session instead of failing the UI', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw Error('Denied'); } });
  assert.deepEqual(readThreatPreferences(), defaultThreatPreferences);
  saveThreatPreferences({ ...defaultThreatPreferences, shadowing: false }); assert.equal(readThreatPreferences().shadowing, false);
});
