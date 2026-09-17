import { resolveEnvironment } from './environment.mjs';
import { hostingConfiguration } from './hosting-policy.mjs';
import assert from 'node:assert/strict';

const dev = resolveEnvironment(['--environment', 'dev']);
const prod = resolveEnvironment(['--environment', 'prod']);
const local = resolveEnvironment(['--environment', 'local']);

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
  const endpoint = new URL(config.gameWebSocketUrl);
  assert.equal(endpoint.protocol, 'wss:');
  assert.equal(endpoint.pathname, '/session/v1');
  assert.equal(endpoint.search, '');
  assert.notEqual(endpoint.origin, new URL(other.gameWebSocketUrl).origin);
  const policy = hostingConfiguration({ hosting: { headers: [] } }, config);
  const csp = policy.hosting.headers[0].headers[0].value;
  assert.ok(csp.includes(endpoint.origin));
  assert.ok(!csp.includes(new URL(other.gameWebSocketUrl).origin));
  assert.ok(!csp.includes('ws: ') && !csp.includes('wss: '));
  assert.ok(!config.authEmulatorUrl);
}
assert.equal(dev.authDomain, 'dev-moles-under-the-pitch-org.firebaseapp.com');
assert.equal(prod.authDomain, 'molesunderthepitch-dotorg.firebaseapp.com');
assert.equal(dev.measurementId, 'G-B2SE4J2QPF');
assert.equal(prod.measurementId, 'G-LJ4X3TZX0Y');
assert.throws(() => resolveEnvironment([]));
assert.throws(() => resolveEnvironment(['--environment', 'staging']));
console.log('Verified separate DEV, PROD, and local Firebase configuration profiles.');
