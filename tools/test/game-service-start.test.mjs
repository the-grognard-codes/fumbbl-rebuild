import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const startup = fileURLToPath(new URL('../../deployment/game-service/start.sh', import.meta.url));
const probe = new URL('../../deployment/game-service/proxy/check-dev-runtime.mjs', import.meta.url).href;
const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';

function start(target, state = 'RUNNING', failCheck = false) {
  const fixture = `
gcloud() {
  case "$1 $2 $3" in
    'compute instances describe') printf '%s\\n' '${state}' ;;
    'compute instances start') printf 'started fixture VM\\n' ;;
    'compute ssh '*) printf 'checked fixture service\\n' >&2; ${failCheck ? 'return 1' : 'return 0'} ;;
    *) return 99 ;;
  esac
}
node() { printf 'checked fixture DEV endpoint\\n'; ${failCheck ? 'return 1' : 'return 0'}; }
timeout() { printf 'bounded:%s:%s\\n' "$1" "$2" >&2; shift 2; "$@"; }
sleep() { SECONDS=$((SECONDS + 61)); }
ssh-keygen() { printf '2048 SHA256:fixture test\\n'; }
ssh-add() { printf '2048 SHA256:fixture test\\n'; }
ssh-agent() { return 99; }
source "$1" "$2"
`;
  return spawnSync(bash, ['-c', fixture, 'startup-test', startup, target], {
    encoding: 'utf8', windowsHide: true, timeout: 10000
  });
}

test('DEV starts a terminated VM and checks public WSS without SSH', () => {
  const result = start('dev', 'TERMINATED');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /started fixture VM/);
  assert.match(result.stderr, /bounded:--kill-after=2s:10s/);
  assert.match(result.stdout, /dev WSS game runtime is ready/);
  assert.doesNotMatch(result.stderr, /checked fixture service/);
});

test('PROD uses bounded SSH checks while an already running VM is preserved', () => {
  const result = start('prod');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already running/);
  assert.match(result.stderr, /bounded:--kill-after=2s:15s/);
  assert.match(result.stderr, /checked fixture service/);
  assert.doesNotMatch(result.stdout, /started fixture VM|checked fixture DEV endpoint/);
});

test('failed DEV and PROD readiness checks return failure at the deadline', () => {
  for (const target of ['dev', 'prod']) {
    const result = start(target, 'RUNNING', true);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /within 60 seconds/);
    if (target === 'prod') assert.match(result.stderr, /bounded:--kill-after=2s:10s/);
  }
});

test('an unavailable VM state is rejected before probing', () => {
  const result = start('dev', 'STOPPING');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not startable.*STOPPING/);
  assert.doesNotMatch(result.stdout, /checked fixture/);
});

for (const scenario of ['upgrade', 'response', 'timeout', 'error']) {
  test(`DEV probe handles ${scenario} without contacting a remote service`, () => {
    const fixture = `
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
https.request = (options, response) => {
  assert.equal(options.hostname, 'game-dev.molesunderthepitch.org');
  assert.equal(options.path, '/browser/v2');
  assert.equal(options.headers.Origin, 'https://dev.molesunderthepitch.org');
  assert.equal(Buffer.from(options.headers['Sec-WebSocket-Key'], 'base64').length, 16);
  const request = new EventEmitter();
  request.destroy = error => request.emit('error', error);
  request.end = () => queueMicrotask(() => {
    if ('${scenario}' === 'upgrade') request.emit('upgrade', { statusCode: 101 }, { destroy() {} });
    if ('${scenario}' === 'response') response({ statusCode: 503, resume() {} });
    if ('${scenario}' === 'timeout') request.emit('timeout');
    if ('${scenario}' === 'error') request.emit('error', new Error('fixture transport failure'));
  });
  return request;
};
await import(${JSON.stringify(probe)});
`;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', fixture], {
      encoding: 'utf8', windowsHide: true, timeout: 10000
    });
    assert.equal(result.status, scenario === 'upgrade' ? 0 : 1, result.stderr);
    if (scenario === 'response') assert.match(result.stderr, /HTTP 503; expected 101/);
    if (scenario === 'timeout') assert.match(result.stderr, /timed out/);
    if (scenario === 'error') assert.match(result.stderr, /fixture transport failure/);
  });
}
