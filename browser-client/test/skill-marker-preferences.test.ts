import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { defaultSkillMarkerPreferences, readSkillMarkerPreferences, saveSkillMarkerPreferences } from '../src/skill-marker-preferences.ts';

const stored = new Map<string, string>();
function storage() {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value),
  } });
}
afterEach(() => { storage(); saveSkillMarkerPreferences({ ...defaultSkillMarkerPreferences }); stored.clear(); delete globalThis.localStorage; });

test('old or invalid saved marker preferences default the new toggle to on', () => {
  storage(); assert.deepEqual(readSkillMarkerPreferences(), defaultSkillMarkerPreferences);
  stored.set('ffb.match.skill-marker.preferences', '{"showTraits":false}');
  assert.deepEqual(readSkillMarkerPreferences(), { ...defaultSkillMarkerPreferences, showTraits: false, showBigGuyNegatraits: true });
  for (const value of ['{','null','[]','{"showTraits":"off","showBigGuyNegatraits":0}']) {
    stored.set('ffb.match.skill-marker.preferences', value);
    assert.deepEqual(readSkillMarkerPreferences(), defaultSkillMarkerPreferences);
  }
});

test('independent trait choices persist without resetting one another', () => {
  storage(); saveSkillMarkerPreferences({ ...defaultSkillMarkerPreferences, showTraits: true, showBigGuyNegatraits: false });
  assert.deepEqual(readSkillMarkerPreferences(), { ...defaultSkillMarkerPreferences, showTraits: true, showBigGuyNegatraits: false });
  saveSkillMarkerPreferences({ ...readSkillMarkerPreferences(), showTraits: false });
  assert.deepEqual(readSkillMarkerPreferences(), { ...defaultSkillMarkerPreferences, showTraits: false, showBigGuyNegatraits: false });
});

test('denied storage retains toggle changes for this session', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw Error('Denied'); } });
  saveSkillMarkerPreferences({ ...defaultSkillMarkerPreferences, showTraits: true, showBigGuyNegatraits: false });
  assert.deepEqual(readSkillMarkerPreferences(), { ...defaultSkillMarkerPreferences, showTraits: true, showBigGuyNegatraits: false });
});

test('style, size, team and origin preferences validate and persist independently', () => {
  storage();
  const settings = { ...defaultSkillMarkerPreferences, style: 'illustrated', size: 'large', showOwn: false, showBase: true } as const;
  saveSkillMarkerPreferences(settings); assert.deepEqual(readSkillMarkerPreferences(), settings);
  stored.set('ffb.match.skill-marker.preferences', '{"style":"invalid","size":42,"showBase":true,"showOpponent":false}');
  assert.deepEqual(readSkillMarkerPreferences(), { ...defaultSkillMarkerPreferences, showBase: true, showOpponent: false });
});
