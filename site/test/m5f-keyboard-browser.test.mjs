import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { resolveEnvironment, configurationScript } from '../../deployment/firebase/scripts/environment.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const matchId = '12345678-1234-1234-1234-123456789abc';
const base = { projectionVersion: 3, matchId, revision: 1, callerRole: 'home', phase: 'PLAY', actor: 'home', prompt: null,
  players: [{ id: 'p1', name: 'Lineman', slot: 1, role: 'home', x: 0, y: 0, state: 'standing', art: null },
    { id: 'p2', name: 'Blitzer', slot: 2, role: 'away', x: 22, y: 7, state: 'prone', art: null }],
  weather: 'Nice', homeRerolls: 2, awayRerolls: 1,
  actions: [{ id: '1:move', label: 'Move Lineman to 1, 1', actor: 'home', kind: 'move', target: { x: 1, y: 1 } },
    ...Array.from({ length: 12 }, (_, index) => ({ id: `1:other-move-${index}`, label: `Other move ${index}`, actor: 'home', kind: 'move', target: null }))],
  turn: 1, turnMode: 'PLAY', ball: { x: 1, y: 1 }, activePlayerId: 'p1', half: 1, homeTurn: 1, awayTurn: 0, homeScore: 0, awayScore: 0, drive: 1 };

test('pitch keyboard focus shows player cards and commits only a selected coach action', async () => {
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
  const calls = []; let revision = 1;
  try {
    const pages = [];
    for (const [index, role] of ['home', 'spectator'].entries()) {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 660 } })).newPage(); pages.push(page);
      await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
      await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture-${index}'}));return()=>{};}` }));
      await page.routeWebSocket('**/browser/v2', socket => {
        const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
        socket.onMessage(raw => {
          const request = JSON.parse(raw);
          if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: index ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
          if (request.type === 'browse') send({ type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [] });
          if (request.type === 'savedTeam') send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', teams: [], document: null, validation: null, versionStatus: null });
          if (request.type === 'setup' || request.type === 'watch') {
            if (request.operation === 'action' || request.operation === 'concede') { assert.equal(index, 0); calls.push(request); revision++; }
            send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false,
              state: { ...base, revision, callerRole: role, actions: revision === 1 ? base.actions : [], players: revision === 1 ? base.players : base.players.map(player => player.id === 'p1' ? { ...player, x: 1, y: 1 } : player) } });
          }
        });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}${index ? '&watch=1' : ''}`);
      await page.getByLabel('Live match pitch').waitFor();
      assert.equal(await page.getByLabel('Pitch text companion').count(), 0);
      assert.equal(await page.getByText('Roster & bench').count(), 0);
      const marker = page.getByLabel('Live match pitch').locator('.live-marker').first();
      await marker.focus();
      await page.getByRole('tooltip', { name: /Lineman player card/ }).waitFor();
      assert.match(await page.getByRole('tooltip', { name: /Lineman player card/ }).textContent(), /MA.*ST.*AG.*PA.*AV/s);
      assert.notEqual(await marker.evaluate(element => getComputedStyle(element).outlineStyle), 'none');
      await marker.press('Space');
      assert.equal(calls.length, 0, 'Space on a player selects only');
      if (index) {
        assert.equal(await page.getByRole('button', { name: 'Commit action' }).count(), 0);
        await page.getByRole('button', { name: /Game Menu/ }).click();
        assert.equal(await page.getByRole('button', { name: 'Concede match' }).isDisabled(), true);
        await page.getByRole('button', { name: 'Close Game Menu' }).click();
      }
    }
    const actor = pages[0];
    await actor.getByText('All server actions', { exact: true }).click();
    await actor.getByLabel('Server action', { exact: true }).selectOption('1:move');
    assert.equal(calls.length, 0, 'Selecting an action does not send it');
    await actor.getByLabel('Live match pitch').getByRole('button', { name: '2×' }).click();
    const viewport = actor.getByLabel('Pitch action preview'); await viewport.focus();
    await viewport.press('ArrowRight');
    assert.ok(await viewport.evaluate(element => element.scrollLeft) > 0, 'Arrow key pans a zoomed pitch');
    await viewport.dispatchEvent('keydown', { key: ' ', code: 'Space', repeat: true, bubbles: true });
    assert.equal(calls.length, 0, 'Held Space does not commit');
    await viewport.press('Space');
    assert.equal(calls.length, 1); assert.equal(calls[0].actionId, '1:move'); assert.equal(calls[0].expectedRevision, 1);
    await actor.getByTestId('setup-status').filter({ hasText: 'Revision 2' }).waitFor({ state: 'attached' });
    await actor.getByRole('button', { name: /Game Menu/ }).click();
    await actor.getByRole('button', { name: 'Concede match' }).click();
    assert.equal(calls.length, 1, 'Opening the concession confirmation does not submit');
    await actor.getByRole('button', { name: 'Confirm concession' }).dispatchEvent('click');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].operation, 'concede');
    assert.equal(calls[1].expectedRevision, 2);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
