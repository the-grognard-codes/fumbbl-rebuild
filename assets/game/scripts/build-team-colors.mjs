import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readRgbaPng } from './png-art.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('team-colors/v1/', root);
const json = async url => JSON.parse(await readFile(url, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ramps = await json(new URL('proofs/shared-sprite-v1/source/palettes.json', root));
const proof = await json(new URL('proofs/shared-sprite-v1/source/materials.json', root));
const seed = process.argv.includes('--seed');
const check = process.argv.includes('--check');
await mkdir(new URL('source/', output), { recursive: true });
await mkdir(new URL('delivery/', output), { recursive: true });
async function emit(url, bytes) {
  if (check) { if (!(await readFile(url)).equals(Buffer.from(bytes))) throw Error(`Stale export: ${url}`); }
  else await writeFile(url, bytes);
}
const packs = {};
for (const roster of ['human', 'orc']) {
  const team = await json(new URL(`teams/${roster}/team.json`, root));
  const directory = `teams/${roster}/poses/${team.posePack}/`;
  const catalog = await json(new URL(directory + 'catalog.json', root));
  const inventory = Object.values(catalog.positions).flatMap(position => [position.portrait, ...Object.values(position.poses)])
    .map(entry => ({ source: directory + entry.file, kind: entry.file.endsWith('-portrait.png') ? 'bust' : 'body' }));
  inventory.push({ source: `ui/helmets-v1/${roster}.png`, kind: 'helmet' });
  const mapsUrl = new URL(`source/${roster}.json`, output);
  const maps = seed ? { version: 1, roster, images: [] } : await json(mapsUrl);
  if (maps.version !== 1 || maps.roster !== roster || !seed && maps.images.length !== inventory.length) throw Error('Invalid material inventory');
  const chunks = [], entries = [];
  let offset = 0;
  for (const item of inventory) {
    const source = new URL(item.source, root), bytes = await readFile(source);
    let image = await readRgbaPng(fileURLToPath(source));
    if (item.crop) {
      const { x, y, width, height } = item.crop, rgba = Buffer.alloc(width * height * 4);
      for (let row = 0; row < height; row++) image.rgba.copy(rgba, row * width * 4, ((row + y) * image.width + x) * 4, ((row + y) * image.width + x + width) * 4);
      image = { width, height, rgba };
    }
    const sourceUrl = item.kind === 'helmet' ? `/assets/game/ui/match-ui-icon-atlas-v1.png#${roster}` : '/assets/game/' + item.source;
    const id = item.kind === 'helmet' ? `${roster}-helmet` : `${roster}-${item.source.split('/').at(-1).replace('.png', '')}`;
    let assignment = maps.images.find(entry => entry.id === id);
    if (seed) {
      const accepted = proof.images.find(entry => entry.source === item.source && (item.kind !== 'helmet' || roster === 'human'));
      const indices = accepted ? accepted.indices : Array.from({ length: image.height }, (_, y) => Array.from({ length: image.width }, (_, x) => {
        const [r, g, b, a] = image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
        if (!a) return 0;
        const light = .2126 * r + .7152 * g + .0722 * b;
        // Authoring seed only. Explicit source maps, reviewed by region, are the export input.
        if (roster === 'human') {
          if (b > r * 1.22 && b > g * 1.13 && b > 24) return 1 + Math.min(15, Math.round(light / 12));
          if (r > 115 && g > 100 && b > 65 && r >= g && g > b * 1.07 && r - g < 42 && r - b < 92)
            return 17 + Math.min(15, Math.round((light - 50) / 13));
        } else {
          if (r > 95 && r > g * 1.65 && g > b * 1.65 && g > 30 && r - g > 55)
            return 17 + Math.min(15, Math.round(light / 12));
          if (light > 22 && light < 130 && Math.max(r, g, b) - Math.min(r, g, b) < 18 && b >= r * .95)
            return 1 + Math.min(15, Math.round((light - 20) / 7));
        }
        return 0;
      }));
      assignment = { id, source: item.source, sourceSha256: hash(bytes), ...item.crop && { crop: item.crop }, indices };
      maps.images.push(assignment);
    }
    if (!assignment || assignment.source !== item.source || assignment.sourceSha256 !== hash(bytes)
      || JSON.stringify(assignment.crop) !== JSON.stringify(item.crop) || assignment.indices.length !== image.height) throw Error(`Material source changed: ${id}`);
    const indices = Uint8Array.from(assignment.indices.flat());
    if (assignment.indices.some(row => row.length !== image.width || row.some(index => !Number.isInteger(index) || index < 0 || index > 32))
      || indices.length !== image.width * image.height) throw Error(`Invalid indices: ${id}`);
    for (let pixel = 0; pixel < indices.length; pixel++) if (!image.rgba[pixel * 4 + 3] && indices[pixel]) throw Error(`Transparent material: ${id}`);
    const data = Buffer.concat([image.rgba, indices]);
    entries.push({ id, sourceUrl, sourceSha256: hash(bytes), kind: item.kind, width: image.width, height: image.height, offset, length: data.length });
    chunks.push(data); offset += data.length;
  }
  if (seed) await writeFile(mapsUrl, JSON.stringify(maps) + '\n');
  const raw = Buffer.concat(chunks), compressed = gzipSync(raw, { level: 9, mtime: 0 });
  await emit(new URL(`delivery/${roster}.bin.gz`, output), compressed);
  packs[roster] = { url: `/assets/game/team-colors/v1/${roster}.bin.gz`, bytes: raw.length, sha256: hash(raw), images: entries };
  console.log(`${roster}: ${entries.length} images, ${raw.length} decoded / ${compressed.length} transferred bytes`);
}
const manifest = { version: 1, ramps, packs };
await emit(new URL('delivery/manifest.json', output), JSON.stringify(manifest) + '\n');
await emit(new URL('../../../browser-client/src/generated-team-colors.ts', import.meta.url), '// Generated by assets/game/scripts/build-team-colors.mjs.\nexport const teamColorManifest = ' + JSON.stringify(manifest) + ' as const;\n');
