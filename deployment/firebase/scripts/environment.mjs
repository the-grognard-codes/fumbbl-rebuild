const environments = Object.freeze({
  dev: Object.freeze({
    name: 'dev',
    projectId: 'dev-moles-under-the-pitch-org',
    domain: 'dev.molesunderthepitch.org',
    emailLinkUrl: 'https://dev.molesunderthepitch.org/login/complete'
  }),
  prod: Object.freeze({
    name: 'prod',
    projectId: 'moles-under-the-pitch-dot-org',
    domain: 'molesunderthepitch.org',
    emailLinkUrl: 'https://molesunderthepitch.org/login/complete'
  }),
  local: Object.freeze({
    name: 'local',
    projectId: 'dev-moles-under-the-pitch-org',
    domain: 'localhost',
    emailLinkUrl: 'http://localhost:5000/login/complete',
    authEmulatorUrl: 'http://127.0.0.1:9099'
  })
});

function argument(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function resolveEnvironment(args, variables) {
  const name = argument(args, '--environment');
  if (!name || !Object.hasOwn(environments, name)) {
    throw new Error('Specify --environment dev, prod, or local. Builds never infer a Firebase project from local CLI state.');
  }
  const allowPlaceholders = args.includes('--allow-placeholder-config');
  const profile = environments[name];
  const required = ['FIREBASE_WEB_API_KEY', 'FIREBASE_WEB_MESSAGING_SENDER_ID', 'FIREBASE_WEB_APP_ID'];
  const values = Object.fromEntries(required.map(key => [key, variables[key]]));
  const missing = required.filter(key => !values[key]);
  if (missing.length && !allowPlaceholders) {
    throw new Error(`Missing public Firebase build configuration: ${missing.join(', ')}`);
  }
  for (const key of missing) values[key] = `BUILD_TIME_${key}_REQUIRED`;
  return Object.freeze({
    environment: profile.name,
    apiKey: values.FIREBASE_WEB_API_KEY,
    authDomain: profile.domain,
    projectId: profile.projectId,
    storageBucket: `${profile.projectId}.firebasestorage.app`,
    messagingSenderId: values.FIREBASE_WEB_MESSAGING_SENDER_ID,
    appId: values.FIREBASE_WEB_APP_ID,
    emailLinkUrl: profile.emailLinkUrl,
    ...(profile.authEmulatorUrl ? { authEmulatorUrl: profile.authEmulatorUrl } : {})
  });
}

export function configurationScript(config) {
  const json = JSON.stringify(config, null, 2).replace(/</g, '\\u003c');
  return `window.MOLES_FIREBASE_CONFIG = Object.freeze(${json});\n`;
}
