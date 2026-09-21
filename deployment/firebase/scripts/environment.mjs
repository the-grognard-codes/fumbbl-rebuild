const environments = Object.freeze({
  dev: Object.freeze({
    name: 'dev',
    firebaseWebConfig: Object.freeze({
      apiKey: 'AIzaSyDMxIgHAiDIGVfc0yD5YwVdmpIQPdT7AQ8',
      authDomain: 'dev-moles-under-the-pitch-org.firebaseapp.com',
      projectId: 'dev-moles-under-the-pitch-org',
      storageBucket: 'dev-moles-under-the-pitch-org.firebasestorage.app',
      messagingSenderId: '589432788264',
      appId: '1:589432788264:web:0881be9230e4f57cfa2c1d',
      measurementId: 'G-B2SE4J2QPF'
    }),
    emailLinkUrl: 'https://dev.molesunderthepitch.org/login/complete',
    gameWebSocketUrl: 'wss://game-dev.molesunderthepitch.org/browser/v2'
  }),
  prod: Object.freeze({
    name: 'prod',
    firebaseWebConfig: Object.freeze({
      apiKey: 'AIzaSyBZh0UqeRBApw7Oes5viCNLdzK99Cu2SPI',
      authDomain: 'molesunderthepitch-dotorg.firebaseapp.com',
      projectId: 'molesunderthepitch-dotorg',
      storageBucket: 'molesunderthepitch-dotorg.firebasestorage.app',
      messagingSenderId: '826907627534',
      appId: '1:826907627534:web:5bf33cc7b2d7e761192c5f',
      measurementId: 'G-LJ4X3TZX0Y'
    }),
    emailLinkUrl: 'https://molesunderthepitch.org/login/complete',
    gameWebSocketUrl: 'wss://game.molesunderthepitch.org/browser/v2'
  }),
  local: Object.freeze({
    name: 'local',
    firebaseWebConfig: Object.freeze({
      apiKey: 'AIzaSyDMxIgHAiDIGVfc0yD5YwVdmpIQPdT7AQ8',
      authDomain: 'dev-moles-under-the-pitch-org.firebaseapp.com',
      projectId: 'dev-moles-under-the-pitch-org',
      storageBucket: 'dev-moles-under-the-pitch-org.firebasestorage.app',
      messagingSenderId: '589432788264',
      appId: '1:589432788264:web:0881be9230e4f57cfa2c1d',
      measurementId: 'G-B2SE4J2QPF'
    }),
    emailLinkUrl: 'http://localhost:5000/login/complete',
    gameWebSocketUrl: 'ws://127.0.0.1:22227/browser/v2',
    authEmulatorUrl: 'http://127.0.0.1:9099'
  }),
  'local-dev': Object.freeze({
    name: 'local-dev',
    firebaseWebConfig: Object.freeze({
      apiKey: 'AIzaSyDMxIgHAiDIGVfc0yD5YwVdmpIQPdT7AQ8',
      authDomain: 'dev-moles-under-the-pitch-org.firebaseapp.com',
      projectId: 'dev-moles-under-the-pitch-org',
      storageBucket: 'dev-moles-under-the-pitch-org.firebasestorage.app',
      messagingSenderId: '589432788264',
      appId: '1:589432788264:web:0881be9230e4f57cfa2c1d',
      measurementId: 'G-B2SE4J2QPF'
    }),
    gameWebSocketUrl: 'ws://127.0.0.1:22232/browser/v2',
    emailLinkUrl: 'http://localhost:5000/login/complete'
  })
});

function argument(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function resolveEnvironment(args) {
  const name = argument(args, '--environment');
  if (!name || !Object.hasOwn(environments, name)) {
    throw new Error('Specify --environment dev, prod, local, or local-dev. Builds never infer a Firebase project from local CLI state.');
  }
  const profile = environments[name];
  return Object.freeze({
    environment: profile.name,
    ...profile.firebaseWebConfig,
    emailLinkUrl: profile.emailLinkUrl,
    ...(profile.gameWebSocketUrl ? { gameWebSocketUrl: profile.gameWebSocketUrl } : {}),
    ...(profile.authEmulatorUrl ? { authEmulatorUrl: profile.authEmulatorUrl } : {})
  });
}

export function configurationScript(config) {
  const json = JSON.stringify(config, null, 2).replace(/</g, '\\u003c');
  return `window.MOLES_FIREBASE_CONFIG = Object.freeze(${json});\n`;
}
