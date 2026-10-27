import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';
import { setCameraAngle, setCameraMode } from './camera-controls.mjs';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const view = { ...initial, phase: 'PLAY', turnMode: 'REGULAR', prompt: null, reaction: undefined, kickPreview: undefined,
  actions: [], activePlayerId: null, players: [
    { ...initial.players[0], id: 'human', x: 12, y: 7, art: { rosterId: 'human', positionId: 'blitzer' } },
    { ...initial.players[1], id: 'orc', x: 13, y: 7, art: { rosterId: 'orc', positionId: 'troll' } },
  ] };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const errors = [];
const evidence = process.env.CURSOR_SQUARE_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(view => { window.cursorInput = { view, selectedId: 'human' }; window.cursorIntents = []; }, view);
  await page.route('**/cursor-test', route => route.fulfill({ contentType: 'text/html', body: `
    <style>html,body{margin:0;height:100%;background:#101c2b}.play-runtime{height:100%}
    #app .live-pitch{height:100%;display:flex;flex-direction:column;margin:0;padding:0;box-sizing:border-box}
    #app .live-pitch-viewport{flex:1;max-height:none;min-height:0;aspect-ratio:auto}</style>
    <div id="app" class="play-runtime"></div><script type="module" src="/test/cursor-square-harness.tsx"></script>` }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/cursor-test`);
  await page.locator('[data-player-id="human"]').waitFor();
  const marker = page.locator('.live-hover-square');
  const expectSquare = async square => {
    await page.waitForFunction(square => document.querySelector('.live-hover-square')?.getAttribute('data-hover-square') === square, square);
  };
  const expectHidden = () => marker.waitFor({ state: 'detached' });
  const publish = async (options = {}) => {
    await page.evaluate(input => window.publishCursorInput(input), { view, selectedId: 'human', ...options });
  };
  const hover = async (x, y) => {
    const local = await squarePosition(page, x, y), bounds = await page.locator('.live-pitch-scene').boundingBox();
    const position = { x: local.x + bounds.x, y: local.y + bounds.y };
    await page.mouse.move(position.x, position.y);
    return position;
  };
  await expectHidden();
  for (const role of ['home', 'away', 'spectator']) {
    await publish({ view: { ...view, callerRole: role, actor: role === 'home' ? 'away' : 'home' }, readOnly: role === 'spectator' });
    for (const angle of [30, 40, 50, 90]) {
      if (angle === 90) await setCameraMode(page, 'top-down'); else await setCameraAngle(page, String(angle));
      await hover(11, 8); await expectSquare('11,8');
      assert.equal(await page.locator('[data-selection="human"]').count(), 1, 'Hover preserves selected player');
      const styles = await page.locator('.live-selection-square').evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        return { stroke: style.stroke, fill: style.fill, width: style.strokeWidth };
      }));
      assert.deepEqual(styles[0], styles[1], 'Hover reuses the selected-square appearance');
      assert.equal(await marker.evaluate(element => getComputedStyle(element).pointerEvents), 'none');
      await hover(12, 7); await expectHidden();
      assert.equal(await page.locator('.live-selection-square').count(), 1, 'Coincident outlines are deduplicated');
      await hover(13, 7); await expectSquare('13,7');
    }
  }
  assert.deepEqual(await page.evaluate(() => window.cursorIntents), [], 'Hover and inspection send no game intents');
  await publish();
  await setCameraMode(page, 'top-down');
  const position = await hover(11, 8); await expectSquare('11,8');
  await page.mouse.click(position.x, position.y);
  assert.deepEqual(await page.evaluate(() => window.cursorIntents.at(-1)), { x: 11, y: 8 }, 'Hover matches the click square');
  const occupied = await hover(13, 7); await expectSquare('13,7');
  await page.mouse.click(occupied.x, occupied.y);
  await expectHidden();
  assert.equal(await page.locator('[data-selection="orc"]').count(), 1, 'Click selects normally');
  await publish();

  // Cover a stationary pointer with an overlay both inside and outside the scene.
  for (const inside of [false, true]) {
    const position = await hover(11, 8); await expectSquare('11,8');
    await page.evaluate(({ position, inside }) => {
      const overlay = document.createElement('aside'); overlay.id = 'cursor-overlay';
      overlay.style.cssText = `position:fixed;z-index:9999;left:${position.x - 30}px;top:${position.y - 30}px;width:60px;height:60px;background:#123`;
      (inside ? document.querySelector('.live-pitch-scene') : document.body).append(overlay);
    }, { position, inside });
    await expectHidden();
    await page.evaluate(() => document.getElementById('cursor-overlay').remove());
    await expectSquare('11,8');
  }
  const animatedPosition = await hover(11, 8); await expectSquare('11,8');
  await page.evaluate(position => {
    const overlay = document.createElement('aside'); overlay.id = 'cursor-overlay';
    overlay.style.cssText = `position:fixed;z-index:9999;left:${position.x - 30}px;top:${position.y - 30}px;width:60px;height:60px;background:#123;transform:translateX(120px);transition:transform .15s linear`;
    document.body.append(overlay);
    overlay.getBoundingClientRect();
    requestAnimationFrame(() => { overlay.style.transform = 'translateX(0)'; });
  }, animatedPosition);
  await expectHidden();
  await page.evaluate(() => document.getElementById('cursor-overlay').remove());
  await expectSquare('11,8');
  const hoverPosition = await hover(11, 8);
  const action = kind => ({ id: kind, actor: 'home', kind, label: kind, sourcePlayerId: 'human', target: { x: 11, y: 8 } });
  for (const options of [
    { interactionBlocked: true }, { draggingPlayerId: 'human' },
    { view: { ...view, phase: 'READY_FOR_KICKOFF', actions: [action('kickoff')] } },
    ...['followUp', 'push', 'hitAndRun', 'kickoffMove', 'reactiveSquare'].map(kind => ({ view: { ...view, actions: [action(kind)] } })),
    { decision: { key: 'sidestep', kind: 'skill', title: 'Sidestep', options: [],
      pitchSelection: { playerId: 'human', choices: [], committed: true } } },
  ]) {
    await publish(options); await expectHidden();
    await publish(); await expectSquare('11,8');
  }
  // Replay seeks and revision changes restore hover from physical coordinates.
  await publish({ readOnly: true, view: { ...view, callerRole: 'spectator', revision: view.revision + 1 } });
  await expectSquare('11,8');
  await publish({ readOnly: true, playback: true }); await expectSquare('11,8');
  await publish();
  await page.touchscreen.tap(hoverPosition.x, hoverPosition.y); await expectHidden();
  await hover(11, 8); await expectSquare('11,8');
  const viewport = page.locator('.live-pitch-viewport');
  await viewport.dispatchEvent('pointermove', { pointerType: 'pen', clientX: hoverPosition.x, clientY: hoverPosition.y, buttons: 0, pressure: 0 });
  await expectSquare('11,8');
  await viewport.dispatchEvent('pointermove', { pointerType: 'pen', clientX: hoverPosition.x, clientY: hoverPosition.y, buttons: 1, pressure: .5 });
  await expectHidden();
  await viewport.dispatchEvent('pointermove', { pointerType: 'pen', clientX: hoverPosition.x, clientY: hoverPosition.y, buttons: 0, pressure: 0 });
  await expectSquare('11,8');
  await viewport.dispatchEvent('pointercancel', { pointerType: 'pen' }); await expectHidden();
  await hover(11, 8); await expectSquare('11,8');
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await expectHidden();
  await hover(11, 8); await expectSquare('11,8');
  await viewport.focus(); await page.keyboard.press('ArrowRight'); await expectHidden();
  assert.equal(await page.locator('.live-keyboard-square').count(), 1, 'Keyboard navigation keeps its own marker');
  await hover(11, 8); await expectSquare('11,8');
  await page.mouse.down({ button: 'right' }); await expectHidden();
  await page.mouse.move(hoverPosition.x + 30, hoverPosition.y + 20);
  await page.mouse.up({ button: 'right' });
  await hover(11, 8); await expectSquare('11,8');
  if (evidence) await page.screenshot({ path: `${evidence}/cursor-square-selection.png` });
  await page.mouse.move(1, 1); await expectHidden();
  // Exercise the actual completed-match replay, including blocked history loads.
  await publish({ replayResult: true });
  await page.locator('.live-pitch-viewport').scrollIntoViewIfNeeded();
  await hover(11, 8); await expectSquare('11,8');
  await publish({ replayResult: true, interactionBlocked: true }); await expectHidden();
  await publish({ replayResult: true }); await expectSquare('11,8');
  await publish({ replayResult: true, view: { ...view, revision: view.revision + 1 } }); await expectSquare('11,8');
  // Use the production coach HUD to check the actual panels over the pitch.
  await page.addInitScript(view => { window.hudState = view; window.hudIntents = []; window.hudMessages = []; }, view);
  await page.route('**/cursor-hud', route => route.fulfill({ contentType: 'text/html', body:
    '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/cursor-hud`);
  await page.addStyleTag({ content: readFileSync(new URL('../../site/src/assets/play.css', import.meta.url), 'utf8') });
  await page.evaluate(() => document.body.classList.add('game-match'));
  await page.locator('.coach-match').waitFor();
  await setCameraAngle(page, '40');
  for (const selector of ['.match-history-log', '.match-history-chat', '.live-dugout-zone']) {
    await hover(11, 8); await expectSquare('11,8');
    await page.locator(selector).first().hover(); await expectHidden();
  }
  await hover(11, 8); await expectSquare('11,8');
  if (evidence) await page.screenshot({ path: `${evidence}/cursor-live-pitch.png` });
  assert.deepEqual(errors, []);
  console.log('PASS cursor square: canonical cells, preserved selection, all views/angles, overlays, stationary mode changes, hybrid pointer input, keyboard and camera');
} finally { await browser.close(); await server.close(); }
