// Reuse the DEV-accepted play release, not concurrent UI/sprite work.
import { cp, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configurationScript, resolveEnvironment } from '../../firebase/scripts/environment.mjs';
import { hostingConfiguration } from '../../firebase/scripts/hosting-policy.mjs';
const destination = resolve('.tools/prod-release-20260921/client');
await mkdir(destination);
const hosting = resolve(destination, 'hosting');
await cp(resolve('.tools/dev-release-20260921/client/hosting'), hosting, { recursive: true });
await copyFile(resolve('site/src/assets/transport-policy.js'), resolve(hosting, 'assets/transport-policy.js'));
const config = resolveEnvironment(['--environment', 'prod']);
await writeFile(resolve(hosting, 'firebase-web-config.js'), configurationScript(config));
const generated = hostingConfiguration(JSON.parse(await readFile('firebase.json', 'utf8')), config);
generated.hosting.public = hosting;
delete generated.emulators;
await writeFile(resolve(destination, 'firebase.json'), JSON.stringify(generated, null, 2) + '\n');
console.log('Assembled PROD client from DEV-accepted UI with exact PROD Firebase/WSS/CSP bindings.');
