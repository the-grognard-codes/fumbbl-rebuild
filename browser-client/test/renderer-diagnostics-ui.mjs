import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const initial = JSON.parse(await readFile(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const poseAsset = '**/teams/*/poses/**/*.png';
const colorPack = '**/team-colors/v1/*.bin.gz';
const turfAsset = '**/pitch/stadium-v1.png';
const errors = [];

async function open({ missingMapping = false, blockWebgl = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ blockWebgl }) => {
    window.rendererResources = { observers: 0, wheelListeners: 0 };
    const Observer = window.ResizeObserver;
    window.ResizeObserver = class extends Observer {
      active = false;
      observe(...args) { if (!this.active) window.rendererResources.observers++; this.active = true; super.observe(...args); }
      disconnect() { if (this.active) window.rendererResources.observers--; this.active = false; super.disconnect(); }
    };
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === 'wheel' && this instanceof Element && this.classList.contains('live-pitch-viewport')) window.rendererResources.wheelListeners++;
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      if (type === 'wheel' && this instanceof Element && this.classList.contains('live-pitch-viewport')) window.rendererResources.wheelListeners--;
      return remove.call(this, type, listener, options);
    };
    if (blockWebgl) {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return typeof type === 'string' && type.startsWith('webgl') ? null : getContext.call(this, type, ...args);
      };
    }
  }, { blockWebgl });
  let revision = 0;
  const requests = [];
  const state = () => ({ ...initial, revision,
    players: initial.players.map((player, index) => ({ ...player, x: index ? player.x : 12 + revision,
      art: { rosterId: missingMapping ? 'unmapped-roster' : 'human', positionId: 'blitzer' } })),
    actions: [{ id: `${revision}:select-home1`, kind: 'select', label: 'Move home1', actor: 'home', target: { playerId: 'home1' }, sourcePlayerId: 'home1' }],
    playerActionMenu: [] });
  await page.routeWebSocket('**/browser/v2', socket => {
    const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
    socket.onMessage(raw => {
      const request = JSON.parse(raw); requests.push(request);
      if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
      else if (request.type === 'setup') {
        if (request.operation === 'action') revision++;
        send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: state() });
      }
    });
  });
  await page.route('**/play/match?*', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module" src="/test/renderer-diagnostics-harness.tsx"></script>' }));
  await page.goto(`${origin}/play/match?matchId=${initial.matchId}`);
  await page.waitForFunction(() => typeof window.mountRendererTest === 'function');
  return { page, requests };
}
const mount = async page => {
  await page.evaluate(() => window.mountRendererTest());
  await page.getByLabel('Live match pitch').waitFor();
  await page.getByTestId('setup-status').filter({ hasText: 'Revision' }).waitFor({ state: 'attached' });
};
const unmount = async page => {
  await page.evaluate(() => window.unmountRendererTest());
  await page.waitForFunction(() => document.getElementById('app').childElementCount === 0
    && window.rendererResources.observers === 0 && window.rendererResources.wheelListeners === 0);
};
async function selectAndAccept(page, requests) {
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await page.getByLabel('Server action', { exact: true }).selectOption('0:select-home1');
  await page.getByRole('button', { name: 'Debug', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByTestId('setup-status').filter({ hasText: 'Revision 1' }).waitFor({ state: 'attached' });
  await page.locator('.live-marker[data-player-id="home1"][data-x="13"]').waitFor();
  const actions = requests.filter(request => request.type === 'setup' && request.operation === 'action');
  assert.equal(actions.length, 1, 'One V2 intent is sent and accepted while graphics are degraded');
  assert.equal(actions[0].version, 2);
}

try {
  for (const scenario of ['valid', 'missing-mapping', 'failed-assets', 'without-webgl']) {
    const { page, requests } = await open({ missingMapping: scenario === 'missing-mapping', blockWebgl: scenario === 'without-webgl' });
    const artRequests = [];
    page.on('request', request => { if (/\/poses\/.*\.png$/.test(request.url())) artRequests.push(request.url()); });
    if (scenario === 'failed-assets') {
      await page.route(poseAsset, route => route.fulfill({ status: 404, body: '' }));
      await page.route(colorPack, route => route.fulfill({ status: 404, body: '' }));
      await page.route(turfAsset, route => route.fulfill({ status: 404, body: '' }));
    }
    await mount(page);
    assert.equal(await page.locator('[data-cell-x]').count(), 390);
    assert.equal(await page.locator('canvas').count(), 0, 'V2 has no WebGL initialization dependency');
    if (scenario === 'missing-mapping' || scenario === 'failed-assets') {
      await page.locator('.live-marker[data-player-id="home1"] .live-token').waitFor();
      if (scenario === 'missing-mapping') assert.equal(artRequests.length, 0, 'Missing mappings do not trigger asset retries');
      else await page.getByText('Pitch texture unavailable; plain field shown.', { exact: true }).waitFor();
    } else {
      await page.waitForFunction(() => [...document.querySelectorAll('.live-marker img')].some(image => image.complete && image.naturalWidth > 0));
    }
    await selectAndAccept(page, requests);
    if (scenario === 'failed-assets') {
      const counts = new Map();
      for (const url of artRequests) counts.set(url, (counts.get(url) ?? 0) + 1);
      assert.ok(counts.size > 0);
      assert.ok([...counts.values()].every(count => count === 1), 'Failed player art is not repeatedly fetched');
      await page.unroute(poseAsset); await page.unroute(colorPack); await page.unroute(turfAsset);
      await unmount(page); await mount(page);
      await page.waitForFunction(() => [...document.querySelectorAll('.live-marker img')].some(image => image.complete && image.naturalWidth > 0));
      assert.equal(await page.locator('.live-pitch-error').count(), 0, 'Remount restores available textures');
      await page.getByTestId('setup-status').filter({ hasText: 'Revision 1' }).waitFor({ state: 'attached' });
    }
    await unmount(page);
    await page.close();
    console.log(`PASS V2 renderer ${scenario}: accepted authoritative state and clean teardown`);
  }

  const { page } = await open();
  // Exercise disposal before React has committed any renderer work.
  await page.evaluate(() => { window.mountRendererTest(); window.unmountRendererTest(); });
  assert.equal(await page.locator('#app').evaluate(element => element.childElementCount), 0);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let delayed = 0;
  await page.route(poseAsset, async route => { delayed++; await gate; await route.continue(); });
  await mount(page);
  await page.waitForFunction(() => document.querySelectorAll('.live-marker img').length > 0);
  await unmount(page);
  release();
  await page.unrouteAll({ behavior: 'wait' });
  assert.ok(delayed > 0, 'Asset loading was pending during teardown');
  assert.equal(await page.locator('#app').evaluate(element => element.childElementCount), 0, 'Late assets cannot recreate a disposed renderer');
  for (let index = 0; index < 3; index++) { await mount(page); await unmount(page); }
  assert.deepEqual(await page.evaluate(() => window.rendererResources), { observers: 0, wheelListeners: 0 });
  assert.deepEqual(errors, [], 'No uncaught errors during failures, recovery, or lifecycle transitions');
  await page.close();
  console.log('PASS V2 early teardown, pending assets, repeated mount/unmount, observer and listener cleanup');
} finally {
  await browser.close();
  await server.close();
}
