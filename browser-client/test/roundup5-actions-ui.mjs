import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const actor = { ...base.players.find(player => player.role === 'home'), id: 'actor', x: 7, y: 7 };
const enemy = { ...base.players.find(player => player.role === 'away'), id: 'enemy', x: 8, y: 7 };
const other = { ...enemy, id: 'other', x: 7, y: 8 };
const view = { ...base, phase: 'PLAY', callerRole: 'home', actor: 'home', activePlayerId: null, prompt: null,
  players: [actor, enemy, other], revision: 1, playerActionMenu: [], actions: [] };
const action = (kind, id, target, label = kind) => ({ kind, id, target, label, actor: 'home', sourcePlayerId: actor.id });
const directions = (revision, x) => [[0, -1, 'north'], [1, 0, 'east'], [0, 1, 'south'], [-1, 0, 'west']]
  .map(([dx, dy, label]) => action('puntDirection', `${revision}:punt:${label}`, { x: x + dx, y: 7 + dy }, `Punt ${label}`));
const puntState = (revision, x) => ({ ...view, revision, activePlayerId: actor.id, activePlayerAction: 'puntMove',
  playerActionMenu: [{ playerId: actor.id, kind: 'declarePunt', spent: true }],
  players: [{ ...actor, x }, { ...enemy, x: 15 }, { ...other, x: 16 }],
  actions: [action('puntNow', `${revision}:punt-now`, { playerId: actor.id }, 'Punt now'),
    ...directions(revision, x), action('move', `${revision}:move`, { x: x + 1, y: 7 }, 'Move'),
    action('endAction', `${revision}:end`, null, 'End activation')] });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const evidence = fileURLToPath(new URL('../../.tools/roundup5-evidence/', import.meta.url));
mkdirSync(evidence, { recursive: true });
const failures = [];
async function check(name, initial, test, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...options });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(state => { window.roundupState = state; window.roundupIntents = []; }, initial);
    await page.route('**/roundup5-actions', route => route.fulfill({ contentType: 'text/html', body:
      '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/roundup5-actions-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/roundup5-actions`);
    await page.locator('.live-pitch-scene').waitFor();
    await test(page);
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}`);
  } catch (error) { failures.push(error); console.error(`FAIL ${name}: ${error.message}`); }
  finally { await page.close(); }
}
const intents = page => page.evaluate(() => window.roundupIntents);
const assertTopLayer = async tooltip => {
  assert.equal(await tooltip.evaluate(element => {
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:red;';
    document.body.append(cover);
    element.style.pointerEvents = 'auto';
    try {
      const bounds = element.getBoundingClientRect();
      return element.matches(':popover-open') && element.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
    } finally { cover.remove(); element.style.removeProperty('pointer-events'); }
  }), true, 'Visible tooltip must paint above even the highest document stacking layer');
};
const planPunt = async page => {
  await page.locator('[data-player-id="actor"]').click();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.locator('.live-pitch-scene').click({ position: await squarePosition(page, 9, 7) });
  await page.locator('.live-route-line').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Target Punt', exact: true }).click();
  await page.getByRole('button', { name: 'Punt east', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
};
try {
  for (const touch of [false, true]) await check(`declared Punt exposes an independent targeting companion (${touch ? 'touch' : 'desktop'})`, {
    ...view, actions: [action('declarePunt', 'declare-punt', { playerId: actor.id }, 'Punt')],
    playerActionMenu: [{ playerId: actor.id, kind: 'declarePunt', spent: false }]
  }, async page => {
    await page.locator('[data-player-id="actor"]').click();
    const targeting = page.getByRole('button', { name: 'Target Punt', exact: true });
    assert.equal(await targeting.count(), 0, 'Targeting appears only after declaration');
    await page.getByRole('button', { name: 'Punt', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
    assert.deepEqual(await intents(page), [{ operation: 'action', fields: { actionId: 'declare-punt' } }]);
    await page.evaluate(state => window.publishRoundup(state), puntState(2, 7));
    await targeting.waitFor();
    assert.equal(await page.getByRole('button', { name: 'Punt', exact: true }).isDisabled(), true);
    assert.equal(await targeting.isEnabled(), true);
    assert.equal(await targeting.evaluate(button => button.previousElementSibling?.getAttribute('aria-label')), 'Punt');
    assert.equal(await targeting.getAttribute('class'), 'jump-companion');
    assert.equal(await targeting.locator('[data-action-icon="puntTarget"]').count(), 1);
    const geometry = await targeting.evaluate(button => {
      const css = getComputedStyle(button);
      return { width: button.offsetWidth, height: button.offsetHeight, radius: css.borderRadius };
    });
    assert.deepEqual(geometry, { width: touch ? 44 : 30, height: touch ? 44 : 30, radius: '2px' });
    await targeting.click();
    assert.equal(await targeting.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.live-push-choice').count(), 4);
    assert.equal(await page.getByRole('button', { name: 'Confirm', exact: true }).isDisabled(), true);
    await targeting.click();
    assert.equal(await page.locator('.live-push-choice').count(), 0);
    await targeting.click();
    await page.getByRole('button', { name: 'Punt east', exact: true }).click();
    assert.equal((await intents(page)).length, 1, 'Selecting targeting and direction sends no native action');
    await page.screenshot({ path: `${evidence}/punt-target-${touch ? 'touch' : 'desktop'}.png` });
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    assert.deepEqual((await intents(page))[1], { operation: 'action', fields: { actionId: '2:punt:east' } });
  }, touch ? { hasTouch: true, viewport: { width: 1024, height: 768 } } : {});
  await check('custom resource and player help has no duplicate native tooltip', { ...view, homeRerolls: 1, awayRerolls: 1 }, async page => {
    const resource = page.locator('.live-resource').first();
    await resource.hover();
    assert.equal(await resource.getAttribute('title'), null);
    assert.equal(await page.locator('.live-resource-tooltip').first().isVisible(), true);
    assert.equal(await page.locator('.live-resource-tooltip').first().evaluate(tooltip => {
      const debug = [...document.querySelectorAll('button')].find(button => button.textContent === 'Debug');
      const a = tooltip.getBoundingClientRect(), b = debug.getBoundingClientRect();
      const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom);
      if (right <= left || bottom <= top) throw Error('Fixture must overlap resource tooltip and Debug');
      tooltip.style.pointerEvents = 'auto';
      try { return tooltip.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2)); }
      finally { tooltip.style.removeProperty('pointer-events'); }
    }), true, 'Resource tooltip must paint above the overlapping Debug control');
    assert.equal(await page.locator('.live-marker[title]').count(), 0);
    await assertTopLayer(page.locator('.live-resource-tooltip').first());
    await page.screenshot({ path: `${evidence}/tooltip.png` });
    await page.locator('[data-player-id="actor"]').hover();
    const card = page.locator('.live-player-hover'); await card.waitFor();
    await assertTopLayer(card);
    await page.screenshot({ path: `${evidence}/tooltip-player.png` });
    const awayResource = page.locator('.live-resources.away .live-resource').first();
    await awayResource.focus();
    const awayHelp = page.locator('.live-resources.away .live-resource-tooltip').first();
    await awayHelp.waitFor(); await assertTopLayer(awayHelp);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const bounds = document.querySelector('.live-resources.away .live-resource-tooltip').getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
    });
    await page.keyboard.press('Escape');
    assert.equal(await awayHelp.isVisible(), false);
  });
  await check('Jump Up selects, changes and cancels a target before one Confirm', {
    ...view, players: [{ ...actor, state: 'is prone', skills: ['Jump Up'] }, enemy, other],
    actions: [action('jumpUpBlock', 'jump-enemy', { playerId: enemy.id }), action('jumpUpBlock', 'jump-other', { playerId: other.id })]
  }, async page => {
    await page.locator('[data-player-id="actor"]').click();
    const mode = page.getByRole('button', { name: 'Jump Up', exact: true });
    await mode.click();
    assert.equal(await page.getByRole('button', { name: 'Confirm', exact: true }).isDisabled(), true);
    await page.locator('[data-player-id="enemy"]').click();
    await page.locator('[data-player-id="other"]').click();
    assert.deepEqual(await intents(page), []);
    await page.screenshot({ path: `${evidence}/jump-up.png` });
    await page.locator('.live-pitch-scene').click({ button: 'right', position: await squarePosition(page, 10, 10) });
    assert.equal(await mode.getAttribute('aria-pressed'), 'false');
    await mode.click(); await page.locator('[data-player-id="other"]').click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    assert.deepEqual(await intents(page), [{ operation: 'action', fields: { actionId: 'jump-other' } }]);
  });
  const jumpFixture = JSON.parse(readFileSync(new URL('./fixtures/roundup5-jump-preview.json', import.meta.url), 'utf8'));
  const jumpReady = decodeSetupStateValue(jumpFixture.ready);
  const jumpActions = jumpReady.actions.filter(action => action.kind === 'jumpUpBlock');
  assert.ok(jumpActions.length >= 2, 'Native fixture offers alternate Jump Up targets');
  for (const touch of [false, true]) await check(`native Jump Up block assists and dice (${touch ? 'touch' : 'desktop'})`, jumpReady, async page => {
    await page.locator(`[data-player-id="${jumpActions[0].sourcePlayerId}"]`).click();
    await page.getByRole('button', { name: 'Jump Up', exact: true }).click();
    assert.equal(await page.locator('[data-block-marker]').count(), 0);
    assert.equal(await page.locator('.block-die.potential').count(), 0);
    for (const action of jumpActions.slice(0, 2)) {
      const target = action.target.playerId;
      const roll = jumpReady.blockPreview.rolls.find(roll => roll.playerId === action.sourcePlayerId && roll.targetPlayerId === target);
      assert.ok(roll?.highlight, 'Native preview supplies dice and assist metadata');
      await page.locator(`[data-player-id="${target}"]`).click();
      await page.waitForFunction(({ target, dice }) => document.querySelector('[data-block-layer="assists"]')?.getAttribute('data-block-target') === target
        && document.querySelectorAll('.block-die.potential').length === Math.abs(dice), { target, dice: roll.dice });
      for (const [kind, assists] of [['offense', roll.highlight.offensiveAssists], ['defense', roll.highlight.defensiveAssists]])
        assert.deepEqual(await page.locator(`[data-block-marker="${kind}"]`).evaluateAll(markers => markers.map(marker => marker.dataset.blockContributor).sort()),
          assists.map(assist => assist.playerId).sort());
      assert.equal((await page.locator('.block-dice-surface').getAttribute('class')).includes('uphill'), roll.dice < 0);
      await page.screenshot({ path: `${evidence}/jump-up-preview-${touch ? 'touch' : 'desktop'}-${roll.dice < 0 ? 'uphill' : 'assists'}.png` });
    }
    assert.deepEqual(await intents(page), [], 'Previewing and changing targets does not declare a block');
    await page.getByRole('button', { name: 'Jump Up', exact: true }).click();
    assert.equal(await page.locator('[data-block-marker]').count(), 0);
    assert.equal(await page.locator('.block-die.potential').count(), 0);
    await page.getByRole('button', { name: 'Jump Up', exact: true }).click();
    await page.locator(`[data-player-id="${jumpActions[0].target.playerId}"]`).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    assert.deepEqual(await intents(page), [{ operation: 'action', fields: { actionId: jumpActions[0].id } }]);
  }, touch ? { hasTouch: true, viewport: { width: 1024, height: 768 } } : {});
  await check('Jump Up proposed assists and dice remain private to the acting coach', decodeSetupStateValue(jumpFixture.spectator, true), async page => {
    assert.equal(await page.locator('[data-block-marker]').count(), 0);
    assert.equal(await page.locator('.block-die.potential').count(), 0);
  });
  await check('Punt cardinal choice is local and right-click preserves a planned route', puntState(1, 7), async page => {
    await page.locator('[data-player-id="actor"]').click();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await page.locator('.live-pitch-scene').click({ position: await squarePosition(page, 9, 7) });
    await page.locator('.live-route-line').waitFor({ state: 'attached' });
    const path = await page.locator('.live-route-line').getAttribute('d');
    const mode = page.getByRole('button', { name: 'Target Punt', exact: true });
    await mode.click();
    assert.equal(await page.locator('.live-push-choice').count(), 4);
    await page.getByRole('button', { name: 'Punt north', exact: true }).click();
    assert.deepEqual(await intents(page), []);
    await page.screenshot({ path: `${evidence}/punt.png` });
    await page.locator('.live-pitch-scene').click({ button: 'right', position: await squarePosition(page, 10, 10) });
    assert.equal(await page.locator('.live-push-choice').count(), 0);
    assert.equal(await page.locator('.live-route-line').getAttribute('d'), path);
    await mode.click(); await page.getByRole('button', { name: 'Punt east', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    assert.equal((await intents(page))[0].operation, 'route');
    await page.evaluate(state => window.publishRoundup(state), puntState(2, 9));
    await page.waitForFunction(() => window.roundupIntents.length === 2);
    assert.equal((await intents(page))[1].fields.actionId, '2:punt:east');
  });
  await check('Punt does not execute after movement ends the activation', puntState(1, 7), async page => {
    await planPunt(page);
    await page.evaluate(state => window.publishRoundup(state), { ...puntState(2, 8), activePlayerId: null, actions: [] });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await intents(page)).length, 1);
    await page.evaluate(state => window.publishRoundup(state), puntState(3, 9));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await intents(page)).length, 1, 'Later movement cannot revive a cancelled Punt');
  });
  await check('Punt waits for an interrupted movement choice before executing', puntState(1, 7), async page => {
    await planPunt(page);
    await page.evaluate(state => window.publishRoundup(state), { ...puntState(2, 8),
      actions: [action('reroll', 'reroll', null, 'Use team reroll')] });
    await page.getByRole('button', { name: 'Use team reroll', exact: true }).waitFor();
    assert.equal((await intents(page)).length, 1);
    await page.evaluate(state => window.publishRoundup(state), { ...puntState(3, 8), actor: 'away', turn: view.turn + 1,
      reaction: { id: 'opponent-reaction', actor: 'away', title: 'Shadowing', expiresAt: Date.now() + 30000, serverNow: Date.now() }, actions: [] });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await intents(page)).length, 1, 'An opposing reaction must not dispatch the pending Punt');
    await page.evaluate(state => window.publishRoundup(state), puntState(4, 9));
    await page.waitForFunction(() => window.roundupIntents.length === 2);
    assert.equal((await intents(page))[1].fields.actionId, '4:punt:east');
  });
  await check('Pile Driver offers Use and Decline through normal optional skill UI', {
    ...view, activePlayerId: actor.id, actions: [
      action('pileDriver', 'pile-use', { playerId: enemy.id }, 'Use Pile Driver'),
      action('pileDriver', 'pile-decline', null, 'Decline Pile Driver')
    ]
  }, async page => {
    await page.getByRole('button', { name: 'Use Pile Driver', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Decline Pile Driver', exact: true }).click();
    assert.deepEqual(await intents(page), [{ operation: 'action', fields: { actionId: 'pile-decline' } }]);
  });
  for (const callerRole of ['home', 'away', 'spectator']) await check(`kick cursor ownership: ${callerRole}`, {
    ...view, callerRole, phase: 'READY_FOR_KICKOFF', ball: null, ballState: { version: 1, inPlay: false, moving: false, carrierPlayerId: null },
    actions: [action('kickoff', 'kick', { x: 18, y: 7 }, 'Place kick')]
  }, async page => {
    const square = await squarePosition(page, 18, 7);
    const bounds = await page.locator('.live-pitch-scene').boundingBox();
    await page.mouse.move(bounds.x + square.x, bounds.y + square.y);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator('.live-ball-marker').count(), callerRole === 'home' ? 1 : 0);
  });
} finally { await browser.close(); await server.close(); }
if (failures.length) throw new AggregateError(failures, 'Roundup 5 action regressions');
