import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/movement-interaction-projections.json',import.meta.url),'utf8'));
const actorId = fixture.meta.playerId;
const ready = structuredClone(fixture.readyState);
for(const player of ready.players) {
  if(player.id === actorId) {player.x=7;player.y=7;player.skills=['Leap'];}
  else {player.x=null;player.y=null;player.offPitch='reserve';}
}
ready.ball = {x:1,y:14};
if(ready.ballState) ready.ballState = {...ready.ballState,carrierPlayerId:null,moving:true};
delete ready.movementForecast; delete ready.blockPreview;
ready.threats = {version:1,eligiblePlayerIds:[actorId],zonePlayerIds:[]};
const server = await createServer({root:fileURLToPath(new URL('../',import.meta.url)),configFile:false,server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser = await chromium.launch({headless:true});
mkdirSync(fileURLToPath(new URL('./test-output/jump/',new URL('../',import.meta.url))),{recursive:true});
try {
  for(const touch of [false,true]) {
    const context = await browser.newContext({viewport:{width:touch ? 768 : 1440,height:900},hasTouch:touch,isMobile:touch});
    const page = await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/play/match?**',route=>route.fulfill({contentType:'text/html',body:'<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx";mountPlay(document.getElementById("app"),{url:"ws://unused",getToken:async()=>"token"});</script>'}));
    await page.addInitScript(({ready,actorId})=>{
      localStorage.setItem('ffb.match.threat.preferences',JSON.stringify({enabled:false,zoneColors:false,tackle:false,otherSkills:true,prehensileTail:true,divingTackle:true,tentacles:true,shadowing:true}));
      window.WebSocket=class {
        static OPEN=1;readyState=1;sent=[];state=ready;
        constructor(){window.testSocket=this;queueMicrotask(()=>this.onopen?.());}
        emit(value){this.onmessage?.({data:JSON.stringify(value)});}
        send(raw){
          const request=JSON.parse(raw);this.sent.push(request);
          const envelope={version:2,requestId:request.requestId,code:'ACCEPTED'};
          if(request.type==='authenticate') queueMicrotask(()=>this.emit({...envelope,type:'authentication',accountId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}));
          if(['matchTranscript','matchChat'].includes(request.type)) queueMicrotask(()=>this.emit({...envelope,type:'error',code:'TRANSCRIPT_UNAVAILABLE'}));
          if(request.type==='setup') queueMicrotask(()=>this.emit({...envelope,type:'setupState',duplicate:false,state:this.state}));
          if(request.type==='movementRange') queueMicrotask(()=>this.emit({...envelope,type:'movementRange',matchId:ready.matchId,range:{rangeVersion:2,playerId:actorId,from:{x:7,y:7},remaining:8,normalRemaining:6,normal:[{x:8,y:7}],full:[{x:8,y:7}],revision:ready.revision}}));
          if(request.type==='movementPreview') {
            const steps=request.waypoints.map(point=>({x:point.x,y:point.y,dodge:0,rush:0,dodgeModifier:0,reactions:[],checks:point.jump ? [{name:'Jump',target:3,condition:'entry'}] : []}));
            const used=steps.reduce((sum,step)=>sum+(step.checks.length ? 2 : 1),0);
            const end=steps.at(-1)??{x:7,y:7};
            const jump={x:end.x+2,y:end.y,dodge:0,rush:2,dodgeModifier:-1,reactions:['Diving Tackle'],checks:[{name:'Jump',target:4,condition:'entry'},{name:'Diving Tackle',target:null,condition:'possible'}]};
            queueMicrotask(()=>this.emit({...envelope,type:'movementPreview',matchId:ready.matchId,plan:{planVersion:1,kind:request.kind,targetPlayerId:request.targetPlayerId,waypoints:request.waypoints,
              route:{routeVersion:request.waypoints.some(point=>point.jump)?4:3,playerId:actorId,from:{x:7,y:7},remaining:8,steps,revision:ready.revision,actor:ready.callerRole},
              range:{rangeVersion:2,playerId:actorId,from:{x:end.x,y:end.y},remaining:8-used,normalRemaining:Math.max(0,6-used),normal:[],full:[],revision:ready.revision},jumpOptions:used<=6?[jump]:[]}}));
          }
        }
        close(){this.readyState=3;this.onclose?.();}
      };
    },{ready,actorId});
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${ready.matchId}`);
    try {await page.locator(`.live-marker[data-player-id="${actorId}"]`).click({timeout:10000});}
    catch(error) {console.error('Render diagnostics',await page.locator('body').innerText(),errors);throw error;}
    const jump=page.getByRole('button',{name:'Jump',exact:true});
    await page.waitForFunction(()=>!document.querySelector('button[aria-label="Jump"]')?.disabled);
    assert.equal(await jump.evaluate(button=>button.previousElementSibling?.getAttribute('aria-label')),'Move');
    const confirm=page.getByRole('button',{name:'Confirmed!',exact:true});
    await jump.click();assert.equal(await jump.getAttribute('aria-pressed'),'true');assert.equal(await confirm.isDisabled(),true);
    assert.equal(await page.locator('[data-jump-landing="9,7"]').count(),1);
    assert.equal(await page.locator('.live-jump-target').textContent(),'J 4+');
    assert.equal(await page.locator('[data-rush-warning="9,7"]').count(),1);
    await page.screenshot({path:`test-output/jump/${touch?'tablet':'desktop'}-jump-mode.png`});
    const square=await squarePosition(page,9,7);
    await page.locator('.live-pitch-scene').click({position:square});
    await page.waitForFunction(()=>document.querySelector('.live-route-line')?.getAttribute('d')?.includes('Q'));
    assert.equal(await jump.getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('[data-jump-landing]').count(),0);
    await jump.click();await page.keyboard.press('Escape');
    assert.equal(await jump.getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('.live-route-waypoint').count(),1,'Cancel preserves jump waypoint');
    await page.locator('.live-pitch-scene').click({position:square,button:'right'});
    await page.waitForFunction(()=>!document.querySelector('.live-route-waypoint'));
    assert.deepEqual(await page.evaluate(()=>window.testSocket.sent.filter(request=>request.type==='setup'&&request.operation!=='load')),[],'Planning, mode changes and undo never mutate gameplay');
    await jump.click();await page.locator('.live-pitch-scene').click({position:square});
    await page.waitForFunction(()=>!document.querySelector('.commit-action')?.disabled);
    await confirm.click();
    const mutations=await page.evaluate(()=>window.testSocket.sent.filter(request=>request.type==='setup'&&request.operation==='movement'));
    assert.equal(mutations.length,1);assert.equal(mutations[0].waypoints[0].jump,true);
    if(touch) {
      const target=await jump.boundingBox();assert.ok(target.width>=44&&target.height>=44);
    }
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('Jump UI passed: first-square preview, adjacent toggle, threat preference override, Rush warning, cancel, undo, arc, one confirmation and tablet targets.');
} finally {await browser.close();await server.close();}
