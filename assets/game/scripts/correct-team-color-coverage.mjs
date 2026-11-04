/** Offline coverage repair. Only saved per-pixel indices are shipped to the renderer. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readRgbaPng, visibleBounds } from './png-art.mjs';
import { reviewedBustMaterial } from './bust-material-boundaries.mjs';

const root = new URL('../', import.meta.url);
const inside = (x, y, [left, top, right, bottom]) => x >= left && x <= right && y >= top && y <= bottom;
const polygon = (x, y, points) => {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
};

// Normalized visible-art regions: shoulder paint/trim, chest cloth, and hair ties.
// Keep face, tusks, brown hair and leather outside these added material regions.
const portraitTrim = {
  'orc-big-un-blocker-portrait': [[.35, .08, .64, .19], [0, .50, .48, 1], [.77, .49, 1, 1], [.40, .90, .76, 1]],
  'orc-orc-thrower-portrait': [[.35, .07, .64, .19], [0, .71, .43, 1], [.77, .72, 1, 1], [.40, .92, .80, 1]],
  'orc-goblin-lineman-portrait': [[.29, 0, .91, .35], [0, .55, .47, 1], [.68, .58, 1, 1]],
  'orc-orc-blitzer-portrait': [[.32, .12, .76, .38], [0, .50, .32, 1], [.77, .48, 1, 1], [.30, .86, .78, 1]],
  'orc-orc-lineman-portrait': [[0, .43, .30, 1], [.76, .43, 1, 1], [.30, .90, .75, 1]],
  'orc-troll-portrait': [[0, .38, .24, .92], [.79, .42, 1, .94], [.24, .89, .79, 1]],
};
const humanFaceguards = {
  'human-blitzer-portrait': [[50,90],[74,98],[110,99],[122,90],[119,105],[100,117],[76,113],[53,101]],
  'human-catcher-portrait': [[40,81],[49,89],[109,89],[122,79],[119,105],[102,119],[60,119],[42,105]],
  'human-lineman-portrait': [[39,66],[119,66],[119,104],[40,104]],
  'human-thrower-portrait': [[48,80],[113,80],[111,103],[50,103]],
};
// Pauldron trim adjacent to the Ogre's exposed face was removed by the initial
// face exclusion. Keep these contours separate from skin and shoulder spikes.
const ogreTrim = {
  front: [
    [[28,13],[32,13],[32,30],[27,33],[16,29],[17,26],[26,29],[29,27]],
    [[49,13],[53,14],[52,28],[58,29],[65,25],[67,28],[59,33],[49,30]],
  ],
  front45: [
    [[33,11],[37,13],[40,24],[40,28],[31,30],[22,26],[23,23],[31,27],[37,25],[35,17]],
    [[54,16],[57,16],[57,26],[62,27],[64,25],[65,29],[56,30],[54,26]],
  ],
  side: [
    [[40,10],[44,12],[48,21],[49,27],[43,30],[35,26],[30,23],[31,20],[38,24],[43,27],[46,25],[44,18]],
  ],
};
const trollArmor = {
  portrait: [[8, 52, 47, 121], [126, 68, 153, 130], [49, 137, 117, 155]],
  front: [[15, 13, 31, 29], [51, 14, 66, 29], [31, 32, 49, 40]],
  back: [[16, 9, 30, 25], [46, 10, 61, 25]],
  front45: [[22, 16, 38, 33], [51, 25, 59, 34], [41, 33, 53, 42]],
  back45: [[20, 14, 29, 27], [42, 13, 57, 30]],
  side: [[28, 12, 44, 30]],
  prone: [[14, 31, 28, 42], [41, 31, 49, 41], [28, 38, 42, 44]],
  stunned: [[16, 29, 32, 40], [42, 29, 54, 39]],
};
const trollPaint = {
  portrait: [[12, 59, 41, 115], [130, 78, 150, 124], [56, 141, 113, 154]],
  front: [[19, 16, 29, 25], [54, 17, 62, 25]],
  back: [[19, 11, 27, 20], [48, 12, 58, 20]],
  front45: [[24, 18, 36, 25]], back45: [[45, 15, 54, 25]],
  side: [[32, 15, 42, 23]], prone: [[19, 33, 25, 37], [43, 33, 47, 37]],
  stunned: [[19, 31, 29, 35], [44, 31, 51, 35]],
};
const shoulderPaint = {
  'orc-big-un-blocker-portrait': [
    [[16,117],[28,103],[42,99],[60,110],[67,130],[48,140],[27,134]],
    [[130,109],[144,112],[150,128],[139,136],[133,126]],
  ],
  'orc-goblin-lineman-portrait': [
    [[14,116],[30,108],[40,91],[56,105],[58,128],[44,130],[32,121]],
    [[118,122],[131,125],[146,116],[150,130],[136,139],[120,135]],
  ],
};
const bodyFaces = {
  'big-un-blocker': {front:[24,11,37,27],front45:[31,11,44,27],side:[36,10,47,26],prone:[26,26,39,39]},
  'orc-thrower': {front:[23,15,36,30],front45:[27,14,39,30],side:[34,15,44,30],prone:[16,24,31,36]},
  'goblin-lineman': {front:[26,30,39,40],front45:[32,29,45,40],side:[33,26,46,40],prone:[24,28,42,40]},
  'orc-blitzer': {front:[24,15,38,29],front45:[29,15,44,30],side:[32,14,45,30],prone:[24,26,40,39]},
  'orc-lineman': {front:[24,9,38,25],front45:[28,9,43,25],side:[32,9,46,25],prone:[25,25,40,38]},
};
const throwerBalls = {front:[9,21,20,31],back:[38,16,50,29],front45:[8,21,19,31],back45:[11,16,23,27],side:[20,15,31,27],prone:[10,40,23,49],stunned:[47,39,59,49]};
const hairTies = {
  'big-un-blocker': {front:[27,7,33,10],back45:[31,7,37,12],front45:[31,7,37,10],side:[27,7,32,10]},
  'orc-thrower': {front:[22,8,28,11],back:[18,9,23,13],front45:[24,8,30,11],back45:[32,7,37,12],side:[28,7,33,11]},
};

for (const roster of ['human', 'orc']) {
  const file = new URL(`team-colors/v1/source/${roster}.json`, root);
  const maps = JSON.parse(await readFile(file, 'utf8'));
  let changed = 0;
  for (const entry of maps.images) {
    if (entry.id.endsWith('-helmet') || entry.id.endsWith('-portrait')) continue; // Approved redesign masks are authoritative.
    let image = await readRgbaPng(fileURLToPath(new URL(entry.source, root)));
    if (entry.crop) {
      const { x, y, width, height } = entry.crop, rgba = Buffer.alloc(width * height * 4);
      for (let row = 0; row < height; row++) image.rgba.copy(rgba, row * width * 4, ((row + y) * image.width + x) * 4, ((row + y) * image.width + x + width) * 4);
      image = { width, height, rgba };
    }
    const bounds = visibleBounds(image), portrait = entry.id.endsWith('-portrait');
    const pose = entry.id.split('-').at(-1), position = entry.id.slice(roster.length + 1, -(pose.length + 1));
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const at = (y * image.width + x) * 4, [r, g, b, a] = image.rgba.subarray(at, at + 4);
      if (!a) continue;
      const nx = (x - bounds.x) / bounds.width, ny = (y - bounds.y) / bounds.height;
      const light = .2126 * r + .7152 * g + .0722 * b;
      let index = entry.indices[y][x];
      if (roster === 'human') {
        // Blue kit may border faces and hands. Do not erase it with a face rectangle.
        // The thrower's blue irises are a separate fixed material.
        const iris = entry.id === 'human-thrower-portrait' && inside(x, y, [57, 67, 103, 80]);
        const faceguard = humanFaceguards[entry.id] && polygon(x, y, humanFaceguards[entry.id]);
        const helmetShell = entry.id !== 'human-helmet' || polygon(x, y,
          [[0, 0], [231, 0], [290, 90], [282, 106], [211, 86], [211, 136], [110, 158], [79, 190], [100, 241], [105, 288], [74, 287], [25, 252], [0, 225]]);
        if (!index && !iris && !faceguard && helmetShell && b > 24 && b > r * 1.22 && b > g * 1.13)
          index = 1 + Math.min(15, Math.round(light / 12));
        const brow = position === 'blitzer' && ({front:[23,14,37,18],front45:[30,14,43,18],side:[33,14,44,18]})[pose];
        if (!index && brow && inside(x, y, brow) && r > 115 && g > 100 && b > 65 && r >= g && g > b * 1.07 && r - g < 42 && r - b < 92)
          index = 17 + Math.min(15, Math.round((light - 50) / 13));
        if (!index && position === 'ogre' && ogreTrim[pose]?.some(points => polygon(x, y, points))
          && r > 70 && g > 60 && b > 35 && r >= g && g > b * 1.07 && r - g < 42 && r - b < 92)
          index = 17 + Math.max(0, Math.min(15, Math.round((light - 50) / 13)));
      } else if (entry.id === 'orc-helmet') {
        // Shell panels stop at the copper rim, cheek fittings and spikes. Retain
        // exposed copper/yellow wear while including the dark green paint shades.
        const shell = polygon(x, y, [[46, 98], [78, 66], [128, 48], [169, 58], [184, 119], [141, 157], [69, 178], [50, 145]])
          || polygon(x, y, [[217, 81], [256, 104], [282, 151], [253, 154], [231, 122]])
          || polygon(x, y, [[51, 223], [93, 217], [100, 257], [120, 269], [127, 329], [75, 313], [56, 275]])
          || polygon(x, y, [[292, 199], [309, 201], [310, 299], [298, 326], [292, 275]]);
        const stripe = polygon(x, y, [[120,62],[135,59],[156,58],[154,67],[156,74],[172,82],[191,85],[211,79],[215,74],
          [222,86],[231,110],[239,139],[246,173],[249,222],[224,251],[190,234],[187,204],[182,174],[177,145],[167,117],[155,94],[140,78]]);
        // The circular feature is a forward-facing spike, not band material.
        const frontSpike = Math.hypot((x - 214) / 19, (y - 166) / 21) <= 1;
        // The band and its worn areas are secondary; hardware stays original.
        // Clear the old rectangular selection from the brow band.
        if (index >= 17) index = 0;
        if (!index && shell && g > r * .92 && g > b * 1.12 && light > 12)
          index = 1 + Math.min(15, Math.round(light / 13));
        // Source luminance retains the relief, wear and dark pits without
        // retaining copper-colored holes in the secondary material.
        if (stripe && !frontSpike)
          index = 17 + Math.min(15, Math.round(light / 15));
        if (frontSpike) index = 0;
      } else {
        const orange = r > 65 && r > g * 1.48 && g > b * 1.45 && g > 20 && r - g > 32;
        const regions = portraitTrim[entry.id];
        // Body topknots, helmet stripes and toe armor repeat the same orange
        // material beyond the former .15-.86 vertical cutoff. Skin is olive.
        const face = bodyFaces[position]?.[pose], ball = position === 'orc-thrower' && throwerBalls[pose];
        const hairTie = hairTies[position]?.[pose];
        const top = hairTies[position] ? hairTie && inside(x, y, hairTie) : ny < .20;
        const bodyRegion = !portrait && position !== 'troll' && (top || ny > .80 || ny >= .20 && ny < .43)
          && !(face && inside(x, y, face)) && !(ball && inside(x, y, ball));
        const trollRegion = position === 'troll' && trollArmor[pose].some(box => inside(x, y, box));
        const proneChest = entry.id === 'orc-big-un-blocker-prone' && polygon(x, y,
          [[19,30],[25,29],[28,32],[34,30],[39,31],[38,34],[29,35],[21,34]]);
        if (!index && orange && (regions?.some(box => inside(nx, ny, box)) || bodyRegion || trollRegion || proneChest))
          index = 17 + Math.min(15, Math.round(light / 12));
        const darkPaint = light > 23 && light < 118 && r < g * 1.32 && g < b * 1.42 && g > r * .77 && b > r * .56;
        const paintedPlate = position === 'troll' && trollPaint[pose].some(box => inside(x, y, box))
          || shoulderPaint[entry.id]?.some(points => polygon(x, y, points));
        if (!index && paintedPlate && darkPaint) index = 1 + Math.min(15, Math.round((light - 18) / 7));
      }
      if (portrait) index = reviewedBustMaterial(entry.id, x, y, [r, g, b, a], index);
      if (entry.indices[y][x] !== index) { entry.indices[y][x] = index; changed++; }
    }
  }
  await writeFile(file, JSON.stringify(maps) + '\n');
  console.log(`${roster}: ${changed} material assignments corrected`);
}
