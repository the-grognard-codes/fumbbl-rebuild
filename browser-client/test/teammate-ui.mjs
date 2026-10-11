import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';

// Presentation and submitted-intent evidence, paired with TeammateActivationTest.
const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const evidence = process.env.TEAMMATE_EVIDENCE_DIR;
const choose = async id => { const marker = page.locator(`.live-marker[data-player-id="${id}"]`); await marker.focus(); await marker.press('Enter'); };
const intents = () => page.evaluate(() => window.hudIntents);
try {
  for (const role of ['home', 'away']) for (const kicked of [false, true]) {
    const kind = kicked ? 'kickMate' : 'liftTeamMate';
    const action = (id, kind, target) => ({ id, kind, label: `${kind} ${id}`, actor: role, sourcePlayerId: 'actor', target });
    const state = { ...base, revision: 1, actor: role, callerRole: role, activePlayerId: 'actor',
      players: ['actor', 'first', 'second', 'ineligible'].map((id, i) => ({ ...base.players[0], id, role, name: id,
        x: 12 + (i === 1 ? 1 : i === 2 ? -1 : 0), y: 7 + (i === 3 ? 1 : 0), state: 'is standing',
        skills: i === 1 || i === 2 ? ['Right Stuff'] : [], art: { rosterId: 'human', positionId: 'lineman' } })),
      actions: [action('first-choice', kind, { playerId: 'first' }), action('second-choice', kind, { playerId: 'second' }),
        action('move', 'move', { x: 12, y: 6 }), action('end', 'endAction', { playerId: 'actor' })] };
    await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, state);
    await page.route('**/teammate-test', route => route.fulfill({ contentType: 'text/html', body: '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/teammate-test`);
    await page.locator('.coach-match').waitFor();
    await choose('actor'); await choose('first');
    assert.match(await page.locator('.command-preview').textContent(), /first-choice/);
    assert.deepEqual(await intents(), []);
    await choose('second');
    await page.getByRole('button', { name: 'Cancel teammate selection' }).waitFor();
    assert.match(await page.locator('.command-preview').textContent(), /second-choice/);
    assert.match(await page.locator('.command-preview').textContent(), /second-choice/);
    await page.getByRole('button', { name: 'Cancel teammate selection' }).click();
    assert.deepEqual(await intents(), []);
    assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isDisabled(), true);
    await choose('first');
    await page.evaluate(state => window.publishHud({ ...state, revision: 2, actions: state.actions.filter(action => action.id !== 'first-choice') }), state);
    await page.getByTestId('setup-status').filter({ hasText: 'Revision 2' }).waitFor({ state: 'attached' });
    await page.getByRole('button', { name: 'Other action', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Other action', exact: true }).click({ trial: true });
    assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isDisabled(), true, 'A new revision clears the proposal');
    await choose('ineligible');
    assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isDisabled(), true);
    await choose('second');
    if (evidence && role === 'home' && !kicked) { await mkdir(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/teammate-proposal.png` }); }
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    assert.deepEqual(await intents(), [{ operation: 'action', fields: { actionId: 'second-choice' } }]);
    assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isDisabled(), true);
    const landed = { ...state, revision: 3, actions: [action('landing', kicked ? 'kickMateTo' : 'throwTeamMate', { x: 14, y: 7 })],
      players: state.players.map(player => player.id === 'second' ? { ...player, state: 'is picked up' } : player) };
    await page.evaluate(state => window.publishHud(state), landed);
    await page.getByTestId('setup-status').filter({ hasText: 'Revision 3' }).waitFor({ state: 'attached' });
    await page.getByRole('button', { name: 'Other action', exact: true }).click({ trial: true });
    const at = await squarePosition(page, 14, 7); await page.mouse.click(at.x, at.y);
    assert.match(await page.locator('.command-preview').textContent(), /landing/);
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    assert.equal((await intents()).at(-1).fields.actionId, 'landing');
    await page.evaluate(state => window.publishHud({ ...state, revision: 4, callerRole: 'spectator', actions: [] }), state);
    await page.getByTestId('setup-status').filter({ hasText: 'Revision 4' }).waitFor({ state: 'attached' });
    await choose('second'); assert.equal((await intents()).length, 2);
  }
  assert.deepEqual(errors, []);
  console.log('Teammate proposals: both coaches, throw/kick, change/cancel, stale eligibility, confirmation and landing passed');
} finally { await browser.close(); await server.close(); }
