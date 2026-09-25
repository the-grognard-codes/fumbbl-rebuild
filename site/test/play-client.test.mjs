import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveEnvironment } from '../../deployment/firebase/scripts/environment.mjs';
import { validateTransportConfiguration } from '../src/assets/transport-policy.js';
import { hostingConfiguration } from '../../deployment/firebase/scripts/hosting-policy.mjs';

const source = await readFile(new URL('../src/assets/play.js', import.meta.url), 'utf8');
const start = source.indexOf('export function gameEndpoint');
const end = source.indexOf('export function startPlay');
const policyImport = `import { validateTransportConfiguration } from '${new URL('../src/assets/transport-policy.js', import.meta.url).href}';\n`;
const { gameEndpoint } = await import(`data:text/javascript,${encodeURIComponent(policyImport + source.slice(start, end))}`);

test('local DEV and PROD endpoints are exact and mutually isolated', () => {
  const config = resolveEnvironment(['--environment', 'local-dev']);
  const page = new URL('http://localhost:5000/play');
  assert.equal(gameEndpoint(config.gameWebSocketUrl, page, config), config.gameWebSocketUrl);
  assert.equal(config.gameWebSocketUrl, 'ws://127.0.0.1:22232/browser/v2');
  assert.throws(() => validateTransportConfiguration({ ...config, gameWebSocketUrl: 'ws://127.0.0.1:22231/browser/v2' }));
  for (const url of ['wss://game.test/browser/v2', 'ws://127.0.0.1:22227/browser/v2', config.gameWebSocketUrl + '?', config.gameWebSocketUrl + '?token=x', config.gameWebSocketUrl + '/', 'ws://user:pass@127.0.0.1:22231/browser/v2'])
    assert.throws(() => gameEndpoint(url, page, { ...config, gameWebSocketUrl: url }));
  for (const environment of ['dev', 'prod']) {
    const hosted = resolveEnvironment(['--environment', environment]);
    assert.throws(() => gameEndpoint(undefined, new URL(hosted.emailLinkUrl), hosted));
    assert.equal(gameEndpoint(hosted.gameWebSocketUrl, new URL(hosted.emailLinkUrl), hosted), hosted.gameWebSocketUrl);
  }
  const dev = resolveEnvironment(['--environment', 'dev']);
  const devPage = new URL(dev.emailLinkUrl);
  assert.equal(gameEndpoint(dev.gameWebSocketUrl, devPage, dev), 'wss://game-dev.molesunderthepitch.org/browser/v2');
  for (const url of [dev.gameWebSocketUrl.replace('wss:', 'ws:'), dev.gameWebSocketUrl + '?',
    dev.gameWebSocketUrl + '?token=x', dev.gameWebSocketUrl + '/', 'wss://game.molesunderthepitch.org/browser/v2',
    'wss://game-dev.molesunderthepitch.org.evil/browser/v2', 'wss://game-dev.molesunderthepitch.org/session/v1']) {
    assert.throws(() => gameEndpoint(url, devPage, { ...dev, gameWebSocketUrl: url }));
  }
});

test('all environment pairs reject mixed projects domains endpoints and emulators before use', () => {
  const configs = ['local', 'local-dev', 'dev', 'prod'].map(environment => resolveEnvironment(['--environment', environment]));
  for (const config of configs) {
    assert.equal(validateTransportConfiguration(config), config);
    for (const other of configs) for (const field of ['projectId', 'authDomain', 'gameWebSocketUrl', 'authEmulatorUrl']) {
      if (config[field] === other[field]) continue;
      const mixed = { ...config, [field]: other[field] };
      assert.throws(() => validateTransportConfiguration(mixed));
      assert.throws(() => hostingConfiguration({ hosting: { headers: [] } }, mixed));
    }
    for (const href of ['https://foreign.invalid', 'http://localhost.evil:5000']) {
      assert.throws(() => validateTransportConfiguration(config, new URL(href)));
    }
  }
  for (const environment of ['dev', 'prod']) {
    const config = resolveEnvironment(['--environment', environment]);
    const other = resolveEnvironment(['--environment', environment === 'dev' ? 'prod' : 'dev']);
    assert.throws(() => validateTransportConfiguration(config, new URL(other.emailLinkUrl)));
    assert.throws(() => validateTransportConfiguration(config, new URL(config.emailLinkUrl.replace('https:', 'http:'))));
    for (const gameWebSocketUrl of ['ws://127.0.0.1:22231/browser/v2', 'wss://game.test/browser/v2'])
      assert.throws(() => hostingConfiguration({ hosting: { headers: [] } }, { ...config, gameWebSocketUrl }));
  }
});

test('bearer invitation survives the sign-in redirect without accepting a client return URL', async () => {
  const code = 'abcdefghijklmnopqrstuv'; const data = new Map(); let redirected;
  globalThis.location = { search: `?invite=${code}&returnTo=https://foreign.invalid`, assign: value => { redirected = value; } };
  globalThis.sessionStorage = { setItem: (key, value) => data.set(key, value) };
  const body = source.slice(end, source.indexOf("if (typeof document"));
  const module = await import(`data:text/javascript,${encodeURIComponent('const onAuthStateChanged=(auth,callback)=>{callback(null);return()=>{};};' + body)}`);
  try {
    module.startPlay({ auth: {}, config: {} }, {}, { replaceChildren() {} });
    assert.equal(data.get('moles.play.invitation'), code);
    assert.equal(redirected, '/login?returnTo=%2Fplay');
  } finally { delete globalThis.location; delete globalThis.sessionStorage; }
});

test('a direct match link survives sign-in through a validated same-site return', async () => {
  const data = new Map(); const navigations = [];
  globalThis.sessionStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const body = source.slice(end, source.indexOf("if (typeof document"));
  const module = await import(`data:text/javascript,${encodeURIComponent('const onAuthStateChanged=(auth,callback)=>{callback(globalThis.__testUser);return()=>{};};' + body)}`);
  try {
    globalThis.location = { pathname: '/play/match', search: `?matchId=${'12345678-1234-1234-1234-123456789abc'}&watch=1`, assign: value => navigations.push(value) };
    globalThis.__testUser = null;
    module.startPlay({ auth: {}, config: {} }, {}, { replaceChildren() {} });
    assert.equal(data.get('moles.play.return-match'), '/play/match?matchId=12345678-1234-1234-1234-123456789abc&watch=1');
    assert.equal(navigations.at(-1), '/login?returnTo=%2Fplay');
    globalThis.location = { pathname: '/play', search: '', assign: value => navigations.push(value) };
    globalThis.__testUser = { getIdToken: async () => 'unused' };
    module.startPlay({ auth: {}, config: {} }, {}, { replaceChildren() {} });
    assert.equal(navigations.at(-1), '/play/match?matchId=12345678-1234-1234-1234-123456789abc&watch=1');
    assert.equal(data.has('moles.play.return-match'), false);
  } finally { delete globalThis.location; delete globalThis.sessionStorage; delete globalThis.__testUser; }
});

test('marker-6 container publication remains loopback-only', async () => {
  const compose = await readFile(new URL('../../containers/local/compose.marker6.yaml', import.meta.url), 'utf8');
  const config = await readFile(new URL('../../containers/local/server.marker6.ini', import.meta.url), 'utf8');
  assert.match(compose, /ports:\s*\r?\n\s*- "127\.0\.0\.1:22231:22227"/);
  assert.doesNotMatch(compose, /network_mode\s*:/);
  assert.equal((compose.match(/ports:/g) ?? []).length, 1);
  assert.match(config, /^local\.transport\.container\.forwarding=true\r?$/m);
});
