import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));

test('support scaling preserves CSS targets, rounds up physical space and works with keyboard, touch and no script', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    const file = resolve(root, `.${path === '/support' ? '/support/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/support`);
    const slider = page.getByRole('slider', { name: 'OS / display scaling' });
    await page.waitForFunction(() => !document.querySelector('#display-scale').disabled);
    await slider.focus();
    const cssTargets = await page.locator('.support-calculated-sizes dt span').allTextContents();
    const expected = [
      ['1920 × 900', '1366 × 768', '1024 × 600', '1350 × 300', '980 × 320'],
      ['2400 × 1125', '1708 × 960', '1280 × 750', '1688 × 375', '1225 × 400'],
      ['2880 × 1350', '2049 × 1152', '1536 × 900', '2025 × 450', '1470 × 480'],
      ['3360 × 1575', '2391 × 1344', '1792 × 1050', '2363 × 525', '1715 × 560'],
      ['3840 × 1800', '2732 × 1536', '2048 × 1200', '2700 × 600', '1960 × 640'],
    ];
    for (let index = 0; index < expected.length; index++) {
      if (index) await slider.press('ArrowRight');
      const percent = 100 + index * 25;
      assert.equal(await slider.inputValue(), String(percent));
      assert.equal(await slider.getAttribute('aria-valuetext'), `${percent} percent`);
      assert.equal(await page.locator('#scale-value').textContent(), `${percent}%`);
      assert.deepEqual(await page.locator('.physical-size').allTextContents(), expected[index].map(size => `${size} physical px`));
      assert.deepEqual(await page.locator('.support-calculated-sizes dt span').allTextContents(), cssTargets);
      assert.match(await page.locator('#scale-summary').textContent(), /100% browser zoom/);
    }
    await slider.press('ArrowRight');
    assert.equal(await slider.inputValue(), '200');
    await slider.press('Home');
    await slider.press('ArrowLeft');
    assert.equal(await slider.inputValue(), '100');
    await page.getByText('Layout fit is different from comfortable play', { exact: true }).click();
    assert.equal(await page.getByText('1350 × 300 CSS pixels for live coaching/spectating', { exact: true }).isVisible(), true);
    await page.getByText('Layout fit is different from comfortable play', { exact: true }).click();

    const output = fileURLToPath(new URL('../../test-output/support-page/', import.meta.url));
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
      if (width === 390) await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);

    const touch = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
    await touch.route('https://fonts.googleapis.com/**', route => route.abort());
    const touchPage = await touch.newPage();
    await touchPage.goto(page.url());
    const touchSlider = touchPage.getByRole('slider');
    await touchSlider.scrollIntoViewIfNeeded();
    await touchPage.waitForFunction(() => !document.querySelector('#display-scale').disabled);
    const bounds = await touchSlider.boundingBox();
    await touchPage.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    assert.equal(await touchSlider.inputValue(), '150');
    assert.equal(await touchPage.locator('.physical-size').first().textContent(), '2880 × 1350 physical px');

    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
    await noScript.route('https://fonts.googleapis.com/**', route => route.abort());
    const fallback = await noScript.newPage();
    await fallback.goto(page.url());
    assert.equal(await fallback.getByRole('slider').isDisabled(), true);
    assert.deepEqual(await fallback.locator('.physical-size').allTextContents(), expected[0].map(size => `${size} physical px`));
    assert.equal(await fallback.locator('noscript').isVisible(), true);
    assert.equal(await fallback.getByRole('heading', { name: 'Planning for animated matches' }).isVisible(), true);
    assert.equal(await fallback.getByRole('link', { name: 'support@molesunderthepitch.org', exact: true }).isVisible(), true);
    assert.equal(await fallback.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
