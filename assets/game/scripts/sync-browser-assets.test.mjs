import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { link, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const gameRoot = fileURLToPath(new URL('../', import.meta.url));

async function linkTree(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory()) await linkTree(join(source, entry.name), join(target, entry.name));
    else if (entry.isFile()) await link(join(source, entry.name), join(target, entry.name));
    else throw Error(`Unsupported fixture entry: ${entry.name}`);
  }
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files.sort();
}

test('asset sync preserves live inputs on repeated builds and repairs stale delivery', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ffb-asset-sync-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('ffb-asset-sync-'));
    await rm(root, { recursive: true, force: true });
  });
  // Canonical inputs are read-only hard links; generated outputs stay in this fixture.
  await linkTree(gameRoot, join(root, 'assets/game'));
  const client = join(root, 'browser-client');
  await mkdir(join(client, 'src'), { recursive: true });
  const sync = (...args) => execute(process.execPath, [join(root, 'assets/game/scripts/sync-browser-assets.mjs'), ...args],
    { cwd: root, windowsHide: true, timeout: 30000 });
  await sync();
  const delivery = join(client, 'public/assets/game');

  await t.test('unchanged sync leaves every generated catalog and delivered asset untouched', async () => {
    const paths = [...await filesUnder(join(client, 'src')), ...await filesUnder(delivery)];
    const before = await Promise.all(paths.map(path => stat(path, { bigint: true })));
    await sync();
    const after = await Promise.all(paths.map(path => stat(path, { bigint: true })));
    const changed = paths.filter((path, index) => before[index].mtimeNs !== after[index].mtimeNs
      || before[index].ino !== after[index].ino);
    assert.equal(changed.length, 0, `Unchanged sync rewrote ${changed.length} watched files; first: ${changed.slice(0, 5)
      .map(path => relative(root, path)).join(', ')}`);
    await sync('--check');
  });

  await t.test('sync restores missing and changed files, removes stale files and passes check', async () => {
    const ball = join(delivery, 'ui/ball-v1.svg');
    const weather = join(delivery, 'ui/reroll-v1.png');
    const catalog = join(client, 'src/generated-player-art.ts');
    const originalCatalog = await readFile(catalog);
    const stale = join(delivery, 'obsolete.txt');
    await rm(ball);
    await writeFile(weather, 'stale asset');
    await writeFile(catalog, '// stale catalog\n');
    await writeFile(stale, 'obsolete asset');
    await assert.rejects(sync('--check'), /out of sync/);
    await sync();
    assert.deepEqual(await readFile(ball), await readFile(join(gameRoot, 'ui/ball-v1.svg')));
    assert.deepEqual(await readFile(weather), await readFile(join(gameRoot, 'ui/reroll-v1.png')));
    assert.deepEqual(await readFile(catalog), originalCatalog);
    await assert.rejects(stat(stale), { code: 'ENOENT' });
    await sync('--check');
  });
});
