import { setCameraMode } from './camera-controls.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { matchDecision } from '../src/match-decision.ts';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/block-visibility.json', import.meta.url), 'utf8'));
const nativeMultiple = JSON.parse(readFileSync(new URL('./fixtures/block-visibility-multiple.json', import.meta.url), 'utf8'));
const evidence = process.env.BLOCK_VISIBILITY_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/block-visibility.html`);
  await page.waitForFunction(() => typeof window.publishBlockVisibility === 'function');
  const publish = async (input, reset = false) => {
    const serial = await page.evaluate(({ input, reset }) => window.publishBlockVisibility(input, reset), { input, reset });
    await page.waitForFunction(({ serial, input }) => {
      const frame = document.querySelector('#block-harness-state');
      return window.blockVisibilityCommitted === serial && frame?.dataset.publication === String(serial)
        && (!input.mode || frame.dataset.mode === input.mode)
        && (!input.view || frame.dataset.revision === String(input.view.revision) && frame.dataset.role === input.view.callerRole);
    }, { serial, input });
  };
  // Native command ordering is covered by RoundupActionFlowTest. Extend the
  // historical frozen view with the reverse offer to exercise both UI choices.
  const orderedMultiple = structuredClone(nativeMultiple.ready);
  const forward = orderedMultiple.blockPreview.multiple[0];
  const reverse = structuredClone(forward);
  reverse.context.blocks.reverse();
  reverse.context.activeTargetPlayerId = reverse.context.blocks[0].targetPlayerId;
  reverse.actionId = `${forward.actionId.split(':multi-block-')[0]}:multi-block-${reverse.context.blocks.map(block => block.targetPlayerId).join('-')}`;
  orderedMultiple.blockPreview.multiple.push(reverse);
  const reverseAction = structuredClone(orderedMultiple.actions.find(action => action.id === forward.actionId));
  reverseAction.id = reverse.actionId; reverseAction.label = 'Block targets in reverse order';
  orderedMultiple.actions.push(reverseAction);
  const multipleIds = forward.context.blocks.map(block => block.targetPlayerId);
  for (const ids of [multipleIds, [...multipleIds].reverse()]) {
    await publish({ mode: 'game', view: orderedMultiple, records: [], proposal: null, dice: null }, true);
    await page.evaluate(() => { window.blockVisibilityIntents = []; });
    const group = page.getByRole('group', { name: 'Multiple Block targets', exact: true });
    await group.getByText('Multiple Block: select the first target.', { exact: true }).waitFor();
    const confirm = page.getByRole('button', { name: 'Confirmed!', exact: true });
    assert.equal(await confirm.isDisabled(), true);
    await page.locator(`.live-marker[data-player-id="${ids[0]}"]`).click();
    await group.getByText('Multiple Block: select the second target.', { exact: true }).waitFor();
    assert.equal(await confirm.isDisabled(), true, 'One target cannot submit Multiple Block');
    await page.locator(`.live-marker[data-player-id="${ids[1]}"]`).click();
    await group.getByText('Multiple Block: confirm the targets in the order shown.', { exact: true }).waitFor();
    assert.equal(await confirm.isEnabled(), true);
    const expected = orderedMultiple.blockPreview.multiple.find(option =>
      option.context.blocks.every((block, index) => block.targetPlayerId === ids[index]));
    assert.ok(expected, 'Native projection must offer each coach-selected order');
    assert.deepEqual(await page.evaluate(() => window.blockVisibilityIntents), []);
    await confirm.click();
    assert.deepEqual(await page.evaluate(() => window.blockVisibilityIntents),
      [{ operation: 'action', fields: { actionId: expected.actionId } }]);
    await group.getByRole('button', { name: 'Clear targets', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await confirm.isDisabled(), true);
  }
  await page.evaluate(() => { window.blockVisibilityIntents = []; });
  const markers = kind => page.locator(`[data-block-marker="${kind}"]`);
  const waitMarkers = async (block, offense, defense) => {
    try {
      await page.waitForFunction(({ block, offense, defense }) =>
        document.querySelectorAll('[data-block-marker="block"]').length === block
        && document.querySelectorAll('[data-block-marker="offense"]').length === offense
        && document.querySelectorAll('[data-block-marker="defense"]').length === defense, { block, offense, defense }, { timeout: 5000 });
    } catch (error) {
      const observed = await page.evaluate(() => ({ markers: [...document.querySelectorAll('[data-block-marker]')].map(element => element.dataset.blockMarker),
        selected: document.querySelector('.live-marker.selected')?.getAttribute('data-player-id'),
        action: document.querySelector('select[aria-label="Server action"]')?.value }));
      throw new Error(`Expected block/offense/defense markers ${block}/${offense}/${defense}: ${JSON.stringify(observed)}`, { cause: error });
    }
  };
  for (const journey of journeys) {
    const block = journey.rolled.blockContext.blocks[0];
    for (const role of ['home', 'away', 'spectator']) {
      await publish({ mode: 'pitch', view: { ...journey.rolled, callerRole: role }, records: journey.records, dice: null,
        proposal: null, animated: true }, true);
      await waitMarkers(1, block.offensiveAssists.length, block.defensiveAssists.length);
      assert.equal(await page.locator('[data-block-layer="assists"]').getAttribute('data-block-target'), block.targetPlayerId);
      assert.deepEqual(await markers('offense').evaluateAll(elements => elements.map(element => element.dataset.blockContributor).sort()),
        block.offensiveAssists.map(assist => assist.playerId).sort());
      assert.deepEqual(await markers('defense').evaluateAll(elements => elements.map(element => element.dataset.blockContributor).sort()),
        block.defensiveAssists.map(assist => assist.playerId).sort());
      assert.equal(await page.locator('.live-pitch-scene').getAttribute('data-end'), role === 'away' ? 'away' : 'home');
      assert.equal(await page.locator('[data-block-description]').count(), 1);
      assert.equal(await page.locator('[data-block-layer="assists"]').evaluate(element => {
        const scene = element.closest('.live-pitch-scene');
        const player = scene.querySelector('[data-player-id]');
        const threats = scene.querySelector('.live-threats');
        return element.ownerSVGElement === scene.querySelector(':scope > svg')
          && !!(element.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING)
          && (!threats || !!(threats.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))
          && Number(getComputedStyle(player).zIndex) > (Number.parseInt(getComputedStyle(element.ownerSVGElement).zIndex, 10) || 0);
      }), true, 'assists follow threats and remain below player sprites');
      for (const camera of ['top-down', 'perspective']) {
        const scene = page.locator('.live-pitch-scene');
        if (await scene.getAttribute('data-projection') !== camera)
          await setCameraMode(page, camera);
        await page.waitForFunction(camera => document.querySelector('.live-pitch-scene').dataset.projection === camera, camera);
        assert.equal(await page.locator('[data-block-marker] path').evaluateAll(paths =>
          paths.every(path => !/NaN|undefined|Infinity/.test(path.getAttribute('d')))), true);
        assert.equal(await page.locator('[data-block-marker]').evaluateAll(markers => {
          const points = path => [...path.getAttribute('d').matchAll(/[ML]([^, ]+),([^ ]+)/g)]
            .map(match => ({ x: Number(match[1]), y: Number(match[2]) }));
          const meets = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-7;
          return markers.every(marker => {
            const shaft = points(marker.querySelector('.shaft')), head = points(marker.querySelector('.arrowhead'));
            if (!meets(shaft.at(-1), head[1])) return false;
            if (marker.dataset.blockMarker === 'block') {
              const flare = marker.querySelector('.block-impact-flare');
              return [...marker.querySelectorAll('.phase-impact')].every(trace => meets(points(trace).at(-1),
                { x: Number(flare.getAttribute('cx')), y: Number(flare.getAttribute('cy')) }));
            }
            if (![...marker.querySelectorAll('.phase-origin')].every(trace => meets(points(trace).at(-1), shaft[0]))) return false;
            if (marker.dataset.blockMarker === 'defense') {
              if (![...marker.querySelectorAll('.phase-origin')].every(trace => points(trace).length === 3)) return false;
              const bar = points(marker.querySelector('.bar'));
              return Math.abs((head[1].x - bar[0].x) * (bar[1].y - bar[0].y)
                - (head[1].y - bar[0].y) * (bar[1].x - bar[0].x)) < 1e-7;
            }
            return true;
          });
        }), true, 'rendered origin traces, shafts, arrowheads, defensive bars and impact flares remain connected');
        assert.equal(await page.locator('.live-block-marker-layer').evaluate(element => getComputedStyle(element).pointerEvents), 'none');
      }
      if (evidence) await page.screenshot({ path: `${evidence}/${journey.blitz ? 'blitz' : 'block'}-${journey.uphill ? 'uphill' : 'offense'}-${role}.png` });
      await publish({ view: { ...journey.resolved, callerRole: role } });
      await waitMarkers(0, 0, 0);
    }
  }

  // Retained decorative dice must never resurrect explicitly cleared committed markers.
  const journey = journeys[0], first = journey.rolled.blockContext.blocks[0];
  const attackerRole = journey.rolled.players.find(player => player.id === first.playerId).role;
  const defenderRole = attackerRole === 'home' ? 'away' : 'home';
  const cleared = structuredClone(journey.rolled); delete cleared.blockContext;
  await publish({ mode: 'pitch', view: cleared, dice: { label: 'Old roll', faces: ['POW'], subjectId: first.playerId,
    selected: null, blockContext: journey.rolled.blockContext }, proposal: null }, true);
  await waitMarkers(0, 0, 0);

  await publish({ view: journey.rolled, animated: false, dice: null });
  await waitMarkers(1, first.offensiveAssists.length, first.defensiveAssists.length);
  assert.equal(await page.locator('[data-block-layer]').evaluateAll(layers => layers.every(layer => layer.classList.contains('static'))), true);
  assert.equal(await page.locator('.block-visibility .trace').evaluateAll(traces => traces.every(trace => getComputedStyle(trace).display === 'none')), true);
  await publish({ animated: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.block-visibility .trace').evaluateAll(traces => traces.every(trace =>
    getComputedStyle(trace).display === 'none' && getComputedStyle(trace).animationName === 'none')), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await waitMarkers(1, first.offensiveAssists.length, first.defensiveAssists.length);
  await page.waitForFunction(() => document.querySelector('.live-pitch-scene').getBoundingClientRect().width <= innerWidth);
  if (evidence) await page.screenshot({ path: `${evidence}/reduced-motion-390.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // A renderer-only Multiple Block case: native player identities plus two independent authored contexts.
  const multiple = structuredClone(journey.rolled);
  const defenders = multiple.players.filter(player => player.role === defenderRole && player.id !== first.targetPlayerId);
  const secondTarget = defenders[0], secondDefense = defenders[1];
  Object.assign(secondTarget, { x: 8, y: 8, offPitch: 'pitch' });
  Object.assign(secondDefense, { x: 6, y: 7, offPitch: 'pitch' });
  const second = { ...first, targetPlayerId: secondTarget.id, to: { x: 8, y: 8 }, offensiveAssists: [],
    defensiveAssists: [{ playerId: secondDefense.id, x: 6, y: 7 }] };
  multiple.blockContext.blocks.push(second);
  await publish({ mode: 'pitch', view: multiple, animated: true }, true);
  await waitMarkers(2, first.offensiveAssists.length, 0);
  multiple.blockContext.activeTargetPlayerId = secondTarget.id;
  await publish({ view: multiple });
  await waitMarkers(2, 0, 1);
  assert.equal(await markers('block').locator('.inactive').count(), 0);
  assert.equal(await page.locator('[data-block-marker="block"].inactive').count(), 1);
  assert.equal(await markers('defense').getAttribute('data-block-contributor'), secondDefense.id);
  assert.equal(await page.locator('[data-block-layer="assists"]').getAttribute('data-block-target'), secondTarget.id);

  // Exercise actual GameView selection and cancellation, rather than supplying a proposed context.
  await publish({ mode: 'game', view: journey.ready, records: [], proposal: null, dice: null }, true);
  await page.locator('.coach-match').waitFor();
  await waitMarkers(0, 0, 0);
  const choosePlayer = async id => {
    const player = page.locator(`[data-player-id="${id}"]`);
    await player.focus();
    assert.equal(await player.evaluate(element => document.activeElement === element), true, `keyboard inspection must focus ${id}`);
    await page.keyboard.press('Enter');
  };
  await choosePlayer(first.playerId);
  await waitMarkers(0, 0, 0);
  await choosePlayer(first.targetPlayerId);
  await waitMarkers(1, first.offensiveAssists.length, first.defensiveAssists.length);
  assert.deepEqual(await page.evaluate(() => window.blockVisibilityIntents), [], 'target selection never submits a command');
  await page.keyboard.press('Escape');
  await waitMarkers(0, 0, 0);
  for (const role of [defenderRole, 'spectator']) {
    await publish({ view: { ...journey.ready, callerRole: role } }, true);
    await choosePlayer(first.playerId);
    await choosePlayer(first.targetPlayerId);
    await waitMarkers(0, 0, 0);
  }

  const multipleProposal = structuredClone(multiple);
  const multipleContext = { ...multipleProposal.blockContext, activeTargetPlayerId: first.targetPlayerId };
  delete multipleProposal.blockContext;
  multipleProposal.actions = [{ id: 'test-multiple-block', label: 'Block both targets', actor: attackerRole, kind: 'multiBlock',
    sourcePlayerId: first.playerId, target: null }];
  multipleProposal.blockPreview = { version: 1, rolls: [], multiple: [{ actionId: 'test-multiple-block', context: multipleContext }] };
  await publish({ mode: 'game', view: multipleProposal, records: [] }, true);
  await choosePlayer(first.playerId);
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await page.getByLabel('Server action', { exact: true }).selectOption('test-multiple-block');
  await waitMarkers(2, first.offensiveAssists.length, 0);
  await choosePlayer(secondTarget.id);
  await waitMarkers(2, 0, 1);
  assert.equal(await page.locator('[data-block-layer="assists"]').getAttribute('data-block-target'), secondTarget.id,
    'GameView target selection changes only the active assists, retaining both block directions');
  await page.keyboard.press('Escape');
  await waitMarkers(0, 0, 0);

  // Target-specific committed choices must remain identifiable and inspectable for either chooser.
  const nativeAttacker = nativeMultiple.rolled.players.find(player => player.id === nativeMultiple.rolled.blockContext.blocks[0].playerId);
  for (const role of [nativeAttacker.role, nativeAttacker.role === 'home' ? 'away' : 'home']) {
    const committed = structuredClone(nativeMultiple.rolled);
    committed.callerRole = role;
    const blocks = committed.blockContext.blocks;
    // The opponent projection preserves native faces but uses the existing null-source chooser contract.
    if (role !== nativeAttacker.role) committed.actions = committed.actions.filter(action => action.kind === 'blockDie')
      .map(action => ({ ...action, actor: role, sourcePlayerId: null }));
    const decoded = decodeSetupStateValue(committed);
    if (role !== nativeAttacker.role) assert.equal(decoded.actions.every(action => action.sourcePlayerId === null), true,
      'opponent chooser actions intentionally have no acting player source');
    const dialog = page.getByRole('dialog', { name: 'Choose a block die', exact: true });
    for (const [index, block] of blocks.entries()) {
      const remaining = blocks.slice(index).map(item => item.targetPlayerId);
      const staged = { ...decoded, revision: decoded.revision + index,
        blockContext: { ...decoded.blockContext, activeTargetPlayerId: block.targetPlayerId },
        actions: decoded.actions.filter(action => !action.id.includes(':multi:') || !action.target
          || !('playerId' in action.target) || remaining.includes(action.target.playerId))
          .map(action => ({ ...action, id: action.id.replace(/^\d+:/, `${decoded.revision + index}:`) })) };
      const decision = matchDecision(staged, staged.actions);
      const target = decoded.players.find(player => player.id === block.targetPlayerId);
      assert.equal(decision.options.filter(option => option.face).length,
        staged.actions.filter(action => action.kind === 'blockDie' && action.target.playerId === target.id).length,
        'Only the current target contributes dice choices');
      for (const option of decision.options)
        assert.ok(option.label.endsWith(`against ${target.name} #${target.number}`), 'every visible target-specific choice identifies the current target');
      await publish({ mode: 'game', view: staged, records: nativeMultiple.records }, true);
      await dialog.waitFor();
      const nativeChoice = staged.actions.find(action => action.kind === 'blockDie' && action.target.playerId === target.id);
      const choice = dialog.getByRole('button', { name: `${nativeChoice.label} against ${target.name} #${target.number}`, exact: true });
      // Initial automatic focus may already be here while a stationary pointer inspects another die.
      // Establish an actual keyboard focus transition rather than refocusing the same element.
      await page.getByLabel('Component', { exact: true }).focus();
      await choice.focus();
      try {
        await page.waitForFunction(target => document.querySelector('[data-block-layer="assists"]').dataset.blockTarget === target, target.id, { timeout: 5000 });
      } catch (error) {
        const observed = await page.evaluate(() => ({ focused: document.activeElement?.getAttribute('aria-label'),
          target: document.querySelector('[data-block-layer="assists"]')?.getAttribute('data-block-target') }));
        throw new Error(`Multiple Block ${role} focus on ${target.id} did not switch assists: ${JSON.stringify(observed)}`, { cause: error });
      }
      await waitMarkers(2, block.offensiveAssists.length, block.defensiveAssists.length);
      assert.deepEqual(await markers('offense').evaluateAll(elements => elements.map(element => element.dataset.blockContributor).sort()),
        block.offensiveAssists.map(assist => assist.playerId).sort(), 'only this native target\'s counted assists are visible');
      assert.equal(await page.locator('[data-block-marker="block"].inactive').count(), 1);
      // Pointer inspection must follow the same target contract as keyboard focus.
      await page.getByLabel('Component', { exact: true }).hover();
      await choice.hover();
      await page.waitForFunction(target => document.querySelector('[data-block-layer="assists"]').dataset.blockTarget === target, target.id, { timeout: 5000 });
      await waitMarkers(2, block.offensiveAssists.length, block.defensiveAssists.length);
      assert.deepEqual(await page.evaluate(() => window.blockVisibilityIntents), [], 'focus and pointer inspection never submit a choice');
      await choice.click();
      assert.deepEqual(await page.evaluate(() => window.blockVisibilityIntents.pop()), { operation: 'action',
        fields: { actionId: nativeChoice.id } });
    }
  }

  const nativeActive = nativeMultiple.rolled.blockContext.blocks.find(block => block.targetPlayerId === nativeMultiple.rolled.blockContext.activeTargetPlayerId);
  await publish({ mode: 'game', view: { ...nativeMultiple.rolled, callerRole: 'spectator' }, records: nativeMultiple.records }, true);
  await waitMarkers(2, nativeActive.offensiveAssists.length, nativeActive.defensiveAssists.length);
  assert.equal(await page.getByRole('dialog', { name: 'Choose a block die', exact: true }).count(), 0,
    'spectators see both committed directions without acquiring native chooser actions');
  await publish({ mode: 'replay', view: nativeMultiple.rolled, records: nativeMultiple.records, enabled: true }, true);
  await waitMarkers(2, nativeActive.offensiveAssists.length, nativeActive.defensiveAssists.length);
  await publish({ view: nativeMultiple.resolved });
  await page.waitForFunction(revision => document.querySelector('#block-playback-state').dataset.revision === String(revision), nativeMultiple.resolved.revision);
  await waitMarkers(0, 0, 0);
  await publish({ view: nativeMultiple.rolled });
  await waitMarkers(2, nativeActive.offensiveAssists.length, nativeActive.defensiveAssists.length);

  // Production replay hook must restore snapshots on backward seek and clear on forward seek/reconnect.
  await publish({ mode: 'replay', view: journey.rolled, records: journey.records, enabled: true }, true);
  await waitMarkers(1, first.offensiveAssists.length, first.defensiveAssists.length);
  await publish({ view: journey.resolved });
  await page.waitForFunction(revision => document.querySelector('#block-playback-state').dataset.revision === String(revision), journey.resolved.revision);
  await waitMarkers(0, 0, 0);
  await publish({ view: journey.rolled });
  await waitMarkers(1, first.offensiveAssists.length, first.defensiveAssists.length);
  await publish({ view: cleared, enabled: false });
  await waitMarkers(0, 0, 0);
  await publish({ view: journey.rolled, enabled: true });
  await waitMarkers(1, first.offensiveAssists.length, first.defensiveAssists.length);
  assert.deepEqual(errors, []);
  console.log('PASS: native ordinary/blitz/uphill and Multiple Block; all roles/cameras; marker geometry/layers; static/reduced motion/390px; private selection/cancel; target-labelled native choices and null-source opponent focus/pointer inspection; replay seek/reconnect; stale dice clearing.');
} finally { await browser.close(); await server.close(); }
