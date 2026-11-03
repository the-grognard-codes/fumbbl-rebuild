import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { decodeSpriteProof, recolorProofImage, SpriteProofTextures } from '../src/sprite-proof-format.ts';
import { resolvePlayerPortrait } from '../src/player-art.ts';

const raw = JSON.parse(await readFile(new URL('../../assets/game/proofs/shared-sprite-v1/delivery/pack.json', import.meta.url), 'utf8'));
const pack = decodeSpriteProof(raw);

test('every delivered player, bust and helmet preserves fixed pixels and alpha for all 256 ordered pairs', () => {
  for (const image of pack.images) {
    const original = [...image.rgba];
    for (const primary of pack.ramps) for (const secondary of pack.ramps) {
      const output = recolorProofImage(image, primary, secondary);
      assert.equal(output.length, original.length);
      for (let pixel = 0; pixel < image.width * image.height; pixel++) {
        const offset = pixel * 4;
        assert.equal(output[offset + 3], original[offset + 3]);
        if (image.indices[Math.floor(pixel / image.width)][pixel % image.width] === 0) {
          assert.deepEqual([...output.slice(offset, offset + 4)], original.slice(offset, offset + 4));
        }
      }
    }
    assert.deepEqual(image.rgba, original, 'rendering never mutates source artwork');
  }
});

test('reserved indices select exact ordered ramp entries, including equal colors and translucent pixels', () => {
  const image = { ...pack.images[0], width: 33, height: 1, indices: [Array.from({ length: 33 }, (_, i) => i)], rgba: Array.from({ length: 33 }, () => [8, 9, 10, 128]).flat() };
  const primary = { id: 'a', name: 'A', colors: ['#1000ff','#1100ff','#1200ff','#1300ff','#1400ff','#1500ff','#1600ff','#1700ff','#1800ff','#1900ff','#1a00ff','#1b00ff','#1c00ff','#1d00ff','#1e00ff','#1f00ff'] };
  const secondary = { id: 'b', name: 'B', colors: ['#00a080','#00a180','#00a280','#00a380','#00a480','#00a580','#00a680','#00a780','#00a880','#00a980','#00aa80','#00ab80','#00ac80','#00ad80','#00ae80','#00af80'] };
  const expected = [8, 9, 10, 128,
    ...[16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31].flatMap(red => [red, 0, 255, 128]),
    ...[160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175].flatMap(green => [0, green, 128, 128])];
  assert.deepEqual([...recolorProofImage(image, primary, secondary)], expected);
  const same = recolorProofImage(image, primary, primary);
  assert.deepEqual([...same.slice(4, 68)], [...same.slice(68, 132)]);
});

test('sixteen-shade sources retain original material membership and recover more than three shade levels', async () => {
  const archived = JSON.parse(await readFile(new URL('../../assets/game/proofs/shared-sprite-v1/archive/three-shade/materials.json', import.meta.url), 'utf8'));
  for (const image of pack.images) {
    const old = archived.images.find((entry: { id: string }) => entry.id === image.id);
    if (!old) continue; // Later samples are absent from the archived lineman proof.
    image.indices.forEach((row, y) => row.forEach((index, x) => {
      const original = Number(old.indices[y][x]);
      assert.equal(index === 0, original === 0);
      if (original !== 0) assert.equal(index <= 16, original <= 3);
    }));
    assert.ok(new Set(image.indices.flat().filter(index => index > 0 && index <= 16)).size > 3);
    assert.ok(new Set(image.indices.flat().filter(index => index > 16)).size > 3);
  }
});

test('Human helmet preserves atlas crop pixels and fixed equipment', async () => {
  const { readRgbaPng } = await import('../../assets/game/scripts/png-art.mjs');
  const atlas = await readRgbaPng(new URL('../../assets/game/ui/mvp-art/match-ui-icon-atlas-v1.png', import.meta.url));
  const helmet = pack.images.find(image => image.kind === 'helmet')!;
  assert.equal(helmet.width, 336); assert.equal(helmet.height, 317);
  for (let y = 0; y < helmet.height; y++) {
    const offset = ((y + 106) * atlas.width + 64) * 4;
    assert.deepEqual(helmet.rgba.slice(y * 336 * 4, (y + 1) * 336 * 4), [...atlas.rgba.slice(offset, offset + 336 * 4)]);
  }
  for (const [x, y] of [[200, 225], [260, 120], [220, 160], [115, 248]]) assert.equal(helmet.indices[y][x], 0);
  const textures = new SpriteProofTextures(pack, image => `texture:${image.id}`);
  assert.equal(textures.resolve('/assets/game/ui/match-ui-icon-atlas-v1.png#human', 'red', 'gold'), 'texture:human-helmet');
  assert.equal(textures.resolve('/assets/game/ui/match-ui-icon-atlas-v1.png#orc', 'red', 'gold'), '/assets/game/ui/match-ui-icon-atlas-v1.png#orc');
});

test('malformed dimensions, assignments, palettes, paths and source records fail before rendering', () => {
  const changes = [
    (value: typeof raw) => { value.version = 1; },
    (value: typeof raw) => { value.ramps.pop(); },
    (value: typeof raw) => { value.ramps[1].id = value.ramps[0].id; },
    (value: typeof raw) => { value.ramps[0].colors[0] = 'red'; },
    (value: typeof raw) => { value.ramps[0].colors.pop(); },
    (value: typeof raw) => { value.ramps[0].colors[1] = value.ramps[0].colors[0]; },
    (value: typeof raw) => { value.images[0].width = 0; },
    (value: typeof raw) => { value.images[0].rgba[0] = 256; },
    (value: typeof raw) => { value.images[0].rgba.pop(); },
    (value: typeof raw) => { value.images[0].indices[0] = Array(64).fill(33); },
    (value: typeof raw) => { value.images[0].indices[0] = Array(64).fill(-1); },
    (value: typeof raw) => { value.images[0].indices[0] = Array(64).fill(1.5); },
    (value: typeof raw) => { value.images[0].indices[0] = '0'.repeat(64); },
    (value: typeof raw) => { value.images[0].indices[0] = Array(64).fill(1); },
    (value: typeof raw) => { value.images[0].sourceUrl = '/assets/game/../secret.png'; },
    (value: typeof raw) => { value.images.push(value.images[0]); },
  ];
  for (const change of changes) { const value = structuredClone(raw); change(value); assert.throws(() => decodeSpriteProof(value), /Invalid sprite proof/); }
});

test('bust consumers share the existing portrait identity; unsupported players retain static fallback', () => {
  let encodes = 0;
  const textures = new SpriteProofTextures(pack, () => `texture-${++encodes}`, 2);
  const source = resolvePlayerPortrait({ id: '1', name: 'Lineman', slot: 1, role: 'home', x: null, y: null,
    state: 'reserve', art: { rosterId: 'human', positionId: 'lineman' } });
  assert.ok(source?.endsWith('/lineman-portrait.png'));
  assert.equal(textures.resolve(source, 'red', 'gold'), 'texture-1');
  assert.equal(textures.resolve(source, 'red', 'gold'), 'texture-1');
  assert.equal(textures.resolve('/play' + source, 'red', 'gold'), 'texture-1', 'base URL does not change portrait identity');
  assert.equal(textures.resolve('/unknown.png', 'red', 'gold'), '/unknown.png');
  assert.equal(textures.resolve(null, 'red', 'gold'), null);
  assert.throws(() => textures.resolve(source, 'missing', 'gold'), /Unknown proof palette/);
  textures.resolve(source, 'navy', 'ivory'); textures.resolve(source, 'black', 'white');
  assert.equal(textures.size, 2);
  assert.equal(textures.resolve(source, 'red', 'gold'), 'texture-4', 'evicted texture is regenerated');
});
