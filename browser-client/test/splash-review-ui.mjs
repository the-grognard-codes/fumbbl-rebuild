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
 for (const width of [1440, 390, 1024, 844]) {
  await page.setViewportSize({width, height: width === 390 ? 844 : width === 1024 ? 768 : width === 844 ? 390 : 900});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/splash-review.html`);
  await page.locator('.match-splash').waitFor(); await page.evaluate(() => document.fonts.ready);
  for (const kind of (process.env.SPLASH_KINDS?.split(',') ?? ['touchdown','turnover','turnStart','kickoff','weather','halfTime','fullTime'])) {
   await page.getByLabel('Event', {exact:true}).selectOption(kind);
   const properties = await page.locator('.match-splash-shade').evaluate(node => node.getAnimations({subtree:true}).flatMap(animation => animation.effect.getKeyframes().flatMap(frame => Object.keys(frame))));
   assert.ok(properties.every(property => ['offset','computedOffset','easing','composite','opacity','transform'].includes(property)), 'Splash keyframes animate only transform and opacity');
   for (const time of [0,150,350,500,700,1300]) {
    await page.getByRole('button',{name:'Replay animation',exact:true}).click();
    await page.locator('.match-splash-shade').evaluate((node,time) => { for(const animation of node.getAnimations({subtree:true})) { animation.pause(); animation.currentTime=time; } },time);
    await page.screenshot({path:`${output}/${kind}-${width}-${time}.png`});
   }
   for (const team of ['home','away']) for (const pair of ['gold','black','white']) {
    await page.getByLabel('Team',{exact:true}).selectOption(team); await page.getByLabel('Colours',{exact:true}).selectOption(pair);
    await page.locator('.match-splash-shade').evaluate(node => { for(const animation of node.getAnimations({subtree:true})) { animation.pause(); animation.currentTime=900; } });
    assert.ok(await page.locator('.match-splash').evaluate(node => node.scrollWidth <= node.clientWidth));
    if (kind === 'halfTime') {
     const layout = await page.locator('.match-splash').evaluate(card => {
      const heading = card.querySelector('h2'), pitch = card.querySelector('.match-splash-half-pitch');
      const h = heading.getBoundingClientRect(), p = pitch.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(heading);
      return { lines: range.getClientRects().length, dx: Math.abs(h.x + h.width / 2 - p.x - p.width / 2),
       dy: Math.abs(h.y + h.height / 2 - p.y - p.height / 2), dotted: getComputedStyle(pitch, '::before').borderLeftStyle,
       wide: getComputedStyle(pitch, '::after').borderTopStyle };
     });
     assert.equal(layout.lines, 1, 'Halftime heading stays on one line');
     assert.ok(layout.dx < 1 && layout.dy < 1, 'Halftime heading is centred on the scrimmage midpoint');
     assert.equal(layout.dotted, 'dotted'); assert.equal(layout.wide, 'dashed');
    }
    await page.screenshot({path:`${output}/${kind}-${width}-${team}-${pair}.png`});
   }
   if (kind === 'kickoff' || kind === 'weather' || kind === 'fullTime') {
    const control = page.getByLabel(kind === 'fullTime' ? 'Outcome' : 'Variant', {exact:true});
    const values = await control.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
    for (const value of values) {
     await control.selectOption(value);
     await page.locator('.match-splash-icon img').evaluate(img => img.decode());
     await page.locator('.match-splash-shade').evaluate(node => { for (const animation of node.getAnimations({subtree:true})) { animation.pause(); animation.currentTime=900; } });
     assert.ok(await page.locator('.match-splash').evaluate(node => node.scrollWidth <= node.clientWidth));
     await page.screenshot({path:`${output}/${kind}-${width}-${value}.png`});
    }
    if (kind === 'kickoff') {
     await control.selectOption('WEATHER_CHANGE');
     const condition = page.getByLabel('Resulting weather', {exact:true});
     for (const value of await condition.locator('option').evaluateAll(nodes => nodes.map(node => node.value))) {
      await condition.selectOption(value);
      const splash = page.locator(`.match-splash-kickoff[data-weather="${value}"]`);
      await splash.locator('.match-splash-icon img').evaluate(img => img.decode());
      await splash.evaluate(node => { for (const animation of node.getAnimations({subtree:true})) { animation.pause(); animation.currentTime=900; } });
      assert.equal(await splash.getByRole('heading').textContent(), 'CHANGING WEATHER');
      await page.screenshot({path:`${output}/kickoff-${width}-changing-${value}.png`});
     }
    }
   }
   await page.getByRole('button',{name:'Exit',exact:true}).click();
   await page.locator('.match-splash-shade').evaluate(node => { for(const animation of node.getAnimations({subtree:true})) { animation.pause(); animation.currentTime=100; } });
   await page.screenshot({path:`${output}/${kind}-${width}-exit.png`});
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.getByRole('button',{name:'Replay animation',exact:true}).click();
   assert.ok(await page.locator('.match-splash').evaluate(node => node.getAnimations({subtree:true}).length === 0));
   await page.screenshot({path:`${output}/${kind}-${width}-reduced.png`});
   await page.emulateMedia({reducedMotion:'no-preference'});
  }
 }
 await page.getByText('Inspect frames', {exact:true}).click();
 await page.getByRole('slider', {name:'Frame time'}).focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
 assert.ok(await page.locator('.review-stage').evaluate(node => node.getAnimations({subtree:true}).every(animation => animation.playState === 'paused')));
 await page.getByLabel('Camera', {exact:true}).selectOption('away');
 await page.getByLabel('Event', {exact:true}).selectOption('turnStart');
 await page.getByLabel('Team', {exact:true}).selectOption('home');
 assert.equal(await page.locator('.match-splash-shade').getAttribute('data-team'), 'away');
 console.log(`PASS splash review captures: ${output}`);
} finally { await browser.close(); await server.close(); }
