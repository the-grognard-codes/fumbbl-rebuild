import assert from 'node:assert/strict';
import test from 'node:test';
import { diceDirectionAngles, nativeDirectionAngles } from '../src/dice-direction-presentation.ts';
import { PitchProjection } from '../src/pitch-projection.ts';

const angle = (value: number) => (value + 360) % 360;
const close = (actual: number, expected: number) => assert.ok(Math.abs(angle(actual) - angle(expected)) < 1e-7, `${actual} != ${expected}`);

test('native compass arrows follow both ends of the overhead pitch', () => {
  const expected = { north: 180, northeast: -135, east: -90, southeast: -45,
    south: 0, southwest: 45, west: 90, northwest: 135 };
  for (const end of ['home', 'away'] as const) {
    const camera = new PitchProjection({ width: 1440, height: 900, mode: 'top-down', end });
    const directions = diceDirectionAngles(camera);
    assert.deepEqual(Object.keys(directions), Object.keys(nativeDirectionAngles));
    for (const [name, degrees] of Object.entries(expected)) close(directions[name], degrees + (end === 'away' ? 180 : 0));
  }
});

test('perspective diagonal arrows follow the foreshortened pitch at each camera elevation', () => {
  for (const perspectiveElevation of [30, 40, 50] as const) for (const end of ['home', 'away'] as const) {
    const camera = new PitchProjection({ width: 1440, height: 900, end, perspectiveElevation });
    const directions = diceDirectionAngles(camera);
    const diagonal = Math.atan(Math.sin(perspectiveElevation * Math.PI / 180)) * 180 / Math.PI;
    close(directions.east, -90 + (end === 'away' ? 180 : 0));
    close(directions.southeast, -diagonal + (end === 'away' ? 180 : 0));
    assert.notEqual(directions.southeast, nativeDirectionAngles.southeast);
  }
});
