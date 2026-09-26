import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { chromium } from 'playwright';

const output = 'test-output/pitch-parity';
const framesPerCase = 3;
const results = [];
await mkdir(output, { recursive: true });

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? null;
}

async function clickPixiSquare(page, x, y) {
  const canvas = page.locator('.parity-pixi-scene canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Pixi canvas has no bounds');
  await page.mouse.click(box.x + (30 + x * 36) * box.width / 960, box.y + (30 + y * 36) * box.height / 564);
}

async function measureCase(page, renderer) {
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const samples = [];
  for (let run = 0; run < framesPerCase; run++) {
    await page.getByRole('button', { name: 'Reset fixture' }).click();
    if (renderer === 'dom') {
      await page.locator('.parity-marker[data-player="home-1"]').click();
      await page.locator('.parity-marker[data-player="away-1"]').click();
    } else {
      await clickPixiSquare(page, 5, 7);
      await clickPixiSquare(page, 10, 7);
    }
    await page.getByRole('button', { name: 'Commit blitz' }).waitFor();
    await page.evaluate(() => {
      window.__parityTiming = { intervals: [], start: null, firstFrame: null, last: null };
      document.querySelector('.parity-command .commit-action').addEventListener('click', () => {
        const timing = window.__parityTiming;
        timing.start = performance.now();
        const frame = now => {
          if (timing.firstFrame === null) timing.firstFrame = now;
          if (timing.last !== null && now - timing.start <= 1000) timing.intervals.push(now - timing.last);
          timing.last = now;
          if (now - timing.start < 1050) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }, { once: true });
    });
    const before = await session.send('Performance.getMetrics');
    await page.getByRole('button', { name: 'Commit blitz' }).click();
    await page.getByRole('button', { name: 'Choose defender down' }).waitFor();
    await page.waitForTimeout(150);
    const after = await session.send('Performance.getMetrics');
    const timing = await page.evaluate(() => window.__parityTiming);
    const heap = metrics => metrics.metrics.find(item => item.name === 'JSHeapUsedSize')?.value ?? null;
    samples.push({ p95FrameMs: percentile(timing.intervals, .95), droppedOver16_7Ms: timing.intervals.filter(ms => ms > 16.7).length,
      frames: timing.intervals.length, firstFrameAfterClickMs: timing.firstFrame - timing.start,
      heapBeforeBytes: heap(before), heapAfterBytes: heap(after) });
  }
  await session.detach();
  return samples;
}

for (const channel of ['chrome', 'msedge']) {
  let browser;
  try { browser = await chromium.launch({ channel, headless: true }); }
  catch (error) { results.push({ channel, unavailable: String(error) }); continue; }
  try {
    const version = browser.version();
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      for (const renderer of ['dom', 'pixi']) {
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:5173/pitch-parity');
        await page.getByRole('button', { name: renderer === 'dom' ? 'DOM only' : 'Pixi only' }).click();
        if (renderer === 'pixi') await page.locator('.parity-pixi-scene[data-ready="true"] canvas').waitFor();
        const environment = await page.evaluate(() => ({ innerWidth, innerHeight, devicePixelRatio, userAgent: navigator.userAgent }));
        const samples = await measureCase(page, renderer);
        results.push({ channel, version, viewport, renderer, environment, samples, errors });
        await page.close();
      }
    }
  } finally { await browser.close(); }
}

const report = { method: 'Headless diagnostic only; rAF intervals during three scripted 900ms Blitz transitions in each single-renderer mode. Not a foreground human benchmark. Browser zoom remains 100%; in-app zoom is Fit. JSHeapUsedSize is only JS heap, not total or GPU memory.',
  machine: { platform: os.platform(), release: os.release(), arch: os.arch(), cpus: os.cpus().length, totalMemoryBytes: os.totalmem() },
  createdAt: new Date().toISOString(), results };
await writeFile(`${output}/diagnostic-timing.json`, `${JSON.stringify(report, null, 2)}\n`);
for (const item of results) {
  if (item.unavailable) console.log(`${item.channel}: unavailable`);
  else console.log(`${item.channel} ${item.viewport.width} ${item.renderer}: p95 ${item.samples.map(sample => sample.p95FrameMs?.toFixed(1)).join(', ')} ms; errors ${item.errors.length}`);
}
