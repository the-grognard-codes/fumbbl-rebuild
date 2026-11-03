import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readRgbaPng } from './png-art.mjs';
import { AssetOutput } from './asset-output.mjs';
import { decodeProofAnimation } from '../../../browser-client/src/sprite-proof-animation.ts';

const root = new URL('../proofs/shared-sprite-v1/', import.meta.url);
const ramps = JSON.parse(await readFile(new URL('source/palettes.json', root), 'utf8'));
const images = [], clips = [];
const output = new AssetOutput();
for (const design of ['lineman', 'halfling', 'ogre']) {
const batch = new URL(`../teams/human/batches/${design}-animation-proof-v1/export-v${design === 'halfling' ? 1 : 2}/`, import.meta.url);
const manifest = JSON.parse((await readFile(new URL('manifest.json', batch), 'utf8')).replace(/^\uFEFF/, ''));
for (const entry of manifest.players) {
  const url = new URL(entry.file, batch), { width, height, rgba } = await readRgbaPng(fileURLToPath(url));
  const frameDestination = new URL(`delivery/frames/${entry.id}.png`, root), png = await readFile(url);
  if (process.argv.includes('--check')) {
    if (!(await readFile(frameDestination)).equals(png)) throw Error('Animation PNG delivery is stale');
  } else await output.write(frameDestination, png);
  // Authoring sentinels: saturated blue = primary; magenta = secondary. Neutral steel,
  // skin, leather and near-black contours stay fixed. Persisted indices are authoritative.
  const indices = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    const [r, g, b, a] = rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4);
    const primary = b > r * 1.3 && b > g * 1.15 && b - r > 15;
    const secondary = r > g * 1.6 && b > g * 1.4 && Math.min(r, b) - g > 25;
    if (!a || (!primary && !secondary)) return 0;
    const value = primary ? b : Math.max(r, b);
    const shade = Math.max(0, Math.min(15, Math.round((value - 25) / 230 * 15)));
    return (primary ? 1 : 17) + shade;
  }));
  images.push({ id: entry.id, kind: 'body', width, height, rgba: [...rgba], indices,
    sourceUrl: `/assets/game/proofs/shared-sprite-v1/frames/${entry.id}.png`,
    sourceSha256: createHash('sha256').update(await readFile(url)).digest('hex') });
}
for (const direction of design === 'lineman' ? ['front45', 'back45'] : ['front45']) for (const clip of ['idle', 'move', 'fall']) {
  const baseline = manifest.players.find(entry => entry.id === `${design}-${direction}-idle-0`);
  const baseCenter = baseline.bounds.y + baseline.bounds.height / 2;
  clips.push({ design, direction, id: clip, loop: clip !== 'fall', frames: [0, 1, 2, 3].map(index => {
    const entry = manifest.players.find(entry => entry.id === `${design}-${direction}-${clip}-${index}`);
    const b = entry.bounds, ground = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, blend = clip === 'fall' ? index / 3 : 0;
    return { imageId: entry.id, durationMs: clip === 'idle' ? 260 : clip === 'move' ? 140 : [160, 160, 180, 300][index],
      bounds: b, footAnchor: { x: entry.width / 2, y: (entry.height - 1) * (1 - blend) + ground.y * blend },
      bodyAnchor: { x: entry.width / 2, y: baseCenter * (1 - blend) + ground.y * blend }, groundAnchor: ground,
      pose: clip === 'fall' && index === 3 ? 'prone' : 'front45' };
  }) });
}
}
const authored = new URL('source/animation-authoring.json', root);
if (process.argv.includes('--author')) await new AssetOutput().write(authored, JSON.stringify({
  images: images.map(({ id, sourceSha256, indices }) => ({ id, sourceSha256, indices })), clips
}, null, 2) + '\n');
const assignments = JSON.parse(await readFile(authored, 'utf8'));
for (const image of images) {
  const assignment = assignments.images.find(entry => entry.id === image.id);
  if (!assignment || assignment.sourceSha256 !== image.sourceSha256) throw Error('Animation material source changed');
  image.indices = assignment.indices;
}
const pack = decodeProofAnimation({ version: 1, palettePack: { version: 2, status: 'palette-review', ramps, images }, clips: assignments.clips });
const destination = new URL('delivery/animation.json', root), content = JSON.stringify(pack) + '\n';
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== content) throw Error('Animation export is stale');
} else await new AssetOutput().write(destination, content);
