import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const evidence = process.env.THREAT_EVIDENCE_DIR;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });

function state(role) {
  const other = role === 'home' ? 'away' : 'home';
  const player = (id, role, x, y, skills = []) => ({ ...base.players[0], id, name: id, role, x, y, skills, state: 'is standing', status: 'Standing', offPitch: 'pitch' });
  const players = [player('friendly', role, 9, 7), player('tail', other, 12, 6, ['Prehensile Tail', 'Tackle']),
    player('tentacles', other, 12, 7, ['Tentacles']), player('diving', other, 12, 8, ['Diving Tackle']),
    player('shadowing', other, 10, 6, ['Shadowing', 'Tackle']), player('armbar', other, 15, 7, ['Arm Bar'])];
  const view = { ...base, callerRole: role, actor: role, phase: 'PLAY', turnMode: 'REGULAR', players,
    activePlayerId: null, actions: [], prompt: null, ball: null,
    threats: { version: 1, eligiblePlayerIds: ['friendly'], zonePlayerIds: players.map(player => player.id) } };
  for (const key of ['passing', 'movementForecast', 'ballState', 'kickoff']) delete view[key];
  return view;
}
try {
  for (const role of ['home', 'away']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const view = state(role);
    await page.addInitScript(view => {
      window.threatState = view; window.threatIntents = [];
      window.threatRange = { rangeVersion: 2, playerId: 'friendly', from: { x: 9, y: 7 }, remaining: 8, normalRemaining: 6,
        normal: [{ x: 10, y: 7 }], full: [{ x: 10, y: 7 }, { x: 11, y: 7 }], revision: view.revision };
    }, view);
    await page.route('**/threat-test', route => route.fulfill({ contentType: 'text/html', body:
      '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/threat-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/threat-test`);
    const select = async () => { const marker = page.locator('[data-player-id="friendly"]'); await marker.focus(); await page.keyboard.press('Enter'); };
    await page.locator('.coach-match').waitFor(); await select();
    const overlap = page.locator('[data-threat-square="11,7"]');
    await overlap.waitFor(); assert.equal(await overlap.getAttribute('data-threat-count'), '4');
    assert.ok(await page.locator('[data-threat-count="1"]').count());
    assert.ok(await page.locator('[data-threat-count="2"]').count());
    assert.ok(await page.locator('[data-threat-count="3"]').count());
    assert.equal(await page.locator('[data-threat-square="12,7"]').count(), 0, 'Occupied squares remain clear');
    assert.equal(await page.locator('[data-threat-square="15,8"]').getAttribute('data-threat-striped'), 'false', 'Arm Bar does not stripe');
    await page.getByRole('button', { name: 'Debug', exact: true }).click();
    for (const projection of ['Top-down view', 'Perspective view']) {
      await page.getByRole('button', { name: projection, exact: true }).click();
      const squareCenter = await squarePosition(page, 11, 7);
      const symbols = await overlap.evaluate(element => {
        const tackle = element.querySelector('[data-tackle-warning] path'), letter = element.querySelector('[data-tackle-warning] text');
        const rush = document.querySelector('[data-rush-warning="11,7"] path');
        const rushMark = document.querySelector('[data-rush-warning="11,7"] text');
        const separator = element.querySelector('[data-warning-separator]');
        const t = tackle.getBBox(), r = rush.getBBox();
        const s = separator.getBBox();
        return { white: getComputedStyle(tackle).stroke, hollow: getComputedStyle(tackle).fill,
          red: getComputedStyle(letter).fill, text: letter.textContent, different: t.x !== r.x || t.y !== r.y,
          separator: separator.textContent, centers: [rushMark, separator, letter].map(mark =>
            ({ x: Number(mark.getAttribute('x')), y: Number(mark.getAttribute('y')) })),
          separate: r.x + r.width < s.x && s.x + s.width < t.x,
          fills: element.querySelectorAll('.live-threat-fill').length,
          opacity: [...element.querySelectorAll('.live-threat-fill')].map(fill => getComputedStyle(fill).fillOpacity),
          pointer: getComputedStyle(element.closest('.live-threats')).pointerEvents };
      });
      assert.match(symbols.white, /^rgba\(255, 255, 255, 0\.85/); assert.equal(symbols.hollow, 'none');
      assert.equal(symbols.red, 'rgb(242, 70, 70)'); assert.equal(symbols.text, 'T'); assert.equal(symbols.different, true);
      assert.equal(symbols.separator, '/'); assert.equal(symbols.separate, true, 'The slash fits between both markers');
      const [rushCenter, separatorCenter, tackleCenter] = symbols.centers;
      assert.ok(Math.abs(separatorCenter.x - squareCenter.x) < .1 && Math.abs(separatorCenter.y - squareCenter.y) < .1);
      assert.ok(Math.abs((rushCenter.x + tackleCenter.x) / 2 - squareCenter.x) < .1, 'The marker pair is centered on the square');
      assert.equal(rushCenter.y, separatorCenter.y); assert.equal(tackleCenter.y, separatorCenter.y);
      assert.equal(symbols.fills, 8); assert.ok(symbols.opacity.every(alpha => alpha === '0.5')); assert.equal(symbols.pointer, 'none');
      if (evidence) await page.screenshot({ path: resolve(evidence, `${role}-${projection.startsWith('Top') ? 'top' : 'perspective'}.png`) });
    }
    await page.getByRole('button', { name: 'Debug', exact: true }).click();
    const open = async () => { await page.getByRole('button', { name: 'Game Menu', exact: true }).click(); await page.getByRole('tab', { name: 'Game Settings', exact: true }).click(); };
    const menu = page.getByRole('dialog', { name: 'Game Menu', exact: true });
    const checkbox = name => menu.getByRole('checkbox', { name, exact: true });
    await open(); assert.equal(await menu.getByRole('checkbox').count(), 8);
    assert.ok((await menu.getByRole('checkbox').all()).length);
    for (const control of await menu.getByRole('checkbox').all()) assert.equal(await control.isChecked(), true);
      const controlSizes = await menu.getByRole('checkbox').evaluateAll(controls => controls.map(control => {
        const box = control.getBoundingClientRect(); const label = control.parentElement.getBoundingClientRect();
        return [box.width, box.height, label.height];
      }));
      assert.ok(controlSizes.every(([width, height, row]) => width === 16 && height === 16 && row <= 36),
        `Settings use compact inline checkboxes: ${JSON.stringify(controlSizes)}`);
    await checkbox('Tackle-zone colors').uncheck();
    assert.equal(await page.locator('.live-threat-fill').count(), 0); assert.ok(await page.locator('.live-threat-hatch').count());
    assert.ok(await page.locator('[data-tackle-warning]').count());
    if (evidence) { await page.keyboard.press('Escape'); await page.screenshot({ path: resolve(evidence, `${role}-neutral-hatching.png`) }); await open(); }
    await checkbox('Other-skill markings').uncheck(); assert.equal(await page.locator('.live-threat-hatch').count(), 0);
    const pairedCenter = await page.locator('[data-warning-separator="11,7"]').evaluate(element =>
      [Number(element.getAttribute('x')), Number(element.getAttribute('y'))]);
    await checkbox('Tackle warnings').uncheck(); assert.equal(await page.locator('[data-threat-square]').count(), 0);
    assert.equal(await page.locator('[data-warning-separator]').count(), 0);
    assert.deepEqual(await page.locator('[data-rush-warning="11,7"] text').evaluate(element =>
      [Number(element.getAttribute('x')), Number(element.getAttribute('y'))]), pairedCenter, 'Disabling Tackle recenters the lone rushing marker');
    await checkbox('Other-skill markings').check();
    for (const name of ['Prehensile Tail', 'Diving Tackle', 'Tentacles', 'Shadowing']) await checkbox(name).uncheck();
    assert.equal(await page.locator('[data-threat-square]').count(), 0);
    await checkbox('Tentacles').check(); assert.ok(await page.locator('.live-threat-hatch').count());
    await checkbox('Show opposing player threats').uncheck(); assert.equal(await page.locator('[data-threat-square]').count(), 0);
    await checkbox('Show opposing player threats').check(); assert.ok(await page.locator('.live-threat-hatch').count());
    await page.reload(); await page.locator('.coach-match').waitFor(); await select(); await open();
    assert.equal(await checkbox('Tackle-zone colors').isChecked(), false); assert.equal(await checkbox('Tentacles').isChecked(), true);
    assert.equal(await checkbox('Shadowing').isChecked(), false); assert.ok(await page.locator('.live-threat-hatch').count());
    for (const control of await menu.getByRole('checkbox').all()) await control.check();
    for (const [width, height] of [[1237, 617], [640, 330], [375, 300]]) {
      await page.setViewportSize({ width, height });
        await menu.evaluate(element => element.scrollTop = 0);
      assert.equal(await menu.evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth
        && box.top >= 0 && box.bottom <= innerHeight && element.scrollWidth <= element.clientWidth; }), true);
      assert.equal(await menu.locator('.threat-settings label').evaluateAll(labels => labels.every(label => getComputedStyle(label).fontFamily.includes('MUTP'))), true);
      if (evidence) await page.screenshot({ path: resolve(evidence, `${role}-settings-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw Error('Denied'); }; });
    await checkbox('Shadowing').uncheck(); await page.keyboard.press('Escape'); await open();
    assert.equal(await checkbox('Shadowing').isChecked(), false, 'Storage denial preserves this session');
    await checkbox('Shadowing').check(); await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => window.threatIntents), []);
    for (const [patch, connected, pending] of [[{}, false, null], [{}, true, 'pending'], [{ phase: 'SETUP' }, true, null],
      [{ phase: 'FULL_TIME' }, true, null], [{ callerRole: 'spectator' }, true, null],
      [{ actor: role === 'home' ? 'away' : 'home' }, true, null], [{ turnMode: 'QUICK_SNAP' }, true, null],
      [{ saveResume: { status: 'SUSPENDED', proposalId: null, proposer: null, expiresAt: null } }, true, null],
      [{ saveResume: { status: 'RESUME_PENDING', proposalId: 'resume', proposer: role, expiresAt: Date.now() + 60000 } }, true, null],
      [{ threats: { ...view.threats, eligiblePlayerIds: [] } }, true, null], [{ threats: undefined }, true, null]]) {
      await page.evaluate(({ state, connected, pending }) => window.publishThreat(state, connected, pending), { state: { ...view, ...patch }, connected, pending });
      await page.waitForFunction(() => !document.querySelector('[data-threat-square]'));
    }
    for (const patch of [{ activePlayerId: 'friendly' }, { turnMode: 'BLITZ' }, { turnMode: 'KICKOFF', kickoff: {
      version: 1, event: 'CHARGE', actor: role, stage: 'selection', allowed: 2, selected: 0, completed: 0,
    } }]) {
      await page.evaluate(state => window.publishThreat(state), { ...view, ...patch }); await select(); await overlap.waitFor();
    }
    // Both Charge selection paths retain the inspected participant, and deselection
    // clears it. Each click still sends only its existing native action.
    await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
    const charge = { ...view, turnMode: 'KICKOFF', kickoff: { version: 1, event: 'CHARGE', actor: role, stage: 'selection', allowed: 2, selected: 0, completed: 0 },
      actions: [{ id: 'event:event-pick:friendly', label: 'Select friendly', actor: role, kind: 'kickoffChoice', target: { playerId: 'friendly' }, sourcePlayerId: null }] };
    const deselect = { ...charge, actions: [{ ...charge.actions[0], label: 'Deselect friendly' }] };
    await page.evaluate(state => window.publishThreat(state), charge); await select(); await overlap.waitFor();
    await page.evaluate(state => window.publishThreat(state), deselect); await select();
    await page.waitForFunction(() => !document.querySelector('[data-threat-square]'));
    await page.evaluate(state => window.publishThreat(state), charge);
    await page.getByRole('button', { name: 'Select friendly', exact: true }).click(); await overlap.waitFor();
    await page.evaluate(state => window.publishThreat(state), deselect);
    await page.getByRole('button', { name: 'Deselect friendly', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-threat-square]'));
    await page.evaluate(state => window.publishThreat(state), charge);
    await page.getByRole('button', { name: 'Select friendly', exact: true }).click(); await overlap.waitFor();
    assert.deepEqual(await page.evaluate(() => window.threatIntents), Array(5).fill({ operation: 'action', fields: { actionId: 'event:event-pick:friendly' } }));
    const fullCharge = { ...deselect, kickoff: { ...charge.kickoff, allowed: 1, selected: 1 },
      players: [...charge.players, { ...charge.players[0], id: 'unoffered', name: 'unoffered', x: 7, y: 7 }] };
    await page.evaluate(state => window.publishThreat(state), fullCharge);
    await page.locator('[data-player-id="unoffered"]').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('[data-threat-square]'));
    assert.equal(await page.evaluate(() => window.threatIntents.length), 5, 'Inspecting an unoffered Charge candidate sends no pick');
    await page.evaluate(state => window.publishThreat(state), view); await select(); await overlap.waitFor();
    await page.locator('.live-pitch-viewport').focus(); await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-threat-square]'));
    assert.deepEqual(errors, []); await context.close();
  }
  console.log('PASS: threats and settings, both coaches/projections, four overlap bands, independent skill toggles, persistence/storage denial, five-tab narrow layouts, eligibility/Charge, clear selection and no extra gameplay commands.');
} finally { await browser.close(); await server.close(); }
