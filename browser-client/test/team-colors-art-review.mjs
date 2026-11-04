import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { teamColorManifest } from '../src/generated-team-colors.ts';
import { decodeColorPack, recolorTeamImage } from '../src/team-color-art.ts';

const directory = new URL('../../assets/game/team-colors/v1/qa/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1330, height: 640 } });
const metrics = [];
const bustDirectory = new URL('bust-review/', directory);
const bustReviewFiles = [];
try {
  for (const roster of ['human', 'orc']) {
    const compressed = await readFile(new URL(`../../assets/game/team-colors/v1/delivery/${roster}.bin.gz`, import.meta.url));
    const started = performance.now(), raw = gunzipSync(compressed);
    const pack = await decodeColorPack(roster, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    metrics.push({ roster, compressedBytes: compressed.length, decodedBytes: raw.length, decodeMs: performance.now() - started });
    if (process.argv.includes('--busts')) {
      await mkdir(bustDirectory, { recursive: true });
      const busts = [...pack.values()].filter(image => image.entry.kind === 'bust').map(image => ({
        id: image.entry.id, width: image.entry.width, height: image.entry.height,
        original: [...image.rgba],
        kit: [...recolorTeamImage(image, { version: 1, primary: 'magenta', secondary: 'lime' })],
        mask: [...image.rgba].map((value, index) => index % 4 === 3 ? value
          : image.indices[Math.floor(index / 4)] === 0 ? 88
            : (image.indices[Math.floor(index / 4)] < 17 ? [255, 0, 170] : [120, 255, 20])[index % 4]),
      }));
      if (busts.length !== 6) throw Error(`Unexpected bust inventory: ${roster}`);
      for (const group of [...busts.map(bust => [bust]), busts]) {
        const overview = group.length > 1, scale = overview ? 1 : 2;
        const name = overview ? `${roster}-busts-overview` : group[0].id;
        await page.setViewportSize({ width: 3 * 160 * scale + 80, height: 500 });
        await page.setContent('<style>body{margin:20px;background:#17221c;color:white;font:14px sans-serif}h1{font-size:18px}h2{font-size:15px;margin:18px 0 8px}.row{display:flex;gap:20px}section{flex:none}canvas{display:block;image-rendering:pixelated}p{margin:8px 0}</style><h1></h1><p>Magenta = primary · Lime = secondary · Gray = fixed</p><main></main>');
        await page.evaluate(({ group, scale, name }) => {
          document.querySelector('h1').textContent = name;
          for (const image of group) {
            const heading = document.createElement('h2'), row = document.createElement('div');
            heading.textContent = image.id; row.className = 'row';
            for (const [label, key] of [['Original', 'original'], ['High contrast', 'kit'], ['Material mask', 'mask']]) {
              const section = document.createElement('section'), title = document.createElement('p'), canvas = document.createElement('canvas');
              title.textContent = label; canvas.width = image.width; canvas.height = image.height;
              canvas.style.width = `${image.width * scale}px`; canvas.style.height = `${image.height * scale}px`;
              canvas.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(image[key]), image.width, image.height), 0, 0);
              section.append(title, canvas); row.append(section);
            }
            document.querySelector('main').append(heading, row);
          }
        }, { group, scale, name });
        await page.screenshot({ path: new URL(`${name}.png`, bustDirectory).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
        bustReviewFiles.push(`${name}.png`);
      }
      continue;
    }
    for (let start = 0; start < 49; start += 8) {
      const images = [...pack.values()].slice(start, start + 8);
      if (process.argv.includes('--helmets') && images[0].entry.kind !== 'helmet') continue;
      const name = images[0].entry.id.replace('-portrait', '');
      const rows = images.map(image => ({ id: image.entry.id, width: image.entry.width, height: image.entry.height,
        original: [...image.rgba], kit: [...recolorTeamImage(image, { version: 1, primary: 'magenta', secondary: 'lime' })],
        materials: [...image.rgba].map((value, index) => index % 4 === 3 ? value : image.indices[Math.floor(index / 4)]
          ? image.indices[Math.floor(index / 4)] < 17 ? [255, 0, 170][index % 4] : [120, 255, 20][index % 4] : Math.round(value * .35)) }));
      await page.setContent('<style>body{margin:12px;background:#203724;color:#fff;font:12px sans-serif} main{display:flex;gap:4px}section{text-align:center;width:160px}canvas{display:block;image-rendering:pixelated;margin:8px auto}h1{font-size:16px}</style><h1></h1><main></main>');
      await page.evaluate(({ name, rows }) => {
        document.querySelector('h1').textContent = `${name}: accepted source / magenta + lime / material assignments`;
        for (const image of rows) {
          const section = document.createElement('section'); section.textContent = image.id;
          for (const key of ['original', 'kit', 'materials']) {
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            canvas.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(image[key]), image.width, image.height), 0, 0);
            canvas.style.width = `${Math.min(160, image.width * 2)}px`; canvas.style.height = `${Math.min(160, image.height * 2)}px`;
            section.append(canvas);
          }
          document.querySelector('main').append(section);
        }
      }, { name, rows });
      await page.screenshot({ path: new URL(`${name}.png`, directory).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
      if (images.length === 1 && images[0].entry.kind === 'helmet') {
        const image = images[0];
        const mask = [...image.rgba].map((value, index) => index % 4 === 3 ? value
          : image.indices[Math.floor(index / 4)] === 0 ? 88
            : (image.indices[Math.floor(index / 4)] < 17 ? [255, 0, 170] : [120, 255, 20])[index % 4]);
        const blackWhite = [...recolorTeamImage(image, { version: 1, primary: 'black', secondary: 'white' })];
        await page.setViewportSize({ width: image.entry.width * 4 + 100, height: image.entry.height + 130 });
        await page.setContent('<style>body{margin:20px;background:#17221c;color:white;font:16px sans-serif}main{display:flex;gap:20px}h1{font-size:20px;margin:0 0 12px}h2{font-size:16px}canvas{display:block;image-rendering:pixelated}</style><h1></h1><p>Magenta = primary · Lime = secondary · Gray = fixed material</p><main></main>');
        await page.evaluate(({ name, width, height, original, kit, mask, blackWhite }) => {
          document.querySelector('h1').textContent = `${name}: current material coverage (native size)`;
          for (const [label, rgba] of [['Original', original], ['High contrast', kit], ['Material mask', mask], ['Black / White', blackWhite]]) {
            const section = document.createElement('section'), heading = document.createElement('h2'), canvas = document.createElement('canvas');
            heading.textContent = label; canvas.width = width; canvas.height = height;
            canvas.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(rgba), width, height), 0, 0);
            section.append(heading, canvas); document.querySelector('main').append(section);
          }
        }, { name, width: image.entry.width, height: image.entry.height, original: rows[0].original, kit: rows[0].kit, mask, blackWhite });
        await page.screenshot({ path: new URL(`${name}-detail.png`, directory).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
        await page.setViewportSize({ width: 1330, height: 640 });
      }
    }
  }
  if (process.argv.includes('--busts')) {
    await writeFile(new URL('index.html', bustDirectory), '<!doctype html><meta charset="utf-8"><title>Bust material review</title><style>body{background:#17221c;color:white;font:16px sans-serif}img{max-width:100%;image-rendering:pixelated}a{color:#ffdc8a}</style><h1>Bust material review</h1><p>Approved portrait redesigns and production masks. Individual comparisons are shown at 2x nearest-neighbor; roster overviews at native size.</p>' + bustReviewFiles.map(file => `<h2>${file.replace('.png', '')}</h2><a href="${file}"><img src="${file}" alt="${file}"></a>`).join(''));
    console.log(`Exported ${bustReviewFiles.length - 2} individual bust comparisons, two roster overviews and a gallery.`);
  } else await writeFile(new URL('decode-measurements.json', directory), JSON.stringify(metrics, null, 2) + '\n');
} finally { await browser.close(); }
