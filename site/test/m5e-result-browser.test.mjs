import assert from 'node:assert/strict';
import { revealPlayer } from '../../browser-client/test/projected-pitch-helper.mjs';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { resolveEnvironment, configurationScript } from '../../deployment/firebase/scripts/environment.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const matchId = '12345678-1234-1234-1234-123456789abc';
const fullTime = { projectionVersion: 4, matchId, revision: 2, callerRole: 'home', phase: 'FULL_TIME', actor: 'home', prompt: null,
  homeTeamName: 'Home', awayTeamName: 'Away', homeResources: { apothecaries: 1, assistantCoaches: 2, cheerleaders: 3 }, awayResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 1 },
  players: [{ id: 'p1', name: 'Lineman', slot: 1, number: 1, position: 'Lineman', ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: ['Block'], offPitch: 'pitch', role: 'home', x: 3, y: 4, state: 'standing', art: { rosterId: 'human', positionId: 'lineman' } },
    { id: 'p2', name: 'Blitzer', slot: 2, number: 2, position: 'Blitzer', ma: 7, st: 3, ag: 3, pa: 5, av: 9, skills: ['Block'], offPitch: 'reserve', role: 'away', x: null, y: null, state: 'stunned', art: { rosterId: 'human', positionId: 'blitzer' } }],
  weather: 'Nice', homeRerolls: 2, awayRerolls: 1, actions: [], turn: 8, turnMode: 'END', ball: { x: 13, y: 7 }, activePlayerId: null,
  half: 2, homeTurn: 8, awayTurn: 8, homeScore: 2, awayScore: 1, drive: 3 };
const beforeFinalDecision = { ...fullTime, revision: 1, phase: 'PLAY', turnMode: 'PLAY',
  actions: [{ id: '1:end-turn', label: 'End Turn', actor: 'home', kind: 'endTurn', target: null, sourcePlayerId: null }] };
const result = { formatVersion: 1, engineVersion: 'ffb-3.4.0-bb2025-m3d.1', ruleset: 'BB2025', catalogVersion: 'bb2025-human-2026-09-08.1',
  presetId: 'human-exhibition-1150', presetVersion: 'bb2025-human-2026-09-08.1', matchId, homeScore: 2, awayScore: 1, finalRevision: 2, eventCount: 3 };

test('active player keeps Blitz - Stab in More actions after selecting the defender', async () => {
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
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 660 } })).newPage();
    const submitted = [];
    const block = { ...beforeFinalDecision, activePlayerId: 'p1', turnMode: 'REGULAR',
      players: [beforeFinalDecision.players[0], { ...beforeFinalDecision.players[1], x: 4, y: 4, offPitch: 'pitch', state: 'standing' }], actions: [
      { id: '1:block-p2', label: 'Block Blitzer', actor: 'home', kind: 'block', target: { playerId: 'p2' }, sourcePlayerId: 'p1' },
      { id: '1:blockStab-p2', label: 'Blitz - Stab Blitzer', actor: 'home', kind: 'blockStab', target: { playerId: 'p2' }, sourcePlayerId: 'p1' }
    ] };
    await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
    await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: "export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture'}));return()=>{};}" }));
    await page.routeWebSocket('**/browser/v2', socket => {
      const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
      socket.onMessage(raw => {
        const request = JSON.parse(raw);
        if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
        if (request.type === 'setup') {
          if (request.operation === 'action') submitted.push([request.actionId, request.expectedRevision]);
          send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: submitted.length ? fullTime : block });
        }
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}`);
    await page.getByLabel('Live match pitch').waitFor();
    assert.equal(await page.getByLabel('Selected player').count(), 0);
    const defender = page.locator('.live-marker[data-player-id="p2"]');
    await revealPlayer(page, defender);
    await defender.click();
    assert.equal(await page.getByLabel('Actions at selected target').count(), 0);
    await page.getByRole('button', { name: 'Other action' }).click();
    assert.equal(await page.getByLabel('Additional actions').getByRole('button', { name: 'Blitz - Stab Blitzer' }).count(), 1);
    if (process.env.SPECIAL_CAPTURE_DIR) {
      await mkdir(process.env.SPECIAL_CAPTURE_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.SPECIAL_CAPTURE_DIR, 'blitz-stab-menu.png') });
    }
    await page.getByLabel('Additional actions').getByRole('button', { name: 'Blitz - Stab Blitzer' }).click();
    await page.getByRole('button', { name: 'Confirmed!' }).click();
    assert.deepEqual(submitted, [['1:blockStab-p2', 1]]);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});

test('hosted kickoff player choices toggle in one click and confirm separately', async () => {
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
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 660 } })).newPage();
    const requests = []; let selected = new Set(); let revision = 0;
    const choice = (name, playerId) => ({ id: `${revision}:event-pick:${playerId}`, label: `${selected.has(playerId) ? 'Deselect' : 'Select'} ${name}`,
      actor: 'home', kind: 'kickoffChoice', target: { playerId }, sourcePlayerId: null });
    const state = () => ({ ...beforeFinalDecision, revision, turnMode: revision < 5 ? 'CHARGE' : 'REGULAR',
      players: [...beforeFinalDecision.players, { ...beforeFinalDecision.players[0], id: 'p3', name: 'Runner', slot: 3, number: 3, x: 4 }],
      actions: revision < 5 ? [choice('Lineman', 'p1'), choice('Runner', 'p3'),
        ...(selected.size === 2 ? [{ id: `${revision}:event-confirm`, label: 'Confirm CHARGE', actor: 'home', kind: 'kickoffChoice', target: null, sourcePlayerId: null }] : [])]
        : beforeFinalDecision.actions });
    await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
    await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: "export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture'}));return()=>{};}" }));
    await page.routeWebSocket('**/browser/v2', socket => {
      const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
      socket.onMessage(raw => {
        const request = JSON.parse(raw);
        if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
        if (request.type === 'setup') {
          if (request.operation === 'action') {
            requests.push([request.actionId, request.expectedRevision]);
            assert.equal(request.expectedRevision, revision);
            if (request.actionId.endsWith(':event-confirm')) assert.equal(selected.size, 2);
            else { const id = request.actionId.split(':').at(-1); if (selected.has(id)) selected.delete(id); else selected.add(id); }
            revision++;
          }
          send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: state() });
        }
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}`);
    const ribbon = page.locator('.kickoff-command');
    await ribbon.getByRole('button', { name: 'Select Lineman' }).click();
    await ribbon.getByRole('button', { name: 'Deselect Lineman' }).click();
    await ribbon.getByRole('button', { name: 'Select Lineman' }).click();
    await ribbon.getByRole('button', { name: 'Select Runner' }).click();
    await page.waitForFunction(() => {
      const confirm = document.querySelector('.kickoff-command-confirm button:last-child');
      return confirm instanceof HTMLButtonElement && !confirm.disabled;
    });
    assert.equal(await ribbon.getByRole('button', { name: 'Confirm selection' }).isEnabled(), true);
    if (process.env.MATCH_CAPTURE_DIR) {
      await mkdir(process.env.MATCH_CAPTURE_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.MATCH_CAPTURE_DIR, 'kickoff-player-selection.png') });
    }
    await ribbon.getByRole('button', { name: 'Confirm selection' }).click();
    await ribbon.waitFor({ state: 'detached' });
    assert.deepEqual(requests, [['0:event-pick:p1', 0], ['1:event-pick:p1', 1], ['2:event-pick:p1', 2],
      ['3:event-pick:p3', 3], ['4:event-confirm', 4]]);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});

test('hosted coin and receive choices keep focus in the required dialog and send exact prompt IDs', async () => {
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
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 660 } })).newPage();
    const choices = []; let stage = 0;
    const prompts = [{ id: 'coin-1', actor: 'home', kind: 'coin', options: ['heads', 'tails'] },
      { id: 'receive-1', actor: 'home', kind: 'receive', options: ['receive', 'kick'] }];
    const state = () => ({ ...beforeFinalDecision, phase: stage < 2 ? 'PRE_MATCH' : 'PLAY', revision: stage,
      prompt: prompts[stage] ?? null, actions: stage < 2 ? [] : beforeFinalDecision.actions });
    await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
    await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: "export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture'}));return()=>{};}" }));
    await page.routeWebSocket('**/browser/v2', socket => {
      const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
      socket.onMessage(raw => {
        const request = JSON.parse(raw);
        if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
        if (request.type === 'setup') {
          if (request.operation === 'choice') { choices.push(request); stage++; }
          send({ type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state: state() });
        }
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}`);
    const dialog = page.getByRole('dialog', { name: 'Match decision' });
    await dialog.getByRole('button', { name: 'Heads' }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.closest('dialog')?.getAttribute('aria-label')), 'Match decision');
    await dialog.getByRole('button', { name: 'Heads' }).click();
    await dialog.getByRole('button', { name: 'Kick' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(choices.map(choice => [choice.promptId, choice.optionId, choice.expectedRevision]), [['coin-1', 'heads', 0], ['receive-1', 'kick', 1]]);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});

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
    const homeResources = page.getByLabel('home resources');
    for (const label of ['Rerolls: 2 available', 'Apothecaries: 1 available', 'Assistant coaches: 2 available', 'Cheerleaders: 3 available'])
      assert.equal(await homeResources.getByRole('button', { name: label }).count(), 1);
    assert.equal(await page.getByLabel('away resources').getByRole('button', { name: /Apothecaries/ }).count(), 0);
    await page.getByRole('button', { name: 'Expand away dugout' }).click();
    assert.equal(await page.getByLabel('away dugout').getByRole('button', { name: /Blitzer/ }).count(), 1);
    await page.waitForFunction(() => document.querySelector('.live-pitch-scene')?.getBoundingClientRect().bottom <= innerHeight,
      null, { timeout: 5000 }); // ResizeObserver applies Fit after the first authoritative frame.
    const checkViewport = async () => {
      await page.waitForFunction(() => {
        const pitch = document.querySelector('.live-pitch-scene')?.getBoundingClientRect();
        const bench = document.querySelector('.match-bench')?.getBoundingClientRect();
        const ribbon = document.querySelector('.match-command-bar')?.getBoundingClientRect();
        const commit = document.querySelector('.confirmation-row .commit-action')?.getBoundingClientRect();
        return pitch && bench && ribbon && commit && pitch.top >= 0 && pitch.bottom <= innerHeight && bench.bottom <= innerHeight
          && commit.bottom <= ribbon.bottom && ribbon.bottom <= innerHeight
          && document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight;
      }, null, { timeout: 5000 });
      const bounds = await page.evaluate(() => {
        const pitch = document.querySelector('.live-pitch-scene')?.getBoundingClientRect();
        const bench = document.querySelector('.match-bench')?.getBoundingClientRect();
        const ribbon = document.querySelector('.match-command-bar')?.getBoundingClientRect();
        const commit = document.querySelector('.confirmation-row .commit-action')?.getBoundingClientRect();
        return { pitchTop: pitch?.top, pitchBottom: pitch?.bottom, benchBottom: bench?.bottom, ribbonBottom: ribbon?.bottom, commitBottom: commit?.bottom,
          height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, width: innerWidth };
      });
      assert.ok(bounds.pitchTop >= 0 && bounds.pitchBottom <= bounds.height && bounds.benchBottom <= bounds.height
        && bounds.commitBottom <= bounds.ribbonBottom && bounds.ribbonBottom <= bounds.height
        && bounds.scrollWidth <= bounds.width && bounds.scrollHeight <= bounds.height, `Critical match UI exceeds viewport: ${JSON.stringify(bounds)}`);
    };
    await checkViewport();
    if (process.env.M5E_SCREENSHOT_DIR) {
      await mkdir(process.env.M5E_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.M5E_SCREENSHOT_DIR, 'match-1280.png') });
    }
    await page.setViewportSize({ width: 1920, height: 900 });
    await checkViewport();
    if (process.env.M5E_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.M5E_SCREENSHOT_DIR, 'match-1920-900.png') });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await checkViewport();
    if (process.env.M5E_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.M5E_SCREENSHOT_DIR, 'match-1920-1080.png') });
    await page.setViewportSize({ width: 1920, height: 820 });
    await checkViewport();
    if (process.env.M5E_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.M5E_SCREENSHOT_DIR, 'match-1920.png') });
    await page.setViewportSize({ width: 1280, height: 660 });
    await checkViewport();
    await page.getByRole('button', { name: 'End Turn', exact: true }).click();
    assert.equal(completed, false, 'Staging End Turn does not submit it');
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    await page.getByRole('link', { name: 'Open final result and replay' }).waitFor();
    const offPitch = page.getByLabel('away dugout').getByRole('button', { name: /Blitzer/ });
    await offPitch.focus();
    await page.getByRole('tooltip', { name: /Blitzer player card/ }).waitFor();
    const card = page.getByRole('tooltip', { name: /Blitzer player card/ });
    assert.match(await card.textContent(), /Blitzer \(Human, Blitzer\).*StatusStunned/s);
    assert.doesNotMatch(await card.textContent(), /Square \d|Match notes/i);
    const portraitLayout = await card.evaluate(element => {
      const stat = element.querySelector('.live-player-stats > div').getBoundingClientRect();
      const portrait = element.querySelector('header img').getBoundingClientRect();
      return { statWidth: stat.width, portraitWidth: portrait.width, topDifference: Math.abs(stat.top - portrait.top) };
    });
    assert.ok(portraitLayout.statWidth < portraitLayout.portraitWidth && portraitLayout.topDifference < 2,
      `Portrait should start beside the narrower MA stat: ${JSON.stringify(portraitLayout)}`);
    const cardBounds = await card.boundingBox();
    assert.ok(cardBounds.x >= 8 && cardBounds.y >= 8 && cardBounds.x + cardBounds.width <= 1280 - 8
      && cardBounds.y + cardBounds.height <= 660 - 8, `Player card fits inside the match viewport: ${JSON.stringify(cardBounds)}`);
    if (process.env.M5E_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.M5E_SCREENSHOT_DIR, 'full-time-1280.png') });
    assert.equal(await page.getByLabel('Home score 2', { exact: true }).textContent(), '2');
    assert.equal(await page.getByLabel('Away score 1', { exact: true }).textContent(), '1');
    assert.equal(await page.getByLabel('away dugout').getByRole('button', { name: /Blitzer/ }).count(), 1);
    await page.getByRole('link', { name: 'Open final result and replay' }).click();
    assert.equal(new URL(page.url()).pathname, '/play/result');
    await page.getByLabel('Final score').waitFor();
    const last = page.getByRole('button', { name: 'Last', exact: true });
    await last.focus(); await last.press('Enter');
    await page.getByLabel('Read-only replay pitch').waitFor();
    assert.match(await page.getByLabel('Replay event').textContent(), /Event 3 of 3: FULL_TIME/);
    assert.ok(await page.getByLabel('Read-only replay pitch').locator('.live-marker').count() > 0);
    const replay = page.getByLabel('Read-only replay pitch');
    const replayScene = replay.locator('.live-pitch-scene');
    const cameraFocus = await replayScene.getAttribute('data-focus');
    const canonicalIds = await replay.locator('.live-marker').evaluateAll(nodes => nodes.map(node => node.dataset.playerId).sort());
    await replay.getByRole('button', { name: 'Away coach view', exact: true }).click();
    assert.equal(await replayScene.getAttribute('data-end'), 'away');
    await replay.getByRole('button', { name: 'Top-down view', exact: true }).click();
    assert.equal(await replayScene.getAttribute('data-projection'), 'top-down');
    assert.equal(await replayScene.getAttribute('data-focus'), cameraFocus);
    assert.equal(await replayScene.locator('polygon[data-cell-x]').count(), 390);
    assert.deepEqual(await replay.locator('.live-marker').evaluateAll(nodes => nodes.map(node => node.dataset.playerId).sort()), canonicalIds);
    const replayPlayer = replay.locator('.live-marker').first();
    await revealPlayer(page, replayPlayer); await replayPlayer.focus();
    await page.getByRole('tooltip', { name: /player card$/ }).waitFor();
    await replay.getByRole('button', { name: 'Home coach view', exact: true }).click();
    assert.equal(await page.getByRole('tooltip', { name: /player card$/ }).count(), 0, 'Camera changes dismiss the previous inspector');
    await page.locator('.replay-dugouts .live-dugout.away .live-dugout-zone-summary').first().click();
    await page.locator('.replay-dugouts .live-dugout.away .live-dugout-players button').first().focus();
    await page.getByRole('tooltip', { name: /Blitzer player card$/ }).waitFor();
    assert.equal(requests.filter(request => request.type === 'setup' && request.operation === 'action').length, 1, 'Read-only camera and inspection cannot mutate the match');
    await page.getByLabel('Event', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Seek', exact: true }).click();
    await page.getByRole('heading', { name: /Event 2 of 3/ }).waitFor();
    await page.getByLabel('Speed').selectOption('4');
    await page.getByLabel('Skip animations').uncheck();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('heading', { name: /Event 3 of 3/ }).waitFor();
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

test('completed replay keeps the selected event, native dice, log and chat together', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return; }
    const file = resolve(root, `.${path === '/play/result' ? '/play/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 660 } })).newPage();
    await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
    await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture-home'}));return()=>{};}` }));
    const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const spectator = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const snapshots = [0, 1, 2].map(revision => ({ ...fullTime, revision }));
    const records = snapshots.map((state, index) => ({ index, revision: index, kind: index === 0 ? 'START' : index === 2 ? 'FULL_TIME' : 'ACTION',
      actor: index === 0 ? 'system' : 'home', at: 1000 + index, decision: index === 0 ? null : { operation: 'action', actionId: `action-${index}` },
      native: index === 1 ? [{ commandNr: 1, reportList: { reports: [{ reportId: 'goForItRoll', roll: 3, minimumRoll: 2, successful: true, playerId: 'p1' }] } }]
        : index === 2 ? [{ commandNr: 2, reportList: { reports: [{ reportId: 'blockChoice', blockRoll: [1, 6], diceIndex: 1, defenderId: 'p2' }] } }] : [], state }));
    const messages = [{ index: 0, at: 1001, revision: 1, authorId: owner, role: 'home', text: 'First turn' },
      { index: 1, at: 1002, revision: 2, authorId: spectator, role: 'spectator', text: 'Final play' }];
    await page.routeWebSocket('**/browser/v2', socket => {
      const send = message => socket.send(JSON.stringify({ version: 2, ...message }));
      socket.onMessage(raw => {
        const request = JSON.parse(raw);
        if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: owner });
        if (request.type === 'browse') send({ type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [] });
        if (request.type === 'savedTeam') send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', teams: [], document: null, validation: null, versionStatus: null });
        if (request.type === 'matchResult') send({ type: 'matchResult', requestId: request.requestId, code: 'ACCEPTED', result: { ...result, formatVersion: 3 },
          event: request.operation === 'replay' ? { revision: request.index, kind: records[request.index].kind, state: snapshots[request.index] } : null });
        if (request.type === 'matchTranscript') send({ type: 'matchTranscript', requestId: request.requestId, code: 'ACCEPTED', matchId,
          page: { formatVersion: 2, from: request.from, next: records.length, total: records.length, records: records.slice(request.from) } });
        if (request.type === 'matchChat') send({ type: 'matchChat', requestId: request.requestId, code: 'ACCEPTED', matchId, duplicate: false,
          page: { formatVersion: 1, from: request.from, next: messages.length, total: messages.length, messages: messages.slice(request.from) } });
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/play/result?matchId=${matchId}`);
    await page.getByLabel('Final score').waitFor();
    await page.getByLabel('Event', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Seek', exact: true }).click();
    await page.getByRole('heading', { name: /Event 2 of 3/ }).waitFor();
    await page.getByRole('tab', { name: 'Chat' }).click();
    await page.getByText('First turn').waitFor();
    assert.equal(await page.getByText('Final play').count(), 0);
    await page.getByRole('button', { name: 'Last', exact: true }).click();
    await page.getByText('Final play').waitFor();
    assert.equal(await page.getByLabel('Read-only replay pitch').locator('.live-dice-overlay .match-die').count(), 2);
    await page.getByRole('tab', { name: 'Log' }).click();
    const log = page.getByRole('log');
    await log.getByText(/chooses die 2 \(Pow\).*dice Skull, Pow/).waitFor();
    assert.equal(await log.locator('svg.match-die').count(), 2);
    assert.equal(await log.locator('svg.match-die.selected').getAttribute('aria-label'), 'Ivory and cyan die: Pow');
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
