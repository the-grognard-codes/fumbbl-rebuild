import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Exercise the real pitch renderer and ordered playback, not the review surface. */
export async function verifyDiceEffects(browser, url) {
  const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
  const state = revision => ({ ...initial, revision, actions: [] });
  const dice = (label, values, sides = [6, 6]) => values.map((value, index) => ({ sides: sides[index], value, label }));
  const injury = { reportId: 'injury', defenderId: initial.players[0].id, armorBroken: true,
    injury: 7, seriousInjury: 'Head Injury (-AV)', numericDice: { version: 1, dice: [
      ...dice('Armour', [6, 5]), ...dice('Injury', [6, 6]), ...dice('Casualty', [13, 4], [16, 6]),
    ] } };
  const record = (revision, reports = []) => ({ index: revision, revision, kind: 'action', actor: 'home', at: revision,
    decision: null, native: [{ reportList: { reports } }], state: state(revision) });
  const evidence = process.env.DICE_EFFECTS_EVIDENCE;
  if (evidence) mkdirSync(evidence, { recursive: true });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.clock.install();
      await page.addInitScript(input => { window.playbackInput = input; window.playbackFrames = []; },
        { view: state(0), records: [record(0)], enabled: true, mode: 'live' });
      await page.addInitScript(() => {
        // Playwright's fake Date/timers do not advance the document's CSS timeline.
        // Seek real CSS effects to their age while leaving native keyframes intact.
        const births = new WeakMap();
        window.syncPitchCss = () => {
          const now = Date.now();
          document.querySelectorAll('.pitch-dice-lifetime').forEach(element => {
            element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSAnimation).forEach(animation => {
              if (!births.has(animation)) births.set(animation, now);
              animation.pause(); animation.currentTime = now - births.get(animation);
            });
          });
        };
        new MutationObserver(window.syncPitchCss).observe(document, { childList: true, subtree: true });
      });
      await page.route('**/effects-playback-test', route => route.fulfill({ contentType: 'text/html', body:
        '<link rel="stylesheet" href="/src/coach-match.css"><style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
      await page.goto(`${url}/effects-playback-test`);
      await page.waitForFunction(() => !!window.publishPlayback);
      await page.evaluate(() => document.fonts.ready);
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      const publish = input => page.evaluate(input => window.publishPlayback(input), { enabled: true, mode: 'live', ...input });
      let elapsed = 0;
      const until = async time => { await page.clock.runFor(time - elapsed); elapsed = time; await page.evaluate(() => window.syncPitchCss()); };
      const history = [record(0), record(1, [injury])];
      await publish({ view: state(1), records: history });
      await page.locator('[data-outcome=armor]').waitFor();
      const bodyDurations = await page.locator('.pitch-decision-overlay .block-die-cube').evaluateAll(elements =>
        elements.flatMap(el => el.getAnimations().map(animation => animation.effect.getTiming().duration)));
      assert.deepEqual(bodyDurations, [620, 620]);
      const arrival = await page.locator('.pitch-dice-arrival').first().evaluate(element =>
        element.getAnimations().map(animation => animation.effect.getTiming().duration));
      assert.deepEqual(arrival, [200]);
      assert.equal(await page.locator('[data-outcome=stat]').count(), 0, 'no future serious result at armor stage');
      await until(640);
      assert.equal(await page.locator('[data-outcome=armor] .pitch-dice-outcome').evaluate(el => getComputedStyle(el).opacity), '1');
      await until(1000);
      await page.locator('[data-outcome=casualty]').waitFor();
      await until(1640);
      assert.equal(await page.locator('[data-outcome=casualty] .pitch-dice-outcome').evaluate(el => getComputedStyle(el).opacity), '1');
      await until(2000);
      assert.equal(await page.locator('[data-outcome=stat]').count(), 0, 'D16 must precede the determining serious-injury die');
      await until(3000);
      await page.locator('[data-outcome=stat]').waitFor();
      await until(3640);
      assert.equal(await page.locator('[data-outcome=stat] .pitch-dice-outcome').evaluate(el => getComputedStyle(el).opacity), '1');
      assert.ok(await page.locator('.pitch-decision-overlay').evaluate(el => {
        const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1;
      }));
      if (evidence) await page.screenshot({ path: resolve(evidence, `live-outcome-sequence-${width}.png`) });
      await until(5000);
      assert.equal(await page.locator('.pitch-dice-lifetime.exiting [data-outcome=armor]').count(), 1);
      assert.equal(await page.locator('.pitch-dice-lifetime.exiting').first().getAttribute('inert'), '');
      await until(5200);
      assert.equal(await page.locator('[data-outcome=armor]').count(), 0);
      assert.equal(await page.locator('[data-outcome=casualty]').count(), 1, 'later injury keeps its independent full lifetime');
      const choice = { ...state(2), actions: [{ id: 'choose-pow', kind: 'blockDie', actor: initial.callerRole,
        label: 'Choose POW (die 1)', sourcePlayerId: initial.activePlayerId, target: null }] };
      const withChoice = [...history, record(2, [{ reportId: 'blockRoll', blockRoll: [6] }])];
      await publish({ view: choice, records: withChoice, interactive: true });
      await page.clock.runFor(1100);
      await page.getByRole('button', { name: 'Choose POW (die 1)', exact: true }).waitFor();
      await page.clock.runFor(10000);
      assert.equal(await page.getByRole('button', { name: 'Choose POW (die 1)', exact: true }).count(), 1, 'required die never expires');
      await publish({ view: state(3), records: [...withChoice, record(3)], interactive: true });
      await page.waitForFunction(() => !document.querySelector('#required-choice'));
      assert.equal(await page.getByRole('button', { name: 'Choose POW (die 1)', exact: true }).count(), 0);
      const fadingChoice = page.locator('.pitch-dice-lifetime.exiting .live-die-choice');
      assert.equal(await fadingChoice.count(), 1);
      assert.equal(await fadingChoice.isDisabled(), true);
      await fadingChoice.evaluate(button => button.click());
      assert.deepEqual(await page.evaluate(() => window.playbackActions), [], 'evaporating choices cannot submit commands');
      await page.clock.runFor(200);
      assert.equal(await page.locator('.pitch-decision-overlay .match-die').count(), 0);
      // A replay seek and reconnect snapshot must not resurrect animations or old timers.
      await publish({ view: state(1), records: history, mode: 'replay', snapshotKey: 1 });
      await page.clock.runFor(10000);
      assert.equal(await page.locator('.pitch-dice-lifetime.exiting').count(), 0);
      assert.equal(await page.locator('.pitch-dice-outcome').evaluateAll(elements => elements.flatMap(el => el.getAnimations({ subtree: true })).length), 0);
      // Replay speed scales all phases, and adjacent play remains animated after a seek.
      await publish({ view: state(2), records: [record(0), record(1), record(2, [injury])], mode: 'replay', speed: 4 });
      await page.locator('[data-outcome=armor]').waitFor();
      assert.deepEqual(await page.locator('.pitch-dice-arrival').first().evaluate(el => el.getAnimations().map(animation => animation.effect.getTiming().duration)), [50]);
      assert.deepEqual(await page.locator('.block-die-cube').first().evaluate(el => el.getAnimations().map(animation => animation.effect.getTiming().duration)), [155]);
      for (let stage = 0; stage < 3; stage += 1) {
        await page.clock.runFor(250);
        await page.evaluate(() => window.syncPitchCss());
        await page.waitForFunction(count => document.querySelectorAll('.live-dice-overlay .pitch-dice-lifetime').length >= count, stage + 2);
      }
      await page.locator('[data-outcome=stat]').waitFor();
      // Reconnect to a pending injury decision restores symbols, with no old animation.
      const recovery = { ...state(4), actions: [{ id: 'apothecary', kind: 'apothecary', actor: initial.callerRole,
        label: 'Use Apothecary', sourcePlayerId: initial.players[0].id, target: null }] };
      const recoveredHistory = [record(0), record(1), record(2), record(3), record(4, [injury])];
      await publish({ view: recovery, records: recoveredHistory, enabled: false });
      await publish({ view: recovery, records: recoveredHistory });
      await page.locator('[data-outcome=stat]').waitFor();
      assert.equal(await page.locator('.pitch-dice-lifetime').evaluateAll(elements => elements.flatMap(el => el.getAnimations({ subtree: true })).length), 0);
      await page.clock.runFor(10000);
      assert.equal(await page.locator('[data-outcome=stat]').count(), 1);
      // A passive block followed by injury keeps one stable die, without a duplicate ghost.
      const afterBlock = [...recoveredHistory, record(5, [{ reportId: 'blockRoll', blockRoll: [6] }])];
      await publish({ view: state(5), records: afterBlock });
      const passiveBlock = page.locator('.pitch-decision-overlay [data-die-kind=block] .block-die-cube');
      await passiveBlock.waitFor();
      const retainedBlock = await passiveBlock.elementHandle();
      await page.clock.runFor(1000);
      await publish({ view: state(6), records: [...afterBlock, record(6, [injury])] });
      await page.locator('[data-outcome=armor]').waitFor();
      assert.equal(await passiveBlock.count(), 1);
      assert.equal(await retainedBlock.evaluate(element => element.isConnected), true, 'retained blocks must not restart their tumble');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }

    const samples = [
      ['armor', 'Armour', 4, null, '#ffe17b'], ['stun', 'Injury', 4, null, '#ffe17b'],
      ['ko', 'Injury', 5, null, '#ffe17b'], ['casualty', 'Injury', 6, null, '#ffe17b'],
      ['bh', 'Casualty', 6, null, '#b2dfaa'], ['mng', 'Casualty', 7, 'Broken Ribs (MNG)', '#f2cd78'],
      ['ni', 'Casualty', 7, 'Damaged Back (NI)', '#eba86c'], ['stat', 'Serious injury', 7, 'Head Injury (-AV)', '#e6a5b3'],
      ['dead', 'Casualty', 8, 'Dead (RIP)', '#ee9295'],
    ];
    const staticPage = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    try {
      await staticPage.addInitScript(view => { window.diceInput = { view }; window.diceActions = []; }, state(0));
      await staticPage.route('**/effects-static-test', route => route.fulfill({ contentType: 'text/html', body:
        '<link rel="stylesheet" href="/src/coach-match.css"><style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/dice-ui-harness.tsx"></script>' }));
      await staticPage.goto(`${url}/effects-static-test`);
      await staticPage.waitForFunction(() => !!window.publishDice);
      await staticPage.evaluate(() => document.fonts.ready);
      for (const [outcome, label, result, serious, color] of samples) {
        await staticPage.evaluate(({ view, label, result, serious }) => window.publishDice({ view, report: {
          reportId: 'injury', armorBroken: true, injury: result, seriousInjury: serious,
          numericDice: { version: 1, dice: [{ sides: 6, value: 4, label }] },
        } }), { view: state(0), label, result, serious });
        const group = staticPage.locator(`[data-outcome=${outcome}]`); await group.waitFor();
        assert.equal(await group.evaluate(el => getComputedStyle(el).getPropertyValue('--effect-accent').trim()), color);
        assert.equal(await group.evaluate(el => el.getAnimations({ subtree: true }).length), 0);
        if (['bh', 'mng', 'ni', 'stat'].includes(outcome)) {
          const center = await group.evaluate(el => {
            const box = el.querySelector('[data-result-box]').getBoundingClientRect(), text = el.querySelector('[data-result-label]').getBoundingClientRect();
            return [text.x + text.width / 2 - box.x - box.width / 2, text.y + text.height / 2 - box.y - box.height / 2];
          });
          assert.ok(center.every(offset => Math.abs(offset) < .4));
        }
        if (evidence) await staticPage.screenshot({ path: resolve(evidence, `${outcome}-static-${width}.png`) });
      }
    } finally { await staticPage.close(); }
  }
  console.log('PASS: approved pitch effects, native outcomes/stages, pinned input removal, independent lifetimes, desktop/mobile and static inspection.');
}
