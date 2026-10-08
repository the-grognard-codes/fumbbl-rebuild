import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Presentation evidence only. All game actions are recorded locally and must remain empty.
const journey = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const state = { ...journey[0].actor, homeTeamName: 'Tusk Love', awayTeamName: "Bugman's Best",
  saveResume: { status: 'ACTIVE', proposalId: null, proposer: null, expiresAt: null } };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const evidence = process.env.MENU_EVENTS_EVIDENCE_DIR;
try {
  const page = await browser.newPage({ viewport: { width: 1237, height: 617 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, state);
  await page.route('**/menu-events-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/menu-events-test`);
  await page.locator('.coach-match').waitFor(); await page.evaluate(() => document.fonts.ready);
  if (evidence) await mkdir(evidence, { recursive: true });
  const menu = page.getByRole('dialog', { name: 'Game Menu', exact: true });
  const opener = page.getByRole('button', { name: 'Game Menu', exact: true });
  for (const [width, height] of [[1237,617], [640,330], [375,300]]) {
    await page.setViewportSize({ width, height });
    await opener.click();
    assert.equal(await menu.getByRole('button', { name: 'Close Game Menu' }).evaluate(element => element === document.activeElement), true);
    for (const tab of ['Game Options', 'Interface', 'Key Bindings', 'Game Log']) {
      const selected = menu.getByRole('tab', { name: tab, exact: true });
      await selected.click();
      assert.equal(await selected.getAttribute('aria-selected'), 'true');
      assert.deepEqual(await menu.evaluate(element => {
        const css = getComputedStyle(element);
        return [css.backgroundColor, css.borderTopColor, css.color];
      }), ['rgba(9, 23, 38, 0.95)', 'rgb(66, 108, 155)', 'rgb(217, 233, 247)']);
      assert.equal(await menu.locator('h2,h3,button,.game-menu-content > section > p,.match-log-settings label').evaluateAll(elements =>
        elements.every(element => getComputedStyle(element).fontFamily.includes('MUTP'))), true, `${tab}: MUTP typography`);
      assert.equal(await selected.evaluate(element => getComputedStyle(element).color), 'rgb(73, 230, 255)');
      assert.equal(await menu.evaluate(element => {
        const box = element.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
          && element.scrollWidth <= element.clientWidth;
      }), true, `${tab}: dialog fits and scrolls vertically in short viewports`);
      if (evidence) await page.screenshot({ path: `${evidence}/menu-${tab.replaceAll(' ', '-').toLowerCase()}-${width}-${height}.png` });
    }
    for (const [size, pixels] of [['Small',12], ['Medium',14], ['Large',18]]) {
      await menu.getByRole('button', { name: `${size} log text` }).click();
      assert.equal(await menu.locator('.match-event-scroll').evaluate(element => parseFloat(getComputedStyle(element).fontSize)), pixels);
    }
    const close = menu.getByRole('button', { name: 'Close Game Menu' });
    await close.focus(); await page.keyboard.press('Shift+Tab');
    assert.equal(await menu.getByRole('checkbox', { name: 'Roll modifiers', exact: true }).evaluate(element => element === document.activeElement), true, 'Focus wraps to the final Game Log setting inside menu');
    await page.keyboard.press('Tab');
    assert.equal(await close.evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await menu.count(), 0);
    assert.equal(await opener.evaluate(element => element === document.activeElement), true, 'Closing restores opener focus');
  }
  await page.setViewportSize({ width: 1237, height: 617 });
  const banner = page.getByRole('status', { name: 'Current game step' });
  for (const callerRole of ['home', 'away', 'spectator']) {
    const view = { ...state, callerRole, actions: [] };
    for (const [phase, turnMode, title] of [['SETUP','REGULAR','Team setup'], ['READY_FOR_KICKOFF','KICKOFF','Kickoff!'],
      ['PLAY','QUICK_SNAP','Quick Snap!'], ['PLAY','CHARGE','Charge!'], ['PLAY','HIGH_KICK','High Kick!'],
      ['PLAY','SOLID_DEFENCE','Solid Defence!'], ['PLAY','TOUCHBACK','Touchback!']]) {
      await page.evaluate(view => window.publishHud(view), { ...view, phase, turnMode });
      await page.waitForFunction(title => document.querySelector('.match-game-step strong')?.textContent === title, title);
      assert.match(await banner.textContent(), new RegExp(title.replace('!', '\\!')));
    }
    await page.evaluate(view => window.publishHud(view), { ...view, turnMode: 'SELECT_BLITZ_TARGET', activePlayerId: view.players[0].id });
    await banner.waitFor({ state: 'detached' });
    await page.evaluate(view => window.publishHud(view), { ...journey[8].actor, callerRole,
      kickoff: { version: 1, event: 'CHARGE', actor: 'home', stage: 'movement', allowed: 2, completed: 0, selected: 2 } });
    await banner.waitFor({ state: 'detached' });
    if (callerRole === 'home') {
      const decision = page.getByRole('dialog', { name: 'Match decision', exact: true });
      await decision.waitFor();
      assert.equal(await decision.getByRole('button', { name: 'Yes', exact: true }).isEnabled(), true, 'Dedicated follow-up remains available');
      assert.equal(await decision.getByRole('button', { name: 'No', exact: true }).isEnabled(), true);
    }
  }
  await page.evaluate(state => window.publishHud({ ...state, phase: 'PRE_MATCH', actions: [],
    prompt: { id: 'coin', actor: 'home', kind: 'coin', options: ['heads','tails'] } }), state);
  await banner.waitFor({ state: 'detached' });
  const coin = page.getByRole('dialog', { name: 'Match decision', exact: true });
  await coin.waitFor();
  assert.equal(await coin.getByRole('button', { name: 'Heads', exact: true }).isEnabled(), true, 'Coin toss uses its dedicated prompt');
  await page.evaluate(state => window.publishHud({ ...state, callerRole: 'spectator', actions: [] }), state);
  await opener.click(); await menu.getByRole('tab', { name: 'Game Options', exact: true }).click();
  assert.equal(await menu.getByRole('button', { name: 'Request Match Pause', exact: true }).isDisabled(), true);
  assert.equal(await menu.getByRole('button', { name: 'Concede match', exact: true }).isDisabled(), true);
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Presentation checks submitted no game actions');
  assert.deepEqual(errors, []);
  console.log('PASS: MUTP menu across four tabs/three viewports, keyboard focus, log sizes and disabled actions; setup/kickoff-only broadcasts with intact dedicated decisions.');
} finally { await browser.close(); await server.close(); }
