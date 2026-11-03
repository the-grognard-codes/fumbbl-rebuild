import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { decodeProofAnimation, proofFrameAt, findProofClip, animationFrameAt } from '../src/sprite-proof-animation.ts';
import { recolorProofImage } from '../src/sprite-proof-format.ts';
const source = JSON.parse(await readFile(new URL('../../assets/game/proofs/shared-sprite-v1/delivery/animation.json', import.meta.url), 'utf8'));
test('animation loops exactly at boundaries and fall holds final pose', () => {
  assert.equal(proofFrameAt('move', 139), 0); assert.equal(proofFrameAt('move', 140), 1);
  assert.equal(proofFrameAt('move', 559), 3); assert.equal(proofFrameAt('move', 560), 0);
  assert.equal(proofFrameAt('fall', 499), 2); assert.equal(proofFrameAt('fall', 500), 3);
  assert.equal(proofFrameAt('fall', 100000), 3);
  assert.equal(proofFrameAt('idle', -1), 0); assert.equal(proofFrameAt('idle', NaN), 0);
  assert.equal(proofFrameAt('move', 200, true), 0); assert.equal(proofFrameAt('fall', 0, true), 3);
});
test('complete two-direction clips are required', () => {
  assert.equal(decodeProofAnimation(source).palettePack.images.length, 48);
  assert.throws(() => decodeProofAnimation({ ...source, clips: source.clips.slice(1) }));
});
test('all animation frames preserve fixed materials and alpha across 256 pairs', () => {
  const pack = decodeProofAnimation(source).palettePack;
  for (const image of pack.images) for (const primary of pack.ramps) for (const secondary of pack.ramps) {
    const result = recolorProofImage(image, primary, secondary);
    for (let pixel = 0; pixel < image.width * image.height; pixel++) {
      const at = pixel * 4;
      assert.equal(result[at + 3], image.rgba[at + 3]);
      if (!image.indices[Math.floor(pixel / image.width)][pixel % image.width]) {
        for (let channel = 0; channel < 3; channel++) assert.equal(result[at + channel], image.rgba[at + channel]);
      }
    }
  }
});
test('manifest timing drives playback and unsupported clips retain fallback', () => {
  const pack = decodeProofAnimation(source), clip = findProofClip(pack, 'ogre', 'move', 'front45')!;
  assert.equal(animationFrameAt(clip, 140), 1);
  assert.equal(findProofClip(pack, 'ogre', 'move', 'back45'), null);
  assert.equal(findProofClip(pack, 'lineman', 'pass', 'front45'), null);
  const longer = structuredClone(clip); longer.frames[0].durationMs = 400;
  assert.equal(animationFrameAt(longer, 140), 0);
});
test('invalid anchors, timing, bounds and frame identity are rejected', () => {
  for (const change of [
    (value: typeof source) => { value.clips[0].frames[0].durationMs = 0; },
    (value: typeof source) => { value.clips[0].frames[0].footAnchor.x = -1; },
    (value: typeof source) => { value.clips[0].frames[0].bounds.width = 1; },
    (value: typeof source) => { value.clips[0].frames.reverse(); },
    (value: typeof source) => { value.clips[0].loop = false; },
  ]) { const value = structuredClone(source); change(value); assert.throws(() => decodeProofAnimation(value)); }
});
