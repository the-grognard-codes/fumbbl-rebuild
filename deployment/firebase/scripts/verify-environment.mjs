import { resolveEnvironment } from './environment.mjs';

const values = {
  FIREBASE_WEB_API_KEY: 'test-public-api-key',
  FIREBASE_WEB_MESSAGING_SENDER_ID: '1234567890',
  FIREBASE_WEB_APP_ID: '1:1234567890:web:test'
};
const dev = resolveEnvironment(['--environment', 'dev'], values);
const prod = resolveEnvironment(['--environment', 'prod'], values);
const local = resolveEnvironment(['--environment', 'local'], values);

if (dev.projectId === prod.projectId || dev.authDomain === prod.authDomain || dev.emailLinkUrl === prod.emailLinkUrl) {
  throw new Error('DEV and PROD Firebase configuration must remain distinct.');
}
if (dev.projectId !== 'dev-moles-under-the-pitch-org' || prod.projectId !== 'molesunderthepitch-dotorg') {
  throw new Error('Firebase project mapping does not match the approved environment layout.');
}
if (local.projectId !== dev.projectId || !local.authEmulatorUrl) {
  throw new Error('Local authentication must use the DEV project identity through the Auth emulator only.');
}
console.log('Verified separate DEV, PROD, and local Firebase configuration profiles.');
