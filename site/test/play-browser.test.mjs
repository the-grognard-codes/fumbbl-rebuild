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
const accounts = ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc'];
const base = { projectionVersion: 3, matchId, revision: 2, phase: 'SETUP', actor: 'home', prompt: null,
  players: [{ id: 'p1', name: 'Lineman', slot: 1, role: 'home', x: 3, y: 4, state: 'standing', art: { rosterId: 'human', positionId: 'lineman' } }, { id: 'p2', name: 'Lineman', slot: 1, role: 'away', x: 22, y: 4, state: 'standing', art: { rosterId: 'human', positionId: 'blitzer' } }],
  weather: 'Nice', homeRerolls: 2, awayRerolls: 2, actions: [{ id: 'next', label: 'End turn', actor: 'home', kind: 'endTurn', target: null }],
  turn: 0, turnMode: 'setup', ball: { x: 13, y: 7 }, activePlayerId: null, half: 1, homeTurn: 0, awayTurn: 0, homeScore: 0, awayScore: 0, drive: 1 };

test('creator sees opponent join and automatically opens play when opponent starts', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return; }
    const file = resolve(root, `.${path === '/play' || path === '/play/match' ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const recipients = new Map(); const reads = []; let revision = 1;
  const member = role => ({ role, sourceTeamId: matchId, sourceDocumentVersion: 1, ruleset: 'BB2025', catalogVersion: 'fixture', rosterId: 'human', presetId: 'fixture', presetVersion: '1', validation: { valid: true, total: 1, budget: 2, skillPoints: 0, messages: [] }, roster: { captainId: null, resources: {}, players: [] } });
  try {
    const pages = [];
    for (let index = 0; index < 2; index++) {
      const page = await (await browser.newContext()).newPage(); pages.push(page);
      await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
      await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture-${index}'}));return()=>{};}` }));
      await page.routeWebSocket('**/browser/v2', socket => {
        const send = message => socket.send(JSON.stringify({ version: 2, ...message })); recipients.set(index, send);
        socket.onMessage(raw => {
          const request = JSON.parse(raw);
          if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: accounts[index] });
          if (request.type === 'browse') send({ type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [] });
          if (request.type === 'savedTeam') send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', teams: [], document: null, validation: null, versionStatus: null });
          if (request.type === 'preparedMatch') {
            if (index === 1 && revision === 1) revision = 2;
            if (request.operation === 'activate') revision = 3;
            send({ type: 'preparedMatch', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, callerRole: index === 0 ? 'home' : 'away', recoveryMatchId: null,
              document: { formatVersion: 1, matchId, documentVersion: revision, lifecycle: ['WAITING_FOR_OPPONENT', 'AWAITING_SETUP', 'ACTIVATED'][revision - 1], invitation: { intendedOpponent: 'away' }, home: member('home'), away: revision > 1 ? member('away') : null } });
            if (index === 1) recipients.get(0)({ type: 'preparationChanged', requestId: null, code: 'ACCEPTED', matchId });
          }
          if (request.type === 'setup') {
            assert.equal(request.operation, 'load'); reads.push(index);
            send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: { ...base, callerRole: index === 0 ? 'home' : 'away' } });
          }
        });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/play`);
      await page.getByRole('button', { name: 'Refresh games', exact: true }).waitFor();
      await page.getByLabel('Match ID', { exact: true }).fill(matchId);
      await page.getByRole('button', { name: 'Reload game setup', exact: true }).click();
    }
    await pages[0].getByRole('button', { name: 'Start game', exact: true }).waitFor();
    await pages[1].getByRole('button', { name: 'Start game', exact: true }).click();
    for (const page of pages) await page.getByLabel('Pitch grid', { exact: true }).waitFor();
    assert.deepEqual(reads.sort(), [0, 1], 'Both pages opened play without either clicking Resume play');
    for (const page of pages) {
      assert.equal(new URL(page.url()).pathname, '/play/match');
      await page.reload();
      await page.getByLabel('Pitch grid', { exact: true }).waitFor();
    }
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});

test('two players and spectator use one board; updates, read-only controls and reconnect', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return; }
    const file = resolve(root, `.${path === '/play' || path === '/play/match' ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { const content = await readFile(file); response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(content); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const live = new Map(); let revision = 2; const mutations = [];
  const crowdedPlayers = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/m5c-crowded-players.json', import.meta.url), 'utf8'));
  let crowded = false;
  const hostileName = '<img src=x onerror="window.__projectionExecuted=true">';
  const privateSentinels = ['provider-uid-sentinel', 'private-email@example.invalid', 'private-display-sentinel', 'fixture-0', 'fixture-1', 'fixture-2', ...accounts];
  const consoleSummary = { messages: 0, errors: 0, leaked: false };
  const state = index => ({ ...base, revision, callerRole: ['home', 'away', 'spectator'][index],
    players: crowded ? crowdedPlayers : base.players.map(player => ({ ...player, name: hostileName })) });
  try {
    const pages = [];
    for (let index = 0; index < 3; index++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } }); const page = await context.newPage(); pages.push(page);
      // Inspect bounded synthetic console events in memory; never print their text,
      // capture WebSocket frames, enable tracing, or export a HAR.
      page.on('console', message => {
        consoleSummary.messages++;
        if (consoleSummary.messages <= 100) consoleSummary.leaked ||= privateSentinels.some(value => message.text().includes(value));
      });
      page.on('pageerror', () => { consoleSummary.errors++; });
      await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
      await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({uid:'provider-uid-sentinel',email:'private-email@example.invalid',displayName:'private-display-sentinel',getIdToken:async()=>'fixture-${index}'}));return()=>{};}` }));
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
      assert.equal(new URL(page.url()).pathname, '/play/match');
      assert.equal(await page.getByLabel('Live match pitch').locator('.live-marker').count(), 2);
      assert.equal(await page.getByLabel('Live match pitch').locator('.live-marker img').count(), 2);
      await page.waitForFunction(() => [...document.querySelectorAll('.live-marker img')].length === 2 &&
        [...document.querySelectorAll('.live-marker img')].every(image => image.complete && image.naturalWidth > 0));
      assert.equal(await page.getByLabel('Pitch grid', { exact: true }).getByRole('button').count(), 390);
      assert.equal(await page.getByLabel('Coach labels', { exact: true }).textContent(),
        ['Home: You / Away: Opponent', 'Home: Opponent / Away: You', 'Home / Away'][index]);
      assert.ok((await page.getByLabel('Pitch grid', { exact: true }).getByRole('button').allTextContents()).length);
      assert.equal(await page.getByLabel('Pitch grid', { exact: true }).locator('img').count(), 0);
      assert.equal(await page.evaluate(() => window.__projectionExecuted === true), false);
      const text = await page.locator('body').innerText();
      assert.ok(privateSentinels.every(value => !text.includes(value)));
    }
    if (process.env.M5C_SCREENSHOT_DIR) {
      await mkdir(process.env.M5C_SCREENSHOT_DIR, { recursive: true });
      await pages[0].getByLabel('Live match pitch').screenshot({ path: resolve(process.env.M5C_SCREENSHOT_DIR, 'actor-normal.png') });
      await pages[2].getByLabel('Live match pitch').screenshot({ path: resolve(process.env.M5C_SCREENSHOT_DIR, 'spectator-normal.png') });
    }
    crowded = true;
    revision++;
    for (const [index, send] of live) send({ type: 'setupState', requestId: null, code: 'ACCEPTED', duplicate: false, state: state(index) });
    for (const page of pages) {
      await page.getByLabel('Live match pitch').locator('.live-marker').nth(21).waitFor();
      assert.equal(await page.getByLabel('Live match pitch').locator('.live-marker').count(), 22);
    }
    if (process.env.M5C_SCREENSHOT_DIR) {
      await pages[0].getByLabel('Live match pitch').screenshot({ path: resolve(process.env.M5C_SCREENSHOT_DIR, 'actor-crowded.png') });
      await pages[2].getByLabel('Live match pitch').screenshot({ path: resolve(process.env.M5C_SCREENSHOT_DIR, 'spectator-crowded.png') });
    }
    assert.equal(await pages[2].getByRole('button', { name: 'Commit action', exact: true }).isDisabled(), true);
    assert.equal(await pages[1].getByRole('button', { name: 'Commit action', exact: true }).isDisabled(), true);
    await pages[0].getByLabel('Server action', { exact: true }).selectOption('next');
    await pages[0].getByRole('button', { name: 'Commit action', exact: true }).click();
    await pages[2].waitForFunction(() => document.querySelector('[data-testid="setup-status"]')?.textContent.includes('Revision 4'));
    assert.equal(mutations.length, 1);
    await pages[2].getByRole('button', { name: 'Disconnect', exact: true }).click();
    assert.equal(await pages[2].getByLabel('Pitch grid', { exact: true }).count(), 0);
    await pages[2].getByRole('button', { name: 'Reconnect', exact: true }).click();
    await pages[2].getByLabel('Pitch grid', { exact: true }).waitFor();
    assert.match(await pages[2].getByTestId('setup-status').textContent(), /Revision 4/);
    live.get(2)({ type: 'error', requestId: null, code: 'VIEW_UNAVAILABLE' });
    await pages[2].getByLabel('Pitch grid', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(consoleSummary.leaked, false); assert.equal(consoleSummary.errors, 0);
    assert.ok(consoleSummary.messages <= 100, 'Bounded console inspection must not overflow');
    console.info('R3-E synthetic console summary:', JSON.stringify(consoleSummary));
    if (process.env.PLAY_SCREENSHOT_PATH) await pages[2].screenshot({ path: process.env.PLAY_SCREENSHOT_PATH, fullPage: true });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
