import assert from 'node:assert/strict';
import test from 'node:test';
import { kickoffMarkerPosition } from '../src/kickoff-ball-presentation.ts';

test('Kick markers preserve pitch squares and collapse off-pitch distances at each edge', () => {
  for (const [coordinate, expected] of [
    [{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 25, y: 14 }, { x: 25, y: 14 }],
    [{ x: -5, y: 7 }, { x: -1, y: 7 }], [{ x: 30, y: 7 }, { x: 26, y: 7 }],
    [{ x: 13, y: -4 }, { x: 13, y: -1 }], [{ x: 13, y: 20 }, { x: 13, y: 15 }],
    [{ x: -4, y: 18 }, { x: -1, y: 15 }], [{ x: 30, y: -3 }, { x: 26, y: -1 }],
  ]) {
    const original = { ...coordinate };
    assert.deepEqual(kickoffMarkerPosition(coordinate), expected);
    assert.deepEqual(coordinate, original, 'Presentation leaves the native landing square unchanged');
  }
});
