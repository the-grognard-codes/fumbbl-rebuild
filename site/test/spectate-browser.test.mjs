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
const game = { matchId, label: 'Home vs Away', details: {
  home: { name: 'Deepdelve Miners', type: 'Human', teamValue: 1100000, coach: 'Grognard' },
  away: { name: "Bugman's Best", type: 'Orc', teamValue: 990000, coach: 'Coach Bugman - Random' },
  ruleset: 'BB2025', competition: null, phase: 'PLAY', half: 2, turn: 4, homeScore: 1, awayScore: 0, spectators: 3,
} };

test('spectate browses live details, filters matches, prepares replay searches and fits desktop/mobile', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return; }
    const routes = { '/spectate': '/spectate/index.html', '/play': '/play/index.html', '/login': '/login/index.html' };
    const file = resolve(root, `.${routes[path] ?? path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  let games = [game, { ...game, matchId: '22345678-1234-1234-1234-123456789abc', details: { ...game.details,
    home: { ...game.details.home, name: 'The Very Long Named Underworld Invitational All-Stars', coach: null },
    away: { ...game.details.away, name: 'Blackwater Bruisers', coach: null }, homeScore: 0, awayScore: 2, half: 1, turn: 7, spectators: 0 } }];
  const requests = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    // Simulate the unversioned bundles still cached from an older Hosting release.
    await context.route('**/assets/play.js', route => route.fulfill({ contentType: 'text/javascript', body: 'throw Error("Old cached Play bootstrap");' }));
    await context.route('**/assets/game/game.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export function mountPlay(){} export function mountBuilder(){}' }));
    await context.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
    await context.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: "export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture'}));return()=>{};}" }));
    await context.routeWebSocket('**/browser/v2', socket => {
      socket.onMessage(raw => {
        const request = JSON.parse(raw); requests.push(request);
        const send = message => socket.send(JSON.stringify({ version: 2, requestId: request.requestId, ...message }));
        if (request.type === 'authenticate') send({ type: 'authentication', code: 'ACCEPTED', accountId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' });
        if (request.type === 'browse') send({ type: 'browse', code: 'ACCEPTED', matches: games });
        if (request.type === 'savedTeam') send({ type: 'savedTeam', code: 'OK', teams: [], document: null, validation: null, versionStatus: null });
      });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/spectate`);
    const live = page.getByRole('list', { name: 'Games currently in progress' });
    await live.getByRole('article').first().waitFor();
    assert.equal(await live.getByRole('article').count(), 2);
    assert.match(await live.innerText(), /TV 1,100k/);
    assert.match(await live.innerText(), /Half 2 · Turn 4/);
    assert.match(await live.innerText(), /3 spectators/);
    const first = live.getByRole('article').first();
    assert.equal(await first.getByLabel('Score 1 to 0').count(), 1);
    assert.equal(await first.getByRole('link', { name: "Watch Deepdelve Miners vs. Bugman's Best" }).getAttribute('href'), `/play/match?matchId=${matchId}&watch=1`);
    assert.deepEqual(requests.map(request => request.type), ['authenticate', 'browse'], 'The spectator directory must not request private player data');
    assert.equal(requests[1].includeDetails, true, 'Public details are an explicit directory capability');
    await first.getByText('Game ID', { exact: true }).click();
    assert.equal(await first.getByText(matchId, { exact: true }).isVisible(), true);
    await first.getByText('Game ID', { exact: true }).click();
    await page.getByLabel('Find a live game').fill('GROGNARD ORC');
    assert.equal(await live.getByRole('article').count(), 1);
    await page.getByLabel('Find a live game').fill('nothing-matches');
    await page.getByText('No matching live games', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear live search' }).click();
    assert.equal(await live.getByRole('article').count(), 2);

    const replay = page.getByRole('form', { name: 'Replay search' });
    await replay.getByLabel('Game ID', { exact: true }).fill(matchId);
    await replay.getByLabel('Player / coach name').fill('Grognard');
    await replay.getByLabel('Team name').fill('Miners');
    await replay.getByLabel('Team type').fill('Human');
    const before = requests.length;
    await replay.getByRole('button', { name: 'Search replays' }).click();
    await page.getByText('Your search filters are ready. Replay search is not available yet.').waitFor();
    assert.equal(requests.length, before, 'Placeholder replay search must not call an unsupported endpoint');
    assert.equal(await page.getByRole('list', { name: 'Games available as replays' }).getByRole('listitem').count(), 0);
    await replay.getByRole('button', { name: 'Clear filters' }).click();
    assert.equal(await replay.getByLabel('Game ID', { exact: true }).inputValue(), '');
    await page.evaluate(() => document.fonts.ready);
    const output = fileURLToPath(new URL('../../test-output/spectate-page/', import.meta.url));
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
      const button = first.getByRole('link', { name: "Watch Deepdelve Miners vs. Bugman's Best" });
      const bounds = await button.boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
      if (width === 390) await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
    }
    games = [];
    await page.getByRole('button', { name: 'Refresh games', exact: true }).click();
    await page.getByText('The pitch is quiet for now.', { exact: true }).waitFor();
    assert.equal(await live.getByRole('article').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Set up a game' }).getAttribute('href'), '/play');
    await context.unroute('**/assets/play.js');
    await context.unroute('**/assets/game/game.js');
    await page.goto(`${origin}/play`);
    const setup = page.getByRole('region', { name: 'Watch games' });
    await setup.getByRole('link', { name: 'Spectate', exact: true }).waitFor();
    assert.equal(await setup.getByRole('link', { name: 'Spectate', exact: true }).getAttribute('href'), '/spectate');
    assert.deepEqual(errors, []);

    const signedOut = await browser.newContext();
    await signedOut.route('https://fonts.googleapis.com/**', route => route.abort());
    await signedOut.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG,GoogleAuthProvider:class{}});' }));
    await signedOut.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `
      export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback(sessionStorage.getItem('fixture-signed-in')?{getIdToken:async()=>'fixture'}:null));return()=>{};}
      export async function signInWithPopup(){sessionStorage.setItem('fixture-signed-in','1');}
      export async function sendSignInLinkToEmail(){}
    ` }));
    await signedOut.routeWebSocket('**/browser/v2', socket => socket.onMessage(raw => {
      const request = JSON.parse(raw);
      if (request.type === 'authenticate') socket.send(JSON.stringify({ version: 2, type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' }));
      if (request.type === 'browse') socket.send(JSON.stringify(request.includeDetails
        ? { version: 2, type: 'error', requestId: request.requestId, code: 'MALFORMED_MESSAGE' }
        : { version: 2, type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [] }));
    }));
    const signedOutPage = await signedOut.newPage();
    await signedOutPage.goto(`${origin}/spectate`);
    await signedOutPage.waitForURL(`${origin}/login?returnTo=%2Fspectate`);
    await signedOutPage.locator('#google-sign-in').click();
    await signedOutPage.waitForURL(`${origin}/spectate`);
    await signedOutPage.getByText('The pitch is quiet for now.', { exact: true }).waitFor();
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
