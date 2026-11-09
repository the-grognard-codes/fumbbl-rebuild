import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
const errors = [];
await mkdir(new URL('../../.tools/debug-performance/evidence/', import.meta.url), { recursive: true });
async function open(environment, { replay = false, reduced = false, unsupported = false, viewport = { width: 1440, height: 900 } } = {}) {
  const page = await browser.newPage({ viewport, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.on('pageerror', error => errors.push(error.message));
  if (unsupported) await page.addInitScript(() => { Object.defineProperty(window, 'PerformanceObserver', { value: undefined }); });
  await page.route('**/diagnostics-test?*', route => route.fulfill({ contentType: 'text/html', body: '<div id="app"></div><script type="module" src="/test/performance-diagnostics-harness.tsx"></script>' }));
  await page.goto(`${origin}/diagnostics-test?environment=${environment ?? ''}${replay ? '&replay=1' : ''}`);
  if (!replay) await page.getByLabel('Live match pitch').waitFor();
  return page;
}
try {
  for (const environment of ['prod', '', 'unknown']) {
    for (const replay of [false, true]) {
      const page = await open(environment, { replay });
      assert.equal(await page.getByRole('button', { name: 'Debug', exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Performance diagnostics', { exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.diagnosticService), null); await page.close();
    }
  }
  const page = await open('dev');
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  assert.equal(await page.getByLabel('Diagnostics display').inputValue(), 'off');
  await page.getByLabel('Diagnostics display').selectOption('graph');
  await page.getByLabel('Detailed phase traces', { exact: true }).check();
  await page.evaluate(() => {
    const service = window.diagnosticService;
    service.sent('private-commit-id', 'setup', 'movement', true); service.response('private-commit-id', 1);
    window.diagnosticCommit();
  });
  await page.waitForFunction(() => window.diagnosticService.snapshot().details.client.some(row => row.phase === 'responseToCommit' && row.revision === 1));
  const commitCapture = await page.evaluate(() => JSON.parse(window.diagnosticService.export()));
  assert.equal(commitCapture.formatVersion, 2);
  assert.ok(commitCapture.metadata.clock.browserTimeOriginUtcMs > 0);
  assert.ok(commitCapture.capture.details.client.find(row => row.phase === 'responseToCommit').durationMs >= 0);
  assert.equal(JSON.stringify(commitCapture).includes('private-commit-id'), false);
  const overlay = page.getByLabel('Performance diagnostics', { exact: true }); await overlay.waitFor();
  await page.bringToFront();
  await page.waitForFunction(() => window.diagnosticService.snapshot().samples.some(sample => sample.kind === 'frame'));
  await page.evaluate(() => window.diagnosticService.reset());
  await page.evaluate(() => { const until = performance.now() + 90; while (performance.now() < until) { /* Controlled main-thread stall. */ } });
  await page.waitForFunction(() => window.diagnosticService.snapshot().samples.some(sample => sample.kind === 'frame' && sample.value >= 60));
  await page.evaluate(() => {
    const d = window.diagnosticService; d.connection(true); d.server = 'enabled';
    d.sample('frame', 120); d.payload('in', 4096); d.sent('private-request-id', 'setup', 'action', true); d.sample('rtt', 450, 'mutation');
    d.sample('presentation', 180); d.mark('incident');
  });
  await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  await overlay.getByText('Frame interval', { exact: true }).waitFor();
  await overlay.getByRole('button', { name: 'Pause', exact: true }).click();
  await overlay.getByText('Frozen', { exact: true }).waitFor();
  const frozenDownload = async () => { const wait = page.waitForEvent('download'); await overlay.getByRole('button', { name: 'Export JSON' }).click(); const download = await wait; return JSON.parse(await readFile(await download.path(), 'utf8')); };
  const originalFrozen = await frozenDownload();
  await page.evaluate(() => window.diagnosticService.sample('frame', 999));
  await overlay.getByRole('button', { name: 'Mark incident', exact: true }).click();
  const markedFrozen = await frozenDownload();
  assert.deepEqual(markedFrozen.capture.samples, originalFrozen.capture.samples, 'Mark incident preserves the frozen evidence');
  assert.equal(markedFrozen.capture.at, originalFrozen.capture.at);
  await overlay.getByLabel('Inspect graphs', { exact: false }).check();
  const position = overlay.getByLabel('Inspect history position'); await position.focus(); await position.press('End');
  await overlay.getByText('Distributions & timing details', { exact: true }).click();
  const downloadWait = page.waitForEvent('download'); await overlay.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadWait; const capture = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(capture.formatVersion, 2); assert.ok(capture.capture.samples.some(sample => sample.kind === 'frame' && sample.value === 120));
  assert.equal(JSON.stringify(capture).includes('private-request-id'), false);
  await overlay.getByText('Distributions & timing details', { exact: true }).click();
  await overlay.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: fileURLToPath(new URL('../../.tools/debug-performance/evidence/desktop.png', import.meta.url)) });
  await overlay.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await page.getByText('Freeze on threshold', { exact: true }).check();
  await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  await page.evaluate(() => window.diagnosticService.sample('frame', 125));
  await overlay.getByText('Frozen', { exact: true }).waitFor();
  await overlay.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.evaluate(() => window.diagnosticService.sample('frame', 130));
  await overlay.getByText('Frozen', { exact: true }).waitFor();
  await overlay.getByRole('button', { name: 'Off', exact: true }).click(); await overlay.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.diagnosticService.enabled), false);
  await page.reload(); await page.getByRole('button', { name: 'Debug', exact: true }).click(); assert.equal(await page.getByLabel('Diagnostics display').inputValue(), 'off');
  await page.screenshot({ path: fileURLToPath(new URL('../../.tools/debug-performance/evidence/debug-controls.png', import.meta.url)) });
  await page.close();
  const tablet = await open('local-dev', { reduced: true, unsupported: true, viewport: { width: 1024, height: 600 } });
  await tablet.getByRole('button', { name: 'Debug', exact: true }).click(); await tablet.getByLabel('Diagnostics display').selectOption('graph');
  const tabletOverlay = tablet.getByLabel('Performance diagnostics', { exact: true }); await tabletOverlay.getByText('Manual refresh', { exact: true }).waitFor();
  await tablet.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  await tabletOverlay.getByText('Distributions & timing details', { exact: true }).click(); await tabletOverlay.getByText('Long Tasks: Unavailable', { exact: false }).waitFor();
  assert.equal(await tablet.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await tabletOverlay.getByText('Distributions & timing details', { exact: true }).click();
  await tabletOverlay.evaluate(element => { element.scrollTop = 0; });
  await tablet.screenshot({ path: fileURLToPath(new URL('../../.tools/debug-performance/evidence/tablet.png', import.meta.url)) }); await tablet.close();
  const mobile = await open('local-dev', { viewport: { width: 390, height: 844 } });
  await mobile.getByRole('button', { name: 'Debug', exact: true }).click(); await mobile.getByLabel('Diagnostics display').selectOption('counters');
  await mobile.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  await mobile.screenshot({ path: fileURLToPath(new URL('../../.tools/debug-performance/evidence/mobile.png', import.meta.url)) }); await mobile.close();
  const replay = await open('dev', { replay: true }); await replay.getByRole('button', { name: 'Debug', exact: true }).click(); await replay.getByLabel('Diagnostics display').selectOption('counters');
  await replay.getByLabel('Performance diagnostics', { exact: true }).waitFor(); await replay.close();
  assert.deepEqual(errors, []); console.log('Performance diagnostics: PROD/unknown hidden; DEV/live/replay controls, graph inspection, export, reset and capability fallbacks passed.');
} finally { await browser.close(); await server.close(); }
