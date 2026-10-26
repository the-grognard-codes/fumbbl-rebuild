import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cameraPreferenceKey, cycleCameraAngle, defaultCameraPreferences, effectiveCameraEnd,
  flipCameraEnd, readCameraPreferences, saveCameraPreferences } from '../src/camera-preferences.ts';
import { PitchProjection } from '../src/pitch-projection.ts';

test('camera cycles all four angles and preserves selected end', () => {
  let state = defaultCameraPreferences('away');
  assert.equal(state.angle, 40);
  const angles = [];
  for (let index = 0; index < 4; index++) { state = cycleCameraAngle(state); angles.push(state.angle); }
  assert.deepEqual(angles, [50, 90, 30, 40]);
  assert.equal(state.end, 'away');
});

test('overhead flips retain identical projection until returning to an angled view', () => {
  const overhead = cycleCameraAngle(cycleCameraAngle(defaultCameraPreferences('away')));
  const flipped = flipCameraEnd(overhead);
  assert.equal(flipped.end, 'home');
  const project = (state: typeof overhead) => new PitchProjection({ width: 1280, height: 720,
    mode: 'top-down', end: effectiveCameraEnd(state) }).project({ x: 5.5, y: 3.5 });
  assert.deepEqual(project(flipped), project(overhead));
  assert.equal(effectiveCameraEnd(cycleCameraAngle(flipped)), 'home');
  assert.equal(flipCameraEnd(flipped).end, 'away');
});

test('camera settings survive storage recovery, isolate matches and roles, and reject malformed data', () => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  try {
    const key = cameraPreferenceKey('one', 'home');
    const chosen = flipCameraEnd(cycleCameraAngle(defaultCameraPreferences('home')));
    saveCameraPreferences(key, chosen);
    assert.deepEqual(readCameraPreferences(key, 'home'), chosen);
    assert.deepEqual(readCameraPreferences(cameraPreferenceKey('two', 'home'), 'home'), defaultCameraPreferences('home'));
    assert.deepEqual(readCameraPreferences(cameraPreferenceKey('one', 'away'), 'away'), defaultCameraPreferences('away'));
    for (const invalid of ['{', 'null', '[]', '{"angle":90,"end":"away"}', '{"angle":60,"end":"home","overheadEnd":"home"}']) {
      values.set(key, invalid);
      assert.deepEqual(readCameraPreferences(key, 'home'), defaultCameraPreferences('home'));
    }
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw Error('blocked'); } });
    assert.deepEqual(readCameraPreferences(key, 'spectator'), defaultCameraPreferences('spectator'));
    assert.doesNotThrow(() => saveCameraPreferences(key, chosen));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
