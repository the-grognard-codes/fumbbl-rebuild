import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-push-artwork.json', import.meta.url), 'utf8'));
const evidence = process.env.FOLLOW_UP_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1237, height: 617 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, journeys[0].frames[0].home);
  await page.route('**/follow-up-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/follow-up-test`);
  await page.addStyleTag({ content: readFileSync(new URL('../../site/src/assets/play.css', import.meta.url), 'utf8') });
  await page.evaluate(() => document.body.classList.add('game-match'));
  await page.locator('.coach-match').waitFor();
  for (const journey of journeys) for (const role of ['home', 'away']) {
    const pending = journey.frames.find(frame => frame.checkpoint === 'pushed').home;
    const resolved = journey.frames.find(frame => frame.checkpoint === 'resolved').home;
    const destination = resolved.players.find(player => player.id === pending.activePlayerId);
    const state = { ...pending, callerRole: role, actor: role, actions: pending.actions.map(action => ({ ...action, actor: role })),
      players: pending.players.map(player => ({ ...player, role: role === 'away' ? player.role === 'home' ? 'away' : 'home' : player.role })) };
    assert.deepEqual(state.actions.find(action => action.label === 'Follow up').target, { x: destination.x, y: destination.y });
    await page.evaluate(state => window.publishHud(state), state);
    const dialog = page.getByRole('dialog', { name: 'Match decision', exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(element => element.matches(':modal')), false, 'Follow-up allows pitch inspection');
    assert.equal(await dialog.getAttribute('aria-modal'), 'false');
    const waitForClearPrompt = () => page.waitForFunction(() => {
      const prompt = document.querySelector('.match-decision-dialog').getBoundingClientRect();
      return [...document.querySelectorAll('.live-marker.active, .live-follow-up-preview')].every(element => {
        const actor = element.getBoundingClientRect();
        return prompt.right <= actor.left || prompt.left >= actor.right || prompt.bottom <= actor.top || prompt.top >= actor.bottom;
      });
    });
    for (const [width, height] of [[1237, 617], [640, 330]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => {
        const element = document.querySelector('.match-decision-dialog');
        if (!element) return false;
        const box = element.getBoundingClientRect();
        return Math.abs(box.x + box.width / 2 - innerWidth / 2) < 2
          && box.top >= 0 && box.bottom <= innerHeight;
      });
      assert.equal(await dialog.evaluate(element => {
        const box = element.getBoundingClientRect();
        return Math.abs(box.x + box.width / 2 - innerWidth / 2) < 2
          && box.top >= 0 && box.bottom <= innerHeight;
      }), true, 'Follow-up stays horizontally centered and inside the viewport');
      await waitForClearPrompt();
      const preview = page.getByLabel(`Follow-up destination: ${destination.x}, ${destination.y}`, { exact: true });
      await preview.waitFor();
      assert.equal(await preview.locator('.live-push-shaft').count(), 1);
      assert.equal(await preview.locator('.live-push-head').count(), 1);
      assert.equal(await preview.evaluate(element => getComputedStyle(element).pointerEvents), 'none', 'Preview cannot submit an action');
      if (evidence) await page.screenshot({ path: `${evidence}/${role}-${journey.chain ? 'chain' : 'ordinary'}-${width}.png` });
      const pitch = page.locator('.live-pitch-viewport');
      const scene = page.locator('.live-pitch-scene');
      const before = await scene.getAttribute('data-focus');
      const pitchPoint = () => pitch.evaluate(element => {
        const box = element.getBoundingClientRect();
        for (const column of [.35, .65, .2, .8]) for (const row of [.7, .4, .6]) {
          const x = box.x + box.width * column, y = box.y + box.height * row;
          if (y < 80 || y + 60 >= innerHeight) continue;
          if (document.elementFromPoint(x, y)?.closest('.live-pitch-viewport') === element) return { x, y };
        }
        throw Error('No unobstructed pitch point available for panning');
      });
      const start = await pitchPoint();
      await page.mouse.move(start.x, start.y);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(start.x, start.y + 60, { steps: 6 });
      await page.mouse.up({ button: 'right' });
      await page.waitForFunction(before => document.querySelector('.live-pitch-scene').dataset.focus !== before, before);
      const zoom = await scene.getAttribute('data-zoom');
      const wheelPoint = await pitchPoint();
      await page.mouse.move(wheelPoint.x, wheelPoint.y);
      await page.mouse.wheel(0, Number(zoom) > 1 ? 120 : -120);
      await page.waitForFunction(before => document.querySelector('.live-pitch-scene').dataset.zoom !== before, zoom);
      await waitForClearPrompt();
      assert.equal(await dialog.isVisible(), true, 'Panning leaves the decision open');
      assert.equal(await dialog.getByRole('button', { name: 'Yes', exact: true }).isEnabled(), true);
      await page.keyboard.press('Escape');
      assert.equal(await dialog.isVisible(), true, 'Escape cannot silently dismiss a pending decision');
    }
    const answer = journey.chain ? 'Yes' : 'No';
    await dialog.getByRole('button', { name: answer, exact: true }).click();
    assert.equal(await page.evaluate(() => window.hudIntents.at(-1).fields.actionId), state.actions.find(action => action.label === (answer === 'Yes' ? 'Follow up' : 'Do not follow up')).id);
    await page.evaluate(state => window.publishHud({ ...state, activePlayerId: null, actions: [] }), resolved);
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.live-follow-up-preview').count(), 0, 'Resolved follow-up clears its preview');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: ordinary/chain follow-up for both coach views is centered, non-modal, previews the destination and permits panning while Yes/No remain available.');
} finally { await browser.close(); await server.close(); }
