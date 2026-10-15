import assert from 'node:assert/strict';
import test from 'node:test';
import { actionSpriteAtlas, actionSpriteFrames } from '../src/action-icon-art.ts';
import { readRgbaPng } from '../../assets/game/scripts/png-art.mjs';

test('action artwork has transparent gutters and isolated, populated source rectangles', async () => {
  const image = await readRgbaPng(new URL(`../../assets/game/${actionSpriteAtlas.file}`, import.meta.url));
  assert.equal(image.width, actionSpriteAtlas.width);
  assert.equal(image.height, actionSpriteAtlas.height);
  const frames = Object.entries(actionSpriteFrames);
  assert.equal(frames.length, 24);
  for (const [name, [x, y, width, height]] of frames) {
    assert.ok(x >= 4 && y >= 4 && x + width + 4 <= image.width && y + height + 4 <= image.height, name);
    let visible = 0;
    for (let row = y; row < y + height; row++) for (let column = x; column < x + width; column++) {
      if (image.rgba[(row * image.width + column) * 4 + 3] >= 32) visible++;
    }
    assert.ok(visible > 100, `Missing sprite: ${name}`);
    for (const [other, [otherX, otherY, otherWidth, otherHeight]] of frames) {
      if (name === other) continue;
      assert.ok(x + width + 8 <= otherX || otherX + otherWidth + 8 <= x
        || y + height + 8 <= otherY || otherY + otherHeight + 8 <= y, `${name} overlaps ${other}`);
    }
  }
  for (const [x, y] of [[0, 0], [1535, 0], [0, 1023], [1535, 1023]]) {
    assert.equal(image.rgba[(y * image.width + x) * 4 + 3], 0, 'Backdrop must be genuinely transparent');
  }
});
