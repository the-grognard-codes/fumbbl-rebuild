// Read-only cutover verification against a retained, genuinely completed v2 match.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { revealPlayer } from './projected-pitch-helper.mjs';

const origin = 'http://localhost:5000';
const completed = JSON.parse(await readFile(process.env.COACH_ACCEPTANCE_COMPLETED_FILE, 'utf8'));
const tokens = JSON.parse(await readFile(process.env.COACH_ACCEPTANCE_TOKENS_FILE, 'utf8'));
assert.equal(completed.passed, true);
assert.equal(completed.protocol, '/browser/v2');
const output = resolve(process.env.COACH_ACCEPTANCE_EVIDENCE ?? '../.tools/coach-oriented-match-ui/replay-cutover');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const observations = [];
try {
  for (const role of ['home', 'away']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 660 } });
    await context.addInitScript(() => {
      const Native = window.WebSocket;
      window.__replayAcceptance = { incoming: [], outgoing: [] };
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (message.type === 'matchResult') window.__replayAcceptance.incoming.push(message);
          });
        }
        send(raw) {
          const message = JSON.parse(raw);
          if (!['authenticate', 'computerAuthenticate'].includes(message.type)) window.__replayAcceptance.outgoing.push(message);
          super.send(raw);
        }
      };
    });
    const page = await context.newPage();
    await page.goto(`${origin}/login`);
    await page.evaluate(async token => {
      const { authentication } = await import('/assets/auth-client.js');
      const { signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await signInWithCustomToken(authentication().auth, token.token ?? token);
    }, tokens[role]);
    await page.goto(`${origin}/play/result?matchId=${completed.matchId}`);
    await page.getByLabel('Final score').waitFor();
    await page.getByRole('button', { name: 'Last', exact: true }).click();
    await page.getByRole('region', { name: 'Replay event' }).getByText(/FULL_TIME/).waitFor();
    const nativeResult = await page.evaluate(() => window.__replayAcceptance.incoming.find(message => message.result)?.result);
    assert.deepEqual(nativeResult, completed.result);
    await page.locator('.replay-dugouts .live-dugout.home .live-dugout-zone-summary').first().click();
    await page.locator('.replay-dugouts .live-dugout.home .live-dugout-players button').first().focus();
    await page.getByRole('tooltip', { name: /player card$/ }).waitFor();
    await page.getByLabel('Event', { exact: true }).fill('51');
    await page.getByRole('button', { name: 'Seek', exact: true }).click();
    await page.getByRole('heading', { name: /Event 51 of/ }).waitFor();
    const pitch = page.getByLabel('Read-only replay pitch');
    const scene = pitch.locator('.live-pitch-scene');
    const ids = await pitch.locator('.live-marker').evaluateAll(nodes => nodes.map(node => node.dataset.playerId).sort());
    assert.ok(ids.length > 0);
    const focus = await scene.getAttribute('data-focus');
    for (const end of ['home', 'away']) {
      if (await scene.getAttribute('data-end') !== end) await pitch.getByRole('button', { name: `${end === 'home' ? 'Home' : 'Away'} coach view`, exact: true }).click();
      if (await scene.getAttribute('data-projection') !== 'perspective') await pitch.getByRole('button', { name: 'Perspective view', exact: true }).click();
      await page.screenshot({ path: resolve(output, `${role}-${end}-perspective.png`), fullPage: true });
      await pitch.getByRole('button', { name: 'Top-down view', exact: true }).click();
      assert.equal(await scene.getAttribute('data-focus'), focus);
      assert.equal(await scene.locator('polygon[data-cell-x]').count(), 390);
      assert.deepEqual(await pitch.locator('.live-marker').evaluateAll(nodes => nodes.map(node => node.dataset.playerId).sort()), ids);
    }
    const marker = pitch.locator('.live-marker').first();
    await revealPlayer(page, marker); await marker.focus();
    await page.getByRole('tooltip', { name: /player card$/ }).waitFor();
    const mutations = await page.evaluate(() => window.__replayAcceptance.outgoing.filter(message =>
      message.type === 'setup' || (message.operation && !['load', 'replay'].includes(message.operation)
        && !(message.type === 'savedTeam' && message.operation === 'list'))));
    assert.deepEqual(mutations, []);
    observations.push({ role, finalRevision: nativeResult.finalRevision, event: 51,
      cameraEnds: ['home', 'away'], projections: ['perspective', 'top-down'], canonicalCells: 390,
      unchangedPlayerIds: ids.length, pitchInspector: true, dugoutInspector: true, mutationRequests: 0 });
    await context.close();
  }
  await writeFile(resolve(output, 'replay-cutover.json'), JSON.stringify({ passed: true, protocol: '/browser/v2',
    matchId: completed.matchId, browser: browser.version(), observations }, null, 2));
  console.log('PASS: real completed v2 result, both coach camera ends, tactical view and read-only pitch/dugout inspection.');
} finally { await browser.close(); }
