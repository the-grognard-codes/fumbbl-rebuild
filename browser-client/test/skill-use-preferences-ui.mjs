import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1237, height: 617 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/skill-use-settings-test', route => route.fulfill({ contentType: 'text/html', body:
    '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/skill-use-preferences-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/skill-use-settings-test`);
  await page.addStyleTag({ content: readFileSync(new URL('../../site/src/assets/play.css', import.meta.url), 'utf8') });
  await page.evaluate(() => document.body.classList.add('game-match'));
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Game Menu', exact: true });
  await menu.getByRole('tab', { name: 'Skills & Traits', exact: true }).click();
  const settings = menu.getByRole('region', { name: 'Automatic Skill Use', exact: true });
  await settings.getByRole('radio', { name: 'Always Use', exact: true }).first().waitFor();
  assert.equal(await settings.getByRole('group').count(), 18);
  assert.equal(await settings.getByRole('radio').count(), 36);
  assert.equal(await settings.getByRole('radio', { checked: true }).count(), 18);
  assert.equal(await settings.getByRole('radio', { name: 'Always Ask', exact: true, checked: true }).count(), 6);
  const catchGroup = settings.getByRole('group', { name: 'Catch — catch reroll', exact: true });
  await catchGroup.getByRole('radio', { name: 'Always Ask', exact: true }).click();
  assert.equal(await catchGroup.getByRole('radio', { name: 'Always Use', exact: true }).isChecked(), true, 'Server confirmation controls the displayed selection');
  assert.equal(await settings.getByRole('radio', { disabled: true }).count(), 36);
  await page.evaluate(() => window.skillUseFixture.complete());
  await settings.getByText('Preferences saved.', { exact: true }).waitFor();
  assert.equal(await catchGroup.getByRole('radio', { name: 'Always Ask', exact: true }).isChecked(), true);
  await page.evaluate(() => window.skillUseFixture.failNext());
  await catchGroup.getByRole('radio', { name: 'Always Use', exact: true }).click();
  await page.evaluate(() => window.skillUseFixture.complete());
  await settings.getByRole('alert').waitFor();
  assert.equal(await settings.getByText('Preferences saved.', { exact: true }).count(), 0);
  assert.equal(await catchGroup.getByRole('radio', { name: 'Always Ask', exact: true }).isChecked(), true);
  await settings.getByRole('button', { name: 'Reload skill use preferences' }).click();
  await settings.getByRole('alert').waitFor({ state: 'detached' });
  assert.equal(await menu.getByRole('heading', { name: 'Skill Markers', exact: true }).count(), 1, 'Display settings remain');
  const evidence = process.env.SKILL_USE_EVIDENCE_DIR;
  if (evidence) mkdirSync(evidence, { recursive: true });
  for (const [width, height] of [[1237, 617], [640, 330], [375, 300], [320, 300]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await menu.evaluate(element => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
    }), true, `Settings dialog fits ${width}x${height}`);
    assert.deepEqual(await settings.evaluate(element => [...element.querySelectorAll('*')]
      .filter(child => child.scrollWidth > child.clientWidth + 3 && getComputedStyle(child).overflowX !== 'hidden')
      .map(child => `${child.tagName}:${child.scrollWidth}/${child.clientWidth}`)), [], 'Settings have no horizontal overflow');
    assert.equal(await settings.locator('h3,legend,label,p').evaluateAll(elements => elements.every(element => getComputedStyle(element).fontFamily.includes('MUTP'))), true, 'MUTP theme typography');
    const last = settings.getByRole('group').last().getByRole('radio', { name: 'Always Ask', exact: true });
    await last.focus();
    assert.equal(await last.evaluate(element => element === document.activeElement), true, 'All choices are reachable by keyboard');
    if (evidence) { await settings.getByRole('heading').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${evidence}/automatic-skills-${width}-${height}.png` }); }
  }
  await page.evaluate(() => window.skillUseFixture.spectator());
  await settings.waitFor({ state: 'detached' });
  assert.equal(await menu.getByRole('heading', { name: 'Skill Markers', exact: true }).count(), 1);
  await page.reload();
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await menu.getByRole('tab', { name: 'Skills & Traits', exact: true }).click();
  await settings.waitFor();
  await page.evaluate(() => window.skillUseFixture.replay()); await settings.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.skillUseFixture.requests.some(request => request.type === 'setup')), false);
  console.log('PASS: all 18 account controls, defaults, pending/save/error/reload, spectator/replay exclusion, four responsive MUTP layouts, no gameplay mutation.');
} finally { await browser.close(); await server.close(); }
