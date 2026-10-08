import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSiteHeader } from './site-header.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = new URL('../src/', import.meta.url);
const output = new URL('../dist/', import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
async function renderHeaders(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) await renderHeaders(target);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(target, 'utf8');
      const page = relative(fileURLToPath(output), fileURLToPath(directory)).replaceAll('\\', '/');
      if (html.includes('<!-- site-header -->'))
        await writeFile(target, html.replace('<!-- site-header -->', renderSiteHeader(page)));
    }
  }
}
await renderHeaders(output);
await cp(new URL('../../browser-client/dist-play/', import.meta.url), new URL('../dist/assets/game/', import.meta.url), { recursive: true });
await cp(new URL('../../browser-client/public/assets/game/', import.meta.url), new URL('../dist/assets/game/', import.meta.url), { recursive: true });
console.log(`Built static site from ${root}src to ${root}dist`);
