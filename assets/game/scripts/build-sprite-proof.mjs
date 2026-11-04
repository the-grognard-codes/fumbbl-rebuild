import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readRgbaPng } from './png-art.mjs';
import { AssetOutput } from './asset-output.mjs';
import { decodeSpriteProof } from '../../../browser-client/src/sprite-proof-format.ts';

const root = new URL('../proofs/shared-sprite-v1/', import.meta.url);
const readJson = async url => JSON.parse((await readFile(url, 'utf8')).replace(/^\uFEFF/, ''));
const ramps = await readJson(new URL('source/palettes.json', root));
const assignments = await readJson(new URL('source/materials.json', root));
if (assignments.version !== 2) throw Error('Expected 16-shade material assignments (version 2)');
const images = [];
for (const assignment of assignments.images) {
  const helmet = assignment.kind === 'helmet';
  if (helmet ? assignment.source !== 'ui/mvp-art/match-ui-icon-atlas-v1.png'
    : !/^teams\/human\/poses\/coach-oriented-v1\/master\/(lineman-(front45|portrait)|(halfling|ogre)-portrait)\.png$/.test(assignment.source))
    throw Error('Proof source is not a scoped asset');
  // The historical proof retains its approved pixels when production portraits advance.
  if (assignment.archiveSource && assignment.archiveSource !== `proofs/shared-sprite-v1/source/originals/${assignment.source.split('/').at(-1)}`)
    throw Error('Invalid archived proof source');
  const source = new URL('../' + (assignment.archiveSource ?? assignment.source), import.meta.url);
  let image = await readRgbaPng(fileURLToPath(source));
  const sourceSha256 = createHash('sha256').update(await readFile(source)).digest('hex');
  if (sourceSha256 !== assignment.sourceSha256) throw Error('Source artwork changed; review the material map again');
  if (helmet) {
    const crop = assignment.crop;
    // MatchArt's established Human region. Keep source-resolution pixels and alpha intact.
    if (!crop || crop.x !== 64 || crop.y !== 106 || crop.width !== 336 || crop.height !== 317
      || image.width !== 1774 || image.height !== 887) throw Error('Invalid Human helmet atlas crop');
    const rgba = Buffer.alloc(crop.width * crop.height * 4);
    for (let y = 0; y < crop.height; y++) image.rgba.copy(rgba, y * crop.width * 4,
      ((crop.y + y) * image.width + crop.x) * 4, ((crop.y + y) * image.width + crop.x + crop.width) * 4);
    image = { width: crop.width, height: crop.height, rgba };
  }
  images.push({ id: assignment.id, kind: assignment.kind, sourceUrl: helmet ? '/assets/game/ui/match-ui-icon-atlas-v1.png#human' : '/assets/game/' + assignment.source,
    sourceSha256, width: image.width, height: image.height, rgba: [...image.rgba], indices: assignment.indices });
}
const pack = decodeSpriteProof({ version: 2, status: 'palette-review', ramps, images });
const contents = JSON.stringify(pack) + '\n';
const output = new URL('delivery/pack.json', root);
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== contents) throw Error('Sprite proof export is stale');
  console.log(`Verified repeatable sprite proof export: ${images.length} images, 16 ramps.`);
} else {
  await new AssetOutput().write(output, contents);
  console.log(`Exported sprite proof: ${images.length} images, 16 ramps.`);
}
