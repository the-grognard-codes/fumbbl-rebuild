import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { playerArtCatalog } from '../src/generated-player-art.ts';

const gameRoot = fileURLToPath(new URL('../../assets/game/', import.meta.url));
const deliveryRoot = fileURLToPath(new URL('../public/assets/game/', import.meta.url));
const poses = ['front', 'back', 'front45', 'back45', 'side', 'prone', 'stunned'];

test('catalog contains exactly one complete pose and portrait set per authoritative position', async () => {
  for (const rosterId of ['human', 'orc'] as const) {
    const team = JSON.parse(await readFile(`${gameRoot}/teams/${rosterId}/team.json`, 'utf8'));
    const generated = playerArtCatalog[rosterId];
    assert.equal(team.posePack, generated.version);
    assert.deepEqual(Object.keys(generated.positions).sort(), Object.keys(team.positions).sort());
    const expected: string[] = [];
    for (const [role, position] of Object.entries(generated.positions)) {
      assert.deepEqual(Object.keys(position.poses).sort(), [...poses].sort());
      for (const pose of poses) {
        const image = position.poses[pose as keyof typeof position.poses];
        assert.equal(image.file, `master/${role}-${pose}.png`);
        expected.push(`${role}-${pose}.png`);
      }
      assert.equal(position.portrait.file, `master/${role}-portrait.png`);
      assert.equal(position.portrait.width, 160);
      expected.push(`${role}-portrait.png`);
    }
    assert.equal(expected.length, 48);
    const directory = `${deliveryRoot}/teams/${rosterId}/poses/${team.posePack}/master`;
    assert.deepEqual((await readdir(directory)).sort(), expected.sort());
    for (const name of expected) assert.ok((await stat(`${directory}/${name}`)).size > 0);
  }
});
