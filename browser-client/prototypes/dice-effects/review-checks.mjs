// Visual-review evidence runner, not a production gameplay regression suite.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startDiceReview } from './serve.mjs';

const evidence = fileURLToPath(new URL('../../../.notes/art-preview/dice-effects/', import.meta.url));
await mkdir(evidence, { recursive: true });
const server = await startDiceReview(0);
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    const address = `http://127.0.0.1:${server.httpServer.address().port}/pitch-preview`;
    await page.goto(`${address}?variant=MUTP`);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('[data-outcome-tile]').count(), 9);
    assert.equal(await page.locator('.pitch-rolls>.dice-group').count(), 3);
    await page.getByRole('checkbox', { name: 'Show preceding rolls' }).uncheck();
    const time = async value => {
      await page.locator('#review-time').evaluate((element, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(element, String(value)); element.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
      await page.waitForFunction(value => Math.abs(Number.parseFloat(document.querySelector('main').style.getPropertyValue('--elapsed')) - value) < 1, value);
    };
    const opacity = selector => page.locator(selector).first().evaluate(el => Number(getComputedStyle(el).opacity));
    for (const variant of ['MUTP', 'RESULT']) {
      await page.getByRole('button', { name: variant === 'MUTP' ? 'MUTP blue · navy · yellow' : 'Colors by outcome', exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('variant'), variant);
      await page.getByRole('button', { name: 'Entrance midpoint', exact: true }).click();
      assert.ok(Math.abs(await opacity('.pitch-rolls .review-arrival') - .5) < .06, 'entrance is halfway visible at 25 ms');
      assert.equal(await opacity('.pitch-rolls .outcome-reveal'), 0, 'outcome is hidden before settling');
      await time(500);
      const earlyArmor = await page.locator('[data-outcome-tile=armor] .armor-left').first().evaluate(el => getComputedStyle(el).transform);
      await page.getByRole('button', { name: 'Settled', exact: true }).click();
      assert.equal(await opacity('.pitch-rolls .review-arrival'), 1);
      assert.equal(await opacity('.pitch-rolls .group-exit'), 1);
      assert.equal(await opacity('.pitch-rolls .outcome-reveal'), 1);
      const settledArmor = await page.locator('[data-outcome-tile=armor] .armor-left').first().evaluate(el => getComputedStyle(el).transform);
      assert.notEqual(earlyArmor, settledArmor, 'armor splits before holding its final pose');
      const pulse = await opacity('[data-outcome-tile=bh] .result-pulse');
      await page.screenshot({ path: `${evidence}${variant}-${width}-settled.png`, fullPage: true });
      await page.locator('.match-frame').screenshot({ path: `${evidence}${variant}-${width}-pitch.png` });
      await time(1500);
      assert.equal(await page.locator('[data-outcome-tile=armor] .armor-left').first().evaluate(el => getComputedStyle(el).transform), settledArmor);
      assert.notEqual(await opacity('[data-outcome-tile=bh] .result-pulse'), pulse, 'result gently pulses');
      await page.getByRole('button', { name: 'Exit midpoint', exact: true }).click();
      const exit = await opacity('.pitch-rolls .group-exit');
      assert.ok(exit > 0 && exit < 1, 'dice remain partially visible during evaporation');
      assert.ok(await page.locator('.pitch-rolls .evaporation i').first().evaluate(el => Number(getComputedStyle(el).opacity)) > 0);
      await page.screenshot({ path: `${evidence}${variant}-${width}-evaporating.png` });
      await page.getByRole('button', { name: 'After exit', exact: true }).click();
      assert.equal(await opacity('.pitch-rolls .group-exit'), 0);
      checks.push({ width, variant, outcomes: 9, entrance50ms: true, outcomeAfterSettle: true, exit100ms: true,
        oneShotHolds: true, gentlePulse: true });
    }
    await page.getByLabel('Outcome', { exact: true }).selectOption('ordinary');
    await time(1250);
    assert.equal(await page.locator('.pitch-rolls .polygon-die:not([hidden])').count(), 4);
    await time(1400);
    assert.equal(await opacity('.pitch-rolls .group-exit'), 0, 'ordinary roll expires earlier');
    await page.getByLabel('Outcome', { exact: true }).selectOption('ni');
    await page.getByRole('checkbox', { name: 'Show preceding rolls' }).check();
    assert.equal(await page.locator('.pitch-rolls>.dice-group').count(), 4);
    await time(1300);
    assert.equal(await opacity('.pitch-rolls [data-sample=ni] .outcome-reveal'), 0, 'serious result is not revealed early');
    await time(1900);
    assert.equal(await opacity('.pitch-rolls [data-sample=ni] .outcome-reveal'), 1);
    await page.screenshot({ path: `${evidence}sequence-${width}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('main').classList.contains('static-study'));
    assert.equal(await page.locator('.dice-group').evaluateAll(elements => elements.flatMap(el => el.getAnimations({ subtree: true })).length), 0);
    assert.equal(await page.getByRole('checkbox', { name: 'Static / reduced motion' }).isChecked(), true);
    assert.equal(await page.locator('#review-time').isDisabled(), true);
    await page.screenshot({ path: `${evidence}reduced-motion-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow');
    assert.equal(await page.locator('[role=alert]').count(), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('output').textContent.replace(' ms', '')) > 400);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const frozen = await page.locator('output').textContent();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('output').textContent(), frozen, 'pause freezes clock');
    await time(4350);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('output').textContent.replace(' ms', '')) < 400);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    // Arrow keys switch palettes without stealing input navigation.
    await page.locator('h1').click();
    await page.keyboard.press('ArrowLeft');
    assert.equal(new URL(page.url()).searchParams.get('variant'), 'MUTP');
    await page.reload();
    assert.equal(await page.locator('main').getAttribute('data-variant'), 'MUTP');
    assert.deepEqual(errors, []);
    checks.push({ width, ordinaryShapes: 4, seriousInjuryStage: true, reducedMotion: true, noOverflow: true,
      clockRunsAndPauses: true, loopWraps: true, keyboardAndUrl: true, assetAndPageErrors: [] });
    await page.close();
  }
  await writeFile(`${evidence}review-checks.json`, JSON.stringify({ checks }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', checks, evidence }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
