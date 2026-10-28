import { setCameraMode } from './camera-controls.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Run inside the registered dice UI suite, against the real pitch and native-exported reports. */
export async function verifyNumericDice(browser, url, view, evidence) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const reports = JSON.parse(readFileSync(new URL('./fixtures/numeric-dice.json', import.meta.url), 'utf8'));
  const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-dice.json', import.meta.url), 'utf8'));
  const quiet = { ...view, actions: [] };
  const publish = input => page.evaluate(input => window.publishDice(input), input);
  await page.addInitScript(input => { window.diceInput = input; window.diceActions = []; }, { view: quiet, report: reports[0] });
  await page.route('**/numeric-dice-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/dice-ui-harness.tsx"></script>' }));
  await page.goto(`${url}/numeric-dice-test`);
  await page.locator('.numeric-die').first().waitFor();
  assert.deepEqual(await page.locator('.numeric-die').evaluateAll(dice => dice.map(die => [die.dataset.dieKind, die.dataset.face])), [['d6', '3'], ['d8', '2']]);
  await publish({ view: quiet, report: reports[1], replay: true, readOnly: true });
  assert.deepEqual(await page.locator('.numeric-die').evaluateAll(dice => dice.map(die => [die.dataset.dieKind, die.dataset.face])), [['d16', '3'], ['d6', '2']]);
  assert.equal(await page.locator('.live-dice-overlay button:not(:disabled)').count(), 0, 'Replay exposes no native choices');
  for (const sides of [6, 8, 16]) {
    for (let value = 1; value <= sides; value++) {
      await publish({ view: quiet, report: { reportId: 'apothecaryRoll', numericDice: { version: 1, dice: [{ sides, value, label: 'Native result' }] } } });
      const die = page.locator('.numeric-die');
      assert.equal(await die.getAttribute('aria-label'), `Ivory and cyan die: D${sides} ${value}`);
      assert.equal(await die.locator('[data-numeric-face]').count(), sides);
      const orientation = await die.locator('.polygon-die-body').evaluate(body => {
        const result = body.querySelector('[data-result="true"]');
        const matrix = new DOMMatrix(getComputedStyle(body).transform).multiply(new DOMMatrix(getComputedStyle(result).transform));
        return [matrix.m11, matrix.m12, matrix.m13, matrix.m21, matrix.m22, matrix.m23, matrix.m31, matrix.m32, matrix.m33];
      });
      assert.ok(orientation.every((value, i) => Math.abs(value - (i % 4 === 0 ? 1 : 0)) < .0001), `D${sides} ${value} lands head-on`);
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const original = { view: quiet, report: reports[1], rollKey: 'casualty:1' };
  await publish(original);
  const bodies = page.locator('.numeric-die .polygon-die-body');
  const landing = await bodies.evaluateAll(bodies => {
    window.numericBodies = bodies;
    window.numericMarks = bodies.map(body => [...body.querySelectorAll('[data-numeric-face]')].map(face => face.dataset.numericFace));
    return bodies.map(body => {
      const animation = body.getAnimations()[0];
      assertDuration(animation.effect.getTiming().duration);
      animation.pause(); animation.currentTime = 620;
      return Array.from(new DOMMatrix(getComputedStyle(body).transform).toFloat64Array());
    });
    function assertDuration(duration) { if (duration !== 620) throw Error(`Unexpected roll duration ${duration}`); }
  });
  await page.clock.runFor(620);
  assert.equal(await page.locator('.numeric-die.rolling').count(), 0);
  const resting = await bodies.evaluateAll(bodies => bodies.map(body => Array.from(new DOMMatrix(getComputedStyle(body).transform).toFloat64Array())));
  assert.ok(resting.every((matrix, i) => matrix.every((value, component) => Math.abs(value - landing[i][component]) < .0001)), 'No landing jump');
  await publish({ ...original, disabled: true });
  assert.equal(await bodies.evaluateAll(bodies => bodies.every((body, i) => body === window.numericBodies[i] && body.getAnimations().length === 0)), true, 'Unchanged native dice retain identity without rolling twice');
  assert.equal(await bodies.evaluateAll(bodies => bodies.every((body, i) => JSON.stringify([...body.querySelectorAll('[data-numeric-face]')].map(face => face.dataset.numericFace)) === JSON.stringify(window.numericMarks[i]))), true);
  // Appending an action die keeps the earlier roll's DOM and completion state.
  const moment = { label: 'Dodge', faces: ['4'], subjectId: 'actor', selected: null, rollKey: 'action:1',
    rolls: [{ label: 'Dodge', kind: 'd6', face: '4', rollKey: 'action:1' }] };
  await publish({ view: quiet, moment }); await page.clock.runFor(620);
  await page.locator('.numeric-die').evaluate(die => { window.firstActionDie = die; });
  await publish({ view: quiet, moment: { ...moment, label: 'Dodge; Rush', faces: ['4', '2'], rollKey: 'action:2',
    rolls: [...moment.rolls, { label: 'Rush', kind: 'd6', face: '2', rollKey: 'action:2' }] } });
  assert.equal(await page.locator('.numeric-die').first().evaluate(die => die === window.firstActionDie && die.classList.contains('settled')), true);
  assert.equal(await page.locator('.numeric-die.rolling').count(), 1, 'Only the appended native die rolls');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.resume();
  await page.waitForFunction(() => document.querySelectorAll('.numeric-die.rolling').length === 0);
  assert.equal(await page.locator('.numeric-die.rolling').count(), 0, 'Changing the motion preference settles active dice');
  const proDecision = { title: 'Reroll the Pro test?', key: '2:pro', kind: 'proTestReroll', originalFaces: ['1'],
    originalLabel: 'Original action roll', originalRolls: [{ kind: 'd6', face: '1', label: 'Pick up' }],
    proTest: { face: '2', successful: false, rollKey: '2:pro' },
    options: [{ id: '2:pro-test:none', label: 'Keep original roll', kind: 'action' }] };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await publish({ view: quiet, decision: proDecision, moment: { label: 'Pro test', faces: ['2'], subjectId: 'actor', selected: null, rollKey: '2:response' } });
  assert.equal(await page.locator('.pitch-pro-test .numeric-die.rolling').count(), 1, 'A newly revealed Pro test uses the shared roll');
  await page.clock.runFor(620);
  await publish({ view: quiet });
  await publish({ view: quiet, decision: proDecision });
  assert.equal(await page.locator('.pitch-pro-test .numeric-die.rolling').count(), 0, 'Restoring the Pro prompt without a fresh native moment does not replay its test');
  await page.clock.resume();
  assert.deepEqual(await page.locator('.numeric-die').evaluateAll(dice => dice.map(die => die.dataset.face)), ['1', '2'], 'Original action and Pro test remain distinct');
  await page.getByRole('button', { name: 'Keep original roll', exact: true }).focus();
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.diceActions), ['2:pro-test:none'], 'A pending Pro response sends its exact native ID only once');
  const numericChoice = { title: 'Choose a die to reroll', key: '3:choice', kind: 'rerollDie', options: [
    { id: '3:native-choice:0', label: 'Reroll D8 2', face: '2', dieKind: 'd8', kind: 'action' }] };
  await publish({ view: quiet, report: reports[0], decision: numericChoice });
  const currentNumericChoice = page.locator('.pitch-dice-lifetime:not(.exiting) .numeric-die');
  assert.equal(await currentNumericChoice.count(), 1, 'A typed numeric choice does not duplicate the active row');
  assert.equal(await currentNumericChoice.getAttribute('data-die-kind'), 'd8', 'Numeric face choices never use the block variant');
  // Native reroll controls retain focus and command identities, with no enclosing box.
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await publish({ view, report: { reportId: 'pickUpRoll', roll: 1, playerId: 'actor' } });
    const overlay = page.locator('.live-dice-overlay');
    assert.equal(await overlay.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
    assert.equal(await overlay.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await overlay.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    assert.ok(await overlay.evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1; }));
    for (const role of ['home', 'away']) {
      const roleView = journeys.find(journey => journey.count === 0 && journey.role === role).offered;
      for (const camera of ['perspective', 'top-down']) {
        await setCameraMode(page, camera);
        await publish({ view: roleView, report: { reportId: 'injury', numericDice: { version: 1, dice: [
          { sides: 6, value: 6, label: 'Armour' }, { sides: 8, value: 8, label: 'Scatter' }, { sides: 16, value: 16, label: 'Casualty' }] } } });
        if (evidence) await page.screenshot({ path: resolve(evidence, `numeric-${viewport.width}-${role}-${camera}.png`) });
      }
    }
  }
  assert.deepEqual(errors, []);
  await page.close();
}
