import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const output = fileURLToPath(new URL(`../../.tools/animated-splashes/${process.env.SPLASH_ROUND || 'round-1'}/`, import.meta.url));
mkdirSync(output, { recursive: true });
try {
 const page = await browser.newPage();
 for (const width of [1440, 390]) {
  await page.setViewportSize({width, height: width === 390 ? 844 : 900});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/splash-review.html`);
  await page.locator('.match-splash').waitFor(); await page.evaluate(() => document.fonts.ready);
  for (const kind of ['touchdown','turnover','turnStart']) {
   await page.getByLabel('Event', {exact:true}).selectOption(kind);
   for (const time of [0,150,350,500,700,1300]) {
    await page.getByRole('button',{name:'Replay animation',exact:true}).click();
    await page.locator('.match-splash-shade').evaluate((node,time) => { for(const animation of node.getAnimations({subtree:true})) { animation.pause(); animation.currentTime=time; } },time);
    await page.screenshot({path:`${output}/${kind}-${width}-${time}.png`});
   }
   for (const team of ['home','away']) for (const pair of ['gold','black','white']) {
    await page.getByLabel('Team',{exact:true}).selectOption(team); await page.getByLabel('Colours',{exact:true}).selectOption(pair);
    await page.locator('.match-splash-shade').evaluate(node => { for(const animation of node.getAnimations({subtree:true})) { animation.pause(); animation.currentTime=900; } });
    assert.ok(await page.locator('.match-splash').evaluate(node => node.scrollWidth <= node.clientWidth));
    await page.screenshot({path:`${output}/${kind}-${width}-${team}-${pair}.png`});
   }
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.getByRole('button',{name:'Replay animation',exact:true}).click();
   assert.ok(await page.locator('.match-splash').evaluate(node => node.getAnimations({subtree:true}).length === 0));
   await page.screenshot({path:`${output}/${kind}-${width}-reduced.png`});
   await page.emulateMedia({reducedMotion:'no-preference'});
  }
 }
 console.log(`PASS splash review captures: ${output}`);
} finally { await browser.close(); await server.close(); }
