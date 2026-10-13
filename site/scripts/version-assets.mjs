import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';

/** Address each built entry point by its content so cached releases cannot mix. */
export async function versionSiteAssets(output) {
  const versions = new Map();
  const version = async path => {
    if (!versions.has(path)) versions.set(path, createHash('sha256').update(await readFile(new URL(`.${path}`, output))).digest('hex').slice(0, 16));
    return versions.get(path);
  };
  const gameVersion = await version('/assets/game/game.js');
  for (const name of ['play.js', 'teambuilder.js']) {
    const file = new URL(`assets/${name}`, output);
    const source = await readFile(file, 'utf8');
    await writeFile(file, source.replace(/\/assets\/game\/game\.js(?:\?v=[A-Za-z0-9-]+)?/g, `/assets/game/game.js?v=${gameVersion}`));
  }
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith('.html')) {
        let html = await readFile(file, 'utf8');
        const references = [...html.matchAll(/\b(?:src|href)="(\/assets\/[^"#]+?\.(?:js|css)(?:\?[^"#]*)?)"/g)];
        for (const [, reference] of references) {
          const url = new URL(reference, 'https://site.invalid');
          url.searchParams.set('v', await version(url.pathname));
          html = html.replaceAll(`"${reference}"`, `"${url.pathname}${url.search}"`);
        }
        await writeFile(file, html);
      }
    }
  }
  await visit(output);
}
