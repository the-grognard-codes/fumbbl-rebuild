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
  'src/assets/site.css',
  'src/assets/auth-client.js'
];

for (const file of required) {
  await access(new URL(`../${file}`, import.meta.url));
}

const index = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
for (const text of ['not affiliated', 'Privacy', 'Support']) {
  if (!index.includes(text)) throw new Error(`The public page must include ${text}.`);
}
console.log(`Checked ${required.length} public-site inputs in ${root}`);
