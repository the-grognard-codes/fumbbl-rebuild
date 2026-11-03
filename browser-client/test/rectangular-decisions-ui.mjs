import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = fileURLToPath(new URL('../../.tools/validation/decision-prompts/', import.meta.url));
mkdirSync(evidence, { recursive: true });
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 const players = base.players.slice(0, 2).map((p,i) => ({ ...p, id: `candidate-${i}`, art: {rosterId: 'human', positionId: 'lineman'}, number: i+1, name: `Candidate ${i+1}`, x: 12+i*3, y: 7, offPitch: 'pitch', state: 'is standing' }));
 let revision=100;
 const frame = kind => ({ ...base, callerRole: 'home', actor:'home', phase:'PLAY', turnMode:'REGULAR', prompt:null, revision:++revision, players, activePlayerId:null,
   actions:[{id:`${revision}:intercept:none`, kind, actor:'home', label:'Do not intercept'}, ...players.map(p=>({id:`${revision}:intercept:${p.id}`,kind,actor:'home',label:`Intercept with ${p.name}`,target:{playerId:p.id}}))] });
 async function open(state) {
  await page.addInitScript(state => { window.adjustmentState=state; window.adjustmentRecords=[]; window.adjustmentIntents=[]; },state);
  await page.route('**/decision-review', route=>route.fulfill({contentType:'text/html',body:'<main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/match-adjustments-harness.tsx"></script>'}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/decision-review`);
  await page.getByRole('dialog',{name:'Match decision'}).waitFor();
 }
 for(const size of [{width:1280,height:900},{width:390,height:844}]) {
  await page.setViewportSize(size);
  const state=frame('interception'); await open(state);
  const dialog=page.getByRole('dialog',{name:'Match decision'}), confirm=dialog.getByRole('button',{name:'Confirm interceptor'});
  assert.equal(await dialog.getAttribute('aria-modal'),'false');
  assert.equal(await confirm.isDisabled(),true);
  await dialog.getByRole('button',{name:/Candidate 1/}).click();
  await page.locator('.decision-pointer circle').waitFor();
  await dialog.getByRole('button',{name:/Candidate 2/}).click();
  assert.deepEqual(await page.evaluate(()=>window.adjustmentIntents),[]);
  assert.equal(await dialog.locator('img.portrait').count(),2);
  await page.waitForFunction(()=>[...document.querySelectorAll('dialog img')].every(img=>img.complete && img.naturalWidth>0));
  await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(),true);
  if (size.width > 1000) assert.ok(await page.evaluate(() => {
    const panel=document.querySelector('dialog').getBoundingClientRect();
    const subject=document.querySelector('[data-player-id="candidate-1"]');
    const cells=[...document.querySelectorAll('[data-cell-x][data-cell-y]')].filter(n=>Math.abs(Number(n.dataset.cellX)-Number(subject.dataset.x))<=1 && Math.abs(Number(n.dataset.cellY)-Number(subject.dataset.y))<=1);
    return cells.length===9 && cells.every(n=>{const r=n.getBoundingClientRect();return panel.right<=r.left || panel.left>=r.right || panel.bottom<=r.top || panel.top>=r.bottom;});
  }), 'Prompt avoids the subject and all eight neighboring squares');
  // Pitch inspection and global confirmation shortcuts cannot submit a candidate.
  await page.locator('[data-player-id="candidate-0"]').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(()=>window.adjustmentIntents),[]);
  if (size.width > 1000) {
    const before=await page.locator('.decision-pointer circle').getAttribute('cy');
    await page.mouse.move(950,450); await page.mouse.down({button:'right'}); await page.mouse.move(950,500,{steps:6}); await page.mouse.up({button:'right'});
    await page.waitForFunction(before=>document.querySelector('.decision-pointer circle')?.getAttribute('cy')!==before,before);
    assert.deepEqual(await page.evaluate(()=>window.adjustmentIntents),[]);
  }
  await page.screenshot({path:`${evidence}/interception-${size.width}.png`});
  await confirm.click();
  assert.equal((await page.evaluate(()=>window.adjustmentIntents))[0].fields.actionId,state.actions[2].id);
  assert.equal(await confirm.isDisabled(),true);
  const next=frame('interception'); await page.evaluate(next=>window.publishAdjustment(next),next);
  assert.equal(await confirm.isDisabled(),true,'New authoritative revision discards the draft');
  await dialog.getByRole('button',{name:'Decline',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.adjustmentIntents)).at(-1).fields.actionId,next.actions[0].id);
 }
 for(const kind of ['coin','receive']) {
  const options=kind==='coin'?['heads','tails']:['kick','receive'];
  await open({...frame('interception'),phase:'PRE_MATCH',actions:[],prompt:{id:kind,actor:'home',kind,options}});
  assert.equal(await page.getByRole('dialog').getAttribute('aria-modal'),'true');
  await page.waitForFunction(()=>[...document.querySelectorAll('dialog img')].every(img=>img.complete&&img.naturalWidth>0));
  await page.getByRole('dialog').screenshot({path:`${evidence}/${kind}.png`});
  await page.getByRole('button',{name:kind==='coin'?'Heads':'Kick',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.adjustmentIntents))[0].fields.optionId,options[0]);
 }
 const off=frame('bribe'); off.players=players.map(p=>({...p,x:null,y:null,offPitch:'knockedOut'}));
 off.actions=[{id:`${revision}:bribe:yes`,kind:'bribe',actor:'home',label:'Use a bribe',target:{playerId:players[0].id}}, {id:`${revision}:bribe:no`,kind:'bribe',actor:'home',label:'Do not use a bribe',target:{playerId:players[0].id}}];
 await open(off); assert.equal(await page.locator('.decision-pointer').count(),0);
 assert.equal(await page.getByText('Player #1',{exact:true}).isVisible(),true);
 await page.getByRole('dialog').screenshot({path:`${evidence}/off-pitch-bribe.png`});
 assert.deepEqual(errors,[]);
 console.log('PASS rectangular choices: modal coin/kick, candidate previews/confirm/decline, stale drafts, portraits, inspection, pending input, off-pitch identity, desktop and phone.');
} finally { await browser.close(); await server.close(); }
