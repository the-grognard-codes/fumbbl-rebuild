import { setCameraAngle, setCameraMode } from './camera-controls.mjs';
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
    await choose('first');
    assert.equal(await page.locator('.live-selection-square').getAttribute('data-selection'), 'first',
      'A second click on the selected teammate switches player selection');
    assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isDisabled(), true);
    assert.deepEqual(await intents(), []);
    await choose('actor'); await choose('first');
    assert.match(await page.locator('.command-preview').textContent(), /first-choice/);
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
    await page.getByRole('button', { name: 'End Activation', exact: true }).click({ trial: true });
    assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isDisabled(), true, 'A new revision clears the proposal');
    await choose('ineligible');
    assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isDisabled(), true);
    await choose('second');
    if (evidence && role === 'home' && !kicked) { await mkdir(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/teammate-proposal.png` }); }
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    assert.deepEqual(await intents(), [{ operation: 'action', fields: { actionId: 'second-choice' } }]);
    assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isDisabled(), true);
    const landed = { ...state, revision: 3, actions: [action('landing', kicked ? 'kickMateTo' : 'throwTeamMate', { x: 14, y: 7 }),
      action('landing-own', kicked ? 'kickMateTo' : 'throwTeamMate', { x: 18, y: 7 })],
      players: [...state.players.map(player => player.id === 'second' ? { ...player, state: 'is picked up' } : player),
        { ...state.players[0], id: 'occupied-target', name: 'occupied target', x: 14, y: 7,
          role: role === 'home' ? 'away' : 'home', skills: [] },
        { ...state.players[0], id: 'own-target', name: 'own target', x: 18, y: 7, role, skills: [] }] };
    const ranges = Array.from({ length: 26 }, () => '-'.repeat(15));
    ranges[14] = '-------Q-------'; ranges[18] = '-------S-------';
    landed.passing = { version: 2, playerId: 'actor', from: { x: 12, y: 7 }, weatherPenalty: 0,
      rangeLimited: false, action: kicked ? 'kickMateTo' : 'throwTeamMate', ranges,
      targets: ranges.map(row => [...row].map(code => code === '-' ? null : code === 'Q' ? 2 : 3)) };
    await page.evaluate(state => window.publishHud(state), landed);
    await page.getByTestId('setup-status').filter({ hasText: 'Revision 3' }).waitFor({ state: 'attached' });
    const legend = page.getByRole('note', { name: kicked ? 'Kick Team Mate distances' : 'Throw Team Mate distances' });
    await legend.waitFor();
    assert.match(await legend.textContent(), /Quick Pass: 2\+.*Short Pass: 3\+.*limited to Quick or Short/s);
    assert.equal(await page.locator('[data-pass-range]').count(), 390);
    assert.equal(await page.locator('[data-pass-range="Q"]').count(), 1);
    assert.equal(await page.locator('[data-pass-range="S"]').count(), 1);
    assert.equal(await page.locator('[data-pass-range="L"], [data-pass-range="B"]').count(), 0);
    await page.getByRole('button', { name: 'Debug', exact: true }).click();
    for (const angle of [30, 50, 40]) {
      await setCameraAngle(page, String(angle));
      assert.equal(await page.locator('[data-cell-x="14"][data-cell-y="7"][data-pass-range="Q"]').count(), 1);
    }
    await setCameraMode(page, 'top-down');
    assert.equal(await page.locator('[data-pass-range]').count(), 390);
    await setCameraMode(page, 'perspective');
    await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
    await choose('own-target');
    assert.match(await page.locator('.command-preview').textContent(), /landing-own/,
      'The first click targets the own player at the offered flight square');
    await choose('own-target');
    assert.equal(await page.locator('.live-selection-square').getAttribute('data-selection'), 'own-target',
      'A second click on a flight target switches player selection');
    assert.equal(await page.getByRole('button', { name: 'Confirmed!', exact: true }).isDisabled(), true);
    assert.equal((await intents()).length, 1);
    await choose('actor'); await choose('occupied-target');
    assert.match(await page.locator('.command-preview').textContent(), /landing/, 'Keyboard selection targets the occupied square');
    const at = await squarePosition(page, 14, 7); await page.mouse.click(at.x, at.y);
    assert.match(await page.locator('.command-preview').textContent(), /landing/);
    assert.match(await page.locator('.live-pass-target-detail').textContent(), /Quick Pass; 2\+/);
    if (evidence) { await mkdir(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/${role}-${kicked ? 'kick' : 'throw'}-ranges.png` }); }
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    assert.equal((await intents()).at(-1).fields.actionId, 'landing');
    await page.evaluate(state => window.publishHud({ ...state, revision: 4, callerRole: 'spectator', actions: [] }), state);
    await page.getByTestId('setup-status').filter({ hasText: 'Revision 4' }).waitFor({ state: 'attached' });
    await page.locator('.live-pass-legend').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-pass-range]').count(), 0, 'Ending flight targeting clears guidance');
    await choose('second'); assert.equal((await intents()).length, 2);
  }
  assert.deepEqual(errors, []);
  console.log('Teammate proposals: both coaches, throw/kick, change/cancel, stale eligibility, confirmation and landing passed');
} finally { await browser.close(); await server.close(); }
