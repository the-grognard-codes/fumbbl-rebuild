import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { validateTransportConfiguration } from './transport-policy.js';
import { GoogleAuthProvider, connectAuthEmulator, getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

export function authentication() {
  const config = window.MOLES_FIREBASE_CONFIG;
  if (!config || !config.projectId || !config.apiKey || !config.authDomain || !config.appId) {
    throw new Error('Authentication is unavailable because this Hosting artifact has no Firebase web configuration.');
  }
  validateTransportConfiguration(config, location);
  const auth = getAuth(initializeApp(config));
  if (config.authEmulatorUrl) connectAuthEmulator(auth, config.authEmulatorUrl, { disableWarnings: true });
  return { auth, config, GoogleAuthProvider };
}
