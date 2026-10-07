import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { squarePosition } from './projected-pitch-helper.mjs';
import { resolvePlayerArt } from '../src/player-art.ts';
import { PitchProjection } from '../src/pitch-projection.ts';

// Rendering/input regression evidence only; full live acceptance uses real v2.
const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const players = [
  { ...initial.players[0], id: 'human', x: 12, y: 7, art: { rosterId: 'human', positionId: 'blitzer' } },
  { ...initial.players[1], id: 'orc', x: 13, y: 7, art: { rosterId: 'orc', positionId: 'troll' } },
  { ...initial.players[0], id: 'prone', x: 12, y: 6, state: 'is prone', art: { rosterId: 'human', positionId: 'ogre' } },
  { ...initial.players[1], id: 'stunned', x: 13, y: 6, state: 'has been stunned', art: { rosterId: 'orc', positionId: 'goblin-lineman' } },
];
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const errors = [];
const evidence = process.env.PITCH_SCENE_EVIDENCE_DIR;
if (evidence) await mkdir(evidence, { recursive: true });
async function open(role, failArt = false, phase = initial.phase) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 660 } });
  page.on('pageerror', error => errors.push(error.message));
  if (failArt) await page.route('**/poses/**/master/*.png', route => route.fulfill({ status: 404, body: '' }));
  await page.addInitScript(state => { window.initial = state; window.intents = []; }, { ...initial, players, phase, callerRole: role, activePlayerId: 'human', ball: { x: 12, y: 8 } });
  await page.route('**/scene-test', route => route.fulfill({ contentType: 'text/html', body: `
    <style>html,body{margin:0;height:100%;background:#101c2b}.play-runtime{height:100%}#app .live-pitch{height:100%;display:flex;flex-direction:column;margin:0;padding:0;box-sizing:border-box}#app .live-pitch-viewport{flex:1;max-height:none;min-height:0;aspect-ratio:auto}</style>
    <div id="app" class="play-runtime"></div><script type="module" src="/test/projected-pitch-harness.tsx"></script>` }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scene-test`);
  await page.locator('[data-player-id="human"]').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.live-marker img')].every(image => image.complete));
  return page;
}
async function assertProjectedBallAndStands(page, role, mode, angle) {
  const scene = page.locator('.live-pitch-scene');
  const rendered = await scene.evaluate(element => {
    const ball = element.querySelector('.live-ball-marker');
    const pulse = element.querySelector('.live-ball-pulse');
    const structure = element.querySelector('.pitch-stadium-structure');
    return { width: Number.parseFloat(element.style.width), height: Number.parseFloat(element.style.height),
      focus: Number(element.dataset.focus), transverseFocus: Number(element.dataset.transverseFocus),
      zoom: Number(element.dataset.zoom), transform: ball.getAttribute('transform'),
      pointerEvents: getComputedStyle(ball).pointerEvents, animation: getComputedStyle(pulse).animationName,
      pulseFrames: pulse.getAnimations()[0]?.effect?.getKeyframes().map(frame => frame.transform),
      arrowFill: getComputedStyle(element.querySelector('.live-ball-arrow')).fill,
      structureDisplay: getComputedStyle(structure).display };
  });
  const expected = new PitchProjection({ width: rendered.width, height: rendered.height, focus: rendered.focus,
    transverseFocus: rendered.transverseFocus, zoom: rendered.zoom, end: role, mode,
    perspectiveElevation: angle }).project({ x: 12.5, y: 8.5 });
  const actual = /^translate\(([-\d.]+) ([-\d.]+)\)$/.exec(rendered.transform);
  assert.ok(actual && expected, 'ball marker has a projected transform');
  assert.ok(Math.abs(Number(actual[1]) - expected.x) < .02 && Math.abs(Number(actual[2]) - expected.y) < .02,
    'ball marker uses canonical square center');
  assert.equal(rendered.pointerEvents, 'none');
  assert.equal(rendered.animation, 'live-ball-inward');
  assert.deepEqual(rendered.pulseFrames, ['scale(1.55)', 'scale(0.75)']);
  assert.notEqual(rendered.arrowFill, 'none');
  assert.equal(rendered.structureDisplay, 'block');
  assert.equal(await scene.locator('.live-ball-arrow').count(), 4);
  for (const edge of ['north', 'south', 'home', 'away']) {
    assert.equal(await scene.locator(`.pitch-stadium-structure [data-stand-edge="${edge}"]`).count(), 4);
    assert.ok((await scene.locator(`.pitch-stadium-structure [data-stand-edge="${edge}"]`).first().getAttribute('points')).length > 8);
  }
}
try {
  for (const role of ['home', 'away']) {
    const page = await open(role);
    const scene = page.locator('.live-pitch-scene'), frame = page.locator('.live-pitch-viewport');
    assert.equal(await scene.getAttribute('data-end'), role);
    assert.equal(await scene.locator('[data-cell-x]').count(), 390);
    assert.equal(await scene.locator('.live-ball-marker[data-ball-x="12"][data-ball-y="8"]').count(), 1);
    assert.equal(await scene.locator('.live-ball-arrow').count(), 4);
    assert.equal(await scene.locator('.pitch-stadium-structure [data-stand-row]').count(), 4);
    assert.ok(await scene.locator('.pitch-stadium-crowd [data-crowd-team="home"]').count() > 0);
    assert.ok(await scene.locator('.pitch-stadium-crowd [data-crowd-team="away"]').count() > 0);
    assert.equal(await scene.locator('[data-player-id="prone"]').getAttribute('data-pose'), 'prone');
    assert.equal(await scene.locator('[data-player-id="stunned"]').getAttribute('data-pose'), 'stunned');
    assert.equal(await scene.locator('[data-player-id="human"]').getAttribute('data-pose'), role === 'home' ? 'back' : 'front');
    await scene.locator('[data-player-id="orc"]').hover();
    assert.deepEqual(await page.evaluate(() => window.intents), []);
    // A nearer sprite canvas overlaps this farther player, but cannot steal its cell.
    await scene.locator('[data-player-id="orc"]').click();
    assert.deepEqual(await page.evaluate(() => window.intents), [{ player: 'orc' }]);
    await page.evaluate(() => { window.intents = []; });
    await scene.locator('[data-player-id="human"]').click();
    assert.deepEqual(await page.evaluate(() => window.intents), [{ player: 'human' }]);
    assert.equal(await scene.locator('.live-selection-square').getAttribute('data-selection'), 'human');
    assert.equal(await scene.locator('.live-marker.selected').evaluate(element => getComputedStyle(element).outlineStyle), 'none');
    const before = await scene.locator('.pitch-stadium-plate').first().getAttribute('style');
    await frame.dispatchEvent('wheel', { deltaY: 120 });
    await page.waitForFunction(() => Number(document.querySelector('.live-pitch-scene').dataset.zoom) < 1);
    assert.equal(await scene.getAttribute('data-focus'), '13');
    assert.notEqual(await scene.locator('.pitch-stadium-plate').first().getAttribute('style'), before);
    const focus = await scene.getAttribute('data-focus');
    for (const angle of [30, 50, 40]) {
      const reportsBefore = await page.evaluate(() => window.selectionReports.length);
      await page.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      await page.waitForFunction(before => window.selectionReports.length > before, reportsBefore, { timeout: 1500 });
      assert.equal(await scene.getAttribute('data-elevation'), String(angle));
      assert.equal(await scene.getAttribute('data-focus'), focus);
      assert.equal(await scene.locator('.live-selection-square').getAttribute('data-selection'), 'human');
      assert.equal(await scene.locator('.live-route-line').count(), 1);
      assert.deepEqual(await page.evaluate(() => window.intents), [{ player: 'human' }]);
      const target = await squarePosition(page, 12, 10);
      await scene.click({ position: target });
      assert.deepEqual(await page.evaluate(() => window.intents.at(-1)), { x: 12, y: 10 }, 'Each elevation resolves the same canonical ground target');
      await page.evaluate(() => { window.intents.pop(); });
      if (evidence && angle !== 40) await page.screenshot({ path: `${evidence}/perspective-${angle}-${role}.png` });
    }
    await page.getByRole('button', { name: 'Top-down view', exact: true }).click();
    assert.equal(await scene.getAttribute('data-focus'), focus);
    assert.equal(await scene.getAttribute('data-projection'), 'top-down');
    const centered = await scene.locator('.live-marker').evaluateAll(markers => markers.every(marker => {
      const x = parseFloat(marker.style.left) + parseFloat(marker.style.width) / 2;
      const y = parseFloat(marker.style.top) + parseFloat(marker.style.height) / 2;
      return Math.abs(x - Number(marker.dataset.centerX)) < .001 && Math.abs(y - Number(marker.dataset.centerY)) < .001;
    }));
    assert.equal(centered, true, 'tactical visible bounds and ground poses center within their canonical cells');
    for (const player of players) {
      const art = resolvePlayerArt(player, { end: role });
      const bounds = art.body.bounds;
      const offset = await scene.locator(`[data-player-id="${player.id}"]`).evaluate((marker, bounds) => {
        const image = marker.querySelector('img');
        const scale = parseFloat(image.style.width) / image.naturalWidth;
        const scene = marker.closest('.live-pitch-scene').getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();
        const left = imageRect.left - scene.left;
        const top = imageRect.top - scene.top;
        return { dx: left + (bounds.x + bounds.width / 2) * scale - Number(marker.dataset.centerX),
          dy: top + (bounds.y + bounds.height / 2) * scale - Number(marker.dataset.centerY) };
      }, bounds);
      assert.ok(Math.abs(offset.dx) < .04 && Math.abs(offset.dy) < .04, `visible ${player.id} artwork is centered`);
    }
    const destination = await squarePosition(page, 10, 9);
    await scene.click({ position: destination });
    assert.deepEqual(await page.evaluate(() => window.intents), [{ player: 'human' }, { x: 10, y: 9 }]);
    const box = await frame.boundingBox();
    const panFocus = await scene.getAttribute('data-focus');
    const turfPlate = await scene.locator('.pitch-stadium-plate').first().getAttribute('style');
    await page.mouse.move(box.x + box.width * .35, box.y + box.height * .7);
    await page.mouse.down({ button: 'right' }); await page.mouse.move(box.x + box.width * .35, box.y + box.height * .7 - 90, { steps: 8 }); await page.mouse.up({ button: 'right' });
    await page.waitForFunction(before => document.querySelector('.live-pitch-scene').dataset.focus !== before, panFocus);
    assert.notEqual(await scene.locator('.pitch-stadium-plate').first().getAttribute('style'), turfPlate, 'turf tiles travel with the camera');
    assert.equal(await page.evaluate(() => window.intents.length), 2, 'drag to pan does not select or commit');
    const afterPan = await scene.evaluate(element => ({ width: Number.parseFloat(element.style.width), height: Number.parseFloat(element.style.height),
      focus: Number(element.dataset.focus), transverseFocus: Number(element.dataset.transverseFocus),
      zoom: Number(element.dataset.zoom), end: element.dataset.end, mode: element.dataset.projection,
      perspectiveElevation: 40 }));
    const panCamera = new PitchProjection(afterPan);
    const empty = panCamera.visibleCells().map(cell => ({ cell, projected: panCamera.project({ x: cell.x + .5, y: cell.y + .5 }) }))
      .find(({ cell, projected }) => !players.some(player => player.x === cell.x && player.y === cell.y)
        && projected.x > afterPan.width * .3 && projected.x < afterPan.width * .7
        && projected.y > afterPan.height * .35 && projected.y < afterPan.height * .65);
    assert.ok(empty, 'an unobstructed cell is visible after panning');
    const pannedBounds = await scene.boundingBox();
    await scene.click({ position: { x: empty.projected.x * pannedBounds.width / afterPan.width,
      y: empty.projected.y * pannedBounds.height / afterPan.height } });
    assert.deepEqual(await page.evaluate(() => window.intents.at(-1)), empty.cell, 'first left click after right pan is delivered');
    assert.equal(await page.evaluate(() => window.intents.length), 3, 'first left click after right pan produces one intent');
    await frame.focus(); await frame.press('ArrowUp'); await frame.press('ArrowRight');
    assert.equal(await scene.locator('.live-keyboard-square').count(), 1);
    assert.equal(await page.evaluate(() => window.intents.length), 3, 'keyboard navigation never mutates');
    await page.getByRole('button', { name: 'Midfield', exact: true }).click();
    for (const [width, height] of [[1920,1080],[1920,900],[1920,820],[1280,660],[375,660]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('.live-pitch-scene').style.width) - document.querySelector('.live-pitch-viewport').clientWidth) < 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.setViewportSize({ width: 1280, height: 660 });
    await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('.live-pitch-scene').style.width) - document.querySelector('.live-pitch-viewport').clientWidth) < 3);
    if (evidence) await page.screenshot({ path: `${evidence}/tactical-${role}.png` });
    await page.getByRole('button', { name: 'Perspective view', exact: true }).click();
    if (evidence) await page.screenshot({ path: `${evidence}/perspective-${role}.png` });
    await page.close();
  }
  for (const role of ['home', 'away']) {
    const setup = await open(role, false, 'SETUP');
    const marker = setup.locator('[data-player-id="human"]');
    const opponent = setup.locator('[data-player-id="orc"]');
    await setup.evaluate(() => window.updatePitchView({ ...window.initial, revision: window.initial.revision + 1,
      players: window.initial.players.map(player => player.id === 'human' ? { ...player, x: 11 }
        : player.id === 'orc' ? { ...player, x: 14 } : player) }));
    await setup.waitForFunction(() => document.querySelector('[data-player-id="human"]').dataset.x === '11');
    for (const angle of [30, 40, 50]) {
      await setup.getByLabel('Perspective angle', { exact: true }).selectOption(String(angle));
      assert.equal(await marker.getAttribute('data-pose'), role === 'home' ? 'back' : 'front', 'setup facing ignores movement direction in perspective');
      assert.equal(await opponent.getAttribute('data-pose'), role === 'home' ? 'front' : 'back', 'opposing team faces the other end zone');
      assert.equal(await setup.locator('[data-player-id="prone"]').getAttribute('data-pose'), 'prone');
      assert.equal(await setup.locator('[data-player-id="stunned"]').getAttribute('data-pose'), 'stunned');
      await assertProjectedBallAndStands(setup, role, 'perspective', angle);
      if (evidence) await setup.screenshot({ path: `${evidence}/setup-perspective-${angle}-${role}.png` });
    }
    if (role === 'home') {
      const hiddenCrowd = await setup.addStyleTag({ content: '.pitch-stadium-crowd { display: none !important; }' });
      assert.equal(await setup.locator('.pitch-stadium-crowd').evaluate(element => getComputedStyle(element).display), 'none');
      assert.equal(await setup.locator('.pitch-stadium-structure').evaluate(element => getComputedStyle(element).display), 'block');
      assert.equal(await setup.locator('.pitch-stadium-structure [data-stand-row]').count(), 4);
      assert.equal(await setup.locator('.pitch-stadium-world image').count(), 0, 'no unmasked spectator-bearing side-tile images remain');
      assert.ok(await setup.locator('.pitch-stadium-world img').evaluateAll(images => images.length > 0 && images.every(image =>
        image.classList.contains('pitch-stadium-turf') && getComputedStyle(image).clipPath.startsWith('polygon('))),
      'every source painting is clipped to its turf region');
      if (evidence) await setup.screenshot({ path: `${evidence}/stadium-crowd-hidden-50-home.png` });
      await hiddenCrowd.evaluate(element => element.remove());
    }
    await setup.getByRole('button', { name: 'Top-down view', exact: true }).click();
    await setup.waitForFunction(expected => document.querySelector('[data-player-id="human"]').dataset.pose === expected,
      role === 'home' ? 'back' : 'front');
    assert.equal(await marker.getAttribute('data-pose'), role === 'home' ? 'back' : 'front', 'top-down standing art ignores movement facing');
    assert.equal(await opponent.getAttribute('data-pose'), role === 'home' ? 'front' : 'back', 'top-down opposing art ignores movement facing');
    await assertProjectedBallAndStands(setup, role, 'top-down', 50);
    await setup.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await setup.locator('.live-ball-pulse').evaluate(element => getComputedStyle(element).animationName), 'none');
    if (evidence) await setup.screenshot({ path: `${evidence}/setup-top-down-${role}.png` });
    await setup.close();
  }
  const readonly = await open('spectator');
  await readonly.locator('[data-player-id="human"]').click();
  await readonly.locator('.live-pitch-viewport').dispatchEvent('wheel', { deltaY: 90 });
  await readonly.getByRole('button', { name: 'Away coach view', exact: true }).click();
  assert.deepEqual(await readonly.evaluate(() => window.intents), []);
  await readonly.close();
  const missing = await open('home', true);
  await missing.locator('.live-token').first().waitFor();
  const tokenOffsets = await missing.locator('.live-token').evaluateAll(tokens => tokens.map(token => {
    const rect = token.getBoundingClientRect(), marker = token.parentElement;
    const scene = marker.closest('.live-pitch-scene').getBoundingClientRect();
    return { id: marker.dataset.playerId, dx: rect.x + rect.width / 2 - scene.x - Number(marker.dataset.centerX),
      dy: rect.y + rect.height / 2 - scene.y - Number(marker.dataset.centerY) };
  }));
  assert.ok(tokenOffsets.every(offset => Math.abs(offset.dx) < .02 && Math.abs(offset.dy) < .02), `unavailable art stays centered at the canonical ground anchor: ${JSON.stringify(tokenOffsets)}`);
  await missing.locator('[data-player-id="human"]').click();
  assert.deepEqual(await missing.evaluate(() => window.intents), [{ player: 'human' }]);
  await missing.close();
  assert.deepEqual(errors, []);
  console.log('PASS: both projected views preserve canonical intents, moving scenery, pose anchors, camera-only gestures, read-only inspection and unavailable-art fallback.');
} finally { if (errors.length) console.error(errors); await browser.close(); await server.close(); }
