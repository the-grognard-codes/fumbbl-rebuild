// Explicit DEV activation artifact; keep the loopback test candidate unchanged.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const output = process.argv[2];
assert.ok(output && process.argv.length === 3);
const source = readFileSync(new URL('./dev.nginx.conf', import.meta.url), 'utf8');
const rendered = 'user www-data;\n' + source
  .replace(/^# Standalone candidate:.*\r?\n/m, '# DEV hosted activation configuration.\n')
  .replaceAll('127.0.0.1:24443', '443')
  .replace('pid logs/nginx.pid;', 'pid /run/nginx.pid;')
  .replace('access_log logs/access.log safe;', 'access_log /var/log/nginx/game-safe.log safe;')
  .replace('ssl_certificate tls/fullchain.pem;', 'ssl_certificate /etc/letsencrypt/live/game-dev.molesunderthepitch.org/fullchain.pem;')
  .replace('ssl_certificate_key tls/privkey.pem;', 'ssl_certificate_key /etc/letsencrypt/live/game-dev.molesunderthepitch.org/privkey.pem;');
assert.ok(!rendered.includes('24443'));
assert.ok(!rendered.includes('listen 80'));
writeFileSync(output, rendered, { flag: 'wx' });
