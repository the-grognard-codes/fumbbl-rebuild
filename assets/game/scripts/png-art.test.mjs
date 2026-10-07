import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isolatedBounds } from './png-art.mjs';

test('isolated roles reject neighboring sprite spill on every cell edge', () => {
  const image = { width: 64, height: 64, rgba: Buffer.alloc(64 * 64 * 4) };
  const box = { x: 16, y: 16, width: 32, height: 32 };
  image.rgba[(32 * 64 + 32) * 4 + 3] = 255;
  assert.deepEqual(isolatedBounds(image, box, 'bench'), { x: 32, y: 32, width: 1, height: 1 });
  for (const [x,y] of [[16,32],[47,32],[32,16],[32,47]]) {
    const alpha = (y * 64 + x) * 4 + 3; image.rgba[alpha] = 255;
    assert.throws(() => isolatedBounds(image, box, 'bench'), /transparent cell gutters: bench/);
    image.rgba[alpha] = 0;
  }
});
