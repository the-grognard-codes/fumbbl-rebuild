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
const fullTime = { projectionVersion: 3, matchId, revision: 2, callerRole: 'home', phase: 'FULL_TIME', actor: 'home', prompt: null,
  players: [{ id: 'p1', name: 'Lineman', slot: 1, role: 'home', x: 3, y: 4, state: 'standing', art: { rosterId: 'human', positionId: 'lineman' } },
    { id: 'p2', name: 'Blitzer', slot: 2, role: 'away', x: null, y: null, state: 'stunned', art: { rosterId: 'human', positionId: 'blitzer' } }],
  weather: 'Nice', homeRerolls: 2, awayRerolls: 1, actions: [], turn: 8, turnMode: 'END', ball: { x: 13, y: 7 }, activePlayerId: null,
  half: 2, homeTurn: 8, awayTurn: 8, homeScore: 2, awayScore: 1, drive: 3 };
const beforeFinalDecision = { ...fullTime, revision: 1, phase: 'PLAY', turnMode: 'PLAY',
  actions: [{ id: '1:end-turn', label: 'End Turn', actor: 'home', kind: 'endTurn', target: null }] };
const result = { formatVersion: 1, engineVersion: 'ffb-3.4.0-bb2025-m3d.1', ruleset: 'BB2025', catalogVersion: 'bb2025-human-2026-09-08.1',
  presetId: 'human-exhibition-1150', presetVersion: 'bb2025-human-2026-09-08.1', matchId, homeScore: 2, awayScore: 1, finalRevision: 2, eventCount: 3 };

test('hosted final decision leads to participant result and read-only replay after reload', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return; }
    const file = resolve(root, `.${['/play', '/play/match', '/play/result'].includes(path) ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 660 } })).newPage();
    const requests = []; let completed = false;
    await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
    await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: "export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture'}));return()=>{};}" }));
    await page.routeWebSocket('**/browser/v2', socket => {
      const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
      socket.onMessage(raw => {
        const request = JSON.parse(raw); requests.push(request);
        if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
        if (request.type === 'browse') send({ type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [] });
        if (request.type === 'savedTeam') send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', teams: [], document: null, validation: null, versionStatus: null });
        if (request.type === 'setup') {
          if (request.operation === 'action') {
            assert.equal(request.actionId, '1:end-turn'); assert.equal(request.expectedRevision, 1); completed = true;
          }
          send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: completed ? fullTime : beforeFinalDecision });
        }
        if (request.type === 'matchResult') send({ type: 'matchResult', requestId: request.requestId, code: 'ACCEPTED', result,
          event: request.operation === 'replay' ? { revision: request.index, kind: request.index === 2 ? 'FULL_TIME' : 'START', state: { ...fullTime, revision: request.index } } : null });
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}`);
    await page.getByLabel('Match scoreboard').waitFor();
    await page.waitForFunction(() => document.querySelector('.live-pitch-scene')?.getBoundingClientRect().bottom <= innerHeight,
      null, { timeout: 5000 }); // ResizeObserver applies Fit after the first authoritative frame.
    if (process.env.M5E_SCREENSHOT_DIR) {
      await mkdir(process.env.M5E_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.M5E_SCREENSHOT_DIR, 'match-1280.png') });
      await page.setViewportSize({ width: 1920, height: 820 });
      await page.screenshot({ path: resolve(process.env.M5E_SCREENSHOT_DIR, 'match-1920.png') });
      await page.setViewportSize({ width: 1280, height: 660 });
    }
    await page.getByRole('button', { name: 'Select End Turn' }).click();
    await page.getByRole('button', { name: 'Commit action' }).click();
    await page.getByRole('link', { name: 'Open final result and replay' }).waitFor();
    const offPitch = page.getByLabel('Off pitch players').getByRole('button', { name: /Blitzer/ });
    await offPitch.focus(); await offPitch.press('Enter');
    assert.match(await page.getByLabel('Selected player').textContent(), /Blitzer.*stunned/s);
    if (process.env.M5E_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.M5E_SCREENSHOT_DIR, 'full-time-1280.png') });
    assert.match(await page.getByLabel('Match scoreboard').textContent(), /Home2.*Away1/s);
    assert.match(await page.getByLabel('Off pitch players').textContent(), /Blitzer.*stunned/s);
    await page.getByRole('link', { name: 'Open final result and replay' }).click();
    assert.equal(new URL(page.url()).pathname, '/play/result');
    await page.getByLabel('Final score').waitFor();
    const last = page.getByRole('button', { name: 'Last', exact: true });
    await last.focus(); await last.press('Enter');
    await page.getByLabel('Read-only replay pitch').waitFor();
    assert.match(await page.getByLabel('Replay event').textContent(), /Event 3 of 3: FULL_TIME/);
    assert.equal(await page.getByLabel('Read-only replay pitch').locator('.live-marker:enabled').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal control overflow at 1280×660');
    if (process.env.M5E_SCREENSHOT_DIR) {
      await page.screenshot({ path: resolve(process.env.M5E_SCREENSHOT_DIR, 'result-1280.png') });
      await page.setViewportSize({ width: 1920, height: 820 });
      await page.screenshot({ path: resolve(process.env.M5E_SCREENSHOT_DIR, 'result-1920.png') });
    }
    await page.reload();
    await page.getByLabel('Final score').waitFor();
    assert.equal(requests.filter(request => request.type === 'matchResult' && request.operation === 'load').length, 2);
    assert.equal(requests.filter(request => request.type === 'setup' && request.operation === 'action').length, 1);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
