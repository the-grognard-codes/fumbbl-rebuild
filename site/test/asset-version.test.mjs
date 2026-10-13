import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { versionSiteAssets } from '../scripts/version-assets.mjs';

test('new runtime content updates both cached loaders and page entry URLs', async () => {
  const fixtures = fileURLToPath(new URL('../../.tools/', import.meta.url));
  await mkdir(fixtures, { recursive: true });
  const root = await mkdtemp(join(fixtures, 'site-asset-version-'));
  const output = pathToFileURL(root + sep);
  try {
    await mkdir(new URL('assets/game/', output), { recursive: true });
    await mkdir(new URL('play/', output));
    await writeFile(new URL('assets/game/game.js', output), 'export const version = 1;');
    await writeFile(new URL('assets/game/game.css', output), '.pitch { color: green; }');
    await writeFile(new URL('assets/play.js', output), "import('/assets/game/game.js'); import('/assets/game/game.js?v=spectate-v1');");
    await writeFile(new URL('assets/teambuilder.js', output), "import('/assets/game/game.js');");
    await writeFile(new URL('play/index.html', output), '<script src="/assets/play.js"></script><script src="/assets/teambuilder.js"></script><link href="/assets/game/game.css?v=spectate-v1"><script src="https://vendor.invalid/external.js"></script>');
    const contents = async () => Promise.all(['play/index.html', 'assets/play.js', 'assets/teambuilder.js'].map(path => readFile(new URL(path, output), 'utf8')));
    await versionSiteAssets(output);
    const first = await contents();
    assert.match(first[0], /\/assets\/play\.js\?v=[a-f0-9]{16}/);
    assert.match(first[0], /\/assets\/game\/game\.css\?v=[a-f0-9]{16}/);
    assert.match(first[0], /https:\/\/vendor.invalid\/external.js/);
    assert.equal(new Set(first.slice(1).flatMap(source => [...source.matchAll(/game\.js\?v=([a-f0-9]{16})/g)].map(match => match[1]))).size, 1);
    assert.equal(first[1].includes('spectate-v1'), false);
    await versionSiteAssets(output);
    assert.deepEqual(await contents(), first, 'The same build produces stable URLs');
    await writeFile(new URL('assets/game/game.js', output), 'export const version = 2;');
    await versionSiteAssets(output);
    const second = await contents();
    for (let index = 0; index < first.length; index++) assert.notEqual(second[index], first[index]);
    assert.equal(second[0].match(/game\.css\?v=[a-f0-9]{16}/)[0], first[0].match(/game\.css\?v=[a-f0-9]{16}/)[0], 'Unchanged CSS retains its cache address');
  } finally {
    assert.equal(root.startsWith(fixtures), true);
    await rm(root, { recursive: true });
  }
});
