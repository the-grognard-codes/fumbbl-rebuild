import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const failures = [];
try {
  for (const kind of ['coin', 'receive', 'setup', 'kickoff', 'action', 'injury']) {
    const phase = ['coin', 'receive'].includes(kind) ? 'PRE_MATCH' : kind === 'setup' ? 'SETUP' : kind === 'kickoff' ? 'READY_FOR_KICKOFF' : 'PLAY';
    const view = { ...base, revision: 0, phase, actor: 'home', callerRole: 'home',
      actions: kind === 'action' ? base.actions : kind === 'injury'
        ? ['old', 'new'].map(outcome => ({ id: `0:injury:${outcome}`, kind: 'apothecary', actor: 'home', label: `Keep ${outcome} injury`, target: null })) : [], activePlayerId: null,
      turnMode: kind === 'setup' ? 'SETUP' : kind === 'kickoff' ? 'KICKOFF' : 'REGULAR',
      prompt: ['coin', 'receive'].includes(kind) ? { id: `prompt-${kind}`, actor: 'home', kind,
        options: kind === 'coin' ? ['heads', 'tails'] : ['receive', 'kick'] } : null };
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.addInitScript(view => { window.hudState = view; window.hudIntents = []; window.hudMessages = []; }, view);
      await page.route('**/concession-test', route => route.fulfill({ contentType: 'text/html', body:
        '<div id="app"></div><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/concession-test`);
      const decision = page.getByRole('dialog', { name: 'Match decision', exact: true });
      if (['coin', 'receive', 'injury'].includes(kind)) {
        await decision.waitFor();
        await page.keyboard.press('Escape');
        assert.equal(await decision.isVisible(), true, 'Escape cannot discard a mandatory decision');
      }
      const opener = page.getByRole('button', { name: 'Game Menu', exact: true });
      await opener.click({ timeout: 2000 });
      const menu = page.getByRole('dialog', { name: 'Game Menu', exact: true });
      if (['coin', 'receive', 'injury'].includes(kind)) {
        await menu.getByRole('button', { name: 'Close Game Menu', exact: true }).click();
        const option = decision.getByRole('button').first();
        await option.focus(); await page.keyboard.press('Enter');
        assert.equal((await page.evaluate(() => window.hudIntents))[0].operation, kind === 'injury' ? 'action' : 'choice');
        await page.evaluate(view => { window.publishHud(view); window.hudIntents = []; }, view);
        await opener.focus(); await page.keyboard.press('Enter');
        await menu.waitFor();
      }
      await menu.getByRole('button', { name: 'Concede match', exact: true }).click();
      await menu.getByRole('button', { name: 'Confirm concession', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.hudIntents), [{ operation: 'concede', fields: undefined }]);
      const terminal = { ...view, revision: 1, phase: 'FULL_TIME', turnMode: 'END_GAME', prompt: null, actions: [] };
      await page.evaluate(view => window.publishHud(view), terminal);
      await menu.getByRole('button', { name: 'Concede match', exact: true }).waitFor();
      assert.equal(await menu.getByRole('button', { name: 'Concede match', exact: true }).isDisabled(), true);
      console.log(`PASS concession during ${kind}`);
    } catch (error) {
      failures.push(`${kind}: ${error.message}`);
      console.error(`FAIL concession during ${kind}: ${error.message}`);
    } finally { await page.close(); }
  }
  assert.deepEqual(failures, []);
} finally { await browser.close(); await server.close(); }
