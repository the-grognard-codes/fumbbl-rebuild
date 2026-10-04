import assert from 'node:assert/strict';
import test from 'node:test';
import { PitchProjection } from '../src/pitch-projection.ts';

test('painted scenery homography registers every interior sample to the shared camera', () => {
  const source = [[0, -13.350726120762829, 22824.563196736133], [17.044276629673718, 4.301823272632846, -6422.851576615379], [0, .5735764363510462, 1043.4884914389131]];
  for (const end of ['home', 'away'] as const) for (const mode of ['perspective', 'top-down'] as const) for (const focus of [0, 13, 26]) {
    const camera = new PitchProjection({ width: 1280, height: 660, end, mode, focus, zoom: 1.5, transverseFocus: 6 });
    const matrix = camera.planeImageTransform(source).slice(9, -1).split(',').map(Number);
    for (const x of [0, 285, 836, 1387, 1672]) for (const y of [0, 300, 700, 941]) {
      const divisor = source[2][1] * y + source[2][2];
      const world = { x: (source[0][1] * y + source[0][2]) / divisor, y: (source[1][0] * x + source[1][1] * y + source[1][2]) / divisor };
      const expected = camera.project(world)!;
      const w = matrix[3] * x + matrix[7] * y + matrix[15];
      assert.ok(Math.abs((matrix[0] * x + matrix[4] * y + matrix[12]) / w - expected.x) < 1e-7);
      assert.ok(Math.abs((matrix[1] * x + matrix[5] * y + matrix[13]) / w - expected.y) < 1e-7);
    }
  }
  assert.throws(() => new PitchProjection({ width: 100, height: 100 }).planeImageTransform([[NaN]]), RangeError);
});
