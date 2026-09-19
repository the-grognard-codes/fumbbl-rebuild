import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const matchId = '12345678-1234-1234-1234-123456789abc';
const accounts = ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc'];
const base = { matchId, revision: 2, phase: 'SETUP', actor: 'home', prompt: null,
  players: [{ id: 'p1', name: 'Lineman', slot: 1, role: 'home', x: 3, y: 4, state: 'standing' }, { id: 'p2', name: 'Lineman', slot: 1, role: 'away', x: 22, y: 4, state: 'standing' }],
  weather: 'Nice', homeRerolls: 2, awayRerolls: 2, actions: [{ id: 'next', label: 'End turn', actor: 'home', kind: 'endTurn' }],
  turn: 0, turnMode: 'setup', ball: { x: 13, y: 7 }, activePlayerId: null, half: 1, homeTurn: 0, awayTurn: 0, homeScore: 0, awayScore: 0, drive: 1 };

test('two players and spectator use one board; updates, read-only controls and reconnect', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end("window.MOLES_FIREBASE_CONFIG={gameWebSocketUrl:'ws://127.0.0.1:22231/browser/v2'};"); return; }
    const file = resolve(root, `.${path === '/play' ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { const content = await readFile(file); response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(content); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const live = new Map(); let revision = 2; const mutations = [];
  const state = index => ({ ...base, revision, callerRole: ['home', 'away', 'spectator'][index] });
  try {
    const pages = [];
    for (let index = 0; index < 3; index++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } }); const page = await context.newPage(); pages.push(page);
      page.on('pageerror', failure => console.error('Browser error:', failure.message));
      await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
      await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture-${index}'}));return()=>{};}` }));
      await page.routeWebSocket('**/browser/v2', socket => {
        const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
        socket.onMessage(raw => {
          const request = JSON.parse(raw);
          if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: accounts[index] });
          else if (request.type === 'browse') send({ type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [{ matchId, label: 'Home vs Away' }] });
          else if (request.type === 'savedTeam') send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', teams: [], document: null, validation: null, versionStatus: null });
          else if (request.type === 'watch' || request.type === 'setup') {
            live.set(index, send);
            if (request.type === 'setup' && request.operation !== 'load') { assert.notEqual(index, 2); mutations.push(request); revision++; }
            send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: state(index) });
            if (request.operation === 'action') for (const [other, target] of live) if (other !== index) target({ type: 'setupState', requestId: null, code: 'ACCEPTED', duplicate: false, state: state(other) });
          }
        });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/play`);
      await page.getByRole('button', { name: 'Refresh games', exact: true }).waitFor();
      if (index === 2) await page.getByRole('button', { name: /Watch Home vs Away/ }).click();
      else { await page.getByLabel('Match ID', { exact: true }).fill(matchId); await page.getByRole('button', { name: 'Resume play', exact: true }).click(); }
      await page.getByLabel('Pitch grid', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Pitch grid', { exact: true }).getByRole('button').count(), 390);
    }
    assert.equal(await pages[2].getByRole('button', { name: 'Execute action', exact: true }).isDisabled(), true);
    assert.equal(await pages[1].getByRole('button', { name: 'Execute action', exact: true }).isDisabled(), true);
    await pages[0].getByLabel('Server action', { exact: true }).selectOption('next');
    await pages[0].getByRole('button', { name: 'Execute action', exact: true }).click();
    await pages[2].waitForFunction(() => document.querySelector('[data-testid="setup-status"]')?.textContent.includes('Revision 3'));
    assert.equal(mutations.length, 1);
    await pages[2].getByRole('button', { name: 'Disconnect', exact: true }).click();
    assert.equal(await pages[2].getByLabel('Pitch grid', { exact: true }).count(), 0);
    await pages[2].getByRole('button', { name: 'Reconnect', exact: true }).click();
    await pages[2].getByLabel('Pitch grid', { exact: true }).waitFor();
    assert.match(await pages[2].getByTestId('setup-status').textContent(), /Revision 3/);
    if (process.env.PLAY_SCREENSHOT_PATH) await pages[2].screenshot({ path: process.env.PLAY_SCREENSHOT_PATH, fullPage: true });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
