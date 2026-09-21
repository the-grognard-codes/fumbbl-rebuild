// Separate release artifact: leave the running local Hosting emulator untouched.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { configurationScript, resolveEnvironment } from '../../firebase/scripts/environment.mjs';
import { hostingConfiguration } from '../../firebase/scripts/hosting-policy.mjs';
const destination = resolve(process.argv[2] ?? '');
assert.ok(process.argv.length === 3 && destination.startsWith(resolve('.tools') + (process.platform === 'win32' ? '\\' : '/')));
await mkdir(destination); // Refuse an existing release directory.
const hosting = resolve(destination, 'hosting');
await cp(resolve('site/src'), hosting, { recursive: true });
await mkdir(resolve(hosting, 'assets/game'), { recursive: true });
// Only the paired play bundle, never Vite's copied diagnostic/preview artwork.
for (const name of ['game.js', 'game.css']) await cp(resolve('browser-client/dist-play', name), resolve(hosting, 'assets/game', name));
const config = resolveEnvironment(['--environment', 'dev']);
await writeFile(resolve(hosting, 'firebase-web-config.js'), configurationScript(config));
const base = JSON.parse(await readFile('firebase.json', 'utf8'));
const generated = hostingConfiguration(base, config);
generated.hosting.public = hosting;
delete generated.emulators;
await writeFile(resolve(destination, 'firebase.json'), JSON.stringify(generated, null, 2) + '\n');
console.log('Assembled isolated DEV release with exact WSS/CSP; local emulator and preview assets unchanged.');
