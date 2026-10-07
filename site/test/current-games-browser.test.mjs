import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { configurationScript, resolveEnvironment } from '../../deployment/firebase/scripts/environment.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const id = index => `${String(index).padStart(8, '0')}-1234-1234-1234-123456789abc`;
const accounts = ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'];
const entry = (index, lifecycle, homeTeamName, awayTeamName) => ({ matchId: id(index), callerRole: 'home',
  lifecycle, homeTeamName, awayTeamName, phase: lifecycle === 'ACTIVATED' ? 'PRE_MATCH' : null });
const member = { role: 'home', sourceTeamId: id(1), sourceDocumentVersion: 1, ruleset: 'BB2025',
  catalogVersion: 'fixture', rosterId: 'human', presetId: 'fixture', presetVersion: '1',
  validation: { valid: true, total: 1, budget: 2, skillPoints: 0, messages: [] },
  roster: { captainId: null, resources: {}, players: [] } };
const matchState = { matchId: id(3), revision: 41, callerRole: 'home', phase: 'PRE_MATCH', actor: 'away',
  prompt: null, players: [], weather: 'Nice', homeRerolls: 2, awayRerolls: 1, actions: [], turn: 0,
  turnMode: 'setup', ball: null, activePlayerId: null, half: 1, homeTurn: 0, awayTurn: 0, homeScore: 0, awayScore: 0, drive: 1 };

test('current games page assembles owned pages, resumes setup, and links activated games', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return;
    }
    const file = resolve(root, `.${path === '/play' ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const requests = [];
  let empty = false, unavailable = false;
  let conceded = false, uncertainConcession = true;
  let holdRefresh = false, releasePage, signalHeld;
  try {
    for (let account = 0; account < 2; account++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await context.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript',
        body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
      await context.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript',
        body: "export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture'}));return()=>{};}" }));
      await context.routeWebSocket('**/browser/v2', socket => {
        const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
        socket.onMessage(raw => {
          const request = JSON.parse(raw); requests.push({ ...request, account });
          if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: accounts[account] });
          if (request.type === 'browse') send({ type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [] });
          if (request.type === 'savedTeam') send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', teams: [], document: null, validation: null, versionStatus: null });
          if (request.type === 'computer') send({ type: 'computer', requestId: request.requestId, code: 'UNAVAILABLE' });
          if (request.type === 'currentMatches') {
            if (unavailable) { send({ type: 'error', requestId: request.requestId, code: 'PERSISTENCE_FAILED' }); return; }
            const matches = empty || account === 1 ? [] : request.after === null
              ? [entry(1, 'WAITING_FOR_OPPONENT', 'Orcs 4 Hire', null), entry(2, 'AWAITING_SETUP', 'Reavers', 'Raiders')]
              : [...(conceded ? [] : [entry(3, 'ACTIVATED', 'Active Orcs', "Bugman's Best")]), entry(4, 'UNAVAILABLE', null, null)];
            const reply = () => send({ type: 'currentMatches', requestId: request.requestId, code: 'ACCEPTED', matches,
              next: matches.length && request.after === null ? id(2) : null });
            if (holdRefresh) { holdRefresh = false; releasePage = reply; signalHeld(); }
            else reply();
          }
          if (request.type === 'preparedMatch') send({ type: 'preparedMatch', requestId: request.requestId,
            code: 'ACCEPTED', duplicate: false, callerRole: 'home', recoveryMatchId: null,
            document: { formatVersion: 1, matchId: request.matchId, documentVersion: 1,
              lifecycle: 'WAITING_FOR_OPPONENT', invitation: { intendedOpponent: 'away' }, home: member, away: null } });
          if (request.type === 'setup') {
            if (request.operation === 'load') send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: matchState });
            else if (request.operation === 'concede') {
              if (uncertainConcession) { uncertainConcession = false; send({ type: 'setupState', requestId: request.requestId, code: 'MATCH_OUTCOME_UNKNOWN', duplicate: false, state: null }); }
              else { conceded = true; send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: true,
                state: { ...matchState, phase: 'FULL_TIME', revision: 42, awayScore: 1 } }); }
            }
          }
        });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/play`);
      const games = page.getByRole('region', { name: 'Your current games' });
      if (account === 1) {
        await games.getByText('You have no unfinished games.').waitFor();

        assert.equal(await games.getByRole('listitem').count(), 0);
      } else {
        await games.getByRole('link', { name: 'Resume', exact: true }).waitFor();
        assert.equal(await games.getByRole('listitem').count(), 4);
        assert.equal(await games.getByRole('link', { name: 'Resume', exact: true }).getAttribute('href'), `/play/match?matchId=${id(3)}`);
        assert.equal(await games.getByRole('link', { name: 'Resume', exact: true }).getAttribute('target'), null);
        await games.getByText('Awaiting kickoff', { exact: false }).waitFor();
        await games.getByText('Your team: Active Orcs', { exact: false }).waitFor();
        await games.getByText("Opponent: Bugman's Best", { exact: false }).waitFor();
        const before = requests.filter(request => request.type === 'currentMatches' && request.after === null).length;
        holdRefresh = true;
        const held = new Promise(done => { signalHeld = done; });
        await games.getByRole('button', { name: 'Refresh games', exact: true }).click();
        await held;
        await games.getByRole('button', { name: 'Continue setup', exact: true }).first().click();
        await page.waitForFunction(matchId => document.querySelector('input[value="' + matchId + '"]') !== null, id(1));
        assert.equal(requests.filter(request => request.type === 'preparedMatch').at(-1).operation, 'load');
        assert.equal(new URL(page.url()).pathname, '/play');
        releasePage();
        await page.waitForFunction(() => !document.querySelector('section[aria-label="Your current games"] button').disabled);
        assert.equal(requests.filter(request => request.type === 'currentMatches' && request.after === null).length, before + 2,
          'A lifecycle change during paging queues a fresh inventory');
        await games.getByRole('button', { name: 'Refresh games', exact: true }).waitFor({ state: 'visible' });
        if (process.env.CURRENT_GAMES_SCREENSHOT_DIR) {
          await mkdir(process.env.CURRENT_GAMES_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: resolve(process.env.CURRENT_GAMES_SCREENSHOT_DIR, 'current-games.png'), fullPage: true });
        }
        unavailable = true;
        await games.getByRole('button', { name: 'Refresh games', exact: true }).click();
        await games.getByRole('alert').waitFor();
        assert.equal(await games.getByRole('listitem').count(), 4, 'A failed refresh retains the last confirmed list');
        unavailable = false; empty = true;
        await games.getByRole('button', { name: 'Refresh games', exact: true }).click();
        await games.getByText('You have no unfinished games.').waitFor();
        empty = false;
        await games.getByRole('button', { name: 'Refresh games', exact: true }).click();
        await games.getByRole('button', { name: 'Concede', exact: true }).click();
        await games.getByRole('button', { name: 'Keep playing', exact: true }).click();
        assert.equal(requests.filter(request => request.type === 'setup').length, 0, 'Cancelling confirmation makes no native request');
        await games.getByRole('button', { name: 'Concede', exact: true }).click();
        await games.getByRole('button', { name: 'Confirm concession', exact: true }).click();
        await games.getByText('Concession outcome is unconfirmed.', { exact: false }).waitFor();
        await page.waitForFunction(() => !document.querySelector('section[aria-label="Your current games"] button').disabled);
        assert.equal(requests.filter(request => request.type === 'preparedMatch').length, 2, 'Restore the displayed preparation subscription after the native concession reply');
        assert.equal(requests.filter(request => request.type === 'preparedMatch').at(-1).matchId, id(1));
        assert.equal(new URL(page.url()).pathname, '/play');
        assert.equal(await page.locator('.live-pitch-scene').count(), 0);
        await page.reload();
        await page.getByRole('button', { name: 'Repeat retained request', exact: true }).waitFor();
        assert.equal(new URL(page.url()).pathname, '/play', 'A retained lobby concession does not open the pitch on reload');
        assert.equal(requests.filter(request => request.operation === 'concede').length, 1, 'Reconnect never automatically repeats concession');
        await page.getByRole('button', { name: 'Repeat retained request', exact: true }).click();
        await games.getByText('Concession accepted. The match has ended.').waitFor();
        await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Your current games"] li').length === 3);
        const attempts = requests.filter(request => request.operation === 'concede');
        assert.equal(attempts.length, 2); assert.equal(attempts[0].requestId, attempts[1].requestId);
        assert.equal(attempts[0].expectedRevision, 41); assert.equal(attempts[1].expectedRevision, 41);
        assert.equal(await games.getByRole('link', { name: 'Resume', exact: true }).count(), 0);
        assert.equal(context.pages().length, 1);
      }
      await context.close();
    }
    assert.ok(requests.some(request => request.type === 'currentMatches' && request.after === id(2)), 'Load subsequent pages');
    assert.ok(requests.filter(request => request.type === 'currentMatches').every(request => !('accountId' in request) && !('role' in request)));
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
