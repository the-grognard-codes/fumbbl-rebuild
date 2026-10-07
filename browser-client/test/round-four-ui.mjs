import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const state = { ...base, homeTeamName: 'Ironbank Rovers', awayTeamName: 'Cinderclaw Crew', homeResources: { apothecaries: 1 }, homeRerolls: 2,
  clock:{activeRole:'home',turnElapsedMs:0,homeReserveMs:600000,awayReserveMs:600000} };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, state);
  await page.route('**/round-four', route => route.fulfill({ contentType: 'text/html', body: '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/round-four`);
  await page.locator('.coach-match').waitFor();
  const name = await page.locator('.coach-score-center .live-team-nameplate').first().boundingBox();
  await page.mouse.move(name.x + 20, name.y + name.height / 2);
  await page.mouse.down();
  await page.mouse.move(name.x + name.width + 150, name.y + name.height + 90, { steps: 18 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => getSelection().toString()), '', 'Holding/dragging the match HUD must not select text or images blue');
  const selectors = ['.live-resources.home','.live-chess-clock.home','.live-dugout.home','.match-history-chat','.match-history-log'];
  for (const percent of [0,30,100]) {
    await page.getByRole('button',{name:'Game Menu',exact:true}).click();
    await page.getByRole('tab',{name:'Interface',exact:true}).click();
    const slider = page.getByRole('slider',{name:'Panel background opacity'});
    await slider.fill(String(percent));
    await page.getByRole('button',{name:'Close Game Menu'}).click();
    for (const selector of selectors) {
      const colors = await page.locator(selector).evaluate(el => ({ color:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el).opacity }));
      const expected = percent === 100 ? 'rgb(9, 23, 38)' : `rgba(9, 23, 38, ${percent/100})`;
      assert.equal(colors.color,expected,`${selector} background at ${percent}%`);
      assert.equal(colors.opacity,'1','Panel contents stay opaque');
    }
  }
  await page.reload();
  await page.locator('.coach-match').waitFor();
  assert.equal(await page.locator('.live-dugout.home').evaluate(el => getComputedStyle(el).backgroundColor),'rgb(9, 23, 38)','Opacity persists through reload');
  const debug = page.getByRole('button',{name:'Debug',exact:true}), menu = page.getByRole('button',{name:'Game Menu',exact:true});
  for (const [width,height] of [[1280,720],[640,330],[375,300]]) {
    await page.setViewportSize({width,height});
    const d = await debug.boundingBox(), m = await menu.boundingBox();
    assert.ok(d.x + d.width <= m.x && Math.abs(d.y-m.y)<2 && d.x>=0 && m.x+m.width<=width,'Debug sits immediately left of Game Menu');
  }
  await page.setViewportSize({width:1280,height:720});
  await debug.click();
  assert.equal(await page.getByLabel('Match debug',{exact:true}).isVisible(),true);
  assert.equal(await page.getByLabel('Perspective angle',{exact:true}).isVisible(),true);
  assert.deepEqual(await page.evaluate(() => window.hudIntents),[],'Opening Debug sends no game action');
  await debug.click();
  for (const [kind,options] of [['coin',['heads','tails']],['receive',['receive','kick']]]) {
    await page.evaluate(({state,kind,options}) => window.publishHud({...state,prompt:{id:`prompt-${kind}`,kind,actor:'home',options}}),{state,kind,options});
    const dialog = page.getByRole('dialog',{name:'Match decision'});
    await dialog.waitFor();
    assert.match(await dialog.locator('h2').evaluate(el => getComputedStyle(el).fontFamily),/MUTP/);
    assert.match(await dialog.getByRole('button').first().evaluate(el => getComputedStyle(el).fontFamily),/MUTP/);
    await dialog.getByRole('button').first().press('Enter');
    assert.deepEqual((await page.evaluate(() => window.hudIntents)).at(-1),{operation:'choice',fields:{promptId:`prompt-${kind}`,optionId:options[0]}});
  }
  await page.evaluate(state => window.publishHud({...state,prompt:null,actions:[{id:'choose-pow',kind:'blockDie',label:'Choose POW (die 1)',actor:'home',sourcePlayerId:null,target:null}]}),state);
  const dice = page.locator('.live-dice-overlay.interactive'); await dice.waitFor();
  const diceBox = await dice.boundingBox();
  assert.ok(Math.abs(diceBox.x+diceBox.width/2-320)<15,'Dice box center sits halfway from field center to left edge');
  assert.equal(await dice.evaluate(el => getComputedStyle(el).backgroundColor),'rgb(9, 23, 38)','Portal dice share HUD opacity');
  assert.equal(await dice.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight),true,'Dice need no scrollbars at normal size');
  assert.equal(await page.locator('.match-log-count').count(),0,'HUD log counter removed');
  console.log('PASS: held selection, opacity endpoints/persistence/readable contents, responsive Debug adjacency, exact MUTP kickoff choices and boxed quarter-field dice.');
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server.close(); }
