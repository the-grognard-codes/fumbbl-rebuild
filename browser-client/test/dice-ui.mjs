import { setCameraAngle, setCameraMode } from './camera-controls.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { verifyNumericDice } from './numeric-dice-checks.mjs';
import { verifyDiceEffects } from './dice-effects-checks.mjs';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-dice.json', import.meta.url), 'utf8')).sort((a, b) => b.count - a.count);
const evidence = process.env.DICE_UI_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const journey of journeys) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(input => { window.diceInput = input; window.diceActions = []; },
      { view: journey.offered, report: journey.count === 0 ? journey.reports[0] : undefined });
    await page.route('**/dice-test', route => route.fulfill({ contentType: 'text/html', body:
      '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/dice-ui-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/dice-test`);
    const dialog = page.getByRole('dialog');
    try { await dialog.waitFor(); } catch (error) { error.message += `\nDice journey ${journey.role}/${journey.count}: ${JSON.stringify(errors)}`; throw error; }
    const publish = input => page.evaluate(input => window.publishDice(input), input);
    if (evidence) await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.count}-selectable.jpg`), type: 'jpeg', quality: 80 });
    const assertUnboxed = async element => assert.deepEqual(await element.evaluate(element => ({
      background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderTopWidth,
      shadow: getComputedStyle(element).boxShadow })), { background: 'rgba(0, 0, 0, 0)', border: '0px', shadow: 'none' });
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth),true,'Dice surface has no horizontal scrollbar');
    if (journey.count) assert.equal(await dialog.evaluate(element => getComputedStyle(element).pointerEvents), 'none', 'Empty overlay space does not intercept pitch input');
    const offered = journey.offered.actions.filter(action => action.kind === 'blockDie');
    assert.equal(await dialog.locator('.live-dice-choices .match-die').count(), journey.count);
    if (journey.count === 0) assert.equal(await page.locator('.pitch-decision-overlay .match-die').getAttribute('data-face'), '1', 'The failed pickup remains on the board outside the circular prompt');
    for (const action of offered) {
      const choice = dialog.getByRole('button', { name: action.label, exact: true });
      await assertUnboxed(choice);
      assert.equal(await choice.locator(':scope > span.sr-only').evaluate(element => element.getBoundingClientRect().width), 1, 'Native choice text remains accessible without visible labels around dice');
      assert.equal(await choice.evaluate(element => getComputedStyle(element).pointerEvents), 'auto');
      assert.match(await choice.locator('.match-die').evaluate(element => getComputedStyle(element).filter), /drop-shadow/);
    }
    for (const angle of [30, 50, 40]) {
      await setCameraAngle(page, String(angle));
      assert.deepEqual(await page.evaluate(() => window.diceActions), []);
      assert.equal(await dialog.locator('.live-dice-choices .match-die').count(), journey.count);
    }
    await setCameraMode(page, 'top-down');
    await page.setViewportSize({ width: 560, height: 500 });
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].every(button => {
      const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    }));
    for (const button of await dialog.getByRole('button').all()) {
      const rect = await button.boundingBox(); assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 560 && rect.y + rect.height <= 500);
    }
    const action = journey.count ? offered.at(-1) : journey.offered.actions.find(action => action.id.endsWith(':reroll:team'));
    const choice = dialog.getByRole('button', { name: action.label, exact: true });
    await page.keyboard.press('Tab');
    await choice.focus();
    if (journey.count) assert.notEqual(await choice.evaluate(element => getComputedStyle(element).outlineStyle), 'none');
    else assert.deepEqual(await choice.evaluate(element => ({ outline: getComputedStyle(element).outlineStyle,
      background: getComputedStyle(element).backgroundColor })), { outline: 'none', background: 'rgb(36, 73, 102)' },
    'Circular rerolls indicate keyboard focus through the background; answer outlines indicate timeout defaults');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.diceActions), [action.id], 'One keyboard choice retains its exact native identity');
    assert.equal(await dialog.getByRole('button').first().isDisabled(), true);
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const report of journey.reports) for (const mode of ['coach', 'spectator', 'replay']) {
      await publish({ view: mode === 'coach' ? journey.chosen : journey.spectator, report, readOnly: true, replay: mode === 'replay' });
      const roll = page.locator('.live-dice-overlay[role="status"]'); await roll.waitFor(); assert.equal(await roll.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)'); assert.equal(await roll.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
      const expected = report.blockRoll ? report.blockRoll.map(value => ['SKULL', 'BOTH DOWN', 'PUSHBACK', 'PUSHBACK', 'POW/PUSH', 'POW'][value - 1]) : [String(report.roll)];
      assert.deepEqual(await roll.locator('.match-die').evaluateAll(elements => elements.map(element => element.dataset.face)), expected);
      if (journey.count) {
        assert.equal(await roll.locator('.block-die.settled .block-die-cube').count(), journey.count,
          'Native results retain the preview polygon dice');
        assert.deepEqual(await roll.locator('.block-die [data-result="true"]').evaluateAll(elements => elements.map(element => element.dataset.blockFace)), expected,
          'The forward polygon faces show the exact native results');
      }
      assert.equal(await roll.locator('.match-die.selected').count(), report.reportId === 'blockChoice' ? 1 : 0);
      if (report.reportId === 'blockChoice') assert.equal(await roll.locator('.match-die.selected').getAttribute('data-face'), expected[report.diceIndex]);
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.match(await roll.getAttribute('aria-label'), new RegExp(expected[0]));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await roll.locator('.match-die').evaluateAll(elements => elements.flatMap(element => element.getAnimations({ subtree: true })).length), 0);
      if (evidence && (journey.count === 0 || journey.count === 3) && report === journey.reports.at(-1)) await page.screenshot({ path: resolve(evidence, `${journey.role}-${journey.count}-${mode}.jpg`), type: 'jpeg', quality: 80 });
    }
    assert.deepEqual(errors, []); await page.close();
  }
  const sample = journeys.find(journey => journey.count === 3 && journey.role === 'home');
  const animatedPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await animatedPage.clock.install();
  await animatedPage.addInitScript(view => { window.diceInput = { view }; window.diceActions = []; }, { ...sample.offered, actions: [] });
  await animatedPage.route('**/dice-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/dice-ui-harness.tsx"></script>' }));
  await animatedPage.goto(`http://127.0.0.1:${server.httpServer.address().port}/dice-test`);
  for (const dice of [1, 2, 3, -2, -3]) {
    await animatedPage.evaluate(({ view, dice }) => window.publishDice({ view, potentialDice: { dice, targetPlayerId: 'target' } }),
      { view: { ...sample.offered, actions: [] }, dice });
    const preview = animatedPage.locator('.block-dice-surface[role="status"]'); await preview.waitFor();
    assert.equal(await preview.locator('.block-die.potential').count(), Math.abs(dice));
    assert.equal(await preview.evaluate(el => el.classList.contains('uphill')), dice < 0);
    assert.match(await preview.evaluate(el => getComputedStyle(el, '::before').backgroundImage), /radial-gradient/);
    assert.equal(await preview.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.ok(await preview.locator('.block-die-cube').first().evaluate(el => el.getAnimations().length > 0));
    const before = await preview.locator('.block-die-cube').first().evaluate(el => getComputedStyle(el).transform);
    await animatedPage.waitForFunction(before => getComputedStyle(document.querySelector('.block-die.potential .block-die-cube')).transform !== before, before);
    await animatedPage.emulateMedia({ reducedMotion: 'reduce' });
    await animatedPage.waitForFunction(() => [...document.querySelectorAll('.potential .block-die-cube')].every(cube => cube.getAnimations().length === 0));
    assert.equal(await preview.locator('.block-die-cube').first().evaluate(el => el.getAnimations().length), 0);
    await animatedPage.emulateMedia({ reducedMotion: 'no-preference' });
    await animatedPage.waitForFunction(() => [...document.querySelectorAll('.potential .block-die-cube')].every(cube => cube.getAnimations().length > 0));
    if (evidence && dice === -3) await animatedPage.screenshot({ path: resolve(evidence, 'potential-three-uphill.png') });
  }
  const previewPose = await animatedPage.locator('.block-die-cube').evaluateAll(cubes => {
    window.previewCubes = cubes;
    window.previewAnimations = cubes.map(cube => cube.getAnimations()[0]);
    window.previewFaceSets = cubes.map(cube => [...cube.querySelectorAll('.block-die-side')].map(side => side.dataset.blockFace));
    return cubes.map((cube, index) => {
      const animation = cube.getAnimations()[0]; animation.pause(); animation.currentTime = 4000 + index * 500;
      return Array.from(new DOMMatrix(getComputedStyle(cube).transform).toFloat64Array());
    });
  });
  await animatedPage.evaluate(view => window.publishDice({ view, potentialDice: { dice: -3, targetPlayerId: 'target' }, diceAwaiting: true }),
    { ...sample.offered, actions: [] });
  const awaiting = animatedPage.locator('.block-die.awaiting .block-die-cube');
  assert.equal(await awaiting.count(), 3, 'Confirmation retains all potential cubes while awaiting the server');
  const pendingPose = await awaiting.evaluateAll(cubes => {
    const same = cubes.every((cube, index) => cube === window.previewCubes[index]);
    const sameAnimations = cubes.every((cube, index) => cube.getAnimations()[0] === window.previewAnimations[index]);
    return { same, sameAnimations, matrices: cubes.map(cube =>
      Array.from(new DOMMatrix(getComputedStyle(cube).transform).toFloat64Array())) };
  });
  assert.equal(pendingPose.same, true, 'Confirmation keeps the same preview polygons');
  assert.equal(pendingPose.sameAnimations, true, 'Confirmation continues the preview without starting an extra roll');
  const poseDeltas = pendingPose.matrices.map((matrix, index) => Math.max(...matrix.map((value, component) => Math.abs(value - previewPose[index][component]))));
  assert.ok(poseDeltas.every(delta => delta < .0001),
    `Confirmation preserves the last visible preview orientation: ${JSON.stringify(poseDeltas)}`);
  assert.deepEqual(await awaiting.evaluateAll(cubes => cubes.map(cube => cube.getAnimations()[0].effect.getTiming().duration)),
    [16000, 16000, 16000], 'The server wait uses only gentle preview motion');
  const beforeReply = await awaiting.first().evaluate(cube => getComputedStyle(cube).transform);
  await awaiting.evaluateAll(cubes => cubes.forEach(cube => cube.getAnimations()[0].play()));
  await animatedPage.waitForFunction(before => getComputedStyle(document.querySelector('.block-die.awaiting .block-die-cube')).transform !== before, beforeReply);
  assert.notEqual(await awaiting.first().evaluate(cube => getComputedStyle(cube).transform), beforeReply,
    'Preview motion continues while waiting for the server');
  const report = { reportId: 'blockRoll', blockRoll: [1, 5, 6], logBlock: {
    attackerId: sample.offered.activePlayerId, chooser: sample.offered.players.find(player => player.id === sample.offered.activePlayerId).role === 'home' ? 'away' : 'home' } };
  // Hold the completion timer while inspecting a roll shorter than browser command latency.
  await animatedPage.clock.pauseAt(await animatedPage.evaluate(() => Date.now() + 100));
  await animatedPage.evaluate(({ view, report }) => window.publishDice({ view, report, rollKey: 'native-block-1' }),
    { view: sample.offered, report });
  const animated = animatedPage.getByRole('dialog'); await animated.waitFor();
  assert.equal(await animated.locator('.block-die.rolling').count(), 3);
  assert.ok(await animated.locator('.block-die-cube').first().evaluate(el => el.getAnimations().length > 0));
  assert.notEqual(await animated.locator('.block-die-cube').nth(1).evaluate(el => getComputedStyle(el).transform), 'none',
    'The opposite-direction roll also has a valid three-axis transform');
  assert.match(await animated.getAttribute('class'), /uphill/);
  assert.equal(await animated.locator('.block-die-cube').evaluateAll(cubes => cubes.every((cube, index) => cube === window.previewCubes[index])), true,
    'Native results continue rolling on the original preview dice');
  const landing = await animated.locator('.block-die-cube').evaluateAll(cubes => {
    window.landingCubes = cubes;
    return cubes.map(cube => {
      const animation = cube.getAnimations()[0];
      animation.pause(); animation.currentTime = animation.effect.getTiming().duration;
      return Array.from(new DOMMatrix(getComputedStyle(cube).transform).toFloat64Array());
    });
  });
  assert.deepEqual(await animated.locator('.block-die-cube').evaluateAll(cubes => cubes.map(cube =>
    cube.getAnimations()[0].effect.getTiming().duration)), [620, 620, 620], 'Each pitch block roll uses the approved 620ms pace');
  await animatedPage.clock.runFor(619);
  assert.equal(await animated.locator('.block-die.rolling').count(), 3, 'Dice remain rolling until the animation completes');
  await animatedPage.clock.runFor(1);
  await animatedPage.clock.resume();
  await animatedPage.waitForFunction(() => document.querySelectorAll('.block-die.rolling').length === 0);
  const resting = await animated.locator('.block-die-cube').evaluateAll(cubes => ({
    sameCubes: cubes.every((cube, index) => cube === window.landingCubes[index]),
    transforms: cubes.map(cube => Array.from(new DOMMatrix(getComputedStyle(cube).transform).toFloat64Array()))
  }));
  assert.equal(resting.sameCubes, true, 'Each die keeps the same polygon when its roll finishes');
  assert.ok(resting.transforms.every((matrix, index) => matrix.every((value, component) => Math.abs(value - landing[index][component]) < .0001)),
    'Every die lands at its resting angle without an orientation jump');
  const forwardFaces = await animated.locator('.block-die-cube').evaluateAll(cubes => cubes.map(cube => {
    const side = cube.querySelector('[data-result="true"]');
    const matrix = new DOMMatrix(getComputedStyle(cube).transform).multiply(new DOMMatrix(getComputedStyle(side).transform));
    return [matrix.m11, matrix.m12, matrix.m13, matrix.m21, matrix.m22, matrix.m23, matrix.m31, matrix.m32, matrix.m33];
  }));
  assert.ok(forwardFaces.every(matrix => matrix.every((value, component) => Math.abs(value - (component % 4 === 0 ? 1 : 0)) < .0001)),
    'Settled results face the screen head-on');
  assert.equal(await animated.locator('.block-die-cube').evaluateAll(cubes => cubes.every((cube, index) =>
    JSON.stringify([...cube.querySelectorAll('.block-die-side')].map(side => side.dataset.blockFace)) === JSON.stringify(window.previewFaceSets[index]))), true,
    'Every physical die keeps its six markings unchanged from preview through result');
  assert.equal(await animated.locator('.block-die.settled .block-die-cube').count(), 3);
  assert.deepEqual(await animated.locator('.live-die-choice .match-die').evaluateAll(elements => elements.map(el => el.dataset.face)),
    sample.offered.actions.filter(action => action.kind === 'blockDie').map(action => /Choose (.*) \(die/.exec(action.label)[1]));
  await animatedPage.evaluate(({ view, report }) => window.publishDice({ view, report, rollKey: 'late-native-report' }),
    { view: sample.offered, report });
  assert.equal(await animated.locator('.block-die.rolling').count(), 0, 'A late transcript never replays an already presented native choice');
  assert.deepEqual(await animatedPage.evaluate(() => window.diceActions), [], 'Decorative rolls never choose a native die');
  if (evidence) await animatedPage.screenshot({ path: resolve(evidence, 'native-block-uphill-choices.png') });
  await animatedPage.setViewportSize({ width: 320, height: 180 });
  const crowded = { ...sample.offered, actions: [...sample.offered.actions, ...Array.from({ length: 8 }, (_, index) => ({
    id: `overflow-native-${index + 1}`, kind: 'reroll', label: `Keep native dice option ${index + 1}`,
    actor: sample.offered.callerRole, sourcePlayerId: null, target: null
  }))] };
  await animatedPage.evaluate(view => window.publishDice({ view }), crowded);
  const choiceContent = animatedPage.locator('.pitch-dice-content');
  await animatedPage.waitForFunction(() => {
    const content = document.querySelector('.pitch-dice-content'); return content.scrollHeight > content.clientHeight;
  });
  assert.equal(await choiceContent.evaluate(el => getComputedStyle(el).overflowY), 'auto', 'Short screens retain a scrollable choice area');
  await animatedPage.waitForFunction(() => getComputedStyle(document.querySelector('.pitch-dice-content')).pointerEvents === 'auto');
  const scrollArea = await choiceContent.boundingBox();
  await animatedPage.mouse.move(scrollArea.x + scrollArea.width / 2, scrollArea.y + scrollArea.height / 2);
  await animatedPage.mouse.wheel(0, 1000);
  await animatedPage.waitForFunction(() => document.querySelector('.pitch-dice-content').scrollTop > 0);
  const lastChoice = animatedPage.getByRole('button', { name: 'Keep native dice option 8', exact: true });
  await lastChoice.click();
  assert.deepEqual(await animatedPage.evaluate(() => window.diceActions), ['overflow-native-8'], 'Every native choice remains reachable with the pointer on short screens');
  await animatedPage.close();

  const followUp = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[8].actor;
  for (const projection of ['perspective', 'top-down']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(input => { window.diceInput = input; window.diceActions = []; }, { view: { ...followUp, actions: [] } });
    await page.route('**/dice-test', route => route.fulfill({ contentType: 'text/html', body:
      '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/dice-ui-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/dice-test`);
    if (projection === 'top-down') await setCameraMode(page, 'top-down');
    await page.evaluate(view => window.publishDice({ view }), followUp);
    const dialog = page.getByRole('dialog', { name: 'Match decision' }); await dialog.waitFor();
    assert.equal(await dialog.evaluate(element => getComputedStyle(element, '::backdrop').backgroundColor), 'rgba(0, 0, 0, 0)',
      'Follow-up leaves the pitch at normal brightness');
    assert.ok((await dialog.boundingBox()).width <= 202, 'Follow-up prompt is compact');
    assert.ok(await dialog.evaluate(element => {
      const player = document.querySelector('.live-marker.active');
      if (!player) return false;
      const prompt = element.getBoundingClientRect(), actor = player.getBoundingClientRect();
      return prompt.right <= actor.left || prompt.left >= actor.right || prompt.bottom <= actor.top || prompt.top >= actor.bottom;
    }), 'Follow-up prompt does not cover the active player');
    const chosen = followUp.actions.find(action => /Follow up$/.test(action.label));
    const choice = dialog.getByRole('button', { name: 'Yes' });
    await choice.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.diceActions), [chosen.id], 'Follow-up submits only the exact offered action');
    assert.equal(await choice.isDisabled(), true);
    assert.deepEqual(errors, []); await page.close();
  }
  await verifyNumericDice(browser, `http://127.0.0.1:${server.httpServer.address().port}`, journeys.find(journey => journey.count === 0).offered, evidence);
  await verifyDiceEffects(browser, `http://127.0.0.1:${server.httpServer.address().port}`);
  console.log('PASS: native D6/D8/D16 and block faces, all landing orientations, shared motion, continuity, diffuse backing, exact keyboard choices, focus, viewport, both coaches, spectator and replay.');
} finally { await browser.close(); await server.close(); }
