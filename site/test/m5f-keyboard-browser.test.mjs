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

test('keyboard companion explores, pins and commits once while spectator stays read-only', async () => {
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
            if (request.operation === 'action') { assert.equal(index, 0); calls.push(request); revision++; }
            send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false,
              state: { ...base, revision, callerRole: role, actions: revision === 1 ? base.actions : [], players: revision === 1 ? base.players : base.players.map(player => player.id === 'p1' ? { ...player, x: 1, y: 1 } : player) } });
          }
        });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}${index ? '&watch=1' : ''}`);
      await page.getByLabel('Pitch text companion').waitFor();
      const summary = page.getByText('Explore pitch squares with keyboard');
      await summary.focus(); await summary.press('Enter'); await summary.press('Tab');
      assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /Square 0, 0/);
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await summary.evaluate(element => element === document.activeElement), true);
      await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
      assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /Square 1, 1/);
      assert.equal(await page.locator('.pitch-companion .setup-grid button[tabindex="0"]').count(), 1);
      assert.match(await page.getByLabel('Pitch text companion').getByRole('status').textContent(), /Square 1, 1: empty, ball here, 1 server-issued target/);
      if (index === 0 && process.env.M5F_SCREENSHOT_DIR) {
        await mkdir(process.env.M5F_SCREENSHOT_DIR, { recursive: true });
        await page.getByLabel('Pitch text companion').screenshot({ path: resolve(process.env.M5F_SCREENSHOT_DIR, 'companion-1280.png') });
      }
      if (index) {
        await page.keyboard.press('Enter');
        assert.equal(await page.getByRole('button', { name: 'Commit action' }).isDisabled(), true);
        const viewport = page.getByLabel('Pitch action preview'); await viewport.focus(); await viewport.press('Space');
        assert.equal(calls.length, 0);
      } else {
        for (let count = 0; count < 24; count++) await page.keyboard.press('ArrowRight');
        for (let count = 0; count < 13; count++) await page.keyboard.press('ArrowDown');
        assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /Square 25, 14/);
        assert.ok(await page.getByLabel('Pitch grid').evaluate(element => element.scrollTop) > 0, 'Grid keeps the final row reachable');
      }
    }
    const actor = pages[0]; const grid = actor.getByLabel('Pitch grid');
    const roster = actor.getByText('Full roster and states');
    await roster.focus(); await roster.press('Enter');
    await actor.getByRole('table', { name: 'Frozen team players' }).waitFor();
    await roster.press('Enter');
    await grid.locator('button').nth(27).press('Enter');
    assert.equal(await actor.getByLabel('Server action', { exact: true }).inputValue(), '1:move');
    assert.match(await actor.getByLabel('Pitch text companion').getByRole('status').textContent(), /Pinned action: Move Lineman to 1, 1/);
    await grid.locator('button').nth(27).press('Escape');
    assert.equal(await actor.getByLabel('Server action', { exact: true }).inputValue(), '');
    assert.doesNotMatch(await actor.getByLabel('Pitch text companion').getByRole('status').textContent(), /Pinned action:/);
    await grid.locator('button').nth(27).press('Space');
    assert.equal(calls.length, 0, 'Space on a grid button selects only');
    await actor.getByLabel('Live match pitch').locator('.live-marker').first().focus();
    assert.match(await actor.getByLabel('Pitch text companion').getByRole('status').textContent(), /Focused player: home Lineman/);
    await actor.getByLabel('Live match pitch').locator('.live-marker').first().press('Space');
    assert.equal(calls.length, 0, 'Space on a player button selects only');
    const search = actor.getByLabel('Find an action or target');
    await search.focus(); await search.press('Space');
    assert.doesNotMatch(await actor.getByLabel('Pitch text companion').getByRole('status').textContent(), /Focused player:/);
    assert.equal(calls.length, 0, 'Space in text entry does not commit');
    await grid.locator('button').nth(27).press('Enter');
    await actor.getByLabel('Live match pitch').getByRole('button', { name: '2×' }).click();
    const viewport = actor.getByLabel('Pitch action preview'); await viewport.focus();
    await viewport.press('ArrowRight');
    assert.ok(await viewport.evaluate(element => element.scrollLeft) > 0, 'Arrow key pans a zoomed pitch');
    await viewport.dispatchEvent('keydown', { key: ' ', code: 'Space', repeat: true, bubbles: true });
    assert.equal(calls.length, 0, 'Held Space does not commit');
    await viewport.press('Space');
    assert.equal(calls.length, 1); assert.equal(calls[0].actionId, '1:move'); assert.equal(calls[0].expectedRevision, 1);
    await actor.getByTestId('setup-status').filter({ hasText: 'Revision 2' }).waitFor({ state: 'attached' });
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
