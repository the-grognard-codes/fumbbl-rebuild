import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts()[0].pages().find(p => p.url().includes('localhost:5000'));
console.log('URL', page.url());
console.log(JSON.stringify(await page.evaluate(() => ({ revision: window.__soak?.revision, failures: window.__soak?.failures?.slice(-8), outgoing: window.__soak?.outgoing?.slice(-5)?.map(o => o.operation) }))));
console.log('ALERTS', JSON.stringify(await page.getByRole('alert').allTextContents()));
console.log('TEXT', (await page.locator('body').innerText()).slice(0, 500).replace(/\s+/g, ' '));
