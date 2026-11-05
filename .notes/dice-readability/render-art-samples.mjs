import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
// Resolve from this review folder without installing or changing dependencies.
const revision = ['--v7', '--v6', '--v5', '--v4', '--v3', '--v2'].find(arg => process.argv.includes(arg))?.replace('--', '-') ?? '';
const pageUrl = new URL(`./art-samples/index${revision}.html`, import.meta.url);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(pageUrl.href);
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    const status = await page.evaluate(() => ({ cards: document.querySelectorAll('article').length,
      loaded: [...document.images].every(img => img.complete && img.naturalWidth > 0),
      overflow: document.documentElement.scrollWidth > innerWidth }));
    if (status.cards !== 8 || !status.loaded || status.overflow) throw new Error(JSON.stringify(status));
    await page.screenshot({ path: fileURLToPath(new URL(`./art-samples/review${revision}-${width}.png`, import.meta.url)), fullPage: true });
    console.log(`${width}px: eight cards, all images loaded, no horizontal overflow`);
  }
} finally { await browser.close(); }
