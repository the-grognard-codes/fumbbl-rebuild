import './build-modular-stadium-catalog.mjs';
import './build-stadium-catalog.mjs';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRgbaPng, visibleBounds } from './png-art.mjs';

const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const deliveryRoot = fileURLToPath(new URL('../../../browser-client/public/assets/game/', import.meta.url));
const generatedCatalogPath = fileURLToPath(new URL('../../../browser-client/src/generated-player-art.ts', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.length > (check ? 3 : 2) || (process.argv[2] && !check)) {
  throw new Error('Usage: node sync-browser-assets.mjs [--check]');
}
const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));

async function pngVisibleBounds(path) {
  const image = await readRgbaPng(path);
  return { width: image.width, height: image.height, bounds: visibleBounds(image) };
}

const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);
const boundedAnchor = (anchor, bounds) => anchor && Object.keys(anchor).length === 2
  && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
  && anchor.x >= bounds.x && anchor.x <= bounds.x + bounds.width
  && anchor.y >= bounds.y && anchor.y <= bounds.y + bounds.height;
const poseNames = ['front', 'back', 'front45', 'back45', 'side', 'prone', 'stunned'];
async function validatePosePack(rosterId, team) {
  const version = team.posePack;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(version)) throw new Error(`Invalid pose pack version: ${rosterId}`);
  const packPath = resolve(gameRoot, 'teams', rosterId, 'poses', version);
  const catalog = await readJson(resolve(packPath, 'catalog.json'));
  if (catalog.anchorVersion !== 2 || catalog.version !== version || catalog.rosterId !== rosterId || !same(Object.keys(catalog.positions).sort(), Object.keys(team.positions).sort())) {
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
          !boundedAnchor(entry.footAnchor, bounds) || !boundedAnchor(entry.bodyAnchor, bounds) ||
          entry.footAnchor.y !== bounds.y + bounds.height ||
          entry.bodyAnchor.y !== bounds.y + bounds.height / 2 ||
          (!['prone', 'stunned'].includes(pose) && entry.bodyAnchor.x !== entry.footAnchor.x) ||
          (['prone', 'stunned'].includes(pose) && !same(entry.bodyAnchor, entry.groundAnchor)) ||
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
  ['ui/skill-icons-v1.svg', 'ui/skill-icons-v1.svg'],
  ['ui/ball-v1.svg', 'ui/ball-v1.svg'],
  ['ui/weather', 'ui/weather'],
  ['ui/dice', 'ui/dice'],
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
    // Authoring instructions and source calls belong in the repository, not public delivery.
    if (sourcePath === 'pitch' && (relative(source,file).split(/[\\/]/).includes('source') || file.endsWith('README.md'))) continue;
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
