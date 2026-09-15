import { access, readFile } from 'node:fs/promises';
import { resolveEnvironment } from './environment.mjs';

function argument(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const environment = argument(process.argv.slice(2), '--environment');
if (environment !== 'dev' && environment !== 'prod') {
  throw new Error('Specify --environment dev or prod.');
}

const expected = resolveEnvironment(['--environment', environment, '--allow-placeholder-config'], {});
const root = new URL('../hosting/', import.meta.url);
const required = [
  'index.html',
  'play/index.html',
  'login/index.html',
  'login/complete/index.html',
  'privacy/index.html',
  'support/index.html',
  'updates/index.html',
  'firebase-web-config.js'
];
for (const path of required) await access(new URL(path, root));

const script = await readFile(new URL('firebase-web-config.js', root), 'utf8');
const prefix = 'window.MOLES_FIREBASE_CONFIG = Object.freeze(';
if (!script.startsWith(prefix) || !script.endsWith(');\n')) throw new Error('Generated Firebase configuration has an unexpected format.');
const config = JSON.parse(script.slice(prefix.length, -3));
for (const key of ['environment', 'projectId', 'authDomain', 'emailLinkUrl']) {
  if (config[key] !== expected[key]) throw new Error(`Generated ${environment} artifact has an incorrect ${key}.`);
}
const publicPage = await readFile(new URL('index.html', root), 'utf8');
const playPage = await readFile(new URL('play/index.html', root), 'utf8');
const completionPage = await readFile(new URL('login/complete/index.html', root), 'utf8');
if (!publicPage.includes('assets/site.css?v=') || !playPage.includes('/play/assets/') || !completionPage.includes('/firebase-web-config.js')) {
  throw new Error('Hosting artifact routes or assets are incomplete.');
}
console.log(`Verified ${environment} Hosting artifact routes and isolated Firebase configuration.`);
