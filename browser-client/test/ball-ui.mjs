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
    assert.equal(await page.locator('.live-ball-shadow').count(), journey.drop ? 0 : 1);
    const animations = await highlight.evaluate(element => {
      return [...element.querySelectorAll('.live-ball-outer, .live-ball-inner')].map(part => {
        const animation = part.getAnimations()[0];
        return { duration: animation.effect.getTiming().duration, direction: animation.effect.getTiming().direction,
          frames: animation.effect.getKeyframes().map(frame => frame.transform), opacity: getComputedStyle(part).opacity };
      });
    });
    assert.deepEqual(animations, [
      { duration: 24000, direction: 'normal', frames: ['rotate(0deg)', 'rotate(360deg)'], opacity: '1' },
      { duration: 18000, direction: 'reverse', frames: ['rotate(0deg)', 'rotate(360deg)'], opacity: '1' },
    ]);
    // Sample both complete rotations, including the dark outlines. The two
    // rotating shapes must remain separate and fit without relying on clipping.
    const geometry = await highlight.evaluate(element => {
      const parts = [...element.querySelectorAll('.live-ball-outer, .live-ball-inner')];
      const bounds = parts.map(part => {
        const animation = part.getAnimations()[0], savedTime = animation.currentTime;
        animation.pause();
        let minRadius = Infinity, maxRadius = 0, inside = true;
        for (let frame = 0; frame <= 72; frame++) {
          animation.currentTime = Number(animation.effect.getTiming().duration) * frame / 72;
          const rotation = new DOMMatrix(getComputedStyle(part).transform);
          const aroundCenter = new DOMMatrix().translate(16,16).multiply(rotation).translate(-16,-16);
          for (const path of part.querySelectorAll('path')) {
            const matrix = aroundCenter.multiply(path.transform.baseVal.consolidate().matrix);
            // A square corner of the one-pixel outline extends sqrt(.5) from the path.
            const outline = Number(getComputedStyle(path).strokeWidth.replace('px','')) / Math.sqrt(2);
            for (let length = 0; length <= path.getTotalLength(); length += .25) {
              const local = path.getPointAtLength(length), p = matrix.transformPoint(new DOMPoint(local.x,local.y));
              const radius = Math.hypot(p.x - 16,p.y - 16);
              minRadius = Math.min(minRadius,radius - outline); maxRadius = Math.max(maxRadius,radius + outline);
              inside &&= p.x - outline > 0 && p.y - outline > 0 && p.x + outline < 32 && p.y + outline < 32;
            }
          }
        }
        animation.currentTime = savedTime; animation.play();
        return { minRadius,maxRadius,inside };
      });
      return bounds;
    });
    assert.ok(geometry.every(part => part.inside), `every rotation, including outlines, fits inside the square: ${JSON.stringify(geometry)}`);
    assert.ok(geometry[0].minRadius - geometry[1].maxRadius > 1, 'arrows retain a visible gap from the outer ring');
    if (!journey.drop) {
      assert.ok((await page.locator('.live-ball-football').getAttribute('src')).endsWith('/ui/ball-v1.svg'));
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
      assert.equal(await page.locator('.live-ball-shadow').count(), 0);
    } else {
      assert.ok(frames.some(frame => frame.carrier === null), 'Native failed rush clears possession');
      assert.equal(await page.locator('.live-ball-football').count(), last.state.ball ? 1 : 0);
      assert.equal(await page.locator('.live-ball-shadow').count(), last.state.ball ? 1 : 0);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.deepEqual(await page.locator('.live-ball-outer, .live-ball-inner').evaluateAll(elements =>
      elements.map(element => getComputedStyle(element).animationName)), ['none', 'none']);
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
  console.log('PASS: four native pickup/drop journeys, slow opposing rotations without pulsing, carried/loose sprite gating and reduced motion.');
} finally { await browser.close(); await server.close(); }
