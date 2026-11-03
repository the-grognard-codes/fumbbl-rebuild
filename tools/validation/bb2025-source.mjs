import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Historical evidence and original art references are preserved deliberately.
const history = /^(?:\.notes\/|archive\/|docs\/(?:specs|reviews|adr|verification)\/)|\/(?:archive|references)\//;
const historyFiles = new Set(['CHANGELOG.md', 'ARCHIVE.md', 'TODO.md', 'issues.md', 'site/updates.json', 'site/src/updates/index.html']);
const textTypes = new Set(['.java', '.ts', '.tsx', '.js', '.mjs', '.json', '.xml', '.md', '.html', '.css', '.svg', '.yml', '.yaml', '.ps1', '.sh', '.properties', '.txt']);
const unsupported = /bb(?:2016|2020)|\blrb\s*[1-6](?:\.\d+)?\b|\bc[r]p\b/ig;
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const violations = [];
let scanned = 0;
for (const path of new Set(paths)) {
  const absolute = new URL(path, new URL('../../', import.meta.url));
  if (!existsSync(absolute) || history.test(path) || historyFiles.has(path) || !textTypes.has(extname(path))) continue;
  scanned++;
  if (/(?:bb(?:2016|2020)|\/mixed\/)/i.test(path)) violations.push(`${path}: unsupported source path`);
  const lines = readFileSync(absolute, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    unsupported.lastIndex = 0;
    const match = unsupported.exec(lines[index]);
    if (match) violations.push(`${path}:${index + 1}: ${match[0]}`);
    if (path.endsWith('.java') && /20(?:16|20)/.test(lines[index])) violations.push(`${path}:${index + 1}: obsolete edition-specific Java code or comment`);
  }
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else console.log(`BB2025 source audit passed (${scanned} active text files; historical records excluded).`);
