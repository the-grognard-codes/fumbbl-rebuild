import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSiteHeader } from './site-header.mjs';
import { versionSiteAssets } from './version-assets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = new URL('../src/', import.meta.url);
const output = new URL('../dist/', import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
const brand = new URL('assets/brand-package-v4/', source);
const [faviconSvg, ...faviconImages] = await Promise.all([
  readFile(new URL('moles-under-the-pitch-mark-16.svg', brand)),
  readFile(new URL('moles-under-the-pitch-mark-16.png', brand)),
  readFile(new URL('moles-under-the-pitch-mark-32.png', brand))
]);
await writeFile(new URL('favicon.svg', output), faviconSvg);
await writeFile(new URL('favicon-32.png', output), faviconImages[1]);
// ICO supports the approved PNG exports directly, preserving their pixel artwork.
const icoHeader = Buffer.alloc(6 + 16 * faviconImages.length);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(faviconImages.length, 4);
let icoOffset = icoHeader.length;
for (const [index, image] of faviconImages.entries()) {
  const entry = 6 + index * 16;
  icoHeader[entry] = icoHeader[entry + 1] = index === 0 ? 16 : 32;
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(image.length, entry + 8);
  icoHeader.writeUInt32LE(icoOffset, entry + 12);
  icoOffset += image.length;
}
await writeFile(new URL('favicon.ico', output), Buffer.concat([icoHeader, ...faviconImages]));
const faviconVersion = createHash('sha256').update(faviconSvg).update(faviconImages[0]).update(faviconImages[1]).digest('hex').slice(0, 16);
const faviconLinks = `  <link rel="icon" href="/favicon.ico?v=${faviconVersion}" sizes="16x16 32x32">\n  <link rel="icon" type="image/png" href="/favicon-32.png?v=${faviconVersion}" sizes="32x32">\n  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=${faviconVersion}" sizes="any">\n`;
async function renderHeaders(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) await renderHeaders(target);
    else if (entry.name.endsWith('.html')) {
      let html = await readFile(target, 'utf8');
      const page = relative(fileURLToPath(output), fileURLToPath(directory)).replaceAll('\\', '/');
      if (html.includes('<!-- site-header -->')) html = html.replace('<!-- site-header -->', renderSiteHeader(page));
      html = html.replace('</head>', faviconLinks + '</head>');
      await writeFile(target, html);
    }
  }
}
await renderHeaders(output);
// Keep one sign-in source while supporting both public entry addresses.
await mkdir(new URL('../dist/signin/', import.meta.url), { recursive: true });
await cp(new URL('../dist/login/index.html', import.meta.url), new URL('../dist/signin/index.html', import.meta.url));
await cp(new URL('../../browser-client/dist-play/', import.meta.url), new URL('../dist/assets/game/', import.meta.url), { recursive: true });
await cp(new URL('../../browser-client/public/assets/game/', import.meta.url), new URL('../dist/assets/game/', import.meta.url), { recursive: true });
await cp(new URL('../../browser-client/src/team-colors.css', import.meta.url), new URL('../dist/assets/team-colors.css', import.meta.url));
await cp(new URL('../../browser-client/src/FormationManager.css', import.meta.url), new URL('../dist/assets/formation-manager.css', import.meta.url));
await versionSiteAssets(output);
console.log(`Built static site from ${root}src to ${root}dist`);
