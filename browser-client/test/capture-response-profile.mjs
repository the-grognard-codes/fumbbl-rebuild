// Repeatable real play-entry response/feedback workload using an exported native board.
// Socket replies are controlled locally: these are browser costs, not native RTT evidence.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { distribution } from './gameplay-performance-observer.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(process.env.CAPTURE_PROFILE_OUTPUT ?? `${root}/.tools/performance-followup/browser`);
const production = process.env.CAPTURE_PROFILE_DEVELOPMENT !== 'true';
const gameModule = production ? '/dist-play/game.js' : '/src/play-entry.tsx';
const bundleDirectory = resolve(process.env.CAPTURE_BUNDLE_DIRECTORY ?? `${root}/browser-client/dist-play`);
const bundle = production ? await readFile(`${bundleDirectory}/game.js`) : null;
const styles = production ? await readFile(`${bundleDirectory}/game.css`) : null;
const viewport = process.env.CAPTURE_VIEWPORT ? (() => {
  if (!/^\d{3,4}x\d{3,4}$/.test(process.env.CAPTURE_VIEWPORT)) throw Error('Use CAPTURE_VIEWPORT=widthxheight');
  const [width, height] = process.env.CAPTURE_VIEWPORT.split('x').map(Number); return { width, height };
})() : { width: 1440, height: 900 };
const pixelRatio = Number(process.env.CAPTURE_PIXEL_RATIO ?? 1);
assert.ok(Number.isFinite(pixelRatio) && pixelRatio >= 1 && pixelRatio <= 4);
const fixtureText = await readFile(process.env.CAPTURE_BROWSER_FIXTURE ?? `${root}/.tools/performance-followup/native/native-board.json`, 'utf8');
const state = JSON.parse(fixtureText);
state.callerRole = state.actor;
assert.ok(state.actions.some(action => action.kind === 'endTurn'));
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Retain earlier evidence; use a new directory for each measurement.
const server = await createServer({ root: `${root}/browser-client`, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.CAPTURE_HEADED !== 'true' });
const runs = [], errors = [];
try {
  for (let repeat = 1; repeat <= 3; repeat++) for (const mode of ['off', 'counters', 'graph']) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: pixelRatio });
    const page = await context.newPage();
    if (production) {
      await page.route('**/dist-play/game.js', route => route.fulfill({ contentType: 'text/javascript', body: bundle }));
      await page.route('**/dist-play/game.css', route => route.fulfill({ contentType: 'text/css', body: styles }));
    }
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/play/match?*', route => route.fulfill({ contentType: 'text/html', body:
      `<link rel="stylesheet" href="/dist-play/game.css"><div id="app"></div><script type="module">import {mountPlay} from "${gameModule}"; mountPlay(document.getElementById("app"), {environment:"dev",url:"ws://unused",getToken:async()=>"fixture"});</script>` }));
    await page.addInitScript(state => {
      window.profile = { frames: [], actions: [], longTasks: [], recording: false };
      let previous;
      const tick = now => { if (window.profile.recording && previous !== undefined) window.profile.frames.push(now - previous); previous = now; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      new PerformanceObserver(list => { if (window.profile.recording) window.profile.longTasks.push(...list.getEntries().map(entry => entry.duration)); }).observe({ type: 'longtask' });
      document.addEventListener('pointerdown', event => {
        if (event.target instanceof Element && ['End Turn', 'Confirmed!'].includes(event.target.closest('button')?.textContent)) window.profile.input = performance.now();
      }, true);
      document.addEventListener('click', event => {
        if (event.target instanceof Element && ['End Turn', 'Confirmed!'].includes(event.target.closest('button')?.textContent)) window.profile.click = performance.now();
      }, true);
      window.WebSocket = class {
        static OPEN = 1; readyState = 1;
        constructor() { window.socket = this; queueMicrotask(() => this.onopen?.()); }
        emit(reply) { this.onmessage?.({ data: JSON.stringify(reply) }); }
        send(raw) {
          const request = JSON.parse(raw);
          if (request.type === 'authenticate') queueMicrotask(() => this.emit({ version: 2, type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
          if (request.type === 'diagnostics') queueMicrotask(() => this.emit({ version: 2, type: 'diagnostics', requestId: request.requestId, code: 'UNAVAILABLE' }));
          if (request.type === 'setup' && request.operation === 'load') queueMicrotask(() => this.emit({ version: 2, type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: false, state }));
          if (request.type === 'setup' && request.operation === 'action') {
            const sample = { input: window.profile.input, click: window.profile.click, sent: performance.now(), requestId: request.requestId };
            window.profile.actions.push(sample);
            requestAnimationFrame(() => { sample.feedback = performance.now(); sample.pending = !!document.querySelector('[data-request-pending]:not([data-request-pending=""])'); });
            // Deliberately hold authority for 300 ms; pending must render independently.
            setTimeout(() => {
              sample.response = performance.now();
              this.emit({ version: 2, type: 'setupState', requestId: request.requestId, code: 'ACCEPTED', duplicate: true, state });
              sample.handler = performance.now() - sample.response;
              requestAnimationFrame(() => { sample.presented = performance.now(); });
            }, 300);
          }
        }
        close() { this.readyState = 3; this.onclose?.(); }
      };
    }, state);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${state.matchId}`);
    await page.getByLabel('Live match pitch').waitFor();
    if (mode !== 'off') {
      await page.getByRole('button', { name: 'Debug', exact: true }).click();
      // Keep diagnostics clear of End Turn on the short source-capture viewport.
      await page.locator('.performance-options-grid label').filter({ hasText: 'Position' }).locator('select').selectOption('bottom-left');
      await page.getByLabel('Diagnostics display').selectOption(mode);
      await page.getByRole('button', { name: 'Close debug panel', exact: true }).press('Enter');
    }
    const button = page.getByRole('button', { name: 'End Turn', exact: true });
    // Suppress the unactivated-player confirmation using the same user setting as normal play.
    const first = button;
    await first.click();
    const confirm = page.getByRole('button', { name: 'Confirmed!', exact: true });
    if (await confirm.isVisible()) await confirm.click();
    await page.waitForTimeout(650);
    // A measured request uses a native end-turn action; confirmation clicks must be accounted for.
    await page.evaluate(() => { window.profile.frames = []; window.profile.actions = []; window.profile.longTasks = []; window.profile.recording = true; });
    const cdp = await context.newCDPSession(page);
    if (repeat === 1 && mode === 'off') { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
    for (let action = 0; action < 12; action++) {
      await button.click();
      if (await confirm.isVisible()) await confirm.click();
      await page.waitForTimeout(450);
    }
    if (repeat === 1 && mode === 'off') {
      const { profile } = await cdp.send('Profiler.stop');
      await writeFile(`${output}/response.cpuprofile`, JSON.stringify(profile));
    }
    const raw = await page.evaluate(() => { window.profile.recording = false; return window.profile; });
    assert.equal(raw.actions.length, 12);
    const run = { repeat, mode, feedbackMs: distribution(raw.actions.map(action => action.feedback - action.input)),
      pressToClickMs: distribution(raw.actions.map(action => action.click - action.input)),
      clickToFeedbackMs: distribution(raw.actions.map(action => action.feedback - action.click)),
      responseHandlerMs: distribution(raw.actions.map(action => action.handler)),
      responsePresentationMs: distribution(raw.actions.map(action => action.presented - action.response)),
      frameMs: distribution(raw.frames), gaps50: raw.frames.filter(ms => ms >= 50).length,
      gaps100: raw.frames.filter(ms => ms >= 100).length, longTasks: raw.longTasks,
      pendingBeforeReply: raw.actions.every(action => action.pending && action.feedback < action.response), raw };
    runs.push(run);
    await page.screenshot({ path: `${output}/${repeat}-${mode}.png` });
    console.log(JSON.stringify({ repeat, mode, feedback: run.feedbackMs, response: run.responsePresentationMs, gaps50: run.gaps50, pendingBeforeReply: run.pendingBeforeReply }));
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify({ version: 1, browser: browser.version(), cpu: cpus()[0]?.model,
    viewport: [viewport.width, viewport.height], pixelRatio, inputEvent: 'pointerdown', overlayCorner: 'bottom-left',
    fixtureSha256: createHash('sha256').update(fixtureText).digest('hex'),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    checkoutSourceDiffSha256: createHash('sha256').update(execFileSync('git', ['diff', '--', 'browser-client/src'], { cwd: root })).digest('hex'),
    production, artifactSource: process.env.CAPTURE_ARTIFACT_SOURCE ?? 'working-tree build',
    artifactSha256: bundle ? createHash('sha256').update(bundle).digest('hex') : null,
    limitations: ['Native board replay through real V2Client/play-entry; controlled socket replies, not native server RTT',
      'Headless Windows Chrome; rAF opportunities, not physical display latency', 'First off run includes CPU sampling; production flag identifies the loaded bundle',
      '12 repeated end-turn duplicate acknowledgments per mode, one warm-up action; no movement or dice outcome claims'], runs, errors }, null, 2));
  await browser.close(); await server.close();
}
assert.ok(runs.every(run => run.pendingBeforeReply), 'Pending feedback must commit before the held response');
if (process.env.CAPTURE_ENFORCE_FEEDBACK === 'true') assert.ok(runs.every(run => run.feedbackMs.p95 <= 100), 'Pending feedback p95 must be <=100 ms');
