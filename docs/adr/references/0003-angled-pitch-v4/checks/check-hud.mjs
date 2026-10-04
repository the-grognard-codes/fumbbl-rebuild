import { mkdir as prepareReferenceOutput } from 'node:fs/promises';
await prepareReferenceOutput('.tools/pitch-camera-references-v4-qa', { recursive: true });
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(path.resolve('browser-client/package.json'));
const {chromium} = require('playwright');
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1672,height:1150}});
const errors=[], failedRequests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',r=>failedRequests.push({url:r.url(),failure:r.failure()}));
const root=path.resolve('docs/adr/references/0003-angled-pitch-v4');
const output=path.resolve('.tools/pitch-camera-references-v4-qa');
const ready=()=>page.evaluate(()=>window.pitchReferenceReady);
const snapshot=()=>page.evaluate(()=>({
  fixture:JSON.stringify(window.pitchReference.scene),
  camera:window.pitchReference.export().camera,
  card:document.getElementById('player-card').textContent,
  events:document.getElementById('event-messages').textContent,
  chat:document.getElementById('chat-messages').textContent
}));
const report={views:[],layouts:[],errors,failedRequests};
try {
  await page.goto(pathToFileURL(path.join(root,'viewer.html')).href);await ready();
  assert.equal(await page.evaluate(()=>document.fonts.check('700 20px MUTP')),true);
  const rerollData='data:image/png;base64,'+(await readFile(path.join(root,'art/reroll-v1.png'))).toString('base64');
  const alpha=await page.evaluate(async source=>{
    const img=new Image();img.src=source;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
    const context=canvas.getContext('2d');context.drawImage(img,0,0);
    const data=context.getImageData(0,0,img.width,img.height).data;
    let clear=0,opaque=0;
    for(let i=3;i<data.length;i+=4){if(data[i]===0)clear++;if(data[i]===255)opaque++;}
    return{dimensions:[img.width,img.height],clear,opaque,cornerAlpha:[data[3],data[(img.width-1)*4+3],data[(img.height-1)*img.width*4+3],data[data.length-1]]};
  },rerollData);
  assert.ok(alpha.clear>0);assert.ok(alpha.opaque>0);assert.deepEqual(alpha.cornerAlpha,[0,0,0,0]);report.reroll=alpha;
  const original=await snapshot();
  report.turnTracks=[];
  for (const period of [1,2,3]) {
    await page.selectOption('#turn-period',String(period));
    for (const [team,currentWithinPeriod] of [['home',4],['away',3]]) {
      const start=(period-1)*8+1;
      const track=await page.locator(`#${team}-turns`).evaluate(n=>({
        turns:[...n.children].map(n=>Number(n.textContent)),
        current:Number(n.querySelector('[aria-current=step]').textContent),
        currentColor:getComputedStyle(n.querySelector('[aria-current=step]')).color,
        past:[...n.querySelectorAll('.past')].map(n=>({turn:Number(n.textContent),opacity:Number(getComputedStyle(n).opacity)})),
        bounds:n.getBoundingClientRect().toJSON(),weather:document.getElementById('weather-slot').getBoundingClientRect().toJSON()
      }));
      assert.deepEqual(track.turns,Array.from({length:8},(_,i)=>start+i));
      assert.equal(track.current,start+currentWithinPeriod-1);
      assert.equal(track.currentColor,'rgb(255, 225, 123)');
      assert.equal(track.past.length,currentWithinPeriod-1);
      assert.ok(track.past.every(p=>p.opacity>0&&p.opacity<=0.25));
      assert.ok(team==='home'?track.bounds.right<track.weather.left:track.bounds.left>track.weather.right);
      report.turnTracks.push({period,team,turns:track.turns,current:track.current,pastFaded:true,weatherSpaceClear:true});
    }
  }
  await page.selectOption('#turn-period','1');
  for(const view of ['perspective-40-home','perspective-40-away','top-down-home','top-down-away']) {
    await page.selectOption('#view',view);await ready();
    const before=await snapshot();assert.equal(before.fixture,original.fixture);
    assert.equal(await page.locator('.resource').count(),7);
    assert.equal(await page.locator('.resource img').count(),2);
    assert.equal(await page.locator('#player-card').isVisible(),false);
    await page.locator('#occupants [data-player-id="home-3"]').focus();
    assert.equal(await page.locator('#player-card').isVisible(),true);
    assert.match(await page.locator('#player-card').innerText(),/SKILLS\s+Block, Tackle/);
    assert.match(await page.locator('#player-card').innerText(),/STATUS\s+Standing · Ready/);
    assert.match(await page.locator('[title^="Status also"]').getAttribute('title'),/Distracted.*Prone.*Stunned.*Seriously injured.*Dead.*Sent off/);
    await page.locator('#stage').focus();
    assert.equal(await page.locator('#player-card').isVisible(),false);
    const styles=await page.evaluate(()=>['home-resources','away-resources','home-clock','away-clock','match-chat','event-log'].map(id=>({id,background:getComputedStyle(document.getElementById(id)).backgroundColor,opacity:getComputedStyle(document.getElementById(id)).opacity})));
    assert.ok(styles.every(s=>s.background==='rgba(9, 23, 38, 0.3)'&&s.opacity==='1'));
    await page.locator('#toggle-other').click();
    assert.equal(await page.locator('#toggle-other').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#other-actions').isVisible(),true);
    const buttons=await page.evaluate(()=>({primary:document.querySelector('#primary-actions button').getBoundingClientRect().toJSON(),other:document.querySelector('#other-actions button').getBoundingClientRect().toJSON()}));
    assert.equal(buttons.primary.height,buttons.other.height);assert.ok(Math.abs(buttons.primary.width-buttons.other.width)<0.1);
    assert.ok(buttons.other.bottom<buttons.primary.top);
    await page.locator('#other-actions [data-action="Pass"]').click();
    assert.match(await page.locator('#event-messages').innerText(),/Pass selected for Alden/);
    assert.equal(await page.locator('#confirm-action').isEnabled(),true);
    await page.locator('#confirm-action').focus();await page.keyboard.press('Enter');
    assert.match(await page.locator('#event-messages li').last().innerText(),/^Pass confirmed for Alden\.$/);
    assert.equal(await page.locator('#confirm-action').isDisabled(),true);
    assert.equal(await page.locator('#chat-form').isVisible(),false);
    const confirmedCount=await page.locator('#event-messages li').count();
    await page.locator('#confirm-action').evaluate(n=>n.click());
    assert.equal(await page.locator('#event-messages li').count(),confirmedCount);
    await page.locator('#primary-actions [data-action="Blitz"]').click();
    assert.equal(await page.locator('#confirm-action').isEnabled(),true);
    await page.locator('#confirm-action').click();
    assert.match(await page.locator('#event-messages li').last().innerText(),/^Blitz confirmed for Alden\.$/);
    assert.equal(await page.locator('#other-actions').isVisible(),false);
    assert.equal(await page.locator('#toggle-other').getAttribute('aria-expanded'),'false');
    await page.locator('#toggle-other').click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#other-actions').isVisible(),false);
    await page.locator('#toggle-other').click();await page.locator('#stage').click({position:{x:836,y:445}});
    assert.equal(await page.locator('#other-actions').isVisible(),false);
    await page.locator('#stage').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#chat-form').isVisible(),true);
    assert.equal(await page.locator('#chat-entry').evaluate(n=>n===document.activeElement),true);
    const cameraBeforeInput=JSON.stringify((await snapshot()).camera);
    await page.locator('#chat-entry').fill('Draft message');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowDown');
    assert.equal(JSON.stringify((await snapshot()).camera),cameraBeforeInput);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#chat-form').isVisible(),false);
    assert.equal(await page.locator('#chat-entry').inputValue(),'Draft message');
    await page.keyboard.press('Enter');
    await page.locator('#chat-entry').fill('<b>Good game!</b>');await page.keyboard.press('Enter');
    assert.equal(await page.locator('#chat-form').isVisible(),false);
    assert.equal(await page.locator('#chat-entry').inputValue(),'');
    assert.match(await page.locator('#chat-messages li').last().innerText(),/<b>Good game!<\/b>/);
    assert.equal(await page.locator('#chat-messages b').count(),0);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('match-chat')).backgroundColor),'rgba(9, 23, 38, 0.3)');
    const count=await page.locator('#chat-messages li').count();
    await page.keyboard.press('Enter');await page.keyboard.press('Enter');assert.equal(await page.locator('#chat-messages li').count(),count);
    const after=await snapshot();assert.equal(after.fixture,before.fixture);assert.deepEqual(after.camera,before.camera);
    const savedHud={card:after.card,events:after.events,chat:after.chat};
    await page.locator('#toggle-tactical').click();await ready();
    const switched=await snapshot();assert.equal(switched.card,savedHud.card);assert.equal(switched.events,savedHud.events);assert.equal(switched.chat,savedHud.chat);
    assert.equal(switched.camera.focus,before.camera.focus);
    report.views.push({view,supportingPanelBackgroundOpacity:0.3,actions:'open, choose, confirm once, rearm, Escape and outside click passed',chat:'Enter, Escape, draft, text safety and camera isolation passed',fixture:'unchanged'});
  }
  await page.goto(pathToFileURL(path.join(root,'viewer.html')).href+'?capture=1');await ready();
  await page.locator('#stage').screenshot({path:path.join(output,'hud-approved-default.png')});
  await page.locator('#toggle-other').click();
  await page.locator('#stage').focus();await page.keyboard.press('Enter');
  await page.locator('#stage').screenshot({path:path.join(output,'hud-actions-chat.png')});
  for(const width of [1920,1280,390]) {
    await page.setViewportSize({width,height:1080});
    await page.goto(pathToFileURL(path.join(root,'viewer.html')).href);await ready();
    for(const view of ['perspective-40-home','top-down-away']) {
      await page.selectOption('#view',view);await ready();
      const geometry=await page.evaluate(()=>{
        const ids=['home-resources','away-resources','home-clock','away-clock','home-turns','away-turns','weather-slot','match-chat','primary-actions','confirm-action','event-log'];
        const frame=document.getElementById('camera-frame').getBoundingClientRect();
        return{overflow:document.documentElement.scrollWidth>innerWidth,boxes:ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,withinFrame:r.left>=frame.left-0.01&&r.right<=frame.right+0.01&&r.top>=frame.top-0.01&&r.bottom<=frame.bottom+0.01};})};
      });
      assert.equal(geometry.overflow,false);assert.ok(geometry.boxes.every(b=>b.withinFrame));
      report.layouts.push({width,view,...geometry});
    }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);
  await writeFile(path.join(output,'hud-interaction-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
