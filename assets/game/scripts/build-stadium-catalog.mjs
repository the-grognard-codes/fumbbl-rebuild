import { readFile, writeFile } from 'node:fs/promises';
import { readRgbaPng, visibleBounds } from './png-art.mjs';

const root = new URL('../pitch/stadiums/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', root), 'utf8'));
const atlases = {};
const required = ['stone','timber','gate','gateTop','crowd','crowdSide','crowdTop','banner','bench','benchTop','pavilion','pavilionTop','mugs','torch','torchTop','pennant'];
for (const profile of catalog.atlases) {
  if (!/^[a-z0-9-]+$/.test(profile.id) || atlases[profile.id] || !/^[a-z0-9-]+\.png$/.test(profile.atlas)
      || JSON.stringify(profile.roles) !== JSON.stringify(required)) throw Error('Invalid stadium atlas inventory');
  const image = await readRgbaPng(new URL(profile.atlas, root)), regions = {};
  for (let i = 0; i < required.length; i++) {
    const x = Math.round(i % 4 * image.width / 4), y = Math.round(Math.floor(i / 4) * image.height / 4);
    const right = Math.round((i % 4 + 1) * image.width / 4), bottom = Math.round((Math.floor(i / 4) + 1) * image.height / 4);
    regions[required[i]] = visibleBounds(image, { x, y, width: right - x, height: bottom - y });
  }
  atlases[profile.id] = { ...profile, width: image.width, height: image.height, regions };
}
for (const mapping of [catalog.venues, catalog.teams]) {
  if (!mapping || Object.values(mapping).some(id => !atlases[id])) throw Error('Unknown stadium atlas mapping');
}
const output = new URL('../../../browser-client/src/generated-stadium-art.ts', import.meta.url);
const code = '// Generated from canonical stadium catalog and PNG bounds. Run assets:sync.\n'
  + 'export const stadiumAtlases = ' + JSON.stringify(atlases, null, 2) + ' as const;\n'
  + 'export const stadiumVenues: Readonly<Record<string, keyof typeof stadiumAtlases>> = ' + JSON.stringify(catalog.venues, null, 2) + ';\n'
  + 'export const stadiumTeams: Readonly<Record<string, keyof typeof stadiumAtlases>> = ' + JSON.stringify(catalog.teams, null, 2) + ';\n';
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== code) throw Error('Stadium catalog is out of sync. Run assets:sync.');
} else await writeFile(output, code);
console.log('Validated stadium venues:', Object.keys(catalog.venues).join(', '));
