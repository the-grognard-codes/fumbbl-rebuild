import assert from 'node:assert/strict';
import { squarePosition } from '../../browser-client/test/projected-pitch-helper.mjs';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { resolveEnvironment, configurationScript } from '../../deployment/firebase/scripts/environment.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const frames = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const frame = frames.find(item => item.checkpoint === 'target-selected');
const matchId = frame.actor.matchId;

function preview(waypoints) {
  const steps = []; let from = { x: 7, y: 7 };
  for (const target of waypoints) {
    while (from.x !== target.x || from.y !== target.y) {
      from = { x: from.x + Math.sign(target.x - from.x), y: from.y + Math.sign(target.y - from.y) };
      steps.push({ ...from, dodge: steps.length === 0 ? 3 : steps.length === 1 ? 4 : 0,
        rush: 0, reactions: steps.length === 1 ? ['Diving Tackle'] : [] });
    }
  }
  return { routeVersion: 1, playerId: 'home1', from: { x: 7, y: 7 }, remaining: 8, steps, revision: 2, actor: 'home' };
}

test('coach constructs, revises and commits a server-previewed multi-waypoint route; spectator remains read-only', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return; }
    const file = resolve(root, `.${path === '/play/match' ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const pages = [], previews = [], mutations = [];
  let expiredPreview = false, coachAuthentications = 0, signalRefresh;
  const refreshed = new Promise(resolve => { signalRefresh = resolve; });
  try {
    for (let index = 0; index < 2; index++) {
      const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); pages.push(page);
      await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
      await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture-${index}'}));return()=>{};}` }));
      await page.routeWebSocket('**/browser/v2', socket => {
        const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
        socket.onMessage(raw => {
          const request = JSON.parse(raw);
          if (request.type === 'authenticate') {
            send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: index ? 'cccccccc-cccc-cccc-cccc-cccccccccccc' : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
            if (!index && ++coachAuthentications === 2) signalRefresh();
          }
          else if ((request.type === 'setup' && request.operation === 'load') || request.type === 'watch')
            send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: index ? frame.spectator : frame.actor });
          else if (request.type === 'routePreview') {
            previews.push({ index, request });
            if (!index && !expiredPreview) { expiredPreview = true; send({ type: 'error', requestId: request.requestId, code: 'AUTHENTICATION_REQUIRED' }); return; }
            send({ type: 'routePreview', requestId: request.requestId, code: 'ACCEPTED', matchId, route: preview(request.waypoints) });
          } else if (request.type === 'setup' && request.operation === 'route') mutations.push({ index, request });
        });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}${index ? '&watch=1' : ''}`);
      await page.getByLabel('Live match pitch').waitFor();
    }
    const actor = pages[0], spectator = pages[1];
    assert.equal(await spectator.getByRole('button', { name: 'Plan path' }).count(), 0);
    assert.equal(await spectator.getByRole('button', { name: 'Confirmed!' }).count(), 0);
    await actor.getByLabel('Live match pitch').locator('.live-marker').first().hover();
    assert.equal(mutations.length, 0);
    await actor.getByLabel('Live match pitch').locator('.live-marker').first().click();
    await actor.getByRole('button', { name: 'Other action' }).click();
    await actor.getByRole('button', { name: 'Plan path' }).click();
    const pathControls = actor.getByLabel('Movement path');
    const commit = actor.getByRole('button', { name: 'Confirmed!' });
    assert.equal(await commit.isDisabled(), true);
    const square = async (x, y) => {
      const scene = actor.getByLabel('Live match pitch').locator('.live-pitch-scene');
      await scene.click({ position: await squarePosition(actor, x, y) });
    };
    await square(8, 7);
    await refreshed;
    await actor.getByRole('button', { name: 'Other action' }).waitFor();
    assert.equal(await actor.getByRole('button', { name: 'Reconnect' }).count(), 0, 'The expired preview must restore the match without manual input');
    assert.equal(await actor.getByLabel('Live match pitch').count(), 1);
    await actor.getByLabel('Live match pitch').locator('.live-marker').first().click();
    await actor.getByRole('button', { name: 'Other action' }).click();
    await actor.getByRole('button', { name: 'Plan path' }).click();
    await square(8, 7);
    await pathControls.getByRole('button', { name: 'Undo' }).click();
    assert.equal(await commit.isDisabled(), true);
    await square(8, 7);
    await pathControls.getByRole('button', { name: 'Clear' }).click();
    assert.equal(await commit.isDisabled(), true);
    for (const [x, y] of [[8, 7], [8, 6], [12, 6]]) await square(x, y);
    await actor.getByText('Server path ready. Commit moves until the next required decision.').waitFor();
    assert.equal(await commit.isEnabled(), true);
    assert.deepEqual(previews.at(-1).request.waypoints, [{ x: 8, y: 7 }, { x: 8, y: 6 }, { x: 12, y: 6 }]);
    assert.equal(await pathControls.getByLabel('Waypoints').getByRole('button').count(), 3);
    await pathControls.getByText('Square checks').click();
    assert.match(await pathControls.getByLabel('Route square checks').innerText(), /8, 6: dodge 4\+.*possible Diving Tackle/);
    assert.match(await pathControls.getByLabel('Route square checks').innerText(), /12, 6: no dodge.*no rush/);
    if (process.env.M5H_SCREENSHOT_DIR) {
      await mkdir(process.env.M5H_SCREENSHOT_DIR, { recursive: true });
      await actor.screenshot({ path: resolve(process.env.M5H_SCREENSHOT_DIR, 'route-waypoints.png') });
    }
    await pathControls.getByRole('button', { name: '1: 8, 7' }).click();
    assert.equal(await pathControls.getByLabel('Waypoints').getByRole('button').count(), 1);
    await square(8, 6); await square(12, 6);
    await actor.getByText('Server path ready. Commit moves until the next required decision.').waitFor();
    assert.equal(mutations.length, 0, 'Hover and preview never commit movement');
    await commit.click();
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].index, 0);
    assert.equal(mutations[0].request.expectedRevision, 2);
    assert.equal(mutations[0].request.playerId, 'home1');
    assert.deepEqual(mutations[0].request.waypoints, [{ x: 8, y: 7 }, { x: 8, y: 6 }, { x: 12, y: 6 }]);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
