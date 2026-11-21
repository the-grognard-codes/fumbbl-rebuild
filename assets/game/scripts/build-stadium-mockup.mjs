import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readRgbaPng } from './png-art.mjs';
import { AssetOutput } from './asset-output.mjs';

const root = new URL('../pitch/stadiums/mockup/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('provenance.json', root), 'utf8'));
const pngs = (await readdir(root)).filter(file => file.endsWith('.png')).sort();
if (JSON.stringify(pngs) !== JSON.stringify(manifest.assets.map(entry => entry.file).sort())) throw Error('Uncatalogued stadium mockup source');
for (const entry of manifest.assets) {
  const url = new URL(entry.file, root), bytes = await readFile(url), image = await readRgbaPng(url);
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256 || image.width !== entry.width || image.height !== entry.height || !entry.prompt || !entry.reference)
    throw Error(`Invalid stadium mockup provenance: ${entry.file}`);
}
// This source contains only authored blue/gold cloth and protected dark outlines.
// Classification happens once at build time, never against mixed-material art.
for (const file of ['cloth-v1', 'human-sides-indexed-v1', 'orc-sides-indexed-v1', 'human-ends-indexed-v2', 'human-sides-gesture-v1']) {
const image = await readRgbaPng(new URL(file + '.png', root));
const indices = new Uint8Array(image.width * image.height);
for (let pixel = 0; pixel < indices.length; pixel++) {
  const [r, g, b, a] = image.rgba.subarray(pixel * 4, pixel * 4 + 4);
  if (!a || Math.max(r, g, b) < 35) continue;
  const primary = b > r * 1.35 && b > g * 1.12;
  const secondary = file === 'cloth-v1' ? r > b * 1.5 && g > b * 1.3 && r > g * .9 : r > g * 1.6 && b > g * 1.4 && r > b * .7;
  if (primary || secondary) indices[pixel] = (secondary ? 16 : 0) + 1 + Math.min(15, Math.floor(Math.max(r, g, b) / 256 * 16));
}
const target = new URL(file + '-indices.bin.gz', root);
if (process.argv.includes('--check')) {
  if (!gunzipSync(await readFile(target)).equals(indices)) throw Error(`Stadium cloth indices are stale: ${file}`);
} else await new AssetOutput().write(target, gzipSync(indices, { level: 9 }));
}
console.log('Validated Old World Classic mockup sources and cloth indices.');
