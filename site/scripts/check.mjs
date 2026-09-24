import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  'src/index.html',
  'src/updates/index.html',
  'src/privacy/index.html',
  'src/support/index.html',
  'src/login/index.html',
  'src/login/complete/index.html',
  'src/play/index.html',
  'src/teambuilder/index.html',
  'src/assets/site.css',
  'src/assets/auth-client.js',
  'src/assets/play.js',
  'src/assets/teambuilder.js'
];

for (const file of required) {
  await access(new URL(`../${file}`, import.meta.url));
}

const login = await readFile(new URL('../src/login/index.html', import.meta.url), 'utf8');
const play = await readFile(new URL('../src/assets/play.js', import.meta.url), 'utf8');
const builder = await readFile(new URL('../src/assets/teambuilder.js', import.meta.url), 'utf8');
if (login.includes('Microsoft') || !play.includes('gameWebSocketUrl') || !builder.includes('mountBuilder')
  || !builder.includes('gameEndpoint') || builder.includes('localStorage')) {
  throw new Error('The sign-in or play client inputs are incomplete.');
}

const index = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
for (const text of ['not affiliated', 'Privacy', 'Support']) {
  if (!index.includes(text)) throw new Error(`The public page must include ${text}.`);
}
console.log(`Checked ${required.length} public-site inputs in ${root}`);
