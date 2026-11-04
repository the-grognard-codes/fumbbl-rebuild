/** Offline material authoring corrections. Exports consume the saved maps, never these selectors. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readRgbaPng, visibleBounds } from './png-art.mjs';
const root = new URL('../', import.meta.url);
const inside = (x, y, box) => x >= box[0] && y >= box[1] && x <= box[2] && y <= box[3];
for (const roster of ['human', 'orc']) {
  const file = new URL(`team-colors/v1/source/${roster}.json`, root);
  const maps = JSON.parse(await readFile(file, 'utf8'));
  for (const entry of maps.images) {
    if (entry.id.endsWith('-helmet') || entry.id.endsWith('-portrait')) continue; // Approved redesign masks are authoritative.
    let image = await readRgbaPng(fileURLToPath(new URL(entry.source, root)));
    if (entry.crop) {
      const { x, y, width, height } = entry.crop, rgba = Buffer.alloc(width * height * 4);
      for (let row = 0; row < height; row++) image.rgba.copy(rgba, row * width * 4, ((row + y) * image.width + x) * 4, ((row + y) * image.width + x + width) * 4);
      image = { width, height, rgba };
    }
    const bounds = visibleBounds(image), portrait = entry.id.endsWith('portrait');
    const pose = entry.id.split('-').at(-1), small = /halfling|goblin/.test(entry.id), big = /ogre|troll/.test(entry.id);
    // Face and exposed feet regions exclude eye whites, teeth and warm skin highlights.
    const face = portrait
      ? entry.id.includes('halfling') ? [.18, .05, .82, .78] : entry.id.includes('ogre') ? [.28, 0, .77, .75]
        : roster === 'human' ? [.22, .43, .79, .79]
          : entry.id.includes('troll') ? [.24, 0, .78, .88] : entry.id.includes('blitzer') ? [.28, .33, .78, .80]
            : entry.id.includes('goblin') ? [.28, .35, .88, .85] : [.22, .08, .86, .80]
      : ['back', 'back45', 'stunned'].includes(pose) ? null
        : pose === 'prone' ? [.32, 0, .69, .28]
          : small || big || roster === 'orc' && !/blitzer|goblin/.test(entry.id) ? [.3, 0, .74, .35]
            : pose === 'side' ? [.55, .12, .99, .34] : pose === 'front45' ? [.46, .17, .82, .37] : [.3, .17, .7, .37];
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const at = (y * image.width + x) * 4, [r, g, b, a] = image.rgba.subarray(at, at + 4);
      const nx = (x - bounds.x) / bounds.width, ny = (y - bounds.y) / bounds.height;
      const light = .2126 * r + .7152 * g + .0722 * b;
      if (roster === 'human') {
        if (face && inside(nx, ny, face) || !portrait && small && ny > .82) entry.indices[y][x] = 0;
        continue;
      }
      const protectedFace = face && inside(nx, ny, face);
      let paintedRegion = portrait
        ? entry.id.includes('blitzer') ? ny < .35 && nx > .25 && nx < .76 || ny > .5 && (nx < .32 || nx > .77) || ny > .85
          : entry.id.includes('goblin') ? ny < .38 && nx > .30 || ny > .60 && (nx < .33 || nx > .8)
            : ny > .52 && (nx < .3 || nx > .77) || ny > .87
        : ny > .12 && ny < .85;
      if (entry.id.includes('troll')) {
        const regions = portrait ? [[0, .45, .23, .88], [.82, .45, 1, .88]]
          : pose === 'side' ? [[.23, .14, .58, .34]]
            : pose === 'front45' ? [[.10, .15, .38, .34], [.68, .16, .90, .34], [.40, .36, .64, .49]]
              : pose === 'back45' ? [[.05, .12, .33, .32], [.58, .15, .83, .33]]
                : pose === 'prone' || pose === 'stunned' ? [[.09, .14, .32, .32], [.66, .14, .90, .32]]
                  : [[.04, .14, .28, .32], [.70, .14, .96, .32], ...(pose === 'front' ? [[.34, .36, .65, .49]] : [])];
        paintedRegion = regions.some(box => inside(nx, ny, box));
      }
      const fixedSpike = portrait && entry.id.includes('blitzer') && (inside(nx, ny, [.48, 0, .65, .20])
        || inside(nx, ny, [.12, .27, .33, .39]) || inside(nx, ny, [.74, .25, .91, .43]));
      const darkPaint = light > 23 && light < 118 && r < g * 1.32 && g < b * 1.42 && g > r * .77 && b > r * .56;
      const orangePaint = r > 80 && r > g * 1.55 && g > b * 1.55 && g > 25 && r - g > 45;
      let index = 0;
      if (a && !protectedFace && paintedRegion && !fixedSpike) {
        if (darkPaint) index = 1 + Math.min(15, Math.round((light - 18) / 7));
        else if (orangePaint) index = 17 + Math.min(15, Math.round(light / 12));
      }
      // Initial uniform regions; the coverage pass below also authors hair ties.
      if (a && orangePaint && !protectedFace && !fixedSpike && (!entry.id.includes('troll') || paintedRegion)
        && (!portrait || ny > .52) && ny > .15 && ny < .86) index = 17 + Math.min(15, Math.round(light / 12));
      entry.indices[y][x] = index;
    }
  }
  await writeFile(file, JSON.stringify(maps) + '\n');
}
await import('./correct-team-color-coverage.mjs');
