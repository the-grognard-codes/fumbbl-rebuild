import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const base of ['/', '/play/']) {
    const server = await createServer({ root, configFile: false, base, server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    const page = await browser.newPage();
    const errors = [];
    const failedResources = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failedResources.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
    page.on('response', response => {
      if (response.status() >= 400) failedResources.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
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
    } catch (error) {
      // Keep loading failures visible when a heading wait fails before the final assertion.
      console.error('Diagnostic route failed:', { base, path: new URL(page.url()).pathname, errors, failedResources });
      throw error;
    } finally {
      await page.close();
      await server.close();
    }
  }
} finally {
  await browser.close();
}
