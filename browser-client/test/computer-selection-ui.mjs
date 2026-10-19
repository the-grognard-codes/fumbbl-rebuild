import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = fileURLToPath(new URL('../../.tools/bogruk/', import.meta.url));
await mkdir(evidence, { recursive: true });
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const coach of ['coach-bogruk-weak', 'coach-bugman-random']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const errors = []; context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('**/play/match?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="app"></div><script type="module">import { mountPlay } from '/src/play-entry.tsx'; mountPlay(document.getElementById('app'), { url: 'ws://127.0.0.1/unused', getToken: async () => 'test-token' });</script>` }));
    await context.addInitScript(() => {
      const id = '12345678-1234-1234-1234-123456789abc';
      const member = role => ({ role, sourceTeamId: id, sourceDocumentVersion: 1, ruleset: 'BB2025', catalogVersion: 'catalog', rosterId: 'human', presetId: 'starter', presetVersion: '1', validation: { valid: true, total: 1, budget: 2, skillPoints: 0, messages: [] }, roster: { captainId: null, resources: { rerolls: 0 }, players: [] } });
      const document = { formatVersion: 1, matchId: id, documentVersion: 2, lifecycle: 'AWAITING_SETUP', invitation: { intendedOpponent: 'away' }, home: member('home'), away: member('away') };
      window.__computerRequests = [];
      window.WebSocket = class {
        readyState = 0;
        constructor() { queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
        close() { this.readyState = 3; this.onclose?.(); }
        send(raw) {
          const request = JSON.parse(raw); window.__computerRequests.push(request);
          const reply = message => queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ version: 2, requestId: request.requestId, ...message }) }));
          if (request.type === 'authenticate') reply({ type: 'authentication', code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
          else if (request.type === 'currentMatches') reply({ type: 'currentMatches', code: 'ACCEPTED', matches: [], next: null });
          else if (request.type === 'computer') reply({ type: 'computer', code: 'READY' });
          else if (request.type === 'savedTeam') reply({ type: 'savedTeam', code: 'OK', document: null, versionStatus: null, validation: null,
            teams: [{ teamId: id, documentVersion: 1, catalogVersion: 'catalog', teamName: 'Acceptance humans', rosterId: 'human', eligibility: 'CURRENT' }] });
          else if (request.type === 'preparedMatch') {
            if (request.operation === 'activate') { document.lifecycle = 'ACTIVATED'; document.documentVersion = 3; }
            reply({ type: 'preparedMatch', code: 'ACCEPTED', duplicate: false, callerRole: 'home', document, recoveryMatchId: null });
          } else if (request.type === 'setup') reply({ type: 'setupState', code: 'ACCEPTED', duplicate: false, state: {
            matchId: id, revision: 0, callerRole: 'home', actor: 'home', phase: 'PLAY', prompt: null, players: [], actions: [], weather: 'NICE',
            homeRerolls: 0, awayRerolls: 0, turn: 1, turnMode: 'REGULAR', ball: null, activePlayerId: null,
            half: 1, drive: 1, homeTurn: 1, awayTurn: 0, homeScore: 0, awayScore: 0
          } });
        }
      };
    });
    const page = await context.newPage();
    await page.goto(`${base}/test/fixtures/reconnect.html?view=play`);
    await page.getByLabel(/^Play mode/).selectOption('computer');
    await page.getByLabel(/^Opponent/).selectOption(coach);
    const bogruk = coach === 'coach-bogruk-weak';
    const roster = bogruk ? "Bogruk's Almost Best" : "Bugman's Best";
    if (bogruk) {
      await page.getByText('Loves a risky play, especially when there’s a perfectly good safe one.', { exact: true }).waitFor();
      assert.match(await page.getByLabel(/^Opponent/).locator('option:checked').innerText(), /Weak/);
      await page.screenshot({ path: `${evidence}/selector-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${evidence}/selector-mobile.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await page.getByLabel(/^Your saved team/).selectOption('12345678-1234-1234-1234-123456789abc');
    await page.getByLabel(new RegExp(`^Roster for ${roster}`)).selectOption('12345678-1234-1234-1234-123456789abc');
    await page.getByRole('button', { name: 'Create computer game', exact: true }).click();
    await page.getByRole('button', { name: 'Start game in a new window', exact: true }).waitFor();
    const created = await page.evaluate(() => window.__computerRequests.find(request => request.operation === 'createComputer'));
    assert.equal(created.computerId, coach);
    assert.equal(created.computerTeamId, created.teamId);
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Start game in a new window', exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForURL('**/play/match?*');
    await popup.waitForFunction(() => window.__computerRequests.some(request => request.type === 'setup'));
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${coach}: selection, roster clone, activation and match startup`);
  }
} finally { await browser.close(); await server.close(); }
