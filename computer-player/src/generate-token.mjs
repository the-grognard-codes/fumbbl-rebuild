import { createHash, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const index = process.argv.indexOf('--file');
const path = process.argv[index + 1];
if (index < 0 || !path || !isAbsolute(path)) {
  console.error('Usage: node src/generate-token.mjs --file <absolute-secret-file>');
  process.exit(2);
}
const token = randomBytes(32).toString('base64url');
await writeFile(path, token, { flag: 'wx', mode: 0o600 });
console.log(`local.browser.v2.computer.token.sha256=${createHash('sha256').update(token, 'ascii').digest('hex')}`);
