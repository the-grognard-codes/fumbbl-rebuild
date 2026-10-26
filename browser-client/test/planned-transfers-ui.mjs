import { setCameraMode } from './camera-controls.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { squarePosition } from './projected-pitch-helper.mjs';
import { installInitialMovementPreview } from './initial-movement-preview-helper.mjs';
import { PitchProjection } from '../src/pitch-projection.ts';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/planned-transfers.json', import.meta.url), 'utf8'));
const evidence = process.env.TRANSFER_EVIDENCE;
if (evidence) mkdirSync(evidence, {recursive:true});
const server = await createServer({root:fileURLToPath(new URL('../',import.meta.url)),configFile:false,
  server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined)});
const select = (page,id) => page.locator(`.live-marker[data-player-id="${id}"]`).press('Enter');
const mutations = page => page.evaluate(() => window.testSocket.sent.filter(request => request.type === 'setup' && request.operation !== 'load'));
const square = async (page,x,y,button='left') => {
  const point=await squarePosition(page,x,y);
  const bounds=await page.locator('.live-pitch-scene').boundingBox();
  await page.mouse.click(bounds.x+point.x,bounds.y+point.y,{button});
};

async function open(journey, mobile=false) {
  const page = await browser.newPage({viewport:mobile ? {width:412,height:915} : {width:1440,height:900},hasTouch:mobile});
  page.setDefaultTimeout(10000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/play/match?**',route=>route.fulfill({contentType:'text/html',body:
    '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {url:"ws://unused",getToken:async()=>"token"});</script>'}));
  await page.addInitScript(installInitialMovementPreview);
  await page.addInitScript(journey=>{
    window.WebSocket=class {
      static OPEN=1;
      readyState=1;
      state=journey.ready;
      sent=[];
      constructor(){window.testSocket=this;queueMicrotask(()=>this.onopen?.());}
      emit(value){this.onmessage?.({data:JSON.stringify(value)});}
      send(raw){
        const request=JSON.parse(raw);this.sent.push(request);
        if(window.replyToInitialMovementPreview(request,this.state,value=>this.emit(value)))return;
        let response;
        if(request.type==='authenticate')response={version:2,type:'authentication',requestId:request.requestId,code:'ACCEPTED',accountId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'};
        if(['matchTranscript','matchChat','movementRange'].includes(request.type))response={version:2,type:'error',requestId:request.requestId,code:'TRANSCRIPT_UNAVAILABLE'};
        if(request.type==='movementPreview'){
          if(window.rejectNextTransfer && ['pass','handOff'].includes(request.kind)){
            window.rejectNextTransfer=false;
            response={version:2,type:'error',requestId:request.requestId,code:'INVALID_TARGET'};
          }else{
            const native=request.targetPlayerId===journey.alternateId ? journey.alternatePlan : journey.plan;
            const template=native.route.steps[0]??{dodge:0,rush:0,dodgeModifier:0,reactions:[],checks:[]};
            const steps=request.waypoints.map(point=>({...template,x:point.x,y:point.y}));
            response={version:2,type:'movementPreview',requestId:request.requestId,code:'ACCEPTED',matchId:this.state.matchId,
              plan:{planVersion:1,kind:request.kind,targetPlayerId:request.targetPlayerId,waypoints:request.waypoints,
                route:{...native.route,steps,revision:this.state.revision}}};
          }
        }
        if(request.type==='setup'){
          if(request.operation==='movement')this.state=journey.accepted;
          response={version:2,type:'setupState',requestId:request.requestId,code:'ACCEPTED',duplicate:false,state:this.state};
        }
        if(response)queueMicrotask(()=>this.emit(response));
      }
      close(){this.readyState=3;this.onclose?.();}
    };
  },journey);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${journey.ready.matchId}`);
  await page.getByLabel('Live match pitch').waitFor();
  return {page,errors,confirm:page.getByRole('button',{name:'Confirmed!',exact:true})};
}

try {
  for(const journey of journeys){
    console.log(`Checking ${journey.kind}: ${journey.loose?'pickup':journey.moving?'moving':'stationary'}`);
    const {page,errors,confirm}=await open(journey);
    await select(page,journey.sourceId);
    if(journey.moving){await square(page,8,7);await page.locator('.live-route-line').waitFor({state:'attached'});}
    await select(page,journey.targetId);
    const actionName=journey.kind==='pass'?'Pass':'Hand Off';
    await page.waitForFunction(name=>document.querySelector(`button[aria-label="${name}"]`)?.getAttribute('aria-pressed')==='true',actionName);
    await page.locator('.live-target-line').waitFor({state:'attached'});
    assert.equal(await page.locator('.live-passing-square').count(),0,'Implied plans do not show pass difficulty');
    assert.deepEqual(await mutations(page),[],'Planning never declares an activation');
    const path=await page.locator('.live-target-line').getAttribute('d');
    const cameraOptions=await page.locator('.live-pitch-scene').evaluate(element=>({
      width:parseFloat(element.style.width),height:parseFloat(element.style.height),
      focus:Number(element.dataset.focus),transverseFocus:Number(element.dataset.transverseFocus),
      end:element.dataset.end,mode:element.dataset.projection,zoom:Number(element.dataset.zoom),
      perspectiveElevation:Number(element.dataset.elevation)}));
    const endpoint=journey.plan.route.steps.at(-1)??journey.plan.route.from;
    const origin=new PitchProjection(cameraOptions).project({x:endpoint.x+.5,y:endpoint.y+.5});
    assert.ok(path.startsWith(`M${origin.x},${origin.y}`),'The transfer line starts at the planned endpoint');
    if(evidence)await page.screenshot({path:`${evidence}/${journey.kind}-${journey.loose?'pickup':journey.moving?'moving':'stationary'}.png`});
    await select(page,journey.alternateId);
    const alternateName=journey.alternatePlan.kind==='pass'?'Pass':'Hand Off';
    await page.waitForFunction(name=>document.querySelector(`button[aria-label="${name}"]`)?.getAttribute('aria-pressed')==='true',alternateName);
    await page.waitForFunction(previous=>document.querySelector('.live-target-line')?.getAttribute('d')
      && document.querySelector('.live-target-line').getAttribute('d')!==previous,path);
    assert.notEqual(await page.locator('.live-target-line').getAttribute('d'),path,'Replacing the recipient redraws the transfer');
    assert.equal(await page.locator('.live-route-waypoint').count(),journey.moving?1:0);
    // A native rejection restores the previous recipient, including a zero-step plan.
    await page.evaluate(()=>{window.rejectNextTransfer=true;});
    await select(page,journey.targetId);
    await page.waitForFunction(id=>window.testSocket.sent.filter(request=>request.type==='movementPreview').at(-1)?.targetPlayerId===id,journey.alternateId);
    await page.waitForFunction(name=>document.querySelector(`button[aria-label="${name}"]`)?.getAttribute('aria-pressed')==='true',alternateName);
    await select(page,journey.targetId);
    await page.waitForFunction(()=>!document.querySelector('.commit-action')?.disabled);
    await confirm.click();
    const sent=await mutations(page);
    assert.equal(sent.length,1);
    assert.equal(sent[0].operation,'movement');
    assert.equal(sent[0].kind,journey.kind);
    assert.equal(sent[0].targetPlayerId,journey.targetId);
    assert.deepEqual(sent[0].waypoints,journey.plan.waypoints);
    assert.deepEqual(errors,[]);
    await page.close();
  }

  const journey=journeys.find(journey=>journey.moving&&!journey.loose&&journey.kind==='handOff');
  const unavailable=structuredClone(journey);
  unavailable.ready.actions=unavailable.ready.actions.filter(action=>action.kind!=='declareHandOff');
  const denied=await open(unavailable);
  await select(denied.page,journey.sourceId);
  await square(denied.page,8,7);
  await denied.page.locator('.live-route-line').waitFor({state:'attached'});
  await select(denied.page,journey.targetId);
  assert.equal(await denied.page.locator('.live-target-line').count(),0);
  assert.equal(await denied.page.locator('.live-marker.selected').getAttribute('data-player-id'),journey.sourceId);
  assert.equal(await denied.page.locator('.live-route-waypoint').count(),1);
  assert.deepEqual(await mutations(denied.page),[],'An unavailable handoff cannot become a pass or player switch');
  assert.deepEqual(denied.errors,[]);
  await denied.page.close();
  for(const mobile of [false,true]){
    console.log(`Checking route editing: ${mobile?'mobile':'desktop'}`);
    const {page,errors}=await open(journey,mobile);
    if(mobile){
      await page.getByRole('button',{name:'Debug',exact:true}).click();
      await setCameraMode(page, 'top-down');
      await page.getByRole('button',{name:'Debug',exact:true}).click();
    }
    await select(page,journey.sourceId);
    await square(page,8,7);
    await page.locator('.live-route-line').waitFor({state:'attached'});
    await select(page,journey.targetId);
    await page.locator('.live-target-line').waitFor({state:'attached'});
    await square(page,8,6);
    if(evidence)await page.screenshot({path:`${evidence}/editing-${mobile?'mobile':'desktop'}.png`});
    assert.equal(await page.locator('.live-target-line').count(),0);
    await page.waitForFunction(()=>document.querySelectorAll('.live-route-waypoint').length===2);
    await select(page,journey.targetId);
    await page.locator('.live-target-line').waitFor({state:'attached'});
    // Undo removes the transfer before it touches either movement waypoint.
    await square(page,8,6,'right');
    assert.equal(await page.locator('.live-target-line').count(),0);
    assert.equal(await page.locator('.live-route-waypoint').count(),2);
    await square(page,8,6,'right');
    assert.equal(await page.locator('.live-route-waypoint').count(),1);
    await page.locator('.live-route-line').waitFor({state:'attached'});
    await select(page,journey.targetId);
    await page.locator('.live-target-line').waitFor({state:'attached'});
    await page.locator('.live-pitch-viewport').press('Escape');
    assert.equal(await page.locator('.live-marker.selected').count(),0);
    assert.equal(await page.locator('.live-route-waypoint').count(),0);
    assert.deepEqual(await mutations(page),[]);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('Planned transfer journeys passed: stationary/moving/pickup pass and handoff, recipient replacement/rejection, one confirmation, desktop/mobile editing and cancellation.');
}finally{await browser.close();await server.close();}
