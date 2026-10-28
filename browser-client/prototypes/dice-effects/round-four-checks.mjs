// Round-four evidence: narrower split, wheeled gurney with hinged landing, 200 ms entrance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startDiceReview } from './serve.mjs';

const evidence = fileURLToPath(new URL('../../../.notes/art-preview/dice-effects-round-four/', import.meta.url));
await mkdir(evidence, { recursive: true });
const server = await startDiceReview(0);
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  const address = `http://127.0.0.1:${server.httpServer.address().port}/pitch-preview`;
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
    await page.goto(`${address}?round=4`);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('main').getAttribute('data-round'), '4');
    assert.equal(await page.getByLabel('Review speed', { exact: true }).inputValue(), '1');
    assert.equal(await page.locator('[data-outcome-tile]').count(), 9);
    await page.getByRole('checkbox', { name: 'Show preceding rolls' }).uncheck();
    const time = async value => {
      await page.locator('#review-time').evaluate((element, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(value));
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
      await page.waitForFunction(value => document.querySelector('output').textContent === `${value} ms`, value);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const opacity = selector => page.locator(selector).first().evaluate(el => Number(getComputedStyle(el).opacity));
    await time(100);
    assert.ok(Math.abs(await opacity('.pitch-rolls .review-arrival') - .5) < .01);
    await time(175);
    assert.ok(Math.abs(await opacity('.pitch-rolls .review-arrival') - .875) < .01, 'entrance now includes the additional 75 ms');
    await time(200);
    assert.equal(await opacity('.pitch-rolls .review-arrival'), 1);
    await time(300);
    const fidelity = await page.evaluate(() => [...document.getAnimations()].filter(animation => animation.id.startsWith('native-review-')).map(animation => {
      const effect = animation.effect, target = effect.target;
      const key = `${target.closest('.native-review-die').dataset.nativeInstance}:${target.classList.contains('block-die-cube') ? 'body' : 'lift'}`;
      return { source: window.nativeSourceEffects[key], copy: { keyframes: effect.getKeyframes(), timing: effect.getTiming() }, time: animation.currentTime };
    }));
    assert.ok(fidelity.length > 20);
    fidelity.forEach(({ source, copy, time }) => { assert.deepEqual(copy, source); assert.equal(time, 150); });
    assert.equal(await opacity('.pitch-rolls .outcome-reveal'), 0);
    assert.equal(await page.locator('.review-tumble,.die-arrival').count(), 0, 'no replacement tumble wrapper');
    await time(619);
    assert.equal(await opacity('.pitch-rolls .outcome-reveal'), 0);
    await time(622);
    assert.equal(await opacity('.pitch-rolls .outcome-reveal'), 1);
    await time(1000);
    const earlyPads = await page.locator('[data-outcome-tile=armor] .armor-left').first().evaluate(el => getComputedStyle(el).transform);
    await time(1340);
    const waistAngles = await page.locator('[data-outcome-tile=casualty] .casualty-upper-body,[data-outcome-tile=casualty] .casualty-lower-body')
      .evaluateAll(elements => elements.map(el => { const matrix = new DOMMatrix(getComputedStyle(el).transform); return Math.atan2(matrix.m12, matrix.m11) * 180 / Math.PI; }));
    assert.equal(waistAngles.length, 4);
    waistAngles.forEach((angle, index) => assert.ok(Math.abs(angle - (index % 2 === 0 ? 14 : -6)) < .01, 'player bends at waist on contact'));
    await page.locator('[data-outcome-tile=casualty]').screenshot({ path: `${evidence}casualty-plop-${width}.png` });
    await time(2000);
    const settledPads = await page.locator('[data-outcome-tile=armor] .armor-left').first().evaluate(el => getComputedStyle(el).transform);
    assert.notEqual(earlyPads, settledPads);
    const separation = await page.locator('[data-outcome-tile=armor] .armor-left,[data-outcome-tile=armor] .armor-right')
      .evaluateAll(elements => elements.map(el => new DOMMatrix(getComputedStyle(el).transform).m41));
    assert.deepEqual(separation, [-3, 3, -3, 3], 'original narrow split restored');
    const settledWaist = await page.locator('[data-outcome-tile=casualty] .casualty-upper-body,[data-outcome-tile=casualty] .casualty-lower-body')
      .evaluateAll(elements => elements.map(el => { const matrix = new DOMMatrix(getComputedStyle(el).transform); return Math.atan2(matrix.m12, matrix.m11); }));
    settledWaist.forEach(angle => assert.ok(Math.abs(angle) < .001, 'player settles flat after the plop'));
    const colors = await page.locator('[data-outcome-tile]').evaluateAll(tiles => tiles.map(tile => {
      const group = tile.querySelector('.dice-group'), style = getComputedStyle(group);
      return { kind: tile.dataset.outcomeTile, fill: style.getPropertyValue('--effect-fill').trim(),
        edge: style.getPropertyValue('--effect-edge').trim(), accent: style.getPropertyValue('--effect-accent').trim() };
    }));
    const casualtyColors = { bh: '#b2dfaa', mng: '#f2cd78', ni: '#eba86c', stat: '#e6a5b3', dead: '#ee9295' };
    for (const color of colors) {
      const casualty = Object.hasOwn(casualtyColors, color.kind);
      assert.equal(color.fill, casualty ? '#466276' : '#22547c');
      assert.equal(color.edge, casualty ? '#afc9da' : '#4db2ff');
      assert.equal(color.accent, casualty ? casualtyColors[color.kind] : '#ffe17b');
    }
    const labelCenters = await page.locator('[data-result-label]').evaluateAll(elements => elements.map(element => {
      const box = element.closest('.result-pulse').querySelector('[data-result-box]').getBoundingClientRect(), label = element.getBoundingClientRect();
      return { dx: label.x + label.width / 2 - box.x - box.width / 2, dy: label.y + label.height / 2 - box.y - box.height / 2 };
    }));
    labelCenters.forEach(center => { assert.ok(Math.abs(center.dx) < .4); assert.ok(Math.abs(center.dy) < .4); });
    assert.equal(await page.locator('[data-outcome-tile=casualty] .stretcher circle').count(), 4, 'prior wheeled gurney restored at both scales');
    assert.equal(await page.locator('[data-outcome-tile=casualty] [data-equipment=cleats]').count(), 2);
    const pulse = await opacity('[data-outcome-tile=bh] .result-pulse');
    await page.screenshot({ path: `${evidence}round-four-${width}-settled.png`, fullPage: true });
    await page.locator('.match-frame').screenshot({ path: `${evidence}pitch-${width}.png` });
    for (const kind of ['armor', 'casualty', 'bh', 'dead']) await page.locator(`[data-outcome-tile=${kind}]`).screenshot({ path: `${evidence}${kind}-${width}.png` });
    await time(3000);
    assert.equal(await page.locator('[data-outcome-tile=armor] .armor-left').first().evaluate(el => getComputedStyle(el).transform), settledPads);
    assert.notEqual(await opacity('[data-outcome-tile=bh] .result-pulse'), pulse);
    await time(5000);
    assert.equal(await opacity('.pitch-rolls .group-exit'), 1);
    await time(5100);
    assert.ok(await opacity('.pitch-rolls .group-exit') > 0 && await opacity('.pitch-rolls .group-exit') < 1);
    await page.locator('.match-frame').screenshot({ path: `${evidence}evaporating-${width}.png` });
    await time(5200);
    assert.equal(await opacity('.pitch-rolls .group-exit'), 0);
    await page.getByLabel('Outcome', { exact: true }).selectOption('ordinary');
    await time(2000);
    assert.equal(await page.locator('.pitch-rolls .polygon-die:not([hidden])').count(), 4);
    await time(2600);
    assert.equal(await opacity('.pitch-rolls .group-exit'), 1);
    await time(2800);
    assert.equal(await opacity('.pitch-rolls .group-exit'), 0);
    await page.getByLabel('Outcome', { exact: true }).selectOption('ni');
    await page.getByRole('checkbox', { name: 'Show preceding rolls' }).check();
    const offsets = await page.locator('.pitch-rolls>.dice-group').evaluateAll(elements => elements.map(el => el.style.getPropertyValue('--offset')));
    assert.deepEqual(offsets, ['0ms', '1000ms', '2000ms', '3000ms']);
    await time(3600);
    assert.equal(await opacity('.pitch-rolls [data-sample=ni] .outcome-reveal'), 0);
    await time(3700);
    assert.equal(await opacity('.pitch-rolls [data-sample=ni] .outcome-reveal'), 1);
    await page.locator('.match-frame').screenshot({ path: `${evidence}sequence-${width}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('main').classList.contains('static-study'));
    assert.equal(await page.locator('.dice-group').evaluateAll(elements => elements.flatMap(el => el.getAnimations({ subtree: true })).length), 0);
    assert.equal(await page.locator('#review-time').isDisabled(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${evidence}static-${width}.png`, fullPage: true });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await time(8835);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('output').textContent.replace(' ms', '')) < 400);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const frozen = await page.locator('output').textContent();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('output').textContent(), frozen);
    assert.equal(await page.locator('[role=alert]').count(), 0);
    assert.deepEqual(errors, []);
    checks.push({ width, entranceMs: 200, effectiveNativeTumbleMs: 620, exitMs: 200, ordinaryHoldMs: 2400,
      emphasizedHoldMs: 4800, cadenceMs: 1000, unchangedNativeEffects: fidelity.length, colorScheme: colors,
      centeredLabels: true, originalNarrowSplit: true, priorWheeledGurney: true, helmetAndCleats: true,
      waistBendsOnContact: true, settlesFlat: true,
      revealOrder: true, loopAndPause: true, reducedMotion: true, noOverflow: true, errors });
    await page.close();
  }
  for (const round of ['1', '2', '3', '4']) {
    const response = await fetch(`${address}?round=${round}`), body = await response.text();
    assert.equal(response.status, 200);
    const entry = { 1: '/Review.tsx', 2: '/RoundTwoReview.tsx', 3: '/RoundThreeReview.tsx', 4: '/RoundFourReview.tsx' }[round];
    assert.ok(body.includes(entry));
  }
  const preserved = JSON.parse((await readFile(`${evidence}previous-rounds-preservation.json`, 'utf8')).replace(/^\uFEFF/, ''));
  for (const file of preserved) assert.equal(createHash('sha256').update(await readFile(new URL(file.file, import.meta.url))).digest('hex').toUpperCase(), file.sha256);
  execFileSync('git', ['diff', '--exit-code', '--', 'browser-client/src/PolygonDie.tsx', 'browser-client/src/block-dice.css'], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)), stdio: 'pipe',
  });
  await writeFile(`${evidence}review-checks.json`, JSON.stringify({ checks, earlierRoundsPreserved: true }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', viewports: checks.map(check => check.width), earlierRoundsPreserved: true,
    entranceMs: 200, tumbleMs: 620, exitMs: 200, evidence }, null, 2));
} finally { await browser.close(); await server.close(); }
