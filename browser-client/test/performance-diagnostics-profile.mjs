// Explicit, report-only Windows/browser overhead probe. Synthetic steady payload/reply
// workload on the real match components; not native-server or physical-device evidence.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cpus, platform } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
const output = new URL('../../.tools/debug-performance/profile/', import.meta.url);
await mkdir(output, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('**/diagnostics-profile?*', route => route.fulfill({ contentType: 'text/html', body: '<div id="app"></div><script type="module" src="/test/performance-diagnostics-harness.tsx"></script>' }));
const distribution = values => { const sorted = [...values].sort((a, b) => a - b); return { count: sorted.length, p50: sorted[Math.ceil(sorted.length * .5) - 1] ?? null, p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? null, max: sorted.at(-1) ?? null }; };
const runs = [];
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/diagnostics-profile?environment=dev`);
  await page.getByLabel('Live match pitch').waitFor();
  for (let repeat = 1; repeat <= 3; repeat++) for (const mode of ['off', 'counters', 'graph']) {
    const samples = await page.evaluate(async mode => {
      const service = window.diagnosticService;
      service.setMode('off'); service.reset(); service.setMode(mode); service.connection(true);
      service.preferences.frameBudget = 1000 / 60;
      service.preferences.freezeOnThreshold = false; service.preferences.manual = false;
      window.diagnosticProfile = { recording: false, renders: [] };
      // Fixed workload, no wire data. At most one correlated read at a time.
      let serial = 0;
      const work = setInterval(() => { const id = `synthetic-${serial++}`; service.payload('out', 128); service.sent(id, 'browse', null, false);
        setTimeout(() => { service.payload('in', 4096); service.response(id); }, 20); }, 50);
      await new Promise(done => setTimeout(done, 1000));
      window.diagnosticProfile.recording = true;
      const frames = [], costs = []; let previous, request;
      const originalFrame = service.frame.bind(service), originalSnapshot = service.snapshot.bind(service);
      service.frame = (...args) => { const started = performance.now(); originalFrame(...args); costs.push(performance.now() - started); };
      service.snapshot = (...args) => { const started = performance.now(); const value = originalSnapshot(...args); costs.push(performance.now() - started); return value; };
      const measure = now => { if (previous !== undefined) frames.push(now - previous); previous = now; request = requestAnimationFrame(measure); };
      request = requestAnimationFrame(measure);
      await new Promise(done => setTimeout(done, 6000));
      cancelAnimationFrame(request); clearInterval(work); window.diagnosticProfile.recording = false;
      service.frame = originalFrame; service.snapshot = originalSnapshot;
      const renders = [...window.diagnosticProfile.renders];
      const capture = JSON.parse(service.export()); service.setMode('off');
      return { frames, collectorCosts: costs, renderCosts: renders, capture };
    }, mode);
    const result = { repeat, mode, frameMs: distribution(samples.frames), collectorMs: distribution(samples.collectorCosts), renderMs: distribution(samples.renderCosts),
      stallsOver50: samples.frames.filter(value => value > 50).length, raw: samples };
    runs.push(result); console.log(`${repeat} ${mode}: p95 frame ${result.frameMs.p95?.toFixed(2)}ms; collector ${result.collectorMs.p95?.toFixed(3) ?? 'n/a'}ms; React ${result.renderMs.p95?.toFixed(3) ?? 'n/a'}ms`);
  }
  const report = { recordedAt: new Date().toISOString(), platform: platform(), cpu: cpus()[0]?.model, browser: browser.version(), viewport: [1440, 900],
    limitations: ['Synthetic steady payload/read workload; no real network/server/gameplay action RTT', 'Vite development React profiler, not optimized production bundle', 'Headless Windows desktop; no physical Android or Linux performance evidence', 'Run only with other builds and test suites stopped'], runs };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
} finally { await browser.close(); await server.close(); }
