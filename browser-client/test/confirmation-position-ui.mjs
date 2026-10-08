import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Presentation and intent evidence using isolated authoritative projections.
const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const play = { ...base, revision: 1, phase: 'PLAY', actor: 'home', callerRole: 'home', activePlayerId: null,
  players: [{ ...base.players[0], id: 'human', role: 'home', name: 'Human Blitzer', x: 12, y: 7 }],
  actions: [{ id: 'select', kind: 'select', label: 'Move Human Blitzer', actor: 'home', sourcePlayerId: 'human', target: null },
    { id: 'end', kind: 'endTurn', label: 'End Turn', actor: 'home', sourcePlayerId: null, target: null }] };
const teammate = { ...play, activePlayerId: 'human',
  players: [...play.players, { ...play.players[0], id: 'mate', name: 'Teammate', x: 13, skills: ['Right Stuff'] }],
  actions: [{ id: 'lift', kind: 'liftTeamMate', label: 'Lift teammate', actor: 'home', sourcePlayerId: 'human', target: { playerId: 'mate' } }] };
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const evidence = process.env.CONFIRMATION_EVIDENCE_DIR;
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, play);
  await page.route('**/confirmation-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  const confirm = page.getByRole('button', { name: 'Confirmed!', exact: true });
  let revision = 1;
  const publish = async (state, setupErrors = []) => {
    const next = { ...state, revision: ++revision };
    await page.evaluate(({ next, setupErrors }) => window.publishHud(next, setupErrors), { next, setupErrors });
    await page.getByTestId('setup-status').filter({ hasText: `Revision ${revision} ` }).waitFor({ state: 'attached' });
  };
  for (const [width, height] of [[1280,660], [1920,1080], [375,660], [640,330], [375,300]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/confirmation-test`);
    await confirm.waitFor(); await page.evaluate(() => document.fonts.ready);
    const origin = await confirm.boundingBox();
    const samePosition = async label => {
      const box = await confirm.boundingBox();
      assert.ok(box && Math.abs(box.x - origin.x) < 1 && Math.abs(box.y - origin.y) < 1,
        `${label}: Confirmed! moved from ${JSON.stringify(origin)} to ${JSON.stringify(box)} at ${width}x${height}`);
      assert.equal(await page.locator('.live-match-page').evaluate(element => element.scrollTop), 0, 'State changes cannot scroll the match beneath its controls');
      assert.ok(Math.abs(box.x + box.width / 2 - width / 2) < 1, 'Confirmation stays centered');
      assert.ok(box.y >= 0 && box.y + box.height <= height && box.x >= 0 && box.x + box.width <= width, 'Confirmation stays inside the match');
    };
    await publish({ ...play, phase: 'SETUP', actions: [] }, ['Setup is not yet legal']);
    await samePosition('Setup'); await confirm.click(); await samePosition('Pending setup confirmation');
    assert.equal((await page.evaluate(() => window.hudIntents)).at(-1).operation, 'confirm');
    await publish(play); await samePosition('Return to play');
    await page.getByRole('button', { name: 'Other action', exact: true }).click();
    await samePosition('Open additional actions');
    await page.getByRole('button', { name: 'Other action', exact: true }).click();
    await page.getByRole('button', { name: 'End Turn', exact: true }).click();
    await samePosition('End-turn preview'); assert.equal(await confirm.isEnabled(), true);
    await confirm.click(); await samePosition('Pending action'); assert.equal(await confirm.isDisabled(), true);
    assert.equal((await page.evaluate(() => window.hudIntents)).at(-1).fields.actionId, 'end');
    await publish(teammate);
    await page.getByRole('button', { name: 'Other action', exact: true }).click({ trial: true });
    await page.locator('[data-player-id="human"]').focus(); await page.keyboard.press('Enter');
    await page.locator('[data-player-id="mate"]').focus(); await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Cancel teammate selection', exact: true }).waitFor();
    await samePosition('Teammate proposal');
    await page.getByRole('button', { name: 'Cancel teammate selection', exact: true }).click();
    await samePosition('Cancelled teammate proposal'); assert.equal(await confirm.isDisabled(), true);
    const away = { ...play, actor: 'away', callerRole: 'away', actions: play.actions.map(action => ({ ...action, actor: 'away' })) };
    await publish(away); await samePosition('Away coach play');
    await publish({ ...away, phase: 'SETUP', actions: [] }); await samePosition('Away coach setup');
    for (const state of [{ ...play, phase: 'SETUP', actor: 'away' },
      { ...play, phase: 'READY_FOR_KICKOFF', turnMode: 'QUICK_SNAP' }, { ...play, actions: [] },
      { ...play, phase: 'FULL_TIME', actions: [] }, { ...play, callerRole: 'spectator', actions: [] }]) {
      await publish(state); assert.equal(await confirm.count(), 0, 'States without confirmation keep it hidden');
    }
    await publish(play); await samePosition('Reappearing confirmation');
    if (evidence && width === 1280) {
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: `${evidence}/confirmation-play.png` });
      await publish({ ...play, phase: 'SETUP', actions: [] }, ['Setup is not yet legal']);
      await page.screenshot({ path: `${evidence}/confirmation-setup.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: Confirmed! stays centered and fixed across setup, previews, teammate selection, pending and hidden states for both coaches at five viewport sizes.');
} finally { await browser.close(); await server.close(); }
