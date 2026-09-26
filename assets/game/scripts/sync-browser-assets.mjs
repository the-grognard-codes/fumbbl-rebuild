import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const deliveryRoot = fileURLToPath(new URL('../../../browser-client/public/assets/game/', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.length > (check ? 3 : 2) || (process.argv[2] && !check)) {
  throw new Error('Usage: node sync-browser-assets.mjs [--check]');
}
const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));

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
  ['references/match-screen-concept-v1.png', 'references/match-screen-concept-v1.png'],
  ['archive/teams/human/36px-v1/sprites', 'archive/humans-36px-v1']
];

const rosterIds = (await readdir(resolve(gameRoot, 'teams'), { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
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
}

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
  await rm(deliveryRoot, { recursive: true, force: true });
  for (const [target, source] of expected) {
    await mkdir(resolve(target, '..'), { recursive: true });
    await cp(source, target);
  }
  console.log(`Synced ${expected.size} browser game assets.`);
}
