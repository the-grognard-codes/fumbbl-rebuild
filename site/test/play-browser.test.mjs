import { observeGameplayPerformance, summarizeGameplayPerformance } from '../../browser-client/test/gameplay-performance-observer.mjs';
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
async function openGrid(page) { await page.getByLabel('Live match pitch').waitFor({ timeout: 5000 }); }

test('hosted history read queues before delayed mutation acknowledgement and survives rejection, duplicates and a history gap', async t => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return; }
    const file = resolve(root, `.${path === '/play/match' ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
  try {
    for (const outcome of ['accepted', 'rejected', 'duplicate', 'history-gap']) await t.test(outcome, async () => {
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      const requests = [], errors = [];
      let send, pendingMutation, prefetchedRead, fallbackRead;
      const state = revision => ({ ...base, callerRole: 'home', revision, phase: 'PLAY', turnMode: 'REGULAR',
        homeTurn: revision, players: base.players.map(player => player.id === 'p1' ? { ...player, x: 3 + revision } : player) });
      const records = [0, 1].map(revision => ({ index: revision, revision, kind: revision ? 'ACTION' : 'START',
        actor: revision ? 'home' : 'system', at: 1000 + revision,
        decision: revision ? { operation: 'action', actionId: 'next' } : null,
        native: revision ? [{ commandNr: 1, modelChangeList: { modelChangeArray: [
          { modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: 'p1', modelChangeValue: [4, 4] },
        ] } }] : [], state: { ...state(revision), actions: [], prompt: null } }));
      const replyHistory = (request, next) => send({ type: 'matchTranscript', requestId: request.requestId, code: 'ACCEPTED', matchId,
        page: { formatVersion: 2, from: request.from, next, total: next, records: records.slice(request.from, next) } });
      try {
        await context.route('https://fonts.googleapis.com/**', route => route.abort());
        await context.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
        await context.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>"synthetic-history-order"}));return()=>{};}' }));
        await context.routeWebSocket('**/browser/v2', socket => {
          send = message => socket.send(JSON.stringify({ version: 2, ...message }));
          socket.onMessage(raw => {
            const request = JSON.parse(raw); requests.push(request);
            if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: accounts[0] });
            if (request.type === 'setup' && request.operation === 'load') send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: state(0) });
            if (request.type === 'setup' && request.operation === 'action') pendingMutation = request;
            if (request.type === 'matchTranscript') {
              if (!pendingMutation) replyHistory(request, 1);
              else if (!prefetchedRead) prefetchedRead = request;
              else fallbackRead = request;
            }
          });
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}`);
        await openGrid(page);
        await page.waitForFunction(() => document.querySelector('.hosted-match')?.dataset.playbackActive === 'false');
        const endTurn = page.getByRole('button', { name: 'End Turn', exact: true });
        await endTurn.click();
        const deadline = Date.now() + 5000;
        while (!prefetchedRead && Date.now() < deadline) await page.waitForTimeout(10);
        assert.ok(prefetchedRead, 'History request must arrive while mutation acknowledgement is deliberately withheld');
        assert.equal(prefetchedRead.from, 1, 'The prefetched read starts after the retained public history');
        assert.ok(requests.indexOf(prefetchedRead) > requests.indexOf(pendingMutation), 'Same-socket order places history after the mutation');
        assert.equal(await endTurn.isEnabled(), false, 'A history read never releases the pending mutation lock');
        await page.keyboard.press('Enter');
        assert.equal(requests.filter(request => request.type === 'setup' && request.operation === 'action').length, 1);
        assert.equal(await page.locator('.live-marker[data-player-id="p1"]').getAttribute('data-x'), '3', 'No unconfirmed movement is invented');
        const rejected = outcome === 'rejected';
        send({ type: 'setupState', requestId: pendingMutation.requestId,
          code: rejected ? 'ILLEGAL_PLACEMENT' : 'ACCEPTED', duplicate: outcome === 'duplicate', state: state(rejected ? 0 : 1) });
        replyHistory(prefetchedRead, rejected || outcome === 'history-gap' ? 1 : 2);
        if (outcome === 'history-gap') {
          const gapDeadline = Date.now() + 5000;
          while (!fallbackRead && Date.now() < gapDeadline) await page.waitForTimeout(10);
          assert.ok(fallbackRead, 'An early empty page triggers a bounded matching-history catch-up read');
          assert.equal(fallbackRead.from, 1);
          assert.equal(await page.locator('.live-marker[data-player-id="p1"]').getAttribute('data-x'), '3');
          replyHistory(fallbackRead, 2);
        }
        await page.waitForFunction(x => document.querySelector('.live-marker[data-player-id="p1"]')?.dataset.x === x, rejected ? '3' : '4');
        await page.waitForFunction(() => document.querySelector('.hosted-match')?.dataset.requestPending === ''
          && document.querySelector('.hosted-match')?.dataset.playbackActive === 'false');
        assert.equal(await endTurn.isEnabled(), true, 'Definitive outcome and completed matching playback release the control');
        assert.equal(requests.filter(request => request.type === 'setup' && request.operation === 'action').length, 1, 'Neither history nor duplicate acknowledgement resubmits a mutation');
        assert.equal(requests.filter(request => request.type === 'matchTranscript').length, outcome === 'history-gap' ? 3 : 2);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});

test('hosted live history avoids normal synchronization pauses and preserves overlap and gap recovery', async t => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return; }
    const file = resolve(root, `.${path === '/play/match' ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
  try {
    for (const outcome of ['actor', 'spectator', 'overlap', 'gap']) await t.test(outcome, async () => {
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      const requests = [], errors = [];
      let send, pendingMutation, heldRead;
      const watch = outcome === 'spectator';
      const state = revision => ({ ...base, callerRole: watch ? 'spectator' : 'home', revision, phase: 'PLAY',
        turnMode: 'REGULAR', homeTurn: revision,
        players: base.players.map(player => player.id === 'p1' ? { ...player, x: 3 + revision } : player) });
      const records = [0, 1].map(revision => ({ index: revision, revision, kind: revision ? 'ACTION' : 'START',
        actor: revision ? 'home' : 'system', at: 1000 + revision,
        decision: revision ? { operation: 'action', actionId: 'next' } : null,
        native: revision ? [{ commandNr: 1, reportList: { reports: [{ reportId: 'dodgeRoll', roll: 4, successful: true }] },
          modelChangeList: { modelChangeArray: [{ modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: 'p1', modelChangeValue: [4, 4] }] } }] : [],
        state: { ...state(revision), callerRole: 'home', actions: [], prompt: null } }));
      const history = (from, next, requestId = null) => send({ type: 'matchTranscript', requestId, code: 'ACCEPTED', matchId,
        page: { formatVersion: 2, from, next, total: next, records: records.slice(from, next) } });
      try {
        await context.route('https://fonts.googleapis.com/**', route => route.abort());
        await context.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
        await context.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>"synthetic-live-history"}));return()=>{};}' }));
        await context.routeWebSocket('**/browser/v2', socket => {
          send = message => socket.send(JSON.stringify({ version: 2, ...message }));
          socket.onMessage(raw => {
            const request = JSON.parse(raw); requests.push(request);
            if (request.type === 'authenticate') {
              assert.equal(request.liveTranscript, true);
              send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: accounts[0], liveTranscript: true });
            }
            if (request.type === 'setup' && request.operation === 'load' || request.type === 'watch') {
              if (outcome !== 'overlap') history(0, 1);
              send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: state(0) });
            }
            if (request.type === 'setup' && request.operation === 'action') pendingMutation = request;
            if (request.type === 'matchTranscript') heldRead = request;
          });
        });
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}${watch ? '&watch=1' : ''}`);
        await openGrid(page);
        await page.waitForFunction(() => document.querySelector('.hosted-match')?.dataset.playbackActive === 'false');
        if (outcome === 'overlap') {
          while (!heldRead) await page.waitForTimeout(10);
          assert.equal(heldRead.from, 0);
          history(0, 1);
        }
        await page.evaluate(() => {
          window.liveHistorySyncCount = 0; let visible = false;
          window.liveHistoryObserver = new MutationObserver(() => {
            const next = [...document.querySelectorAll('.setup-feedback')].some(node => node.textContent === 'Synchronizing match…');
            if (next && !visible) window.liveHistorySyncCount++;
            visible = next;
          });
          window.liveHistoryObserver.observe(document.querySelector('.hosted-match'), { childList: true, subtree: true, characterData: true });
        });
        if (!watch) {
          await page.getByRole('button', { name: 'End Turn', exact: true }).click();
          const deadline = Date.now() + 5000;
          while (!pendingMutation && Date.now() < deadline) await page.waitForTimeout(10);
          assert.ok(pendingMutation);
          assert.equal(requests.filter(request => request.type === 'matchTranscript').length, outcome === 'overlap' ? 1 : 0,
            'Negotiated normal actions do not enqueue a second per-action history read');
        }
        if (outcome !== 'gap') {
          history(1, 2);
          if (!watch) {
            assert.equal(await page.getByRole('button', { name: 'End Turn', exact: true }).isEnabled(), false,
              'A live history push does not acknowledge the pending mutation');
            assert.equal(await page.locator('.live-marker[data-player-id="p1"]').getAttribute('data-x'), '3');
          }
        }
        send({ type: 'setupState', requestId: watch ? null : pendingMutation.requestId, code: 'ACCEPTED', duplicate: false, state: state(1) });
        if (outcome === 'gap') {
          const deadline = Date.now() + 5000;
          while (!heldRead && Date.now() < deadline) await page.waitForTimeout(10);
          assert.ok(heldRead, 'A missing push retains the paged recovery path');
          assert.equal(heldRead.from, 1);
          await page.getByText('Synchronizing match…', { exact: true }).waitFor();
          history(1, 2, heldRead.requestId);
        }
        await page.waitForFunction(() => document.querySelector('.live-marker[data-player-id="p1"]')?.dataset.x === '4'
          && document.querySelector('.hosted-match')?.dataset.playbackActive === 'false');
        if (outcome === 'overlap') history(0, 1, heldRead.requestId);
        await page.locator('.live-dice-overlay .match-die').waitFor();
        await page.waitForTimeout(50);
        const flashes = await page.evaluate(() => window.liveHistorySyncCount);
        assert.equal(flashes, outcome === 'gap' ? 1 : 0, 'Complete live delivery never flashes Synchronizing match');
        assert.equal(requests.filter(request => request.type === 'setup' && request.operation === 'action').length, watch ? 0 : 1);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});

test('hosted native numeric results retain D8 and D16 types on the main pitch', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return; }
    const file = resolve(root, `.${path === '/play/match' ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
    await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>"synthetic-dice"}));return()=>{};}' }));
    const reports = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/numeric-dice.json', import.meta.url), 'utf8'));
    let revision = 0, deliver;
    const state = index => ({ ...base, revision: index, callerRole: 'home', phase: 'PLAY', turnMode: 'REGULAR', actions: [], activePlayerId: 'p1' });
    const records = [0, 1, 2].map(index => ({ index, revision: index, kind: index ? 'ACTION' : 'START', actor: index ? 'home' : 'system',
      at: index + 1000, decision: index ? { operation: 'action', actionId: `native:${index}` } : null,
      native: index ? [{ commandNr: index, reportList: { reports: [{ ...reports[index - 1], playerId: 'p1' }] } }] : [], state: state(index) }));
    await page.routeWebSocket('**/browser/v2', socket => {
      const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
      deliver = index => { revision = index; send({ type: 'setupState', requestId: null, code: 'ACCEPTED', duplicate: false, state: state(index) }); };
      socket.onMessage(raw => {
        const request = JSON.parse(raw);
        if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: accounts[0] });
        if (request.type === 'browse') send({ type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [] });
        if (request.type === 'savedTeam') send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', teams: [], document: null, validation: null, versionStatus: null });
        if (request.type === 'setup') send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: state(revision) });
        if (request.type === 'matchTranscript') send({ type: 'matchTranscript', requestId: request.requestId, code: 'ACCEPTED', matchId,
          page: { formatVersion: 2, from: request.from, next: revision + 1, total: revision + 1, records: records.slice(request.from, revision + 1) } });
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}`);
    await openGrid(page);
    for (const [index, kinds] of [[1, ['d6', 'd8']], [2, ['d16', 'd6']]]) {
      deliver(index);
      // Earlier groups retain their own lifetime while this native group arrives.
      const dice = page.locator('.live-dice-overlay .pitch-roll-group').last().locator('.numeric-die');
      await page.locator(`.live-dice-overlay [data-die-kind="${kinds[0]}"]`).waitFor();
      assert.deepEqual(await dice.evaluateAll(dice => dice.map(die => die.dataset.dieKind)), kinds);
      assert.equal(await page.locator('.live-dice-overlay').evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
    }
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});

test('fresh signed-in direct links resume the same account and show genuine membership denials', async () => {
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
  const requests = [], live = new Map(), contexts = [];
  try {
    for (const [index, account] of [accounts[0], accounts[0], accounts[2], accounts[0]].entries()) {
      const context = await browser.newContext(); contexts.push(context);
      // External font availability must not hold up local navigation checks.
      await context.route('https://fonts.googleapis.com/**', route => route.abort());
      // A prior release may still be cached at either unversioned entry point.
      await context.route('**/assets/play.js', route => route.fulfill({ contentType: 'text/javascript', body: 'throw Error("Cached Play bootstrap");' }));
      await context.route('**/assets/game/game.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export function mountPlay(){}' }));
      await context.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
      await context.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>"synthetic-direct-resume"}));return()=>{};}' }));
      await context.routeWebSocket('**/browser/v2', socket => {
        const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
        socket.onMessage(raw => {
          const request = JSON.parse(raw); requests.push({ ...request, index });
          if (request.type === 'authenticate') {
            live.get(account)?.({ type: 'error', requestId: null, code: 'CONNECTION_REPLACED' });
            live.set(account, send);
            send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: account });
          }
          if (request.type === 'browse') send({ type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [] });
          if (request.type === 'savedTeam') send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', teams: [], document: null, validation: null, versionStatus: null });
          if (request.type === 'setup') {
            assert.equal(request.operation, 'load', 'A fresh direct link never replays a mutation');
            if (account !== accounts[0] || request.matchId !== matchId) send({ type: 'error', requestId: request.requestId, code: 'NOT_FOUND' });
            else send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false,
              state: { ...base, revision: 42, callerRole: 'home' } });
          }
        });
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${index === 3 ? accounts[1] : matchId}`);
      if (index < 2) {
        await openGrid(page);
        assert.match(await page.getByTestId('setup-status').textContent(), /Revision 42/);
        assert.equal(context.pages().length, 1);
      } else {
        await page.getByRole('alert').filter({ hasText: 'This match is unavailable for this account.' }).waitFor();
        assert.equal(await page.getByLabel('Live match pitch').count(), 0);
      }
      if (index === 1) {
        const original = contexts[0].pages()[0];
        await original.getByRole('alert').filter({ hasText: 'CONNECTION REPLACED' }).waitFor();
        assert.equal(await original.getByLabel('Live match pitch').count(), 0);
      }
    }
    assert.equal(requests.filter(request => request.type === 'setup').length, 4);
    assert.ok(requests.filter(request => request.type === 'setup').every(request => !('role' in request) && !('accountId' in request)));
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});

test('start defaults to the current tab and supports explicit windows with blocked-popup fallback', async () => {
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
  const recipients = new Map(); const owners = new Map(); const reads = [];
  const authentications = [{ preparation: 0, play: 0 }, { preparation: 0, play: 0 }]; let revision = 1;
  const member = role => ({ role, sourceTeamId: matchId, sourceDocumentVersion: 1, ruleset: 'BB2025', catalogVersion: 'fixture', rosterId: 'human', presetId: 'fixture', presetVersion: '1', validation: { valid: true, total: 1, budget: 2, skillPoints: 0, messages: [] }, roster: { captainId: null, resources: {}, players: [] } });
  try {
    for (const mode of ['same-tab', 'new-window', 'blocked-window']) {
      const sameTab = mode === 'same-tab', popupBlocked = mode === 'blocked-window';
      revision = 1; recipients.clear(); owners.clear(); reads.length = 0;
      for (const counts of authentications) { counts.preparation = 0; counts.play = 0; }
      const pages = []; const contexts = [];
      for (let index = 0; index < 2; index++) {
        const context = await browser.newContext(); contexts.push(context);
        await context.route('https://fonts.googleapis.com/**', route => route.abort());
        const page = await context.newPage(); pages.push(page);
        if (popupBlocked && index === 1) await page.addInitScript(() => { window.open = () => null; });
        await context.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
        await context.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture-${index}'}));return()=>{};}` }));
        await context.routeWebSocket('**/browser/v2', socket => {
          const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
          let ownershipKey;
          socket.onMessage(raw => {
            const request = JSON.parse(raw);
            if (request.type === 'authenticate') {
              const purpose = request.purpose ?? 'play';
              assert.ok(['preparation', 'play'].includes(purpose));
              ownershipKey = `${index}:${purpose}`;
              owners.get(ownershipKey)?.close({ code: 1008, reason: 'Connection replaced by a newer session for this purpose' });
              owners.set(ownershipKey, socket); authentications[index][purpose]++;
              if (purpose === 'preparation') recipients.set(index, send);
              send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: accounts[index] });
            } else if (owners.get(ownershipKey) !== socket) return;
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
        await page.getByLabel('Match ID', { exact: true }).waitFor();
        await page.getByLabel('Match ID', { exact: true }).fill(matchId);
        await page.getByRole('button', { name: 'Reload game setup', exact: true }).click();
      }
      await pages[0].getByRole('button', { name: 'Start game', exact: true }).waitFor();
      const opened = sameTab || popupBlocked ? null : pages[1].waitForEvent('popup');
      await pages[1].getByRole('button', { name: sameTab ? 'Start game' : 'Start game in a new window', exact: true }).click();
      const starterMatch = sameTab || popupBlocked ? pages[1] : await opened;
      await openGrid(starterMatch);
      assert.equal(new URL(starterMatch.url()).pathname, '/play/match');
      await starterMatch.setViewportSize({ width: 1224, height: 604 });
      await starterMatch.evaluate(() => window.scrollTo(0, 0));
      const setupBounds = await starterMatch.evaluate(() => {
        const side = document.querySelector('.match-side')?.getBoundingClientRect();
        const placement = document.querySelector('[aria-label="Setup placement"]');
        const confirmation = document.querySelector('.confirmation-row .commit-action');
        const confirm = confirmation?.getBoundingClientRect();
        return { sideBottom: side?.bottom, confirmBottom: confirm?.bottom, height: innerHeight,
          confirmText: confirmation?.textContent?.trim(),
          numericPlacement: Boolean(placement),
          toolbarCount: document.querySelectorAll('.live-pitch-toolbar').length };
      });
      assert.equal(setupBounds.confirmText, undefined, 'Passive setup coach has no confirmation control');
      assert.equal(setupBounds.numericPlacement, false);
      assert.equal(await starterMatch.getByLabel('Setup player').count(), 0, 'Numeric placement stays off the pitch until Debug is opened');
      assert.equal(await starterMatch.getByText('Place players with keyboard or touch', { exact: true }).count(), 0);
      await starterMatch.getByRole('button', { name: 'Debug', exact: true }).click();
      await starterMatch.getByRole('region', { name: 'Setup placement', exact: true }).waitFor();
      assert.equal(await starterMatch.getByLabel('Setup player').isVisible(), true, 'Debug retains accessible numeric placement');
      await starterMatch.getByRole('button', { name: 'Debug', exact: true }).click();
      assert.equal(setupBounds.toolbarCount, 0);
      assert.ok(setupBounds.confirmBottom === undefined,
        `Setup confirmation must be visible: ${JSON.stringify(setupBounds)}`);
      const zoomControls = starterMatch.getByRole('group', { name: 'Pitch size' });
      await starterMatch.getByRole('button', { name: /Game Menu/ }).click();
      await starterMatch.getByRole('tab', { name: 'Interface', exact: true }).click();
      await zoomControls.getByRole('button', { name: '2×' }).click();
      assert.equal(await zoomControls.getByRole('button', { name: '2×' }).getAttribute('aria-pressed'), 'true');
      await zoomControls.getByRole('button', { name: 'Fit' }).click();
      await starterMatch.getByRole('button', { name: 'Close Game Menu' }).click();
      if (!sameTab && !popupBlocked) {
        assert.equal(new URL(pages[1].url()).pathname, '/play', 'The preparation page stays open');
        assert.equal(await starterMatch.evaluate(() => window.opener), null, 'The match window cannot control preparation');
        assert.equal(await starterMatch.evaluate(() => window.name), 'moles.play.launched-window');
        assert.equal(await pages[1].getByRole('button', { name: 'Reconnect preparation here', exact: true }).count(), 0);
        await pages[1].reload();
        await pages[1].getByRole('button', { name: 'Refresh teams', exact: true }).click();
        assert.equal(await pages[1].getByText('Match opened in another tab or window', { exact: true }).count(), 0);
        assert.deepEqual(authentications[1], { preparation: 2, play: 1 }, 'Reloaded preparation authenticates independently of the match connection');
      } else assert.equal(contexts[1].pages().length, 1, 'Default and blocked-window launch remain in the current tab');
      await pages[0].getByRole('link', { name: 'Open match in a new tab or window' }).waitFor();
      const opponentWindow = pages[0].waitForEvent('popup');
      await pages[0].getByRole('link', { name: 'Open match in a new tab or window' }).click();
      const opponentMatch = await opponentWindow;
      await openGrid(opponentMatch);
      assert.equal(new URL(pages[0].url()).pathname, '/play', 'Server notification leaves a usable preparation page');
      assert.equal(await pages[0].getByRole('button', { name: 'Reconnect preparation here', exact: true }).count(), 0);
      await pages[0].reload();
      await pages[0].getByRole('button', { name: 'Refresh teams', exact: true }).click();
      assert.equal(await pages[0].getByText('Match opened in another tab or window', { exact: true }).count(), 0);
      assert.deepEqual(authentications[0], { preparation: 2, play: 1 }, 'Reloaded preparation authenticates independently of the match connection');
      assert.deepEqual(reads.sort(), [0, 1], 'Both match windows loaded the authoritative setup');
      for (const page of [opponentMatch, starterMatch]) {
        assert.equal(new URL(page.url()).pathname, '/play/match');
        await page.reload();
        await openGrid(page);
      }
      await starterMatch.getByRole('button', { name: 'Game Menu', exact: true }).click();
      await starterMatch.getByRole('tab', { name: 'Interface', exact: true }).click();
      if (sameTab || popupBlocked) {
        await starterMatch.getByRole('button', { name: 'Exit match' }).click();
        await starterMatch.getByLabel('Match ID', { exact: true }).waitFor();
      } else {
        const closed = starterMatch.waitForEvent('close');
        await starterMatch.getByRole('button', { name: 'Exit match' }).click().catch(error => {
          // The native close can win the race with Playwright's click response.
          // Suppress only that expected outcome; the close event still must arrive.
          if (!starterMatch.isClosed() || !/Target page, context or browser has been closed/.test(error.message)) throw error;
        });
        await closed;
      }
      for (const context of contexts) await context.close();
    }
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});

test('two players and spectator use one board; updates, read-only controls and reconnect', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return; }
    const file = resolve(root, `.${path === '/spectate' ? '/spectate/index.html' : path === '/play' || path === '/play/match' ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { const content = await readFile(file); response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(content); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const live = new Map(); const liveSockets = new Map(); let revision = 2; const mutations = [];
  const crowdedPlayers = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/m5c-crowded-players.json', import.meta.url), 'utf8'));
  const visualCrowdedPlayers = crowdedPlayers.map(player => player.role === 'away'
    ? { ...player, art: { rosterId: 'orc', positionId: 'orc-lineman' } } : player);
  let crowded = false;
  let unactivatedPlayer = false;
  const activationFixture = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
  const activationPlayer = activationFixture.players.find(player => player.role === 'home');
  const hostileName = '<img src=x onerror="window.__projectionExecuted=true">';
  const privateSentinels = ['provider-uid-sentinel', 'private-email@example.invalid', 'private-display-sentinel', 'fixture-0', 'fixture-1', 'fixture-2', ...accounts];
  const consoleSummary = { messages: 0, errors: 0, leaked: false };
  const state = index => unactivatedPlayer
    ? { ...activationFixture, matchId, revision, callerRole: ['home', 'away', 'spectator'][index],
      actions: [{ id: 'next', kind: 'endTurn', label: 'End turn', actor: 'home', sourcePlayerId: null, target: null },
        { id: 'select-unused', kind: 'select', label: `Move ${activationPlayer.name}`, actor: 'home',
          sourcePlayerId: activationPlayer.id, target: { playerId: activationPlayer.id } }] }
    : { ...base, phase: 'PLAY', turnMode: 'regular', revision, callerRole: ['home', 'away', 'spectator'][index],
      players: crowded ? visualCrowdedPlayers : base.players.map(player => ({ ...player, name: hostileName })) };
  try {
    const pages = [];
    for (let index = 0; index < 3; index++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } }); const page = await context.newPage(); pages.push(page);
      await context.route('https://fonts.googleapis.com/**', route => route.abort());
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
        liveSockets.set(index, socket);
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
      await page.getByLabel('Match ID', { exact: true }).waitFor();
      if (index === 2) { await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Spectate', exact: true }).click(); await page.getByRole('link', { name: /Watch Home vs Away/ }).click(); }
      else { await page.getByLabel('Match ID', { exact: true }).fill(matchId); await page.getByRole('button', { name: 'Resume play', exact: true }).click(); }
      await openGrid(page);
      assert.equal(new URL(page.url()).pathname, '/play/match');
      assert.equal(await page.getByLabel('Live match pitch').locator('.live-marker').count(), 2);
      assert.equal(await page.getByLabel('Live match pitch').locator('.live-marker img').count(), 2);
      await page.waitForFunction(() => [...document.querySelectorAll('.live-marker img')].length === 2 &&
        [...document.querySelectorAll('.live-marker img')].every(image => image.complete && image.naturalWidth > 0));
      assert.equal(await page.getByLabel('Pitch grid', { exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Coach labels', { exact: true }).textContent(),
        ['Home: You / Away: Opponent', 'Home: Opponent / Away: You', 'Home / Away'][index]);
      assert.equal(await page.getByLabel('Live match pitch').locator('.live-marker img').count(), 2);
      assert.equal(await page.evaluate(() => window.__projectionExecuted === true), false);
      const text = await page.locator('main.play-runtime').innerText();
      assert.ok(privateSentinels.every(value => !text.includes(value)));
      assert.equal(await page.locator('.account-identity').textContent(), 'private-email@example.invalid', 'only the authenticated header shows the caller identity');
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
    for (const [width, height] of [[1920, 1080], [1920, 900], [1920, 820], [1280, 660], [1224, 330], [360, 800]]) {
      await pages[2].setViewportSize({ width, height });
      await pages[2].waitForFunction(() => {
        const scene = document.querySelector('.live-pitch-scene');
        const viewport = document.querySelector('.live-pitch-viewport');
        if (!scene || !viewport) return false;
        const pitch = scene.getBoundingClientRect(), frame = viewport.getBoundingClientRect();
        if (pitch.left < frame.left - 1 || pitch.right > frame.right + 1 || pitch.top < frame.top - 1 || pitch.bottom > frame.bottom + 1) return false;
        return [...scene.querySelectorAll('.live-marker')].every(marker => {
          const box = marker.getBoundingClientRect();
          return Math.abs(box.left - pitch.left - parseFloat(marker.style.left)) < 1
            && Math.abs(box.top - pitch.top - parseFloat(marker.style.top)) < 1;
        });
      });
      if (process.env.M5C_SCREENSHOT_DIR) await pages[2].screenshot({ path: resolve(process.env.M5C_SCREENSHOT_DIR, `spectator-crowded-${width}x${height}.png`) });
      assert.equal(await pages[2].evaluate(() => document.documentElement.scrollHeight <= innerHeight), true,
        `Crowded match must fit a ${width}x${height} viewport`);
      const header = await pages[2].locator('.site-header').boundingBox();
      const pitch = await pages[2].getByLabel('Live match pitch').boundingBox();
      assert.equal(header, null, 'the game display hides the top bar without reserving layout space');
      assert.ok(pitch.y >= 0 && pitch.y + pitch.height <= height, 'the pitch fits the game viewport');
      await pages[2].getByRole('button', { name: 'Game Menu', exact: true }).click();
      const dialog = await pages[2].getByRole('dialog', { name: 'Game Menu', exact: true }).boundingBox();
      assert.ok(dialog.y >= 0 && dialog.y + dialog.height <= height, 'Game Menu stays within the match viewport');
      await pages[2].getByRole('button', { name: 'Close Game Menu' }).click();
    }
    assert.equal(await pages[2].getByRole('button', { name: 'Confirmed!', exact: true }).count(), 0);
    assert.equal(await pages[1].getByRole('button', { name: 'Confirmed!', exact: true }).count(), 0);
    await pages[0].getByRole('button', { name: 'End Turn', exact: true }).click();
    await pages[2].waitForFunction(() => document.querySelector('[data-testid="setup-status"]')?.textContent.includes('Revision 4'));
    assert.equal(mutations.length, 1, 'End Turn executes immediately when no activation actions remain');
    assert.equal(mutations[0].actionId, 'next');
    unactivatedPlayer = true;
    revision++;
    for (const [index, send] of live) send({ type: 'setupState', requestId: null, code: 'ACCEPTED', duplicate: false, state: state(index) });
    for (const page of pages) await page.getByTestId('setup-status').filter({ hasText: 'Revision 5 ' }).waitFor({ state: 'attached' });
    await pages[0].getByRole('button', { name: 'End Turn', exact: true }).click();
    assert.equal(mutations.length, 1, 'An unactivated player makes End Turn a reviewed proposal');
    await pages[0].getByRole('button', { name: 'Confirmed!', exact: true }).click();
    await pages[2].waitForFunction(() => document.querySelector('[data-testid="setup-status"]')?.textContent.includes('Revision 6'));
    assert.equal(mutations.length, 2);
    assert.equal(mutations[1].actionId, 'next');
    assert.equal(await pages[2].getByRole('button', { name: 'Disconnect', exact: true }).count(), 0);
    assert.equal(await pages[2].getByLabel('Match window controls').count(), 0, 'Window controls live in Game Menu');
    liveSockets.get(2).close();
    await pages[2].getByLabel('Live match pitch').waitFor({ state: 'detached' });
    await pages[2].getByRole('button', { name: 'Reconnect', exact: true }).click();
    await openGrid(pages[2]);
    assert.match(await pages[2].getByTestId('setup-status').textContent(), /Revision 6/);
    live.get(2)({ type: 'error', requestId: null, code: 'VIEW_UNAVAILABLE' });
    await pages[2].getByLabel('Live match pitch').waitFor({ state: 'detached' });
    assert.equal(consoleSummary.leaked, false); assert.equal(consoleSummary.errors, 0);
    assert.ok(consoleSummary.messages <= 100, 'Bounded console inspection must not overflow');
    console.info('R3-E synthetic console summary:', JSON.stringify(consoleSummary));
    if (process.env.PLAY_SCREENSHOT_PATH) await pages[2].screenshot({ path: process.env.PLAY_SCREENSHOT_PATH, fullPage: true });
    await pages[2].getByRole('button', { name: 'Exit match', exact: true }).click();
    await pages[2].waitForURL(`http://127.0.0.1:${server.address().port}/spectate`);
    await pages[2].getByRole('link', { name: 'Watch Home vs Away' }).waitFor();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});

async function waitForObserver(condition) {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'Expected observer evidence arrived within 5 seconds');
    await new Promise(done => setTimeout(done, 10));
  }
}
test('observer correlates wire data and changed DOM while ignoring stale dice', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
  try {
    const context = await browser.newContext(), events = [], errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    // Controlled wire only exercises instrumentation, never used by acceptance.
    await context.addInitScript(() => {
      window.WebSocket = class extends EventTarget { send() {} };
    });
    await observeGameplayPerformance(context, 'home', events);
    const page = await context.newPage();
    await page.route('http://localhost:9876/**', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://localhost:9876/observer-test');
    await page.evaluate(() => { document.body.innerHTML = '<section class="hosted-match" data-revision="1" data-dice-revision="1"><button class="live-marker" style="position:absolute;left:0;top:0" data-player-id="p" data-x="1" data-y="1">Player</button><div class="live-dice-overlay">Old dice</div></section>'; });
    await page.evaluate(() => {
      const socket = new WebSocket('ws://unused'); window.testSocket = socket;
      const incoming = message => socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
      incoming({ type: 'setupState', state: { phase: 'PLAY', revision: 1, actions: [{ id: 'move-a', kind: 'move' }] } });
      document.querySelector('button').click();
      socket.send(JSON.stringify({ type: 'setup', requestId: 'request-a', operation: 'action', actionId: 'move-a', expectedRevision: 1 }));
      document.querySelector('section').dataset.requestPending = 'request-a';
      document.querySelector('button').disabled = true;
    });
    await waitForObserver(() => events.some(event => Number.isFinite(event.pendingPaintAt)));
    await page.evaluate(() => {
      window.testSocket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'setupState', requestId: 'request-a', code: 'ACCEPTED',
        state: { phase: 'PLAY', revision: 2, players: [{ id: 'p', x: 2, y: 1 }], actions: [{ kind: 'blockDie', label: 'Choose POW (die 1)' }] } }) }));
      document.querySelector('section').dataset.revision = '2';
      document.querySelector('button').dataset.x = '2';
    });
    await waitForObserver(() => events.some(event => Number.isFinite(event.movementPaintAt)));
    let trace = summarizeGameplayPerformance(events).traces[0];
    assert.ok(trace.pendingDomAt >= trace.inputAt);
    assert.ok(trace.feedbackDomAt >= trace.inputAt);
    assert.equal(trace.feedbackKind, 'controlDisabled');
    assert.ok(trace.movementDomAt >= trace.responseAt);
    assert.equal(trace.diceDomAt, undefined, 'Old visible dice must not satisfy a new request');
    assert.equal(trace.transcriptAt, undefined, 'State response is not transcript availability');
    assert.equal(trace.diceDataAt, trace.responseAt, 'Authoritative block faces are available before transcript fetch');
    assert.equal(trace.diceDataSource, 'stateAction');
    await page.evaluate(() => {
      window.testSocket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'matchTranscript', page: { records: [{ revision: 2, native: [] }] } }) }));
      document.querySelector('section').dataset.diceRevision = '2';
    });
    await waitForObserver(() => events.some(event => Number.isFinite(event.dicePaintAt)));
    trace = summarizeGameplayPerformance(events).traces[0];
    assert.ok(trace.transcriptAt >= trace.responseAt);
    assert.equal(trace.hasRoll, true);
    assert.equal(trace.diceDataAt, trace.responseAt);
    assert.ok(trace.dicePaintAt >= trace.diceDomAt);
    assert.equal('initialMarkers' in trace, false);
    assert.equal('expectedMoves' in trace, false);
    assert.equal(JSON.stringify(events).includes('move-a'), false);
    await page.evaluate(() => {
      document.querySelector('button').disabled = false;
      document.querySelector('button').click();
      window.testSocket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'movementPreview', plan: {
        route: { revision: 2, playerId: 'p', steps: [{ x: 3, y: 1 }, { x: 4, y: 1 }] } } }) }));
      window.testSocket.send(JSON.stringify({ type: 'setup', requestId: 'request-b', operation: 'movement', playerId: 'p', kind: 'move', expectedRevision: 2 }));
      document.querySelector('button').dataset.x = '3';
      document.querySelector('button').style.transition = 'left 200ms linear';
      document.querySelector('button').style.left = '100px';
    });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.evaluate(() => {
      window.testSocket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'setupState', requestId: 'request-b', code: 'ACCEPTED',
        state: { phase: 'PLAY', revision: 3, players: [{ id: 'p', x: 4, y: 1 }], actions: [] } }) }));
      document.querySelector('section').dataset.revision = '3';
    });
    await waitForObserver(() => events.some(event => event.requestId === 'request-b' && Number.isFinite(event.movementPaintAt)));
    const provisional = summarizeGameplayPerformance(events).traces.find(item => item.requestId === 'request-b');
    assert.ok(provisional.movementDomAt < provisional.responseAt, 'First queued-route movement includes motion before confirmation');
    assert.equal(provisional.provisionalMovementObserved, true);
    assert.ok(provisional.movementPaintAt >= provisional.movementDomAt);
    await waitForObserver(() => events.filter(event => event.kind === 'motion').length >= 3);
    const motion = summarizeGameplayPerformance(events).routeMotion[0];
    assert.ok(new Set(motion.samples.map(sample => sample[1])).size > 1, 'rAF geometry captures interpolated travel separately from the committed target coordinate');
    assert.ok(summarizeGameplayPerformance(events).traces.find(item => item.requestId === 'request-b').firstScreenMovementAt >= provisional.movementDomAt);
    assert.equal(JSON.stringify(events).includes('geometryPlayerId'), false);
    const beforeReload = summarizeGameplayPerformance(events).traces.length;
    await page.reload();
    assert.equal(summarizeGameplayPerformance(events).traces.length, beforeReload, 'Node collection survives navigation');
    assert.deepEqual(errors, [], 'Instrumentation also initializes on non-secure blank/auth frames');
  } finally { await browser.close(); }
});
