import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const kinds = ['blitz','pass','handOff','foul','bomb','throwMate','kickMate','punt','secure'];
const state = { ...initial, players: kinds.map((kind,index) => ({ ...initial.players[0], id: `tag${index}`,
  name: `Tagged ${kind}`, number: index+1, slot: index+1, x: 9+Math.floor(index/3), y: 5+index%3,
  limitedAction: kind, art: { rosterId: 'human', positionId: 'lineman' } })) };
const server = await createServer({ root: fileURLToPath(new URL('../',import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const evidence = fileURLToPath(new URL('../../.tools/limited-action-review/', import.meta.url));
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(30000);
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(view=>{ window.markerInput={view,replay:false}; window.markerIntents=[]; },state);
  await page.route('**/action-tags-test',route=>route.fulfill({contentType:'text/html',body:
    '<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/skill-markers-harness.tsx"></script>'}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/action-tags-test`);
  await page.locator('.coach-match').waitFor();
  await page.addStyleTag({ content: readFileSync(new URL('../../site/src/assets/play.css',import.meta.url),'utf8') });
  const tags=page.locator('.live-limited-action');
  await page.getByRole('button',{name:'Game Menu',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'Game Menu',exact:true});
  await menu.getByRole('tab',{name:'Interface',exact:true}).click();
  const toggle=menu.getByRole('checkbox',{name:'Show limited action tags',exact:true});
  assert.equal(await toggle.isChecked(),true);
  assert.equal(await tags.count(),9);
  await page.screenshot({path:`${evidence}/interface-toggle.png`});
  await toggle.uncheck(); assert.equal(await tags.count(),0);
  await page.reload(); await page.getByRole('button',{name:'Game Menu',exact:true}).click();
  await menu.getByRole('tab',{name:'Interface',exact:true}).click();
  assert.equal(await toggle.isChecked(),false);
  await toggle.check(); await page.keyboard.press('Escape');
  assert.deepEqual(await tags.locator('[data-action-icon]').evaluateAll(items=>items.map(item=>item.dataset.actionIcon)),kinds);
  const publish=(view,replay=false)=>page.evaluate(input=>window.publishMarkerState(input),{view,replay});
  for (const callerRole of ['home','away','spectator']) {
    await publish({...state,callerRole}); assert.equal(await tags.count(),9);
  }
  await publish(state,true); assert.equal(await tags.count(),9);
  const cleared={...state,revision:state.revision+1,players:state.players.map(({limitedAction,...player})=>player)};
  await publish(cleared,true); assert.equal(await tags.count(),0);
  await publish(state,true); assert.equal(await tags.count(),9);
  await publish({...state,players:state.players.map((player,index)=>index===0?{...player,x:null,y:null,offPitch:'reserve'}:player)});
  assert.equal(await tags.count(),8);
  for (const status of ['prone','stunned','distracted']) {
    await publish({...state,players:state.players.map(player=>({...player,state:status,status}))});
    assert.equal(await tags.count(),9);
  }
  await publish(state);
  await page.screenshot({path:`${evidence}/gold-tags-pitch.png`});
  assert.equal(await tags.evaluateAll(items=>items.every(item=>getComputedStyle(item).pointerEvents==='none'
    && getComputedStyle(item,'::before').backgroundImage.includes('radial-gradient'))),true);
  for (const size of [{width:1280,height:800},{width:915,height:412}]) {
    await page.setViewportSize(size);
    await page.getByRole('button',{name:'Game Menu',exact:true}).click();
    await menu.getByRole('tab',{name:'Interface',exact:true}).click(); await toggle.scrollIntoViewIfNeeded();
    assert.equal(await menu.evaluate(item=>item.scrollWidth<=item.clientWidth),true);
    await page.keyboard.press('Escape'); assert.equal(await tags.count(),9);
  }
  assert.deepEqual(errors,[]); assert.deepEqual(await page.evaluate(()=>window.markerIntents),[]);
  console.log('Limited action tags UI PASS: nine gold icons, default-on toggle, persistence, both coaches/spectators, replay seeks, recovery snapshots, statuses, off-pitch removal, mobile viewport.');
} finally { await browser.close(); await server.close(); }
