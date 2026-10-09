import assert from 'node:assert/strict';
import { squarePosition, revealPlayer } from '../../browser-client/test/projected-pitch-helper.mjs';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { resolveEnvironment, configurationScript } from '../../deployment/firebase/scripts/environment.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const frames = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const matchId = frames[0].actor.matchId;
const accounts = ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc'];

test('real-engine Blitz actions pin and commit once across both players and spectator', async () => {
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
  const sockets = new Map(); const calls = []; const previews = []; const pages = [];
  let step = 0; let loads = 0; let overrideState = null;
  const waitForLoadCount = async count => {
    const deadline = Date.now() + 5000;
    while (loads < count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  };
  const state = index => ({ ...(overrideState ?? frames[step].actor), callerRole: index === 2 ? 'spectator' : index === 1 ? 'away' : 'home',
    clock: { activeRole: 'home', turnElapsedMs: 110_000, homeReserveMs: 600_000, awayReserveMs: 600_000 } });
  const sendState = (index, send, requestId = null, duplicate = false) => send({ type: 'setupState', requestId, code: 'ACCEPTED', duplicate, state: state(index) });
  const assertBoard = async page => {
    await page.waitForFunction(players => {
      const labels = [...document.querySelectorAll('[aria-label="Live match pitch"] .live-marker')].map(marker => marker.getAttribute('aria-label'));
      return players.every(player => labels.some(label => label.includes(`${player.teamName} ${player.name},`)
        && label.endsWith(`square ${player.x}, ${player.y}`)));
    }, frames[step].actor.players.filter(player => player.x !== null).map(player => ({ ...player,
      teamName: player.role === 'home' ? frames[step].actor.homeTeamName : frames[step].actor.awayTeamName })));
    await page.getByLabel('Pitch action preview').waitFor();
    const labels = await page.getByLabel('Live match pitch').locator('.live-marker').evaluateAll(markers => markers.map(marker => marker.getAttribute('aria-label')));
    for (const player of frames[step].actor.players.filter(player => player.x !== null)) {
      const teamName = player.role === 'home' ? frames[step].actor.homeTeamName : frames[step].actor.awayTeamName;
      assert.ok(labels.some(label => label.includes(`${teamName} ${player.name},`) && label.endsWith(`square ${player.x}, ${player.y}`)), `Missing ${player.role} ${player.name} at ${player.x},${player.y}`);
    }
    assert.equal(await page.getByLabel('Live match pitch').locator('.live-ball-marker').count(), frames[step].actor.ball ? 1 : 0);
  };
  try {
    for (let index = 0; index < 3; index++) {
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); pages.push(page);
      await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
      await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture-${index}'}));return()=>{};}` }));
      await page.routeWebSocket('**/browser/v2', socket => {
        const send = message => socket.send(JSON.stringify({ version: 2, ...message })); sockets.set(index, send);
        socket.onMessage(raw => {
          const request = JSON.parse(raw);
          if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: accounts[index] });
          else if (request.type === 'setup' && request.operation === 'load') { loads++; sendState(index, send, request.requestId); }
          else if (request.type === 'watch') sendState(index, send, request.requestId);
          else if (request.type === 'routePreview') {
            previews.push({ index, request });
            const snapshot = state(index);
            const player = snapshot.players.find(item => item.id === snapshot.activePlayerId);
            const from = { x: player.x, y: player.y };
            const steps = request.waypoints.map(point => ({ ...point, dodge: 0, rush: 0, reactions: [] }));
            send({ type: 'routePreview', requestId: request.requestId, code: 'ACCEPTED', matchId,
              route: { routeVersion: 1, playerId: player.id, from, remaining: 8, steps,
                revision: snapshot.revision, actor: 'home' } });
          }
          else if (request.type === 'setup' && ['action', 'route'].includes(request.operation)) calls.push({ index, request, send });
        });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/play/match?matchId=${matchId}${index === 2 ? '&watch=1' : ''}`);
      await page.getByLabel('Live match pitch').waitFor();
      assert.match(await page.getByTestId('setup-status').textContent(), /Revision 0/);
      await assertBoard(page);
    }
    const actor = pages[0];
    await actor.setViewportSize({ width: 1224, height: 604 });
    await actor.waitForFunction(() => Math.abs(document.querySelector('.live-pitch-scene').getBoundingClientRect().bottom
      - document.querySelector('.live-pitch-viewport').getBoundingClientRect().bottom) < 1);
    assert.equal(await actor.locator('.live-chess-clock.home.urgent').count(), 1, 'The active turn pulses during its last 15 seconds');
    assert.equal(await actor.locator('.live-chess-clock').evaluateAll(elements => elements.every(element => element.scrollHeight <= element.clientHeight + 1)), true,
      'Both clocks fit beside the team plates');
    const layout = await actor.evaluate(() => {
      const box = selector => document.querySelector(selector)?.getBoundingClientRect();
      const bar = box('.match-command-bar'), confirm = box('.confirmation-row .commit-action');
      const chat = box('.match-history-chat'), log = box('.match-history-log'), scene = box('.live-pitch-scene');
      const pitch = box('.live-pitch-viewport'), header = box('.site-header');
      return { confirmBottom: confirm?.bottom, barTop: bar?.top, barLeft: bar?.left, barRight: bar?.right,
        chatRight: chat?.right, logLeft: log?.left, sceneTop: scene?.top, sceneBottom: scene?.bottom, height: innerHeight,
        pitchTop: pitch?.top, pitchBottom: pitch?.bottom, headerBottom: header?.bottom,
        spacing: parseFloat(getComputedStyle(document.documentElement).fontSize),
        panelAlpha: getComputedStyle(document.querySelector('.match-history-log')).backgroundColor };
    });
    assert.ok(layout.confirmBottom < layout.barTop && layout.chatRight < layout.barLeft && layout.barRight < layout.logLeft, JSON.stringify(layout));
    assert.equal(layout.headerBottom, 0, 'The hidden site header takes no space in the game display');
    assert.ok(layout.pitchTop >= 0 && layout.pitchBottom <= layout.height);
    assert.ok(Math.abs(layout.pitchTop - layout.spacing) < 1
      && Math.abs(layout.height - layout.pitchBottom - layout.spacing) < 1, 'The pitch fills the viewport with one-rem margins');
    assert.ok(Math.abs(layout.sceneTop - layout.pitchTop) < 1 && Math.abs(layout.sceneBottom - layout.pitchBottom) < 1);
    assert.equal(layout.panelAlpha, 'rgba(9, 23, 38, 0.3)');
    const commit = actor.getByRole('button', { name: 'Confirmed!', exact: true });
    assert.equal(await actor.getByRole('button', { name: 'Move', exact: true }).isDisabled(), true);
    assert.equal(await actor.getByRole('button', { name: 'Block', exact: true }).isDisabled(), true);
    await actor.getByRole('button', { name: 'End Turn', exact: true }).click();
    assert.equal(await commit.isEnabled(), true);
    assert.match(await actor.locator('.command-preview').textContent(), /Unactivated players remain/);
    assert.equal(calls.length, 0, 'End Turn pauses while unactivated players remain');
    await actor.getByLabel('Pitch action preview').focus();
    await actor.keyboard.press('Escape');
    assert.equal(await commit.isDisabled(), true, 'Escape cancels the pending End Turn proposal');
    assert.equal(await pages[2].getByRole('button', { name: 'End Turn', exact: true }).count(), 0);
    await revealPlayer(actor, actor.getByLabel('Live match pitch').locator('.live-marker').first());
    await actor.getByLabel('Live match pitch').locator('.live-marker').first().hover();
    const viewport = actor.getByLabel('Pitch action preview');
    await viewport.focus(); await viewport.press('Space');
    assert.equal(calls.length, 0, 'Hover and unpinned Space do not send');
    const pinPlayer = async playerIndex => { const id = await actor.getByLabel('Live match pitch').locator('.live-marker').nth(playerIndex).getAttribute('data-player-id'); await revealPlayer(actor, actor.locator(`[data-player-id="${id}"]`)); await actor.locator(`[data-player-id="${id}"]`).click(); };
    const pinSquare = async (x, y) => {
      const scene = actor.getByLabel('Live match pitch').locator('.live-pitch-scene');
      await scene.click({ position: await squarePosition(actor, x, y) });
    };
    const submit = async (actionId, pin, viaSpace = false, immediate = false) => {
      if (immediate && process.env.M5D_SCREENSHOT_DIR && actionId.startsWith('7:push:')) {
        await mkdir(process.env.M5D_SCREENSHOT_DIR, { recursive: true });
        await actor.screenshot({ path: resolve(process.env.M5D_SCREENSHOT_DIR, 'push-decision-actor.png') });
      }
      await pin();
      const move = /^\d+:move-(\d+)-(\d+)$/.exec(actionId);
      if (move) {
        await actor.waitForFunction(() => document.querySelector('.confirmation-row .commit-action')?.disabled === false);
        const preview = previews.at(-1);
        assert.equal(preview?.index, 0, 'Only the actor requests route previews');
        assert.equal(preview.request.expectedRevision, step);
        assert.deepEqual(preview.request.waypoints, [{ x: Number(move[1]), y: Number(move[2]) }]);
      }
      if (!immediate) assert.equal(await commit.isEnabled(), true, `Pinned action ${actionId} must be ready for an explicit commit`);
      if (actionId === '2:move-8-7') {
        const path = actor.getByLabel('Live match pitch').locator('.live-route-line');
        await path.waitFor({ state: 'attached' });
        assert.equal(await path.evaluate(element => getComputedStyle(element).animationName), 'live-arrow-chase');
        await actor.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await path.evaluate(element => getComputedStyle(element).animationName), 'none');
        await actor.emulateMedia({ reducedMotion: 'no-preference' });
      }
      if (process.env.M5D_SCREENSHOT_DIR && actionId === '2:move-8-7') {
        await mkdir(process.env.M5D_SCREENSHOT_DIR, { recursive: true });
        await actor.getByLabel('Live match pitch').screenshot({ path: resolve(process.env.M5D_SCREENSHOT_DIR, `${actionId.startsWith('2:') ? 'blitz-move' : 'push-choice'}-actor.png`) });
        await pages[2].getByLabel('Live match pitch').screenshot({ path: resolve(process.env.M5D_SCREENSHOT_DIR, `${actionId.startsWith('2:') ? 'blitz-move' : 'push-choice'}-spectator.png`) });
      }
      if (viaSpace) { const viewport = actor.getByLabel('Pitch action preview'); await viewport.focus(); await viewport.press('Space'); }
      else if (!immediate) await commit.click();
      await actor.waitForFunction(() => document.querySelector('.confirmation-row .commit-action')?.disabled === true);
      assert.equal(await actor.getByText('A submitted change needs confirmation.', { exact: false }).count(), 0, 'In-flight requests do not show recovery');
      assert.equal(calls.length, 1, 'One pinned action sends one mutation');
      assert.equal(calls[0].index, 0);
      assert.equal(calls[0].request.expectedRevision, step);
      if (move) {
        assert.equal(calls[0].request.operation, 'route');
        assert.equal(calls[0].request.playerId, 'home1');
        assert.deepEqual(calls[0].request.waypoints, [{ x: Number(move[1]), y: Number(move[2]) }]);
      } else {
        assert.equal(calls[0].request.operation, 'action');
        assert.equal(calls[0].request.actionId, actionId);
      }
      assert.equal(await commit.isDisabled(), true);
      assert.equal(await pages[1].getByRole('button', { name: 'Confirmed!', exact: true }).count(), 0);
      assert.equal(await pages[2].getByRole('button', { name: 'Confirmed!', exact: true }).count(), 0);
      const accepted = calls.shift();
      step++;
      sendState(0, accepted.send, accepted.request.requestId);
      sendState(1, sockets.get(1)); sendState(2, sockets.get(2));
      for (const page of pages) {
        await page.waitForFunction(revision => document.querySelector('[data-testid="setup-status"]')?.textContent.includes(`Revision ${revision}`), step);
        await assertBoard(page);
      }
      sendState(0, accepted.send, null, true);
      assert.equal(calls.length, 0, 'Duplicate projection does not create a new mutation');
    };
    await pinPlayer(0);
    await actor.getByRole('button', { name: 'Other action', exact: true }).click();
    await actor.getByLabel('Additional actions').getByRole('button', { name: 'Forgo activation' }).click();
    assert.equal(await commit.isEnabled(), true, 'More actions pins a commit-ready server choice');
    assert.equal(calls.length, 0, 'More actions only pins a server-issued choice');
    await actor.getByLabel('Pitch action preview').focus();
    await actor.keyboard.press('Escape');
    assert.equal(await commit.isDisabled(), true, 'Escape cancels the pending proposal');
    await pinPlayer(0);
    await actor.getByRole('button', { name: 'Blitz', exact: true }).click();
    if (process.env.M5D_SCREENSHOT_DIR) {
      await mkdir(process.env.M5D_SCREENSHOT_DIR, { recursive: true });
      await actor.screenshot({ path: resolve(process.env.M5D_SCREENSHOT_DIR, 'action-ribbon-blitz.png') });
    }
    const initialSelection = await actor.evaluate(() => ({
      preview: document.querySelector('.command-preview')?.textContent,
      status: document.querySelector('.match-page-top [role="status"]')?.textContent,
      pending: document.body.innerText.includes('A submitted change needs confirmation.'),
      revision: document.querySelector('[data-testid="setup-status"]')?.textContent?.match(/Revision \d+/)?.[0],
    }));
    assert.equal(await commit.isEnabled(), true, `Initial Blitz action must be ready: ${JSON.stringify(initialSelection)}`);
    await commit.click();
    await actor.waitForFunction(() => document.querySelector('.confirmation-row .commit-action')?.disabled === true);
    assert.equal(await actor.getByText('A submitted change needs confirmation.', { exact: false }).count(), 0, 'In-flight requests do not show recovery');
    assert.equal(calls.length, 1);
    const stale = calls.shift();
    stale.send({ type: 'setupState', requestId: stale.request.requestId, code: 'STALE_REVISION', duplicate: false, state: null });
    await waitForLoadCount(3);
    assert.equal(calls.length, 0, 'Stale rejection never resubmits automatically');
    assert.ok(loads >= 3, 'Stale rejection requests a fresh read');
    await submit('0:blitz-home1', async () => { await pinPlayer(0); await actor.getByRole('button', { name: 'Blitz', exact: true }).click(); });
    await submit('1:target-away1', () => pinPlayer(1));
    for (const x of [8, 9, 10]) await submit(`${step}:move-${x}-7`, () => pinSquare(x, 7), x === 8);
    await submit('5:block-away1', () => pinPlayer(1));
    const decision = actor.getByRole('dialog', { name: 'Choose a block die' });
    await decision.waitFor();
    assert.equal(await actor.locator('dialog.match-decision-dialog').count(), 0, 'Block dice use the compact pitch overlay');
    assert.equal(await decision.locator('.match-die').count(), 1, 'The server-offered block face is a graphical choice');
    if (process.env.M5D_SCREENSHOT_DIR) {
      await mkdir(process.env.M5D_SCREENSHOT_DIR, { recursive: true });
      await actor.screenshot({ path: resolve(process.env.M5D_SCREENSHOT_DIR, 'block-die-decision.png') });
    }
    assert.equal(await actor.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label')), 'Choose a block die');
    await decision.getByRole('button').first().press('Escape');
    assert.equal(await decision.isVisible(), true, 'A required server decision cannot be dismissed');
    assert.equal(await pages[1].getByRole('dialog', { name: 'Choose a block die' }).count(), 0);
    await submit('6:block-die:0', () => actor.getByRole('dialog', { name: 'Choose a block die' }).getByRole('button', { name: frames[6].actor.actions[0].label }).click(), false, true);
    assert.equal(await pages[2].getByRole('dialog', { name: 'Choose a block die' }).count(), 0);
    assert.equal(await actor.getByRole('dialog', { name: 'Choose a block die' }).count(), 0, 'Push uses pitch arrows instead of a modal');
    assert.equal(await actor.getByLabel('Live match pitch').locator('.live-push-choice').count(), 3);
    assert.equal(await pages[1].getByLabel('Live match pitch').locator('.live-push-choice').count(), 0);
    assert.equal(await pages[2].getByLabel('Live match pitch').locator('.live-push-choice').count(), 0);
    await submit('7:push:away1:12:6', () => pinSquare(12, 6), false, true);
    assert.equal(step, 8);
    assert.equal(frames[8].checkpoint, 'pushed');
    overrideState = { ...frames[8].actor, revision: 9, actor: 'home', actions: [
      { id: '9:reroll:none', kind: 'reroll', label: 'Do not re-roll Dodge', actor: 'home', target: null, sourcePlayerId: null },
      { id: '9:reroll:dodge', kind: 'reroll', label: 'Use Dodge re-roll', actor: 'home', target: null, sourcePlayerId: null },
      { id: '9:reroll:team', kind: 'reroll', label: 'Use team re-roll for Dodge', actor: 'home', target: null, sourcePlayerId: null }
    ] };
    sendState(0, sockets.get(0));
    const reroll = actor.getByRole('dialog', { name: 'Use a re-roll?' });
    await reroll.waitFor();
    assert.equal(await reroll.getByRole('button', { name: 'Use Dodge re-roll' }).count(), 1);
    assert.equal(await reroll.getByRole('button', { name: 'Use team re-roll for Dodge' }).count(), 1);
    assert.equal(await actor.locator('dialog.match-decision-dialog').count(), 0);
    overrideState = { ...overrideState, revision: 10, actions: [
      { id: '10:follow:no', kind: 'followUp', label: 'Do not follow up', actor: 'home', target: null, sourcePlayerId: null },
      { id: '10:follow:yes', kind: 'followUp', label: 'Follow up', actor: 'home', target: null, sourcePlayerId: null }
    ] };
    sendState(0, sockets.get(0));
    const followUp = actor.getByRole('dialog', { name: 'Match decision' });
    await followUp.waitFor();
    assert.equal(await followUp.getByRole('button', { name: 'No', exact: true }).count(), 1);
    assert.equal(await followUp.getByRole('button', { name: 'Yes', exact: true }).count(), 1);
    assert.equal(await followUp.getByText('Choose an option to continue play.').count(), 0);
    assert.ok((await followUp.boundingBox()).width < 260, 'Follow Up uses a compact dialog');
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
