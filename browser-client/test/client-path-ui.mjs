import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const base of ['/', '/play/']) {
    const server = await createServer({ root, configFile: false, base, server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    try {
      await page.goto(`${origin}${base}teams`);
      await page.getByRole('heading', { name: 'BB2025 starter team builder' }).waitFor();
      await page.getByRole('link', { name: 'Match preparation', exact: true }).click();
      await page.waitForURL(`${origin}${base}matches`);
      await page.getByRole('heading', { name: 'Prepare a saved-team match' }).waitFor();
      for (const [route, heading] of [['setup', 'Match setup and play'], ['results', 'Match result and replay']]) {
        await page.goto(`${origin}${base}${route}?matchId=fixture#retained`);
        await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      }
      await page.getByRole('link', { name: 'Match setup', exact: true }).click();
      await page.waitForURL(`${origin}${base}setup?matchId=fixture`);
      await page.evaluate(() => {
        const link = document.createElement('a');
        link.href = '/results?matchId=fixture#retained';
        link.textContent = 'Fixture result link';
        document.body.append(link);
      });
      await page.getByRole('link', { name: 'Fixture result link', exact: true }).click();
      await page.waitForURL(`${origin}${base}results?matchId=fixture#retained`);
      await page.getByRole('heading', { name: 'Match result and replay', exact: true }).waitFor();
      assert.deepEqual(errors, []);
      console.log(`Diagnostic routes and cross-panel links passed with base ${base}`);
    } finally {
      await page.close();
      await server.close();
    }
  }
} finally {
  await browser.close();
}
