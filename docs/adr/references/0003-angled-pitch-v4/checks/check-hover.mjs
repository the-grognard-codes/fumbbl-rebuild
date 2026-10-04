import { mkdir as prepareReferenceOutput } from 'node:fs/promises';
await prepareReferenceOutput('.tools/pitch-camera-references-v4-qa', { recursive: true });
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require=createRequire(path.resolve('browser-client/package.json'));
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1672,height:1150}});
const root=path.resolve('docs/adr/references/0003-angled-pitch-v4');
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const report={views:[],layouts:[],errors};
const ready=()=>page.evaluate(()=>window.pitchReferenceReady);
const fixture=()=>page.evaluate(()=>JSON.stringify({players:window.pitchReferenceScene.players,selected:window.pitchReferenceScene.selected,ball:window.pitchReferenceScene.ball}));
async function withinViewport(selector) {
  return page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect(),frame=document.getElementById('camera-frame').getBoundingClientRect();return r.left>=Math.max(0,frame.left)&&r.right<=Math.min(innerWidth,frame.right)&&r.top>=Math.max(0,frame.top)&&r.bottom<=Math.min(innerHeight,frame.bottom);});
}
async function pan(value) {
  await page.locator('#pan').evaluate((n,v)=>{n.value=v;n.dispatchEvent(new Event('input',{bubbles:true}));},value);await ready();
}
try {
  await page.goto(pathToFileURL(path.join(root,'viewer.html')).href);await ready();
  const baseline=await fixture();
  for(const view of ['perspective-40-home','perspective-40-away','top-down-home','top-down-away']) {
    await page.selectOption('#view',view);await ready();await pan(13);
    assert.equal(await page.locator('#player-card').isVisible(),false);
    assert.equal(await page.locator('#home-resources .resource').count(),3);
    assert.equal(await page.locator('#away-resources .resource').count(),4);
    assert.equal(await page.locator('.resources h2').count(),0);
    const placement=await page.evaluate(()=>{
      const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();
      return{home:rect('home-resources'),away:rect('away-resources'),hc:rect('home-clock'),ac:rect('away-clock'),score:rect('scoreboard-art'),chat:rect('match-chat'),event:rect('event-log')};
    });
    assert.ok(placement.home.width<placement.away.width);
    assert.ok(Math.abs(placement.home.width-198)<.01);assert.ok(Math.abs(placement.away.width-258)<.01);
    assert.ok(placement.hc.right<placement.score.left);assert.ok(placement.ac.left>placement.score.right);
    assert.ok(placement.home.right<placement.hc.left);assert.ok(placement.ac.right<placement.away.left);
    assert.ok(Math.abs(placement.hc.top-placement.ac.top)<.01);
    assert.ok(Math.abs(placement.chat.bottom-placement.event.bottom)<.01);
    for(const id of ['home-clock','away-clock']) {
      const lines=await page.locator(`#${id} span`).allTextContents();
      assert.match(lines[0],/^BANK/);assert.match(lines[1],/^TURN/);
    }
    const ids=await page.locator('#occupants [data-player-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.playerId));
    assert.equal(ids.length,22);
    for(const id of ids) {
      await page.locator(`#occupants [data-player-id="${id}"]`).focus();
      assert.equal(await page.locator('#player-card').isVisible(),true);
      assert.equal(await page.locator('#player-card').getAttribute('data-player-id'),id);
      assert.equal(await page.locator('#player-card-art').isVisible(),id==='home-3');
      assert.equal(await page.locator('#generic-player-summary').isVisible(),id!=='home-3');
      assert.equal(await page.locator(`#occupants [data-player-id="${id}"]`).evaluate(n=>getComputedStyle(n).outlineStyle),'none');
      assert.equal(await page.locator(`#occupants [data-player-id="${id}"]`).getAttribute('aria-describedby'),'player-card');
      assert.ok(await withinViewport('#player-card'));
    }
    await page.locator('#stage').focus();
    await page.locator('#occupants [data-player-id="home-3"] image').hover();
    assert.equal(await page.locator('#player-card').isVisible(),true);
    assert.match(await page.locator('#player-card').getAttribute('aria-label'),/^Alden, Blitzer/);
    await page.locator('#player-card').hover();
    await page.waitForTimeout(150);assert.equal(await page.locator('#player-card').isVisible(),true);
    await page.mouse.move(800,170);await page.waitForFunction(()=>document.getElementById('player-card').hidden);
    await page.locator('#occupants [data-player-id="away-11"]').focus();
    assert.match(await page.locator('#player-summary-name').innerText(),/^Cinderclaw #11/);
    assert.equal(await page.locator('#player-summary-stats dd').allTextContents().then(a=>a.join(',')),'—,—,—,—');
    // Alternate summaries to catch stale SVG artwork under a generic player card.
    await page.locator('#occupants [data-player-id="home-3"]').focus();
    assert.equal(await page.locator('#player-card-art').isVisible(),true);
    assert.equal(await page.locator('#generic-player-summary').isVisible(),false);
    for(const selected of ['home-5','home-8']) {
      await page.evaluate(id=>{window.pitchReferenceScene.selected=id;window.pitchReference.render();},selected);await ready();
      await page.locator('#occupants [data-player-id="away-11"]').focus();
      const placement=await page.evaluate(()=>{
        const api=window.pitchReference,p=api.scene.players.find(p=>p.id===api.scene.selected);
        const dock=api.project(p.x+.5,p.y+.5).x>=836?'left':'right';
        const card=document.getElementById('player-card').getBoundingClientRect(),panel=document.getElementById(dock==='left'?'match-chat':'event-log').getBoundingClientRect();
        const scale=document.getElementById('camera-frame').getBoundingClientRect().width/1672;
        return{dock,actual:document.getElementById('player-card').dataset.dock,gap:(panel.top-card.bottom)/scale,edge:Math.abs(dock==='left'?panel.left-card.left:panel.right-card.right),selection:document.querySelector('[data-selection]').dataset.selection};
      });
      assert.equal(placement.dock,placement.actual);assert.equal(placement.selection,selected);
      assert.ok(Math.abs(placement.gap-12)<.02);assert.ok(placement.edge<.02);
      assert.equal(await page.locator('#player-card-art').isVisible(),false);
    }
    await page.evaluate(()=>{window.pitchReferenceScene.selected='home-3';window.pitchReference.render();});await ready();
    await page.keyboard.press('Escape');assert.equal(await page.locator('#player-card').isVisible(),false);
    await page.locator('#occupants [data-player-id="home-3"]').focus();
    await pan(9.5);assert.equal(await page.locator('#player-card').isVisible(),false);
    await page.locator('#occupants [data-player-id="home-3"]').focus();
    await page.locator('#toggle-tactical').click();await ready();
    assert.equal(await page.locator('#player-card').isVisible(),false);
    await page.selectOption('#view',view);await pan(13);
    for(const index of [0,2,6]) {
      const icon=page.locator('.resource').nth(index),label=await icon.getAttribute('aria-label');
      await icon.hover();assert.equal(await page.locator('#resource-tooltip').innerText(),label);
      assert.ok(await withinViewport('#resource-tooltip'));
      const iconRect=await icon.boundingBox(),tipRect=await page.locator('#resource-tooltip').boundingBox();
      assert.ok(tipRect.y>=iconRect.y+iconRect.height);
      await icon.focus();assert.equal(await icon.getAttribute('aria-describedby'),'resource-tooltip');
      await page.keyboard.press('Escape');assert.equal(await page.locator('#resource-tooltip').isVisible(),false);
      await page.locator('#stage').focus();
    }
    assert.equal(await fixture(),baseline);
    const projection=await page.evaluate(()=>JSON.stringify(window.pitchReference.export()));
    for(const [size,pixels] of [['small',16],['large',24],['medium',20]]) {
      await page.locator(`[data-log-size="${size}"]`).click();
      assert.equal(await page.locator('#event-messages').evaluate(n=>getComputedStyle(n).fontSize),`${pixels}px`);
      assert.equal(await page.locator('.log-font-controls [aria-pressed=true]').count(),1);
      assert.equal(await page.locator(`[data-log-size="${size}"]`).getAttribute('aria-pressed'),'true');
      assert.equal(await page.evaluate(()=>JSON.stringify(window.pitchReference.export())),projection);
    }
    await page.locator('#hide-controls').click();
    assert.equal(await page.locator('#reference-controls').isVisible(),false);
    assert.equal(await page.locator('#show-controls').isVisible(),true);
    assert.equal(await page.locator('#show-controls').evaluate(n=>n===document.activeElement),true);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.pitchReference.export())),projection);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#reference-controls').isVisible(),true);
    assert.equal(await page.locator('#hide-controls').evaluate(n=>n===document.activeElement),true);
    assert.equal(await page.locator('#framing').count(),0);
    report.views.push({view,playersInspected:22,resources:[3,4],clockPlacement:'beside nameplates, BANK above TURN',hover:'one summary, independent of selection, opposite docking, keyboard, containment and dismissal passed',logFontSizes:[16,20,24],toolbar:'hide/show preserves camera and keyboard focus',selection:'unchanged'});
  }
  // Exercise the same handler against off-pitch entries without altering pitch occupancy.
  await page.evaluate(()=>{
    window.pitchReferenceScene.dugoutPlayers=['Seriously injured','Dead','Sent off'].map((status,i)=>({id:`dugout-${i}`,team:'home',number:12+i,status}));
    const test=document.createElement('div');test.id='dugout-test';Object.assign(test.style,{position:'absolute',left:'20px',top:'250px',pointerEvents:'auto'});
    for(const p of window.pitchReferenceScene.dugoutPlayers){const b=document.createElement('button');b.dataset.playerId=p.id;b.textContent=p.status;test.append(b);}
    document.getElementById('hud').append(test);
  });
  for(const status of ['Seriously injured','Dead','Sent off']) {
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:status,exact:true}).hover();
    assert.equal(await page.locator('#player-status').innerText(),status);
    assert.ok(await withinViewport('#player-card'));
  }
  await page.evaluate(()=>{document.getElementById('dugout-test').remove();delete window.pitchReferenceScene.dugoutPlayers;});
  assert.equal(await fixture(),baseline);report.dugoutStatuses=['Seriously injured','Dead','Sent off'];
  for(const width of [1920,1280,390]) {
    await page.setViewportSize({width,height:1080});
    await page.goto(pathToFileURL(path.join(root,'viewer.html')).href);await ready();
    await page.locator('#occupants [data-player-id="home-3"]').focus();assert.ok(await withinViewport('#player-card'));
    await page.locator('#away-resources .resource').last().focus();assert.ok(await withinViewport('#resource-tooltip'));
    report.layouts.push({width,tooltipsWithinViewport:true});
  }
  assert.deepEqual(errors,[]);
  await writeFile('.tools/pitch-camera-references-v4-qa/hover-interaction-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
