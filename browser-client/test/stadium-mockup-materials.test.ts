import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { readRgbaPng } from '../../assets/game/scripts/png-art.mjs';
import { recolorTeamImage } from '../src/team-color-art.ts';

for (const name of ['cloth-v1', 'human-sides-indexed-v1', 'orc-sides-indexed-v1', 'human-ends-indexed-v2', 'human-sides-gesture-v1']) {
  test(`${name}: indexed cloth recolours while protected pixels and alpha remain byte-identical`, async () => {
    const root = new URL('../../assets/game/pitch/stadiums/mockup/', import.meta.url);
    const { rgba, width, height } = await readRgbaPng(new URL(name + '.png', root));
    const indices = gunzipSync(await readFile(new URL(name + '-indices.bin.gz', root)));
    assert.equal(indices.length, width * height);
    assert.ok(indices.includes(0) && indices.some(index => index > 0 && index <= 16) && indices.some(index => index > 16));
    const output = recolorTeamImage({ rgba, indices }, { version: 1, primary: 'white', secondary: 'black' });
    let changed = 0;
    for (let pixel = 0; pixel < indices.length; pixel++) {
      const offset = pixel * 4;
      assert.equal(output[offset + 3], rgba[offset + 3]);
      if (!rgba[offset + 3]) assert.equal(indices[pixel], 0);
      if (!indices[pixel]) {
        if (output[offset] !== rgba[offset] || output[offset + 1] !== rgba[offset + 1] || output[offset + 2] !== rgba[offset + 2]) assert.fail(`Protected pixel changed at ${pixel}`);
      } else if (output[offset] !== rgba[offset]) changed++;
    }
    assert.ok(changed > 1000);
  });
}
