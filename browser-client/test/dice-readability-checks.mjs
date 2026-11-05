import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { setCameraAngle } from './camera-controls.mjs';

const view = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const base = { subjectId: null, selected: null };
const groups = [
  { ...base, label: 'Dodge 4+ with modifiers', faces: ['5'], rollKey: 'dodge:1', rollDuration: 1000,
    presentation: { name: 'Dodge', icon: 'dodge', result: 'Success' } },
  { ...base, label: 'Casualty', faces: ['7'], static: true, outcome: 'mng', rolls: [{ label: 'Casualty', face: '7', kind: 'd16' }],
    presentation: { name: 'Casualty', result: 'Miss Next Game!' } },
  { ...base, label: 'Ball scatter', faces: ['3', '6'], static: true,
    presentation: { name: 'Ball scatter', icon: 'scatter' }, rolls: [
      { label: 'Ball scatter', face: '3', kind: 'd8', direction: 'east' },
      { label: 'Ball scatter', face: '6', kind: 'd8', direction: 'southwest' }] },
  { ...base, label: 'Unrecognized native event', faces: ['2'], static: true },
  { ...base, label: 'Block dice', faces: ['POW', 'SKULL'], static: true },
  { ...base, label: 'Direction without metadata', faces: ['1'], static: true,
    presentation: { name: 'Ball scatter', icon: 'scatter' },
    rolls: [{ label: 'Direction without metadata', face: '1', kind: 'd8' }] },
];
export async function verifyDiceReadability(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  try {
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.addInitScript(({ view, groups }) => {
    window.readabilityState = view; window.readabilityInput = { groups }; window.readabilityActions = [];
  }, { view, groups });
  await context.route('**/dice-readability-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}section[data-surface]{display:flex;flex-wrap:wrap;gap:12px}</style><div id="app"></div><script type="module" src="/test/dice-readability-harness.tsx"></script>' }));

  const page = await context.newPage();
  await page.clock.install();
  await page.goto(`${url}/dice-readability-test`);
  await page.waitForFunction(() => !!window.publishReadability);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  const publish = input => page.evaluate(input => window.publishReadability(input), input);
  const live = page.locator('[data-surface=live]');
  const replay = page.locator('[data-surface=replay]');
  const roll = (surface, index) => surface.locator(`[data-roll-case="${index}"]`);
  // A fresh key starts the exact existing physical roll duration.
  groups[0].rollKey = 'dodge:2';
  await publish({ groups });
  assert.equal(await roll(live, 0).locator('.pitch-roll-caption').textContent(), 'Dodge');
  assert.equal(await roll(live, 0).locator('.match-die.rolling').count(), 1);
  assert.equal(await roll(replay, 0).locator('.pitch-roll-caption').textContent(), 'Dodge - Success');
  assert.equal(await roll(live, 0).locator('[title]').count(), 0, 'No new dice tooltip');
  assert.equal(await roll(live, 0).locator('.pitch-dice-event-icon').evaluate(element => element.getAnimations().length), 0);
  await page.clock.runFor(999);
  assert.equal(await roll(live, 0).locator('.pitch-roll-caption').textContent(), 'Dodge');
  await page.clock.runFor(1);
  assert.equal(await roll(live, 0).locator('.pitch-roll-caption').textContent(), 'Dodge - Success');
  assert.equal(await roll(live, 0).locator('.match-die.settled').count(), 1);
  assert.equal(await roll(live, 3).locator('.pitch-roll-caption').textContent(), 'Unrecognized native event');
  assert.equal(await roll(live, 3).locator('.pitch-dice-event-icon').count(), 0);
  assert.equal(await roll(live, 2).locator('.pitch-dice-event-icon').count(), 1, 'One event identity for simultaneous dice');
  assert.deepEqual(await roll(live, 2).locator('.pitch-dice-direction').evaluateAll(elements => elements.map(element => element.getAttribute('alt'))),
    ['east direction', 'southwest direction']);
  assert.equal(await roll(live, 5).getByRole('img', { name: 'Direction unavailable' }).count(), 1);
  assert.equal(await roll(live, 1).locator('.pitch-dice-event-icon').count(), 0, 'Retained outcome art is the single icon');
  // Direction stays hidden until the direction die settles, including faster replay cadence.
  const scatter = { ...groups[2], static: false, rollKey: 'scatter:1', rollDuration: 155 };
  await publish({ groups: [scatter] });
  assert.equal(await live.locator('.pitch-dice-direction').count(), 0);
  await page.clock.runFor(154);
  assert.equal(await live.locator('.pitch-dice-direction').count(), 0);
  await page.clock.runFor(1);
  assert.equal(await live.locator('.pitch-dice-direction').count(), 2);
  await publish({ groups });
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Game Menu', exact: true });
  await menu.getByRole('tab', { name: 'Interface', exact: true }).click();
  const icons = menu.getByRole('checkbox', { name: 'Show dice icons', exact: true });
  const text = menu.getByRole('checkbox', { name: 'Show dice text', exact: true });
  assert.equal(await icons.isChecked(), true); assert.equal(await text.isChecked(), true);
  const retainedOutcome = await roll(live, 1).locator('.pitch-dice-outcome').elementHandle();
  for (const [showIcons, showText] of [[true, false], [false, true], [false, false], [true, true]]) {
    await icons.setChecked(showIcons); await text.setChecked(showText);
    for (const surface of [live, replay]) {
      assert.equal(await roll(surface, 0).locator('.pitch-dice-event-icon').count(), Number(showIcons));
      assert.equal(await roll(surface, 0).locator('.pitch-roll-caption').count(), Number(showText));
      assert.equal(await roll(surface, 1).locator('.pitch-dice-outcome').isVisible(), showIcons);
      assert.equal(await roll(surface, 1).locator('.pitch-roll-caption').count(), Number(showText));
      if (showIcons) assert.equal(await roll(surface, 1).locator('[data-result-label]').evaluate(element => getComputedStyle(element).display !== 'none'), true, 'Existing outcome art remains intact');
      assert.equal(await roll(surface, 2).locator('.pitch-dice-direction').count(), showIcons ? 2 : 0);
      assert.equal(await roll(surface, 4).locator('.block-die').count(), 2, 'Block dice survive every visibility combination');
      assert.equal(await roll(surface, 4).locator('.pitch-roll-caption,.pitch-dice-event-icon').count(), 0);
    }
  }
  assert.equal(await retainedOutcome.evaluate(element => element === document.querySelector('[data-surface=live] [data-roll-case="1"] .pitch-dice-outcome')), true,
    'Toggling icons preserves the existing outcome art and its animation lifecycle');
  await icons.uncheck(); await text.uncheck();
  await page.reload(); await page.waitForFunction(() => !!window.publishReadability);
  assert.equal(await live.locator('.pitch-roll-caption,.pitch-dice-event-icon,.pitch-dice-outcome:not([aria-hidden=true])').count(), 0, 'Browser preferences persist on reload');
  const other = await context.newPage(); await other.goto(`${url}/dice-readability-test`); await other.waitForFunction(() => !!window.publishReadability);
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await menu.getByRole('tab', { name: 'Interface', exact: true }).click();
  await icons.check();
  await other.waitForFunction(() => !!document.querySelector('.pitch-dice-event-icon'));
  assert.equal(await other.locator('.pitch-roll-caption').count(), 0, 'Cross-tab update preserves the independent text preference');
  await text.check();
  await other.waitForFunction(() => !!document.querySelector('.pitch-roll-caption'));
  // Denied storage still updates mounted consumers and later remounts.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw Error('fixture storage denial'); }; });
  await icons.uncheck(); await text.uncheck();
  await publish({ groups, show: false }); await publish({ groups });
  assert.equal(await live.locator('.pitch-roll-caption,.pitch-dice-event-icon,.pitch-dice-outcome:not([aria-hidden=true])').count(), 0);
  await icons.check(); await text.check();
  await menu.getByRole('button', { name: 'Close Game Menu', exact: true }).click();
  const decision = { title: 'Reroll the Pro test?', key: 'pro:1', kind: 'proTestReroll',
    proTest: { face: '2', successful: false, rollKey: 'pro:roll' }, originalFaces: ['1'],
    originalLabel: 'Dodge failed', originalRolls: [{ kind: 'd6', face: '1', label: 'Dodge failed',
      presentation: { name: 'Dodge', icon: 'dodge', result: 'Failed' } }],
    options: [{ id: 'keep', kind: 'action', label: 'Keep result' }] };
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await publish({ groups: [], decision, moment: { ...base, label: 'Pro', faces: ['2'], rollKey: 'pro:moment', rollDuration: 620 } });
  const overlay = page.locator('.pitch-decision-overlay');
  assert.equal(await overlay.locator('.pitch-pro-test .pitch-roll-caption').textContent(), 'Pro');
  assert.equal(await overlay.locator('.pitch-dice-event-icon[alt="Dodge"]').count(), 1, 'Original nonblock roll gets its presentation');
  await page.clock.runFor(620);
  assert.equal(await overlay.locator('.pitch-pro-test .pitch-roll-caption').textContent(), 'Pro - Failed');
  await publish({ groups: [], decision: { ...decision, proTest: { ...decision.proTest,
    presentation: { name: 'Pro (reroll)', icon: 'pro', result: 'Failed' } } },
    moment: { ...base, label: 'Pro', faces: ['2'], static: true } });
  assert.equal(await overlay.locator('.pitch-pro-test .pitch-roll-caption').textContent(), 'Pro (reroll) - Failed');
  await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
  await menu.getByRole('tab', { name: 'Interface', exact: true }).click();
  await icons.uncheck(); await text.uncheck();
  assert.equal(await overlay.locator('.pitch-roll-caption,.pitch-dice-event-icon').count(), 0, 'Pro and original nonblock rolls honor controls');
  await menu.getByRole('button', { name: 'Close Game Menu', exact: true }).click();
  await publish({ groups: [], decision: { title: 'Choose a block die', key: 'block:1', kind: 'blockDie',
    originalFaces: ['SKULL'], options: [{ id: 'choose', kind: 'action', face: 'POW', label: 'Choose POW' }] } });
  assert.equal(await overlay.locator('.block-die').count(), 2, 'Original and offered block dice remain visible');
  await overlay.getByRole('button', { name: 'Choose POW', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.readabilityActions), ['choose']);
  // Verify the real LivePitch passes its active camera projection to the fixed dice overlay.
  const pitchContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const pitch = await pitchContext.newPage();
  pitch.on('pageerror', error => errors.push(error.message));
  await pitch.addInitScript(({ view, moment }) => {
    window.diceInput = { view, moment, readOnly: true }; window.diceActions = [];
  }, { view: { ...view, actions: [] }, moment: groups[2] });
  await pitch.route('**/dice-direction-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/dice-ui-harness.tsx"></script>' }));
  await pitch.goto(`${url}/dice-direction-test`);
  const arrow = pitch.locator('.pitch-decision-overlay .pitch-dice-direction[alt="east direction"]');
  await arrow.waitFor();
  for (const end of ['home', 'away']) {
    if (end === 'away') {
      await setCameraAngle(pitch, 30);
      await pitch.getByRole('button', { name: /^Flip perspective:/ }).click();
    }
    for (const elevation of [30, 40, 50, 90]) {
      await setCameraAngle(pitch, elevation);
      const rotation = await arrow.evaluate(element => parseFloat(element.style.transform.slice(7)));
      assert.ok(Math.abs(rotation - (end === 'home' ? -90 : 90)) < 1e-7, `${end}/${elevation}: native east follows pitch length`);
      const diagonal = pitch.locator('.pitch-decision-overlay .pitch-dice-direction[alt="southwest direction"]');
      const rendered = await diagonal.evaluate(element => parseFloat(element.style.transform.slice(7)) + 135);
      const expected = Math.atan(Math.sin(elevation * Math.PI / 180)) * 180 / Math.PI + (end === 'away' ? -180 : 0);
      assert.ok(Math.abs(rendered - expected) < .001, `${end}/${elevation}: diagonal follows ground foreshortening (${rendered} / ${expected})`);
    }
  }
  await pitch.setViewportSize({ width: 390, height: 700 });
  assert.equal(await arrow.isVisible(), true, 'Direction remains visible on a narrow pitch');
  const showGroups = count => pitch.evaluate(({ view, groups, count }) => window.publishDice({ view, readOnly: true,
    moment: { label: 'Dice readability', faces: [], subjectId: null, selected: null,
      groups: groups.slice(0, count).map((group, index) => ({ ...group, static: true, key: `evidence:${index}` })) } }),
  { view: { ...view, actions: [] }, groups, count });
  await showGroups(4);
  assert.equal(await pitch.locator('.pitch-dice-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true,
    'Many captioned groups scroll vertically without forming an offscreen column on mobile');
  const lastCaption = pitch.locator('.pitch-roll-caption').last();
  await lastCaption.scrollIntoViewIfNeeded();
  assert.ok(await lastCaption.evaluate(element => {
    const box = element.getBoundingClientRect(), content = element.closest('.pitch-dice-content').getBoundingClientRect();
    return box.left >= content.left && box.right <= content.right;
  }), 'The final caption stays horizontally inside the scrollable content');
  const evidence = process.env.DICE_READABILITY_EVIDENCE;
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    await showGroups(3);
    await pitch.locator('.pitch-dice-content').evaluate(element => { element.scrollTop = 0; });
    await setCameraAngle(pitch, 40);
    for (const [width, height] of [[1440, 900], [390, 700]]) {
      await pitch.setViewportSize({ width, height });
      await pitch.evaluate(() => document.fonts.ready);
      await pitch.screenshot({ path: resolve(evidence, `ui-live-${width}.png`) });
    }
  }
  assert.deepEqual(await pitch.evaluate(() => window.diceActions), []);
  await pitchContext.close();
  assert.deepEqual(errors, []);
  console.log('PASS: dice visibility modes, persisted/session/cross-tab preferences, native captions, settle timing, projected directions at both ends/all angles, Pro/original rolls, and block choices.');
  } finally { await context.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
    server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  try { await verifyDiceReadability(browser, `http://127.0.0.1:${server.httpServer.address().port}`); }
  finally { await browser.close(); await server.close(); }
}

