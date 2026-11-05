import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const origin = 'http://localhost:5000';
const page = await fetch(`${origin}/play`);
assert.equal(page.status, 200);
assert.match(page.headers.get('content-type'), /text\/html/);
// Resolve from the repository root, independent of the command's working directory.
const assets = new URL('../../assets/game/ui/dice-events-v1/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', assets), 'utf8'));
const delivered = await fetch(`${origin}/assets/game/ui/dice-events-v1/manifest.json`);
assert.equal(delivered.status, 200);
assert.deepEqual(await delivered.json(), manifest);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const entry of manifest.events) {
  const response = await fetch(`${origin}/assets/game/ui/dice-events-v1/${entry.file}`);
  assert.equal(response.status, 200, entry.file);
  assert.match(response.headers.get('content-type'), /svg/, entry.file);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(await readFile(new URL(entry.file, assets))), entry.file);
}
const result = { ready: true, url: `${origin}/play`, iconsVerified: manifest.events.length, checkedAt: new Date().toISOString() };
await writeFile(new URL('runtime-ready.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
