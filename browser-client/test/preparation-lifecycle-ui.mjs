import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
try {
  await context.route('**/play/match?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="app"></div><script type="module">import { mountPlay } from '/src/play-entry.tsx'; mountPlay(document.getElementById('app'), { url: 'ws://127.0.0.1/unused', getToken: async () => 'test-token' });</script>` }));
  await context.addInitScript(() => {
    const id = '12345678-1234-1234-1234-123456789abc';
    const member = role => ({ role, sourceTeamId: id, sourceDocumentVersion: 1, ruleset: 'BB2025', catalogVersion: 'catalog', rosterId: 'human', presetId: 'starter', presetVersion: '1', validation: { valid: true, total: 1, budget: 2, skillPoints: 0, messages: [] }, roster: { captainId: null, resources: { rerolls: 0 }, players: [] } });
    const document = { formatVersion: 1, matchId: id, documentVersion: 2, lifecycle: 'AWAITING_SETUP', invitation: { intendedOpponent: 'away' }, home: member('home'), away: member('away') };
    window.__preparationRequests = [];
    window.WebSocket = class {
      readyState = 0;
      constructor() { window.__preparationSocket = this; queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
      close() { this.readyState = 3; this.onclose?.(); }
      send(raw) {
        const request = JSON.parse(raw); window.__preparationRequests.push(request);
        const reply = message => queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ version: 2, requestId: request.requestId, ...message }) }));
        if (request.type === 'authenticate') reply({ type: 'authentication', code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
        else if (request.type === 'currentMatches') reply({ type: 'currentMatches', code: 'ACCEPTED', matches: [], next: null });
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
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/test/fixtures/reconnect.html?view=play`);
  await page.getByLabel('Match ID', { exact: true }).fill('12345678-1234-1234-1234-123456789abc');
  await page.getByRole('button', { name: 'Reload game setup', exact: true }).click();
  await page.getByRole('button', { name: 'Start game in a new window', exact: true }).waitFor();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Start game in a new window', exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForURL('**/play/match?*');
  await popup.waitForFunction(() => window.__preparationRequests?.some(request => request.type === 'setup'));
  assert.equal(await page.evaluate(() => window.__preparationSocket.readyState), 1);
  assert.equal(await page.getByRole('button', { name: 'Reconnect preparation here', exact: true }).count(), 0,
    'Launching a new match must not display a reconnect prompt on connected preparation');
  assert.equal(await page.getByRole('status').filter({ hasText: /^Match opened in another tab or window$/ }).count(), 0,
    'Connected preparation must not replace its connection state with a transfer status');
  assert.equal(await page.evaluate(() => window.__preparationRequests[0].purpose), 'preparation');
  assert.equal(await popup.evaluate(() => window.__preparationRequests[0].purpose ?? 'play'), 'play');
  const activePopupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open match in a new tab or window', exact: true }).click();
  const activePopup = await activePopupPromise;
  await activePopup.waitForURL('**/play/match?*');
  await activePopup.waitForFunction(() => window.__preparationRequests?.some(request => request.type === 'setup'));
  assert.equal(await page.evaluate(() => window.__preparationSocket.readyState), 1, 'opening an already active match also preserves preparation');
  assert.equal(await page.getByRole('button', { name: 'Reconnect preparation here', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Refresh games', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Refresh teams', exact: true }).isEnabled(), true);
  await page.evaluate(() => sessionStorage.setItem('moles.play.open-match', '12345678-1234-1234-1234-123456789abc'));
  await page.reload();
  await page.getByRole('button', { name: 'Refresh games', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__preparationSocket.readyState), 1, 'preparation reconnects after reload while the match window remains open');
  assert.equal(await popup.evaluate(() => window.__preparationSocket.readyState), 1);
  assert.equal(await page.getByRole('button', { name: 'Reconnect preparation here', exact: true }).count(), 0, 'old launch markers do not restore an obsolete reconnect prompt');
  assert.equal(await page.getByRole('status').filter({ hasText: /^Match opened in another tab or window$/ }).count(), 0);
  await page.evaluate(() => window.__preparationSocket.close());
  await page.getByRole('status').filter({ hasText: /^Disconnected$/ }).waitFor();
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh teams', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__preparationSocket.readyState), 1, 'a real disconnect still offers working preparation reconnection');
  assert.equal(await popup.evaluate(() => window.__preparationSocket.readyState), 1, 'reconnecting preparation preserves the match connection');
  assert.deepEqual(errors, []);
  console.log('PASS activation, opening active match, and reload preserve usable preparation and distinct authentication purposes');
} finally { await browser.close(); await server.close(); }
