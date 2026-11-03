// One-time, reviewable material-map authoring for the two established portraits.
// Export consumes the saved assignments; it never classifies materials at runtime.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readRgbaPng } from './png-art.mjs';
import { fileURLToPath } from 'node:url';
const target = new URL('../proofs/shared-sprite-v1/source/materials.json', import.meta.url);
const assignments = JSON.parse(await readFile(target, 'utf8'));
const inside = (x, y, polygon) => {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
};
const trim = {
  halfling: [ [[10,117],[18,137],[32,129],[41,111],[48,105],[44,116],[37,135],[18,145],[9,137],[6,126]],
    [[109,107],[117,105],[109,130],[124,141],[151,127],[155,132],[125,151],[102,137]],
    [[47,124],[56,127],[62,137],[88,130],[93,127],[96,132],[64,145],[56,149],[53,140]] ],
  ogre: [ [[27,52],[35,50],[53,105],[48,112],[18,126],[5,118],[2,105],[6,108],[19,116],[45,103]],
    [[121,53],[129,56],[125,105],[150,117],[157,106],[155,120],[148,126],[116,113],[113,105]] ],
};
for (const design of ['halfling', 'ogre']) {
  const id = `${design}-portrait`;
  if (assignments.images.some(image => image.id === id) && !process.argv.includes('--revise')) throw Error('Material map already exists: ' + id);
  assignments.images = assignments.images.filter(image => image.id !== id);
  const source = `teams/human/poses/coach-oriented-v1/master/${id}.png`, url = new URL('../' + source, import.meta.url);
  const image = await readRgbaPng(fileURLToPath(url));
  const indices = Array.from({ length: image.height }, (_, y) => Array.from({ length: image.width }, (_, x) => {
    const [r, g, b, a] = image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
    const primary = b > r * 1.3 && b > g * 1.15 && b - r > 15;
    // Restrict warm-ivory trim to garment/painted shoulder regions, excluding face,
    // teeth, hair, spikes and leather harness. Neutral steel is never selected.
    const garment = trim[design].some(polygon => inside(x, y, polygon));
    const secondary = garment && r >= g && g - b >= 2 && r - b >= 8 && r - b <= 90 && g > 60;
    if (!a || !primary && !secondary) return 0;
    const shade = Math.max(0, Math.min(15, Math.round(((primary ? b : g) - 25) / 230 * 15)));
    return (primary ? 1 : 17) + shade;
  }));
  assignments.images.push({ id, kind: 'bust', source, sourceSha256: createHash('sha256').update(await readFile(url)).digest('hex'), indices });
}
await writeFile(target, JSON.stringify(assignments, null, 2) + '\n');
