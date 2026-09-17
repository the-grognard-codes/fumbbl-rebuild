import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/jaken/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const checks = [];
for (const asset of manifest.assets) {
  const file = path.join(root, asset.name);
  if (asset.name.endsWith('.svg')) {
    const svg = await fs.readFile(file, 'utf8');
    const colors = [...new Set(svg.match(/#[0-9a-f]{6}/gi))];
    if (colors.some(c => !manifest.palette.includes(c))) throw new Error('Non-palette vector color');
    if (/<(?:image|text|script)\b|(?:href|src)=/i.test(svg)) throw new Error('External or non-path content');
    await sharp(Buffer.from(svg)).png().toBuffer();
    checks.push({ file: asset.name, validRender: true, paletteOnly: true, selfContainedPaths: true });
  } else {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0, opaque = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) transparent++; if (data[i] === 255) opaque++; }
    if (!transparent || !opaque || info.width !== asset.width || info.height !== asset.height) throw new Error('Bad raster export');
    const corners = [3, (info.width - 1) * 4 + 3, (info.width * (info.height - 1)) * 4 + 3, data.length - 1];
    if (corners.some(i => data[i] !== 0)) throw new Error('Nontransparent padding');
    for (let x = 0; x < info.width; x++) {
      if (data[x * 4 + 3] || data[((info.height - 1) * info.width + x) * 4 + 3]) throw new Error('Clipped top/bottom padding: ' + asset.name);
    }
    for (let y = 0; y < info.height; y++) {
      if (data[(y * info.width) * 4 + 3] || data[(y * info.width + info.width - 1) * 4 + 3]) throw new Error('Clipped side padding: ' + asset.name);
    }
    checks.push({ file: asset.name, width: info.width, height: info.height, transparentPixels: transparent, opaquePixels: opaque, transparentCorners: true });
  }
}
await fs.writeFile(path.join(root, 'verification.json'), JSON.stringify({ checks }, null, 2) + '\n');

const text = (x, y, value, fill = '#edf5ff', size = 20) => `<text x="${x}" y="${y}" fill="${fill}" font-family="sans-serif" font-size="${size}">${value}</text>`;
const sheet = `<svg width="1400" height="1100" xmlns="http://www.w3.org/2000/svg"><path fill="#070d16" d="M0 0h1400v1100H0Z"/><path fill="#edf5ff" d="M0 340h1400v290H0Z"/>${text(40,38,'PRIMARY • DARK SURFACE')}${text(40,372,'PRIMARY • LIGHT SURFACE','#101c2b')}${text(40,666,'COMPACT • 160 PX')}${text(260,666,'GOOGLE • 120 PX')}${text(455,666,'MARK • 32 / 16 PX')}${text(720,666,'EMAIL LINK')}${text(40,1028,'Moles Under the Pitch — production asset preview', '#edf5ff', 24)}${text(40,1068,'True SVG paths · Transparent PNGs · Eight-color palette · Optical 16 px variant','#4db2ff',18)}</svg>`;
const layers = [{ input: await sharp(path.join(root, 'moles-under-the-pitch-logo.png')).resize(1050,300).toBuffer(), left: 160, top: 45 },
{ input: await sharp(path.join(root, 'moles-under-the-pitch-logo.png')).resize(980,280).toBuffer(), left: 200, top: 365 },
{ input: path.join(root,'moles-under-the-pitch-logo-compact-160.png'), left: 48, top: 710 },
{ input: path.join(root,'oauth-google-app-logo-120.png'), left: 285, top: 720 },
{ input: path.join(root,'moles-under-the-pitch-mark-32.png'), left: 500, top: 755 },
{ input: path.join(root,'moles-under-the-pitch-mark-16.png'), left: 560, top: 763 },
{ input: await sharp(path.join(root,'magic-link-complete-illustration.png')).resize(310,310).toBuffer(), left: 740, top: 680 }];
await sharp(Buffer.from(sheet)).composite(layers).png().toFile(path.join(root, 'preview.png'));
await sharp(path.join(root, 'moles-under-the-pitch-mark-16.png')).resize(256,256,{ kernel: 'nearest' }).png().toFile(path.join(root, '_sources', 'mark-16-inspect.png'));
console.log('Verified', checks.length, 'deliverables; wrote preview.png and verification.json');
