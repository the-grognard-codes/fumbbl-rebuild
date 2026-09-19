import { resolveEnvironment } from './environment.mjs';
import { hostingConfiguration } from './hosting-policy.mjs';
import assert from 'node:assert/strict';

const dev = resolveEnvironment(['--environment', 'dev']);
const prod = resolveEnvironment(['--environment', 'prod']);
const local = resolveEnvironment(['--environment', 'local']);
const localDev = resolveEnvironment(['--environment', 'local-dev']);

if (dev.projectId === prod.projectId || dev.authDomain === prod.authDomain || dev.emailLinkUrl === prod.emailLinkUrl) {
  throw new Error('DEV and PROD Firebase configuration must remain distinct.');
}
if (dev.projectId !== 'dev-moles-under-the-pitch-org' || prod.projectId !== 'molesunderthepitch-dotorg') {
  throw new Error('Firebase project mapping does not match the approved environment layout.');
}
if (local.projectId !== dev.projectId || !local.authEmulatorUrl) {
  throw new Error('Local authentication must use the DEV project identity through the Auth emulator only.');
}
for (const [config, other] of [[dev, prod], [prod, dev]]) {
  assert.equal(config.gameWebSocketUrl, undefined, 'Public game runtime remains unavailable until its separate release gate');
  const policy = hostingConfiguration({ hosting: { headers: [] } }, config);
  const csp = policy.hosting.headers[0].headers[0].value;
  assert.ok(!csp.includes('game-dev.molesunderthepitch.org'));
  assert.ok(!csp.includes('game.molesunderthepitch.org'));
  assert.ok(!csp.includes('ws: ') && !csp.includes('wss: '));
  assert.ok(!config.authEmulatorUrl);
}
assert.equal(local.gameWebSocketUrl, 'ws://127.0.0.1:22227/browser/v2');
assert.equal(localDev.projectId, dev.projectId);
assert.equal(localDev.gameWebSocketUrl, 'ws://127.0.0.1:22231/browser/v2');
assert.equal(localDev.authEmulatorUrl, undefined);
assert.equal(dev.authDomain, 'dev-moles-under-the-pitch-org.firebaseapp.com');
assert.equal(prod.authDomain, 'molesunderthepitch-dotorg.firebaseapp.com');
assert.equal(dev.measurementId, 'G-B2SE4J2QPF');
assert.equal(prod.measurementId, 'G-LJ4X3TZX0Y');
assert.throws(() => resolveEnvironment([]));
assert.throws(() => resolveEnvironment(['--environment', 'staging']));
console.log('Verified separate DEV, PROD, and local Firebase configuration profiles.');
