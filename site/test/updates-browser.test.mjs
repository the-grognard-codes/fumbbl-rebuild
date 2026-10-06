import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const history = JSON.parse(await readFile(new URL('../updates.json', import.meta.url), 'utf8'));

test('updates supports linked pagination, topic/PR search, category filters and complete no-script history', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    const file = resolve(root, `.${path === '/updates' ? '/updates/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try { response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/updates`);
    const visible = page.locator('.update-entry:visible');
    const top = page.getByRole('navigation', { name: 'Updates pages, top' });
    await page.getByText(`Showing 1–10 of ${history.length} updates · Page 1 of ${Math.ceil(history.length / 10)}`, { exact: true }).waitFor();
    assert.equal(await visible.count(), 10);
    assert.equal(await visible.first().getAttribute('data-pr'), String(history[0].number));
    assert.equal(await top.getByRole('link', { name: 'Page 1', exact: true }).getAttribute('aria-current'), 'page');
    await top.getByRole('link', { name: 'Older →', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    assert.equal(await visible.first().getAttribute('data-pr'), String(history[10].number));
    assert.equal(await page.locator('#updates-list').evaluate(element => element === document.activeElement), true);
    await page.reload();
    await page.getByText(`Showing 11–20 of ${history.length} updates · Page 2 of ${Math.ceil(history.length / 10)}`, { exact: true }).waitFor();
    await page.goBack();
    await page.getByText(`Showing 1–10 of ${history.length} updates · Page 1 of ${Math.ceil(history.length / 10)}`, { exact: true }).waitFor();

    await page.getByLabel('Search updates').fill('PR #125');
    await page.getByRole('button', { name: 'Find updates' }).click();
    assert.equal(await visible.count(), 1);
    assert.equal(await visible.first().getAttribute('data-pr'), '125');
    assert.equal(await visible.getByRole('link', { name: 'PR #125' }).getAttribute('href'), 'https://github.com/the-grognard-codes/fumbbl-rebuild/pull/125');
    assert.equal(await top.isVisible(), false);
    await page.getByLabel('Category').selectOption('Project notes');
    await page.getByRole('button', { name: 'Find updates' }).click();
    await page.getByRole('heading', { name: 'No matching updates' }).waitFor();
    await page.getByRole('button', { name: 'Show all updates' }).click();
    assert.equal(await visible.count(), 10);
    assert.equal(await page.getByLabel('Search updates').inputValue(), '');
    await page.getByLabel('Search updates').fill('REROLL');
    await page.getByLabel('Category').selectOption('Gameplay');
    await page.getByRole('button', { name: 'Find updates' }).click();
    assert.ok(await visible.count() > 0);
    assert.ok((await visible.evaluateAll(items => items.map(item => item.dataset.category))).every(category => category === 'Gameplay'));
    assert.equal(new URL(page.url()).searchParams.get('category'), 'Gameplay');
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.goto(`${origin}/updates?page=999`);
    assert.equal(await visible.first().getAttribute('data-pr'), String(history[Math.floor((history.length - 1) / 10) * 10].number));
    assert.equal(await visible.last().getAttribute('data-pr'), '1');
    await page.goto(`${origin}/updates?page=-2&category=unknown`);
    await top.getByRole('link', { name: 'Page 1', exact: true }).waitFor();

    const output = fileURLToPath(new URL('../../test-output/updates-page/', import.meta.url));
    await mkdir(output, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
      assert.equal(await visible.count(), 10);
      if (width === 390) await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);

    const noScript = await browser.newContext({ javaScriptEnabled: false });
    await noScript.route('https://fonts.googleapis.com/**', route => route.abort());
    const fallback = await noScript.newPage();
    await fallback.goto(`${origin}/updates`);
    assert.equal(await fallback.locator('.update-entry:visible').count(), history.length);
    assert.equal(await fallback.getByRole('link', { name: 'PR #1', exact: true }).isVisible(), true);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
