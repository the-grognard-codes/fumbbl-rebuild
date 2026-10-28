// Visual-review evidence runner, not a production gameplay regression suite.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startDiceReview } from './serve.mjs';

const evidence = fileURLToPath(new URL('../../../.notes/art-preview/dice-effects-round-two/', import.meta.url));
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
    await page.addInitScript(() => {
      window.nativeSourceEffects = {};
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = animate.apply(this, args);
        const instance = this.closest('.native-review-die')?.dataset.nativeInstance;
        if (instance) window.nativeSourceEffects[`${instance}:${this.classList.contains('block-die-cube') ? 'body' : 'lift'}`] = {
          keyframes: animation.effect.getKeyframes(), timing: animation.effect.getTiming(),
        };
        return animation;
      };
    });
    const address = `http://127.0.0.1:${server.httpServer.address().port}/pitch-preview`;
    await page.goto(`${address}?round=2&variant=MUTP`);
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
    // Native motion is taken from the original component, not the first study's CSS tumble.
    assert.equal(await page.locator('.pitch-rolls .review-tumble,.pitch-rolls .die-arrival').count(), 0);
    await page.getByRole('button', { name: 'Mid tumble', exact: true }).click();
    await page.waitForFunction(() => [...document.getAnimations()].filter(animation => animation.id.startsWith('native-review-'))
      .every(animation => animation.currentTime === 150));
    const fidelity = await page.evaluate(() => [...document.getAnimations()].filter(animation => animation.id.startsWith('native-review-')).map(animation => {
      const effect = animation.effect, target = effect.target;
      const key = `${target.closest('.native-review-die').dataset.nativeInstance}:${target.classList.contains('block-die-cube') ? 'body' : 'lift'}`;
      return { source: window.nativeSourceEffects[key], copy: { keyframes: effect.getKeyframes(), timing: effect.getTiming() } };
    }));
    assert.ok(fidelity.length > 20, 'real native effects are present throughout the study');
    fidelity.forEach(({ source, copy }) => { assert.deepEqual(copy, source); assert.equal(copy.timing.duration, 310); });
    const compareNative = async () => {
      const poses = await page.locator('.motion-options [data-dice-motion=native] .block-die-cube').evaluateAll(elements => elements.map(el => getComputedStyle(el).transform));
      assert.deepEqual(poses.slice(0, 2), poses.slice(2, 4), 'fade does not change the original polygon poses');
    };
    await compareNative();
    await page.locator('.motion-comparison').screenshot({ path: `${evidence}motion-${width}-150ms.png` });
    for (const variant of ['MUTP', 'RESULT']) {
      await page.getByRole('button', { name: variant === 'MUTP' ? 'MUTP blue · navy · yellow' : 'Colors by outcome', exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('variant'), variant);
      await page.getByRole('button', { name: 'Entrance midpoint', exact: true }).click();
      await compareNative();
      assert.equal(await opacity('[data-motion-comparison=baseline] .review-arrival'), 1);
      assert.ok(Math.abs(await opacity('[data-motion-comparison=native] .review-arrival') - .5) < .06);
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
      const centered = await page.locator('[data-outcome-tile] [data-result-label]').evaluateAll(elements => elements.map(element => {
        const box = element.closest('.result-pulse').querySelector('[data-result-box]').getBoundingClientRect();
        const text = element.getBoundingClientRect();
        return { text: element.textContent, dx: (text.left + text.width / 2) - (box.left + box.width / 2),
          dy: (text.top + text.height / 2) - (box.top + box.height / 2) };
      }));
      assert.equal(centered.length, 8);
      centered.forEach(result => { assert.ok(Math.abs(result.dx) < .4, `${result.text} horizontal centering`);
        assert.ok(Math.abs(result.dy) < .4, `${result.text} vertical centering`); });
      await page.screenshot({ path: `${evidence}${variant}-${width}-settled.png`, fullPage: true });
      await page.locator('.match-frame').screenshot({ path: `${evidence}${variant}-${width}-pitch.png` });
      await page.locator('[data-outcome-tile=armor]').screenshot({ path: `${evidence}${variant}-${width}-chainmail.png` });
      await page.locator('[data-outcome-tile=stun]').screenshot({ path: `${evidence}${variant}-${width}-helmet.png` });
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
        oneShotHolds: true, gentlePulse: true, centeredResultLabels: centered });
    }
    await page.getByLabel('Outcome', { exact: true }).selectOption('ordinary');
    await time(1250);
    assert.equal(await page.locator('.pitch-rolls .polygon-die:not([hidden])').count(), 4);
    await time(1400);
    assert.equal(await opacity('.pitch-rolls .group-exit'), 0, 'ordinary roll expires earlier');
    await page.getByLabel('Dice motion', { exact: true }).selectOption('round-one');
    assert.equal(await page.locator('.pitch-rolls .review-tumble').count(), 4);
    assert.equal(await page.locator('.pitch-rolls .native-review-die').count(), 0);
    await page.getByLabel('Dice motion', { exact: true }).selectOption('native');
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
    assert.equal(await page.locator('main').getAttribute('data-round'), '2');
    assert.deepEqual(errors, []);
    checks.push({ width, ordinaryShapes: 4, seriousInjuryStage: true, reducedMotion: true, noOverflow: true,
      clockRunsAndPauses: true, loopWraps: true, keyboardAndUrl: true, nativeEffectCount: fidelity.length,
      originalNativeKeyframesAndTiming: true, identicalNativePoseWithAndWithoutFade: true, roundOneMotionAvailable: true, assetAndPageErrors: [] });
    await page.close();
  }
  const preserved = JSON.parse((await readFile(`${evidence}round-one-preservation.json`, 'utf8')).replace(/^\uFEFF/, ''));
  for (const source of preserved) {
    const content = await readFile(new URL(source.file, import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex').toUpperCase(), source.sha256);
  }
  execFileSync('git', ['diff', '--exit-code', '--', 'browser-client/src/PolygonDie.tsx', 'browser-client/src/block-dice.css'], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)), stdio: 'pipe',
  });
  checks.push({ roundOneSourceFilesUnchanged: true, productionPolygonSourceUnchanged: true });
  await writeFile(`${evidence}review-checks.json`, JSON.stringify({ checks }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', checks, evidence }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
