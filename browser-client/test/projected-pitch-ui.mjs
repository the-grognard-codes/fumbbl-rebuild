import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { squarePosition } from './projected-pitch-helper.mjs';
import { resolvePlayerArt } from '../src/player-art.ts';

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
async function open(role, failArt = false) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 660 } });
  page.on('pageerror', error => errors.push(error.message));
  if (failArt) await page.route('**/poses/**/master/*.png', route => route.fulfill({ status: 404, body: '' }));
  await page.addInitScript(state => { window.initial = state; window.intents = []; }, { ...initial, players, callerRole: role, activePlayerId: 'human', ball: { x: 12, y: 8 } });
  await page.route('**/scene-test', route => route.fulfill({ contentType: 'text/html', body: `
    <style>html,body{margin:0;height:100%;background:#101c2b}.play-runtime{height:100%}#app .live-pitch{height:100%;display:flex;flex-direction:column;margin:0;padding:0;box-sizing:border-box}#app .live-pitch-viewport{flex:1;max-height:none;min-height:0;aspect-ratio:auto}</style>
    <div id="app" class="play-runtime"></div><script type="module" src="/test/projected-pitch-harness.tsx"></script>` }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scene-test`);
  await page.locator('[data-player-id="human"]').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.live-marker img')].every(image => image.complete));
  return page;
}
try {
  for (const role of ['home', 'away']) {
    const page = await open(role);
    const scene = page.locator('.live-pitch-scene'), frame = page.locator('.live-pitch-viewport');
    assert.equal(await scene.getAttribute('data-end'), role);
    assert.equal(await scene.locator('[data-cell-x]').count(), 390);
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
    await page.waitForFunction(() => Number(document.querySelector('.live-pitch-scene').dataset.focus) !== 13);
    assert.notEqual(await scene.locator('.pitch-stadium-plate').first().getAttribute('style'), before);
    const focus = await scene.getAttribute('data-focus');
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
        const left = parseFloat(marker.style.left) + parseFloat(image.style.left);
        const top = parseFloat(marker.style.top) + parseFloat(image.style.top);
        return { dx: left + (bounds.x + bounds.width / 2) * scale - Number(marker.dataset.centerX),
          dy: top + (bounds.y + bounds.height / 2) * scale - Number(marker.dataset.centerY) };
      }, bounds);
      assert.ok(Math.abs(offset.dx) < .001 && Math.abs(offset.dy) < .001, `visible ${player.id} artwork is centered`);
    }
    const destination = await squarePosition(page, 10, 9);
    await scene.click({ position: destination });
    assert.deepEqual(await page.evaluate(() => window.intents), [{ player: 'human' }, { x: 10, y: 9 }]);
    const box = await frame.boundingBox();
    await page.mouse.move(box.x + box.width * .35, box.y + box.height * .7);
    await page.mouse.down(); await page.mouse.move(box.x + box.width * .35, box.y + box.height * .7 - 90, { steps: 8 }); await page.mouse.up();
    assert.equal(await page.evaluate(() => window.intents.length), 2, 'drag to pan does not select or commit');
    await frame.focus(); await frame.press('ArrowUp'); await frame.press('ArrowRight');
    assert.equal(await scene.locator('.live-keyboard-square').count(), 1);
    assert.equal(await page.evaluate(() => window.intents.length), 2, 'keyboard navigation never mutates');
    await page.getByRole('button', { name: 'Midfield', exact: true }).click();
    for (const [width, height] of [[1920,1080],[1920,900],[1920,820],[1280,660],[375,660]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('.live-pitch-scene').style.width) - document.querySelector('.live-pitch-viewport').clientWidth) < 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.setViewportSize({ width: 1280, height: 660 });
    if (evidence) await page.screenshot({ path: `${evidence}/tactical-${role}.png` });
    await page.getByRole('button', { name: 'Perspective view', exact: true }).click();
    if (evidence) await page.screenshot({ path: `${evidence}/perspective-${role}.png` });
    await page.close();
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
