import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/roundup5-onball-contracts.json', import.meta.url), 'utf8'));
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const evidence = fileURLToPath(new URL('../../.tools/roundup5-evidence/', import.meta.url));
mkdirSync(evidence, { recursive: true });
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, hasTouch: false },
  { name: 'touch', viewport: { width: 1024, height: 768 }, hasTouch: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true }
];
try {
  for (const [name, fixture] of Object.entries(fixtures)) for (const profile of profiles) {
    const page = await browser.newPage({ viewport: profile.viewport, hasTouch: profile.hasTouch });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.addInitScript(fixture => {
        window.onBallFixture = fixture; window.onBallState = fixture.selection;
        window.onBallIntents = []; window.onBallPreviews = [];
      }, fixture);
      await page.route('**/on-the-ball', route => route.fulfill({ contentType: 'text/html', body:
        '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/on-the-ball-harness.tsx"></script>' }));
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/on-the-ball`);
      const circle = page.locator('.circular-skill-prompt');
      await circle.waitFor();
      // The existing portrait perspective collapses the pitch; exercise phone
      // route controls in the supported overhead view without changing geometry.
      if (profile.name === 'phone') {
        const angle = page.getByRole('button', { name: /^Cycle camera angle:/ });
        for (let count = 0; count < 6 && !/Overhead/.test(await angle.getAttribute('aria-label')); count++) await angle.click();
        assert.match(await angle.getAttribute('aria-label'), /Overhead/);
      }
      const accept = fixture.selection.actions.find(action => action.kind === 'onTheBall' && action.sourcePlayerId === fixture.active.activePlayerId);
      const decline = fixture.selection.actions.find(action => action.kind === 'reactionEnd');
      assert.ok(accept && decline);
      assert.equal(await circle.getAttribute('aria-modal'), 'false');
      assert.equal(await circle.getByRole('button', { name: decline.label, exact: true }).isVisible(), true);
      if (await circle.locator('.skill-source-chooser').count()) {
        await circle.getByRole('button', { name: accept.label, exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.onBallIntents), [], 'Choosing a player still requires Yes');
      }
      await page.screenshot({ path: `${evidence}/onball-${name}-${profile.name}-prompt.png` });
      await circle.locator('.skill-answer.yes').click();
      assert.deepEqual(await page.evaluate(() => window.onBallIntents), [{ operation: 'action', fields: { actionId: accept.id } }]);
      await page.evaluate(state => window.publishOnBall(state), fixture.active);
      await circle.waitFor({ state: 'detached' });
      if (profile.name === 'phone') {
        await page.getByRole('button', { name: 'Game Menu', exact: true }).click();
        await page.getByRole('tab', { name: 'Interface', exact: true }).click();
        await page.getByRole('group', { name: 'Pitch size', exact: true }).getByRole('button', { name: '2×', exact: true }).click();
        await page.getByRole('button', { name: 'Close Game Menu', exact: true }).click();
      }
      assert.equal(await page.locator('.live-target-square').count(), 0, 'Limited activation uses route planning, not adjacent-square commands');
      await page.locator(`.live-selection-square[data-selection="${fixture.active.activePlayerId}"]`).waitFor({ state: 'attached' });
      const destination = fixture.plan.waypoints.at(-1);
      assert.equal(fixture.plan.waypoints.length, 1);
      assert.equal(fixture.plan.route.steps.length, 3);
      const pitch = page.locator('.live-pitch-scene');
      await pitch.click({ position: await squarePosition(page, destination.x, destination.y) });
      await page.locator('.live-route-line').waitFor({ state: 'attached' });
      const confirm = page.locator('.commit-action');
      await page.waitForFunction(() => !document.querySelector('.commit-action')?.disabled);
      const confirmationBounds = await page.locator('.confirmation-row').boundingBox();
      const controlsBounds = await page.locator('.match-command-bar').boundingBox();
      assert.ok(confirmationBounds.y + confirmationBounds.height <= controlsBounds.y, 'Confirm stays above reaction controls');
      assert.ok(controlsBounds.x >= 0 && controlsBounds.x + controlsBounds.width <= profile.viewport.width,
        'Reaction controls fit the viewport');
      assert.equal((await page.evaluate(() => window.onBallIntents)).length, 1, 'Previewing three squares sends no move');
      await page.screenshot({ path: `${evidence}/onball-${name}-${profile.name}-route.png` });
      await pitch.click({ button: 'right', position: await squarePosition(page, destination.x, destination.y) });
      await page.locator('.live-route-line').waitFor({ state: 'detached' });
      await pitch.click({ position: await squarePosition(page, destination.x, destination.y) });
      await page.waitForFunction(() => !document.querySelector('.commit-action')?.disabled);
      await confirm.click();
      const moves = (await page.evaluate(() => window.onBallIntents)).filter(intent => intent.operation === 'movement');
      assert.equal(moves.length, 1);
      assert.equal(moves[0].fields.playerId, fixture.active.activePlayerId);
      assert.equal(moves[0].fields.kind, 'move');
      assert.deepEqual(moves[0].fields.waypoints, fixture.plan.waypoints);
      await page.evaluate(state => window.publishOnBall(state), fixture.active);
      const finish = fixture.active.actions.find(action => action.kind === 'reactionEndPlayer');
      await page.getByRole('button', { name: finish.label, exact: true }).click();
      assert.equal((await page.evaluate(() => window.onBallIntents)).at(-1).fields.actionId, finish.id);
      await page.evaluate(state => window.publishOnBall(state), fixture.finished);
      assert.equal(await page.getByRole('button', { name: accept.label, exact: true }).count(), 0, 'Finished player cannot be selected again');
      assert.deepEqual(errors, []);
      console.log(`PASS native ${name} On the Ball: circular choice, three-square route, cancel, one confirmation and finish (${profile.name})`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); await server.close(); }
