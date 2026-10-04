import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const deliveryRoot = fileURLToPath(new URL('../../../browser-client/public/assets/game/', import.meta.url));
const generatedCatalogPath = fileURLToPath(new URL('../../../browser-client/src/generated-player-art.ts', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.length > (check ? 3 : 2) || (process.argv[2] && !check)) {
  throw new Error('Usage: node sync-browser-assets.mjs [--check]');
}
const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));

// The accepted pose PNGs use ordinary non-interlaced RGBA PNG encoding. Read
// visible alpha here so catalog bounds cannot silently drift from the images.
async function pngVisibleBounds(path) {
  const png = await readFile(path);
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${path}`);
  let offset = 8;
  let width;
  let height;
  const compressed = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (offset + 12 + length > png.length) throw new Error(`Truncated PNG: ${path}`);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error(`Pose PNG must be non-interlaced RGBA8: ${path}`);
      }
    }
    if (type === 'IDAT') compressed.push(data);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  if (!width || !height || !compressed.length) throw new Error(`Incomplete PNG: ${path}`);
  const inflated = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  if (inflated.length !== height * (stride + 1)) throw new Error(`Invalid PNG scanlines: ${path}`);
  let previous = Buffer.alloc(stride);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0, cursor = 0; y < height; y++) {
    const filter = inflated[cursor++];
    const current = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? current[i - 4] : 0;
      const above = previous[i];
      const upperLeft = i >= 4 ? previous[i - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const distances = [Math.abs(p - left), Math.abs(p - above), Math.abs(p - upperLeft)];
        predictor = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? above : upperLeft;
      } else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${path}`);
      current[i] = (inflated[cursor++] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      if (current[x * 4 + 3] >= 32) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    previous = current;
  }
  if (x1 < 0) throw new Error(`Empty pose PNG: ${path}`);
  return { width, height, bounds: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } };
}

const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);
const poseNames = ['front', 'back', 'front45', 'back45', 'side', 'prone', 'stunned'];
async function validatePosePack(rosterId, team) {
  const version = team.posePack;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(version)) throw new Error(`Invalid pose pack version: ${rosterId}`);
  const packPath = resolve(gameRoot, 'teams', rosterId, 'poses', version);
  const catalog = await readJson(resolve(packPath, 'catalog.json'));
  if (catalog.version !== version || catalog.rosterId !== rosterId || !same(Object.keys(catalog.positions).sort(), Object.keys(team.positions).sort())) {
    throw new Error(`Pose catalog differs from team positions: ${rosterId}`);
  }
  const expected = new Set();
  for (const [role, position] of Object.entries(catalog.positions)) {
    if (!same(Object.keys(position.poses).sort(), [...poseNames].sort())) throw new Error(`Incomplete pose set: ${rosterId}/${role}`);
    const size = position.sizeClass;
    if (!['standard', 'small', 'big'].includes(size)) throw new Error(`Invalid size class: ${rosterId}/${role}`);
    const canvas = size === 'big' ? 80 : 64;
    const maximum = size === 'big' ? 76 : size === 'small' ? 46 : 60;
    for (const pose of poseNames) {
      const entry = position.poses[pose];
      const file = `master/${role}-${pose}.png`;
      if (entry.file !== file) throw new Error(`Invalid pose file: ${rosterId}/${role}/${pose}`);
      const { width, height, bounds } = await pngVisibleBounds(resolve(packPath, file));
      if (width !== canvas || height !== canvas || !same(entry.bounds, bounds) || entry.width !== width || entry.height !== height ||
          bounds.x < 1 || bounds.y < 1 || bounds.x + bounds.width >= canvas || bounds.y + bounds.height >= canvas ||
          bounds.width > maximum || bounds.height > maximum ||
          !same(entry.footAnchor, { x: canvas / 2, y: bounds.y + bounds.height }) ||
          !same(entry.groundAnchor, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })) {
        throw new Error(`Invalid pose geometry: ${rosterId}/${role}/${pose}`);
      }
      expected.add(`${role}-${pose}.png`);
    }
    const portrait = position.portrait;
    const file = `master/${role}-portrait.png`;
    const { width, height, bounds } = await pngVisibleBounds(resolve(packPath, file));
    if (portrait.file !== file || width !== 160 || height !== 160 || portrait.width !== width || portrait.height !== height || !same(portrait.bounds, bounds)) {
      throw new Error(`Invalid portrait geometry: ${rosterId}/${role}`);
    }
    expected.add(`${role}-portrait.png`);
  }
  const actual = await readdir(resolve(packPath, 'master'));
  if (!same(actual.sort(), [...expected].sort())) throw new Error(`Pose master inventory differs: ${rosterId}`);
  return catalog;
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Unsupported asset entry: ${path}`);
  }
  return result;
}

const inputs = [
  ['pitch', 'pitch'],
  ['ui/fonts', 'ui/fonts'],
  ['ui/mvp-art/match-ui-icon-atlas-v1.png', 'ui/match-ui-icon-atlas-v1.png'],
  ['ui/reroll-v1.png', 'ui/reroll-v1.png'],
  ['references/match-screen-concept-v1.png', 'references/match-screen-concept-v1.png'],
  ['archive/teams/human/36px-v1/sprites', 'archive/humans-36px-v1']
];

const rosterIds = (await readdir(resolve(gameRoot, 'teams'), { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const poseCatalogs = {};
for (const rosterId of rosterIds) {
  const team = await readJson(resolve(gameRoot, 'teams', rosterId, 'team.json'));
  if (team.rosterId !== rosterId || team.master !== 'master') throw new Error(`Invalid team record: ${rosterId}`);
  const manifest = await readJson(resolve(gameRoot, 'teams', rosterId, 'manifest.json'));
  const expected = new Set(manifest.map(player => player.id + '.png'));
  const actual = new Set((await readdir(resolve(gameRoot, 'teams', rosterId, 'master'))).filter(name => name.endsWith('.png')));
  if (expected.size !== manifest.length || expected.size !== actual.size || [...expected].some(name => !actual.has(name)) ||
      manifest.some(player => player.file !== `master/${player.id}.png`)) {
    throw new Error(`Manifest and master sprites differ: ${rosterId}`);
  }
  const assigned = Object.values(team.positions).flat();
  if (assigned.length !== expected.size || new Set(assigned).size !== expected.size) {
    throw new Error(`Position inventory differs from manifest: ${rosterId}`);
  }
  for (const variants of Object.values(team.positions)) {
    if (!Array.isArray(variants) || variants.length === 0 || variants.some(name => !expected.has(name))) {
      throw new Error(`Unknown position variant: ${rosterId}`);
    }
  }
  inputs.push([`teams/${rosterId}/master`, `teams/${rosterId}`]);
  if (team.posePack) {
    poseCatalogs[rosterId] = await validatePosePack(rosterId, team);
    inputs.push([`teams/${rosterId}/poses/${team.posePack}/master`, `teams/${rosterId}/poses/${team.posePack}/master`]);
    inputs.push([`teams/${rosterId}/poses/${team.posePack}/catalog.json`, `teams/${rosterId}/poses/${team.posePack}/catalog.json`]);
  }
}

const generatedCatalog = `// Generated by assets/game/scripts/sync-browser-assets.mjs. Do not edit.\nexport const playerArtCatalog = ${JSON.stringify(poseCatalogs, null, 2)} as const;\n`;

const expected = new Map();
for (const [sourcePath, deliveryPath] of inputs) {
  const source = resolve(gameRoot, sourcePath);
  const files = (await stat(source)).isDirectory() ? await filesUnder(source) : [source];
  for (const file of files) {
    const suffix = file === source ? '' : relative(source, file);
    const target = resolve(deliveryRoot, deliveryPath, suffix);
    expected.set(target, file);
  }
}

if (check) {
  if (await readFile(generatedCatalogPath, 'utf8') !== generatedCatalog) throw new Error('Generated player art catalog is out of sync. Run npm run assets:sync.');
  const actual = await filesUnder(deliveryRoot);
  if (actual.length !== expected.size || actual.some(path => !expected.has(path))) {
    throw new Error('Browser game asset file list is out of sync. Run npm run assets:sync.');
  }
  for (const [target, source] of expected) {
    const digest = path => readFile(path).then(bytes => createHash('sha256').update(bytes).digest('hex'));
    if (await digest(target) !== await digest(source)) throw new Error(`Browser game asset differs: ${relative(deliveryRoot, target)}`);
  }
  console.log(`Checked ${expected.size} browser game assets.`);
} else {
  await writeFile(generatedCatalogPath, generatedCatalog);
  await rm(deliveryRoot, { recursive: true, force: true });
  for (const [target, source] of expected) {
    await mkdir(resolve(target, '..'), { recursive: true });
    await cp(source, target);
  }
  console.log(`Synced ${expected.size} browser game assets.`);
}
