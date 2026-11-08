import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/presentation-probe?*', route => route.fulfill({ contentType: 'text/html',
    body: '<div id="app"></div><script type="module" src="/test/performance-diagnostics-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/presentation-probe?environment=dev`);
  await page.getByLabel('Live match pitch').waitFor();
  const result = await page.evaluate(async () => {
    const settle = () => new Promise(resolve => setTimeout(resolve, 50));
    const service = window.diagnosticService;
    await settle(); const off = window.diagnosticProbeRenders;
    service.setMode('counters'); await settle(); const enabled = window.diagnosticProbeRenders;
    for (let index = 0; index < 8; index++) { service.notify(); await settle(); }
    const polled = window.diagnosticProbeRenders;
    service.setMode('off'); await settle();
    return { off, enabled, polled, disabled: window.diagnosticProbeRenders };
  });
  console.log(JSON.stringify(result));
  assert.ok(result.enabled > result.off, 'Enabling must register the current presentation');
  assert.equal(result.polled, result.enabled, 'Metric refreshes must not rerender gameplay presentation subscribers');
  assert.ok(result.disabled > result.polled, 'Disabling must detach the enabled presentation state');
  console.log('PASS presentation tracks enable/disable without rerendering gameplay on metric polls');
} finally { await browser.close(); await server.close(); }
