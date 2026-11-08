import assert from 'node:assert/strict';
import { build } from 'vite';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus, platform } from 'node:os';
import { distribution } from './gameplay-performance-observer.mjs';
import { PitchProjection } from '../src/pitch-projection.ts';
import { setCameraAngle } from './camera-controls.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.PAN_OUTPUT || fileURLToPath(new URL('../../.tools/idle-panning/', import.meta.url)));
await mkdir(output, { recursive: true });
const bundle = process.env.PAN_USE_BUNDLE || join(output, 'bundle');
const baselineRef = process.env.PAN_BASELINE_REF || 'HEAD';
if (!process.env.PAN_USE_BUNDLE) await build({ root, configFile: false, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: process.env.PAN_BASELINE ? [{ name: 'original-pan-source', enforce: 'pre', load(id) {
    const relative = id.replaceAll('\\', '/').split('/browser-client/')[1];
    if (['src/GameView.tsx', 'src/LivePitch.tsx', 'src/useMatchHistoryDock.ts', 'src/PlayerHoverCard.tsx', 'src/HostedResult.tsx', 'src/pitch-projection.ts', 'src/live-pitch.css'].includes(relative))
      return execFileSync('git', ['show', `${baselineRef}:browser-client/${relative}`], { cwd: root, encoding: 'utf8', windowsHide: true });
  } }] : [],
  build: { outDir: join(output, 'bundle'), emptyOutDir: false, lib: { entry: join(root, 'test/idle-panning-harness.tsx'), formats: ['es'], fileName: () => 'harness.js', cssFileName: 'harness' } } });
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://local').pathname;
  if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/harness.css"><div id="app"></div><script type="module" src="/harness.js"></script>'); return; }
  const file = path.startsWith('/assets/') ? join(root, 'public', path) : join(bundle, path);
  try { const body = await readFile(file); res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' })[extname(file)] || 'application/octet-stream'); res.end(body); }
  catch { res.statusCode = 404; res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const results = [];
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${process.env.PAN_MODE || 'off'}`);
  await page.locator('.live-pitch-scene').waitFor(); await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
  await page.locator('.live-marker.home').first().evaluate(element => element.click());
  await page.locator('.live-marker.selected').waitFor();
  await page.waitForTimeout(300);
  const irrelevantReads = await page.evaluate(async () => {
    window.idlePan.start();
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    document.querySelector('[data-pitch-ground]').append(title);
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    const result = window.idlePan.finish(); title.remove(); return result.rectReads;
  });
  console.log(`Pitch-only mutation HUD rectangle reads: ${irrelevantReads}`);
  if (!process.argv.includes('--report-only')) assert.equal(irrelevantReads, 0, 'Pitch-only content changes must not force fixed HUD layout measurements');
  const relevantReads = await page.evaluate(async () => {
    window.idlePan.start();
    const label = document.createElement('span'); label.textContent = ' clock label';
    document.querySelector('.coach-score-center').append(label);
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    const result = window.idlePan.finish(); label.remove(); return result.rectReads;
  });
  assert.ok(relevantReads > 0, 'Changed HUD content still updates docking');
  const cdp = await page.context().newCDPSession(page);
  const rate = Number(process.env.PAN_CPU_RATE || 4); await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const warm = await page.locator('.live-pitch-viewport').boundingBox();
  await page.mouse.move(warm.x + warm.width * .55, warm.y + warm.height * .48);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(warm.x + warm.width * .55, warm.y + warm.height * .48 + 90, { steps: 15 });
  await page.mouse.move(warm.x + warm.width * .55, warm.y + warm.height * .48, { steps: 15 });
  await page.mouse.up({ button: 'right' }); await page.waitForTimeout(300);
  for (let repeat = -1; repeat < Number(process.env.PAN_REPEATS || 3); repeat++) {
    const box = await page.locator('.live-pitch-viewport').boundingBox();
    const x = Math.round(box.x + box.width * .55), y = Math.round(box.y + box.height * .48);
    await page.mouse.move(x, y); await page.waitForTimeout(300); await page.evaluate(() => window.idlePan.start());
    await page.mouse.down({ button: 'right' });
    const started = performance.now(), epoch = Date.now(), pending = [];
    const moves = 160, interval = 10;
    for (let i = 1; i <= moves; i++) {
      const wait = i * interval - (performance.now() - started); if (wait > 0) await new Promise(done => setTimeout(done, wait));
      const dx = Math.round(Math.sin(i / moves * Math.PI * 4) * 160), dy = Math.round(Math.sin(i / moves * Math.PI * 4) * 110);
      pending.push(cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y: y + dy, button: 'right', buttons: 2, timestamp: (epoch + i * interval) / 1000 }));
    }
    await Promise.all(pending); await page.mouse.up({ button: 'right' });
    const release = await page.evaluate(async () => {
      const frames = [];
      for (let i = 0; i < 8; i++) await new Promise(done => requestAnimationFrame(() => {
        const el = document.querySelector('.live-pitch-scene'); frames.push(`${el.dataset.focus}/${el.dataset.transverseFocus}`); done();
      }));
      return frames;
    });
    const releaseStable = release.every(value => value === release.at(-1));
    if (!process.argv.includes('--report-only')) assert.ok(releaseStable, 'Released camera must settle without replaying obsolete drag positions');
    const raw = await page.evaluate(() => window.idlePan.finish());
    assert.ok(raw.input.length > 0 && raw.panRange > 1, 'The workload must actually move the rendered camera, not merely receive pointer events');
    const result = { repeat, cpuRate: rate, releaseStable, release, inputToDispatch: distribution(raw.input.map(x => x.received - x.at)),
      inputToCommit: distribution(raw.input.filter(x => x.commit !== undefined).map(x => x.commit - x.at)),
      inputToOpportunity: distribution(raw.input.filter(x => x.opportunity !== undefined).map(x => x.opportunity - x.at)),
      cameraAge: distribution(raw.cameraAge),
      frames: distribution(raw.frames), staleFrames: raw.errors.filter(x => x > .01).length, rectReads: raw.rectReads, mutations: raw.mutations, finalAligned: raw.finalAligned, raw };
    if (repeat >= 0) { results.push(result); console.log(JSON.stringify({ ...result, raw: undefined })); }
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  if (!process.env.PAN_BASELINE && !process.env.PAN_USE_BUNDLE) {
    for (const flipped of [false, true]) {
      if (flipped) {
        await setCameraAngle(page, '40');
        const priorEnd = await page.locator('.live-pitch-scene').getAttribute('data-end');
        await page.getByRole('button', { name: /^Flip perspective:/ }).click();
        await page.waitForFunction(prior => document.querySelector('.live-pitch-scene').dataset.end !== prior, priorEnd);
      }
    for (const angle of ['30', '40', '50', '90']) {
      await setCameraAngle(page, angle);
      const options = await page.locator('.live-pitch-scene').evaluate(el => ({ width: parseFloat(el.style.width), height: parseFloat(el.style.height),
        focus: Number(el.dataset.focus), transverseFocus: Number(el.dataset.transverseFocus), zoom: Number(el.dataset.zoom),
        end: el.dataset.end, mode: el.dataset.projection, perspectiveElevation: el.dataset.projection === 'perspective' ? Number(el.dataset.elevation) : 40 }));
      const camera = new PitchProjection(options), square = { x: Math.min(25, Math.floor(camera.focus)), y: Math.min(14, Math.floor(camera.transverseFocus)) };
      const actual = await page.locator(`[data-cell-x="${square.x}"][data-cell-y="${square.y}"]`).evaluate(el => {
        const rect = el.getBoundingClientRect(), scene = el.closest('.live-pitch-scene').getBoundingClientRect();
        return { left: rect.left - scene.left, top: rect.top - scene.top, width: rect.width, height: rect.height };
      });
      const corners = camera.square(square), xs = corners.map(p => p.x), ys = corners.map(p => p.y);
      const expected = { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < .6, `${angle} degree grid ${key} stays registered to the camera: ${actual[key]} vs ${expected[key]}`);
    }
    }
    await setCameraAngle(page, '40');
    for (const event of ['pointercancel', 'lostpointercapture']) {
      const box = await page.locator('.live-pitch-viewport').boundingBox(), x = box.x + box.width * .5, y = box.y + box.height * .45;
      await page.mouse.move(x, y); await page.evaluate(() => window.idlePan.start()); await page.mouse.down({ button: 'right' });
      await page.mouse.move(x, y + 30);
      const pointerId = await page.evaluate(() => window.idlePan.pointerId());
      await page.locator('.live-pitch-viewport').dispatchEvent(event, { pointerId });
      await page.mouse.up({ button: 'right' });
      const result = await page.evaluate(() => window.idlePan.finish());
      assert.ok(result.finalAligned, `${event} commits the last received camera target`);
      await page.waitForTimeout(40);
      assert.equal(await page.locator('.live-pitch-scene').getAttribute('data-focus'), result.focus, `${event} leaves no delayed camera update`);
    }
    for (const role of ['home', 'away']) {
      await page.locator(`.live-marker.${role}`).first().focus();
      const card = page.locator(`.live-player-hover.${role}`); await card.waitFor();
      assert.match(await card.getAttribute('class'), role === 'home' ? /dock-left/ : /dock-right/);
    }
  }
  await page.screenshot({ path: join(output, 'pitch.png') });
  const mode = await page.evaluate(() => window.idlePanDiagnosticsMode);
  if (!process.env.PAN_BASELINE && !process.env.PAN_USE_BUNDLE) for (const role of ['home', 'away']) {
    await page.goto(`http://127.0.0.1:${server.address().port}/?card=${role}`);
    const card = page.locator('.live-player-hover'); await card.waitFor();
    const bounds = await card.boundingBox();
    const edge = role === 'home' ? bounds.x : 1440 - bounds.x - bounds.width;
    assert.ok(Math.abs(edge - 12) < 1, `Team card ${role} docks at the viewport side even outside the live-match HUD (replay): ${JSON.stringify(bounds)}`);
  }
  const artifactSha256 = createHash('sha256').update(await readFile(join(bundle, 'harness.js'))).digest('hex');
  await writeFile(join(output, 'report.json'), JSON.stringify({ browser: browser.version(), platform: platform(), cpu: cpus()[0]?.model,
    viewport: [1440, 900], deviceScaleFactor: 1, mode, artifactSha256, fixture: '22 token players derived from public m5a projections; no native engine',
    baseline: !!process.env.PAN_BASELINE, baselineRef: process.env.PAN_BASELINE ? baselineRef : null, warmupRuns: 1,
    limitations: ['Synthetic native-shaped fixture; no network or server action', 'Headless browser, CPU throttling is a reproducibility aid, not physical device evidence', 'rAF opportunities are not physical presentation'], results, errors }, null, 2));
  assert.deepEqual(errors, []); assert.ok(results.every(x => x.finalAligned), 'Final camera must match latest pointer target');
  if (process.argv.includes('--assert-latency')) assert.ok(results.length > 0 && results.every(x => Number.isFinite(x.inputToCommit.p95) && x.inputToCommit.p95 <= 50), 'Input-to-camera commit p95 must stay within 50 ms in the declared foreground workload');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
