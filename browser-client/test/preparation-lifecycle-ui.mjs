import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, publicDir: fileURLToPath(new URL('../../site/src/', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
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
        else if (request.type === 'computer') reply({ type: 'computer', code: 'READY' });
        else if (request.type === 'savedTeam') reply({ type: 'savedTeam', code: 'OK', teams: [{ teamId: id, documentVersion: 1,
          catalogVersion: 'catalog', teamName: 'The Reavers', rosterId: 'human', eligibility: 'CURRENT' }], document: null, validation: null, versionStatus: null });
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
  for (const style of ['site.css', 'teambuilder.css', 'builder-layout.css']) await page.addStyleTag({ url: `${base}/assets/${style}` });
  await page.getByRole('button', { name: 'AI Opponent', exact: true }).click();
  const opponent = page.getByRole('region', { name: 'Computer opponent', exact: true });
  const coaches = opponent.getByRole('list', { name: 'AI coaches', exact: true });
  assert.equal(await coaches.getByRole('button').count(), 5);
  const gobbo = coaches.getByRole('button', { name: 'Gobbo “Wot Now?” Snotpick', exact: true });
  assert.equal(await gobbo.getAttribute('aria-pressed'), 'true');
  assert.equal(await coaches.getByRole('button', { name: 'Bogruk the Almost Clever', exact: true }).isEnabled(), true);
  for (const name of ['Coach Grimbald Ironwhistle', 'Morgath Blackquill', 'Deep Bruise']) {
    assert.equal(await coaches.getByRole('button', { name, exact: true }).isDisabled(), true);
  }
  assert.equal(await coaches.getByText('Coming soon!', { exact: true }).count(), 3);
  await gobbo.press('Enter');
  await opponent.getByText('Skill level: Horrible', { exact: true }).waitFor();
  await opponent.getByText('Calls plays by throwing a squig at the playbook.', { exact: true }).waitFor();
  await mkdir(new URL('../../.tools/gobbo/', import.meta.url), { recursive: true });
  for (const width of [1440, 1024, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
    assert.ok(await coaches.evaluate(element => element.clientWidth >= element.scrollWidth), `Coach cards fit at ${width}px`);
    await page.screenshot({ path: fileURLToPath(new URL(`../../.tools/gobbo/selector-${width}.png`, import.meta.url)), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await opponent.getByRole('combobox', { name: /^Your saved team/ }).selectOption('12345678-1234-1234-1234-123456789abc');
  await opponent.getByRole('combobox', { name: /^Roster for Bugman/ }).selectOption('12345678-1234-1234-1234-123456789abc');
  await opponent.getByRole('button', { name: 'Create computer game', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__preparationRequests.find(request => request.operation === 'createComputer')?.computerId), 'coach-bugman-random');
  await page.getByRole('button', { name: 'Human Opponent', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Human Opponent', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await opponent.count(), 0);
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
