const devProject = 'dev-moles-under-the-pitch-org';
const profiles = Object.freeze({
  dev: { project: devProject, origin: 'https://dev.molesunderthepitch.org', endpoint: 'wss://game-dev.molesunderthepitch.org/browser/v2' },
  prod: { project: 'molesunderthepitch-dotorg', origin: 'https://molesunderthepitch.org', endpoint: 'wss://game.molesunderthepitch.org/browser/v2' },
  local: { project: devProject, endpoint: 'ws://127.0.0.1:22227/browser/v2', emulator: 'http://127.0.0.1:9099' },
  'local-dev': { project: devProject, endpoint: 'ws://127.0.0.1:22232/browser/v2' }
});

/** Validate complete build profiles before Firebase initialization or token delivery. */
export function validateTransportConfiguration(config, page) {
  const profile = profiles[config?.environment];
  if (!profile || config.projectId !== profile.project || config.authDomain !== `${profile.project}.firebaseapp.com`
    || config.gameWebSocketUrl !== profile.endpoint || config.authEmulatorUrl !== profile.emulator) {
    throw Error('Environment configuration is unavailable.');
  }
  if (page) {
    const origin = new URL(page.href ?? `${page.protocol}//${page.host ?? page.hostname}`);
    if (profile.origin ? origin.origin !== profile.origin
      : origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) {
      throw Error('Environment origin is unavailable.');
    }
  }
  return config;
}
