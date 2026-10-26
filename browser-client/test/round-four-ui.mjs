import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const state = { ...base, homeTeamName: 'Ironbank Rovers', awayTeamName: 'Cinderclaw Crew', homeResources: { apothecaries: 1 }, homeRerolls: 2, awayRerolls: 2,
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
    const controls = await page.getByRole('group',{name:'Camera perspective controls',exact:true}).boundingBox();
    const home = await page.locator('.live-resources.home').boundingBox();
    const away = await page.locator('.live-resources.away').boundingBox();
    assert.ok(d.x < width / 2 && controls.x > width / 2 && d.y >= home.y + home.height && controls.y >= away.y + away.height
      && Math.abs(d.y-controls.y)<2 && d.x>=0 && m.x+m.width<=width,'Debug is below home inducements, opposite camera buttons and Game Menu below away inducements');
  }
  await page.setViewportSize({width:1280,height:720});
  await debug.click();
  assert.equal(await page.getByLabel('Match debug',{exact:true}).isVisible(),true);
  assert.equal(await page.getByRole('button',{name:/^Cycle camera angle:/}).isVisible(),true);
  assert.equal(await page.getByLabel('Perspective angle',{exact:true}).count(),0,'Duplicate camera angle selector removed');
  assert.deepEqual(await page.evaluate(() => window.hudIntents),[],'Opening Debug sends no game action');
  await debug.click();
  for (const [kind,options] of [['coin',['heads','tails']],['receive',['receive','kick']]]) {
    await page.evaluate(({state,kind,options}) => window.publishHud({...state,prompt:{id:`prompt-${kind}`,kind,actor:'home',options}}),{state,kind,options});
    const dialog = page.getByRole('dialog',{name:'Match decision'});
    await dialog.getByRole('heading',{name:kind==='coin'?'Call the coin toss':'Choose to receive or kick',exact:true}).waitFor();
    assert.match(await dialog.locator('h2').evaluate(el => getComputedStyle(el).fontFamily),/MUTP/);
    assert.match(await dialog.getByRole('button').first().evaluate(el => getComputedStyle(el).fontFamily),/MUTP/);
    await dialog.getByRole('button').first().press('Enter');
    assert.deepEqual((await page.evaluate(() => window.hudIntents)).at(-1),{operation:'choice',fields:{promptId:`prompt-${kind}`,optionId:options[0]}});
  }
  await page.evaluate(state => window.publishHud({...state,prompt:null,actions:[{id:'choose-pow',kind:'blockDie',label:'Choose POW (die 1)',actor:'home',sourcePlayerId:null,target:null}]}),state);
  const dice = page.locator('.live-dice-overlay.interactive'); await dice.waitFor();
  const diceBox = await dice.boundingBox();
  const screenWidth = await page.evaluate(() => innerWidth);
  assert.ok(Math.abs(diceBox.x+diceBox.width/2-screenWidth*.65)<2,'Dice surface sits at 65% of the screen width');
  const diceRow = await dice.locator('.pitch-block-dice').boundingBox();
  assert.ok(Math.abs(diceRow.y+diceRow.height/2-360)<2,'Result dice are vertically centered on screen');
  const diceStyle = await dice.evaluate(el => ({ background: getComputedStyle(el).backgroundColor,
    border: getComputedStyle(el).borderTopWidth, glow: getComputedStyle(el, '::before').backgroundImage,
    opacity: getComputedStyle(el).opacity }));
  assert.equal(diceStyle.background,'rgba(0, 0, 0, 0)','Block dice remain unboxed at full HUD opacity');
  assert.equal(diceStyle.border,'0px','Block dice have no surrounding border');
  assert.match(diceStyle.glow,/radial-gradient/,'Block dice retain their diffuse glow');
  assert.equal(diceStyle.opacity,'1','Block faces stay opaque');
  assert.equal(await dice.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight),true,'Dice need no scrollbars at normal size');
  await page.evaluate(state => window.publishHud({...state,prompt:null,actions:[{id:'generic-team-reroll',kind:'reroll',label:'Use team reroll',actor:'home',sourcePlayerId:null,target:null}]}),state);
  const reroll = page.getByRole('dialog', { name: 'Use a re-roll?', exact: true }); await reroll.waitFor();
  assert.equal(await reroll.locator('.skill-circle').evaluate(el => getComputedStyle(el).backgroundColor),'rgb(7, 17, 30)','Non-block rerolls use the selected high-contrast circular surface');
  assert.equal(await reroll.locator('.skill-circle').evaluate(el => getComputedStyle(el).borderRadius),'50%');
  assert.equal(await reroll.locator('.skill-ribbon-track').count(),1,'Untimed rerolls retain a static perimeter');
  await reroll.getByRole('button',{name:'Use team reroll',exact:true}).click();
  assert.deepEqual((await page.evaluate(() => window.hudIntents)).at(-1),{operation:'action',fields:{actionId:'generic-team-reroll'}},'Circular confirmation preserves the offered action ID');
  assert.equal(await page.locator('.match-log-count').count(),0,'HUD log counter removed');
  await page.evaluate(state => window.publishHud({...state,phase:'PLAY',turnMode:'SOLID_DEFENCE',prompt:null,actions:[]},['Minimum of 3 players on the Line of Scrimmage.']),state);
  assert.match(await page.getByRole('alert').innerText(),/Minimum of 3 players/,'Native redeployment errors remain visible during kickoff setup');
  console.log('PASS: held selection, opacity endpoints/persistence/readable contents, responsive opposite-side Debug and public camera controls, exact MUTP kickoff choices, unboxed center-right block dice and circular non-block reroll confirmation.');
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server.close(); }
