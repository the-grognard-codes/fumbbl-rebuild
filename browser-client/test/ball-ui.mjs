import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

// Native route snapshots and ordered syncs, rendered through production playback/LivePitch.
const journeys = JSON.parse(readFileSync(new URL('./fixtures/ball-route-presentation.json', import.meta.url), 'utf8'));
const evidence = process.env.BALL_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const journey of journeys) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const first = journey.frames[0], last = journey.frames[1];
    await page.addInitScript(first => { window.playbackInput = { view: first.state, records: first.records, enabled: true, mode: 'live' };
      window.playbackFrames = []; }, first);
    await page.route('**/ball-test', route => route.fulfill({ contentType: 'text/html', body:
      '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/ball-test`);
    const highlight = page.locator('.live-ball-highlight'); await highlight.waitFor();
    assert.equal(await page.locator('.live-ball-football').count(), journey.drop ? 0 : 1);
    const animation = await highlight.evaluate(element => {
      const animation = element.getAnimations()[0];
      return { duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes().map(frame => ({ opacity: frame.opacity, transform: frame.transform })),
        childAnimations: [...element.children].flatMap(child => child.getAnimations()).length };
    });
    assert.equal(animation.duration, 1500); assert.equal(animation.childAnimations, 0);
    assert.deepEqual(animation.frames.map(frame => frame.opacity), ['0.25', '0.9', '0.25']);
    if (!journey.drop) {
      assert.ok((await page.locator('.live-ball-football').getAttribute('href')).endsWith('/ui/ball-v1.svg'));
      assert.equal((await page.request.get(new URL('/assets/game/ui/ball-v1.svg', page.url()).href)).status(), 200);
    }
    if (evidence) await page.screenshot({ path: `${evidence}/${journey.role}-${journey.drop ? 'carrier' : 'loose'}.png` });
    await page.evaluate(last => { window.playbackFrames = []; window.publishPlayback({view:last.state, records:last.records, enabled:true, mode:'live'}); }, last);
    await page.waitForFunction(revision => { const output = document.querySelector('#playback-state');
      return Number(output.dataset.revision) === revision && output.dataset.active === 'false'; }, last.state.revision);
    const frames = await page.evaluate(() => window.playbackFrames);
    if (!journey.drop) {
      for (const x of [9, 8, 7]) assert.ok(frames.some(frame => frame.actorX === x && frame.ballX === x && frame.carrier === 'actor'),
        `Single native pickup route carries the highlight at ${x},7`);
      assert.equal(await page.locator('.live-ball-football').count(), 0);
    } else {
      assert.ok(frames.some(frame => frame.carrier === null), 'Native failed rush clears possession');
      assert.equal(await page.locator('.live-ball-football').count(), last.state.ball ? 1 : 0);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await highlight.evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.ok(Number(await highlight.evaluate(element => getComputedStyle(element).opacity)) > 0);
    await page.getByRole('button', {name:'Reveal ball / active',exact:true}).click();
    await page.waitForFunction(() => {
      const marker = document.querySelector('.live-ball-marker').getBoundingClientRect();
      const viewport = document.querySelector('.live-pitch-viewport').getBoundingClientRect();
      return marker.top + marker.height / 2 > viewport.top && marker.top + marker.height / 2 < viewport.bottom;
    });
    if (evidence) await page.screenshot({ path: `${evidence}/${journey.role}-${journey.drop ? 'dropped' : 'picked-up'}.png` });
    const outOfPlay = { ...last.state, ballState: { ...last.state.ballState, inPlay:false, carrierPlayerId:null } };
    await page.evaluate(view => window.publishPlayback({view,records:[],enabled:false,mode:'replay'}), outOfPlay);
    await page.waitForFunction(() => document.querySelectorAll('.live-ball-marker').length === 0);
    assert.equal(await page.locator('.live-ball-marker').count(),0,'Native out-of-play state hides a retained coordinate');
    const legacy = { ...last.state }; delete legacy.ballState;
    await page.evaluate(view => window.publishPlayback({view, records:[],enabled:false,mode:'replay'}), legacy);
    await page.waitForFunction(() => document.querySelectorAll('.live-ball-football').length === 0);
    assert.equal(await page.locator('.live-ball-football').count(),0,'Unknown legacy possession does not assert a loose sprite');
    assert.deepEqual(errors,[]); await page.close();
  }
  console.log('PASS: four native single-route pickup/drop journeys, native array coordinates, synchronized faint 1.5s highlight, carried/loose sprite gating and reduced motion.');
} finally { await browser.close(); await server.close(); }
