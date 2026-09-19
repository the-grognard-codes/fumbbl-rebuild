import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/assets/play.js', import.meta.url), 'utf8');
const start = source.indexOf('export function gameEndpoint');
const end = source.indexOf('export function startPlay');
const { gameEndpoint } = await import(`data:text/javascript,${encodeURIComponent(source.slice(start, end))}`);

test('single endpoint accepts v2 WSS and loopback-only local WS', () => {
  assert.equal(gameEndpoint('wss://game.test/browser/v2', { hostname: 'site.test', protocol: 'https:' }), 'wss://game.test/browser/v2');
  assert.equal(gameEndpoint('ws://127.0.0.1:22231/browser/v2', { hostname: 'localhost', protocol: 'http:' }), 'ws://127.0.0.1:22231/browser/v2');
  for (const url of ['ws://game.test/browser/v2', 'wss://game.test/session/v1', 'wss://game.test/browser/v2?token=x', 'wss://user:pass@game.test/browser/v2'])
    assert.throws(() => gameEndpoint(url, { hostname: 'site.test', protocol: 'https:' }));
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
