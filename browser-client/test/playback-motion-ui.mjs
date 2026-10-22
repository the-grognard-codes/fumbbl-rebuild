import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

// Measures painted geometry between authoritative squares, not just React commits.
const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const state = (revision, x) => ({ ...initial, revision, actions: [], prompt: null,
  players: initial.players.map((player, index) => index ? player : { ...player, x }) });
const record = (revision, x) => ({ index: revision, revision, kind: 'action', actor: 'home', at: revision,
  decision: null, state: state(revision, x), native: [{ modelChangeList: { modelChangeArray: [{
    modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: initial.players[0].id,
    modelChangeValue: { x, y: initial.players[0].y }
  }] } }] });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.emulateMedia({ reducedMotion: 'no-preference' });
const evidence = resolve(process.env.PLAYBACK_MOTION_EVIDENCE ?? fileURLToPath(new URL('../../.tools/smooth-gameplay/motion', import.meta.url)));
mkdirSync(evidence, { recursive: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(input => { window.playbackInput = input; window.playbackFrames = []; },
    { view: state(0, 7), records: [record(0, 7)], enabled: true, mode: 'live' });
  await page.route('**/motion-test', route => route.fulfill({ contentType: 'text/html',
    body: '<div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/motion-test`);
  const marker = page.locator(`.live-marker[data-player-id="${initial.players[0].id}"]`);
  await marker.waitFor();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  const sample = () => marker.evaluate(node => ({ x: node.getBoundingClientRect().x,
    y: node.getBoundingClientRect().y, transition: getComputedStyle(node).transition,
    duration: getComputedStyle(node).transitionDuration }));
  const before = await sample();
  // Sample every browser frame to detect actual intermediate screen positions.
  const frames = await page.evaluate(async input => {
    const marker = document.querySelector(`[data-player-id="${input.id}"]`);
    const frames = [], start = performance.now();
    window.publishPlayback(input.playback);
    await new Promise(done => {
      const frame = () => {
        const rect = marker.getBoundingClientRect();
        frames.push({ ms: performance.now() - start, x: rect.x, y: rect.y });
        if (performance.now() - start < 400) requestAnimationFrame(frame); else done();
      };
      requestAnimationFrame(frame);
    });
    return frames;
  }, { id: initial.players[0].id, playback: { view: state(1, 8), records: [record(0, 7), record(1, 8)], enabled: true, mode: 'live' } });
  const after = await sample();
  const distance = Math.hypot(after.x - before.x, after.y - before.y);
  const intermediate = frames.filter(frame => Math.hypot(frame.x - before.x, frame.y - before.y) > 1
    && Math.hypot(frame.x - after.x, frame.y - after.y) > 1);
  writeFileSync(resolve(evidence, 'motion.json'), JSON.stringify({ before, after, frames, intermediateFrames: intermediate.length,
    semantics: 'Bounding rectangles sampled at rAF; screenshots corroborate appearance, not physical display latency.' }, null, 2));
  await page.screenshot({ path: resolve(evidence, 'pitch.png') });
  assert.ok(distance > 3, 'Fixture changes the on-screen position');
  assert.ok(intermediate.length >= 2, `Ordinary movement needs intermediate positions; observed ${intermediate.length}, CSS ${after.transition}`);
  assert.deepEqual(errors, []);
  console.log(`PASS: movement traversed ${intermediate.length} intermediate browser frames.`);
} finally { await browser.close(); await server.close(); }
