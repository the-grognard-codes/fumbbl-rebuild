import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { platform, release, cpus } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const evidence = new URL('../../assets/game/team-colors/v1/qa/', import.meta.url);
await mkdir(evidence, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const report = { environment: { platform: platform(), release: release(), cpu: cpus()[0].model, browser: browser.version(), headless: true }, measurements: [], resources: [] };
const url = `http://127.0.0.1:${server.httpServer.address().port}/test/team-colors.html`;
const settle = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
try {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('.live-marker img')?.getAttribute('src')?.startsWith('data:'));
  report.coldHumanFirstColoredMs = await page.evaluate(() => performance.now());
  for (const roster of ['human', 'orc']) {
    const cold = await page.evaluate(async roster => {
      const { TeamColorArt } = await import('/src/team-color-art.ts');
      const { teamColorManifest } = await import('/src/generated-team-colors.ts');
      const art = new TeamColorArt(), release = art.retain(), started = performance.now();
      await art.load(roster); const loadMs = performance.now() - started;
      const source = teamColorManifest.packs[roster].images[1].sourceUrl;
      const colors = { version: 1, primary: 'red', secondary: 'white' };
      const first = performance.now(); art.resolve(source, colors); const firstRecolorMs = performance.now() - first;
      const warm = performance.now(); art.resolve(source, colors); const cachedLookupMs = performance.now() - warm;
      release(); return { loadMs, firstRecolorMs, cachedLookupMs };
    }, roster);
    report.measurements.push({ roster, path: 'fresh-art-cache-browser-http-cache-allowed', ...cold });
    await page.evaluate(roster => window.colorReview.render({ roster }), roster);
    await page.waitForFunction(() => document.querySelector('.live-marker img')?.getAttribute('src')?.startsWith('data:'));
    await settle();
    assert.equal(await page.locator('.live-marker img[src^="data:"]').count(), 22);
    assert.equal(await page.locator('.live-team-nameplate img[src^="data:"]').count(), 2);
    if (await page.getByRole('button', { name: 'Expand Home dugout', exact: true }).count()) await page.getByRole('button', { name: 'Expand Home dugout', exact: true }).click();
    assert.equal(await page.locator('.live-dugouts img[src^="data:"]').count(), 1);
    assert.equal(await page.locator('.live-player-hover img[src^="data:"]').count(), 1);
    assert.equal(await page.locator('.decision-art.portrait').getAttribute('src'),
      await page.locator('.live-player-hover img').getAttribute('src'));
    let ownership;
    for (const role of ['home', 'away', 'spectator']) for (const half of [1, 2]) {
      await page.evaluate(({ roster, role, half }) => window.colorReview.render({ roster, role, half,
        awayColors: { version: 1, primary: 'lime', secondary: 'black' } }), { roster, role, half });
      await settle();
      const helmets = await page.locator('.live-team-nameplate img').evaluateAll(images => images.map(image => image.src));
      assert.notEqual(helmets[0], helmets[1]);
      if (ownership) assert.deepEqual(helmets, ownership); else ownership = helmets;
      // This fixture deliberately keeps inspection overlays open together. Trigger the
      // real camera control without testing overlay hit targets (covered by camera suites).
      await page.getByRole('button', { name: /^Flip perspective:/ }).evaluate(button => button.click()); await settle();
      assert.deepEqual(await page.locator('.live-team-nameplate img').evaluateAll(images => images.map(image => image.src)), ownership);
      assert.equal(await page.locator('.live-marker img[src^="data:"]').count(), 22);
    }
    for (const kind of ['turnStart', 'turnover', 'touchdown']) {
      await page.evaluate(({ roster, kind }) => window.colorReview.render({ roster, kind }), { roster, kind }); await settle();
      assert.equal(await page.locator('.match-splash-icon img[src^="data:"]').count(), 1);
    }
    for (const [primary, secondary] of [['white', 'ivory'], ['black', 'navy'], ['red', 'red'], ['magenta', 'lime']]) {
      await page.evaluate(({ roster, primary, secondary }) => window.colorReview.render({ roster, colors: { version: 1, primary, secondary } }), { roster, primary, secondary });
      await settle();
      await page.screenshot({ path: fileURLToPath(new URL(`${roster}-${primary}-${secondary}-consumers.png`, evidence)), fullPage: true });
    }
    await page.getByRole('button', { name: '2×', exact: true }).click(); await settle();
    await page.screenshot({ path: fileURLToPath(new URL(`${roster}-integer2x-consumers.png`, evidence)), fullPage: true });
    await page.getByRole('button', { name: 'Fit', exact: true }).click(); await settle();
    // Measurements are descriptive, never timing acceptance thresholds.
    for (const historical of [true, false]) {
      const samples = await page.evaluate(async ({ roster, historical }) => {
        const times = [];
        for (let index = 0; index < 120; index++) {
          const start = performance.now(); window.colorReview.render({ roster, historical });
          await new Promise(done => requestAnimationFrame(done)); times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b); return { medianFrameMs: times[60], p95FrameMs: times[114] };
      }, { roster, historical });
      report.measurements.push({ roster, path: historical ? 'accepted-static' : 'colored-warm', ...samples });
    }
  }
  const churn = await page.evaluate(async () => {
    const { teamColorIds } = await import('/src/team-colors.ts');
    for (let index = 0; index < 40; index++) {
      window.colorReview.render({ roster: index % 2 ? 'orc' : 'human', colors: { version: 1, primary: teamColorIds[index % 16], secondary: teamColorIds[(index + 5) % 16] } });
      await new Promise(done => requestAnimationFrame(done));
    }
    return window.colorReview.diagnostics();
  });
  assert(churn.cached <= churn.limit); assert.equal(churn.images, 98); report.resources.push({ phase: 'churn', ...churn });
  await page.evaluate(() => window.colorReview.unmount()); await settle();
  const released = await page.evaluate(() => window.colorReview.diagnostics());
  assert.equal(released.images, 0); assert.equal(released.cached, 0); assert.equal(released.owners, 0); report.resources.push({ phase: 'unmount', ...released });
  await page.route('**/team-colors/v1/*.bin.gz', route => route.abort());
  await page.reload(); await page.waitForSelector('.live-marker img'); await settle();
  assert.equal(await page.locator('.live-marker img[src^="data:"]').count(), 0);
  assert.equal(await page.locator('.live-marker img').count(), 22);
  const failures = await page.locator('.live-marker img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).length);
  assert.equal(failures, 0);
  const fallbackHelmets = page.locator('.live-team-nameplate img[src*="/ui/helmets-v1/"]');
  assert.equal(await fallbackHelmets.count(), 2);
  await fallbackHelmets.evaluateAll(images => Promise.all(images.map(image => image.decode())));
  assert.deepEqual(errors, []);
  await writeFile(new URL('runtime-measurements.json', evidence), JSON.stringify(report, null, 2) + '\n');
  console.log('Team color consumers, identical kits, lifecycle, failure fallback and reporting passed.');
} catch (error) {
  await page.screenshot({ path: fileURLToPath(new URL('../../.tools/team-colors-review-failure.png', import.meta.url)), fullPage: true });
  throw error;
} finally { await browser.close(); await server.close(); }
