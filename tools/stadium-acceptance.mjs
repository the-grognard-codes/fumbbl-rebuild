// Opt-in acceptance against the existing isolated native v2 server; synthetic identities only.
import assert from 'node:assert/strict';
import { retainedAcceptanceUids } from './acceptance-local-server.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../browser-client/node_modules/vite/dist/node/index.js';
import {chromium} from '../browser-client/node_modules/playwright/index.mjs';
import {resolve} from 'node:path';
import {travelToFocus} from '../browser-client/test/projected-pitch-helper.mjs';
import {observeStadiumMotion} from '../browser-client/test/stadium-motion-helper.mjs';
const output=resolve(process.env.STADIUM_EVIDENCE_DIR ?? '.tools/stadium/native-evidence'); await mkdir(output,{recursive:true});
const identityJson=await readFile('.tools/coach-oriented-match-ui/coach-tokens.json','utf8');
retainedAcceptanceUids(identityJson);
const tokens=JSON.parse(identityJson);
const configText=await readFile(process.env.STADIUM_FIREBASE_CONFIG ?? 'deployment/firebase/hosting/firebase-web-config.js','utf8');
const config=JSON.parse(configText.slice(configText.indexOf('{'),configText.lastIndexOf('}')+1));
const idTokens={};
for(const role of ['home','away','spectator']) {
  const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key='+config.apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:tokens[role].token??tokens[role],returnSecureToken:true})});
  const body=await response.json(); if(!body.idToken)throw Error('Firebase acceptance identity unavailable: '+role);
  idTokens[role]=body.idToken;
}
const server=await createServer({root:resolve('browser-client'),configFile:false,plugins:[{name:'native-stadium-host',configureServer(server){server.middlewares.use((req,res,next)=>{
  if(!/^\/(play|teambuilder)([/?]|$)/.test(req.url))return next();
  res.setHeader('Content-Type','text/html');
  res.end('<style>html,body{margin:0;background:#101c2b;color:#edf5ff}body{font-family:Arial}#app{height:100vh}</style><div id="app"></div><script type="module">import {mountPlay,mountBuilder} from "/src/play-entry.tsx";const options={url:"ws://127.0.0.1:22235/browser/v2",getToken:async()=>window.testToken};(location.pathname==="/teambuilder"?mountBuilder:mountPlay)(document.getElementById("app"),options);</script>');
});
}}],server:{host:'127.0.0.1',port:5173,strictPort:true}});
let browser;
const contexts={},pages={},records=[],cameraMatrix=[],restorations=[],motionObservations=[];
async function assertVenue(page,host){
  const league=host==='human'?'Old World Classic':'Badlands Brawl';
  await page.locator('.pitch-stadium-world').waitFor({state:'attached'});
  assert.equal(await page.locator('.pitch-stadium-world').getAttribute('data-stadium-league'),league);
  assert.equal(await page.locator('.pitch-stadium-world').getAttribute('data-stadium-fallback'),'false');
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('[data-art-fallback]').count(),0);
  for(const [team,profile] of [['home',host==='human'?'old-world-classic':'badlands-brawl'],['away',host==='human'?'badlands-brawl':'old-world-classic']]){
    const fans=page.locator('.pitch-stadium-crowd [data-team="'+team+'"]');
    assert.ok(await fans.count()>0);
    assert.ok(await fans.evaluateAll((fans,profile)=>fans.every(fan=>fan.dataset.stadiumProfile===profile),profile));
  }
}

let authoritative;
const request=async(page,operation,fields={})=>{
 const state=authoritative??await latest(page);const input={version:2,type:'setup',operation,requestId:crypto.randomUUID(),matchId:state.matchId,expectedRevision:state.revision,...fields};
 return authoritative=await page.evaluate(input=>new Promise((resolve,reject)=>{const socket=window.nativeSocket;
 const timer=setTimeout(()=>reject(Error('Native request timeout')),10000);
 const handle=event=>{const item=JSON.parse(event.data);if(item.requestId!==input.requestId)return;socket.removeEventListener('message',handle);clearTimeout(timer);if(item.code!=='ACCEPTED')reject(Error('Native request rejected: '+item.code));else resolve(item.state);};
 socket.addEventListener('message',handle);socket.send(JSON.stringify(input));}),input);
};
const latest=page=>page.evaluate(()=>window.nativeIncoming.filter(item=>item.type==='setupState'&&item.state).at(-1)?.state);
try {
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
  for(const role of ['home','away','spectator']) {
    const context=await browser.newContext({viewport:{width:1920,height:1080}});contexts[role]=context;
    await context.addInitScript(token=>{window.testToken=token;window.nativeIncoming=[];window.nativeOutgoing=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);window.nativeSocket=this;this.addEventListener('message',event=>{const item=JSON.parse(event.data);if(item.type!=='authentication')window.nativeIncoming.push(item);});}send(value){window.nativeOutgoing.push(JSON.parse(value));super.send(value);}};},idTokens[role]);
    pages[role]=await context.newPage();
  }
  const teamIds={};
  for(const [role,roster,position] of [['home','human','Lineman'],['away','orc','Orc Lineman']]) {
    const page=pages[role];await page.goto('http://127.0.0.1:5173/teambuilder');
    await page.getByRole('status').filter({hasText:/^Connected$/}).waitFor();
    await page.getByLabel('Team',{exact:true}).selectOption(roster);
    await page.getByLabel('Team name',{exact:true}).fill('Stadium QA '+roster);
    const positionName=await page.evaluate(roster=>window.nativeIncoming.filter(item=>item.type==='catalog'&&item.rosterId===roster).at(-1).positions.find(item=>item.id===(roster==='human'?'lineman':'orc-lineman')).name,roster);
    for(let i=0;i<11;i++)await page.getByRole('button',{name:'Add '+positionName,exact:true}).click();
    await page.getByRole('button',{name:'Validate Roster',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Server validation passed.'}).waitFor();
    await page.getByRole('button',{name:'Save team',exact:true}).click();
    await page.getByRole('button',{name:'Save changes',exact:true}).waitFor();
    teamIds[roster]=await page.evaluate(()=>window.nativeIncoming.filter(item=>item.type==='savedTeam'&&item.document).at(-1).document.teamId);
  }
  for(const homeRoster of ['human','orc']) {
    const home=homeRoster==='human'?pages.home:pages.away,away=homeRoster==='human'?pages.away:pages.home;
    for(const page of [home,away]){
      await page.goto('http://127.0.0.1:5173/play');
      const reconnect=page.getByRole('button',{name:'Reconnect preparation here',exact:true});
      if(await reconnect.count())await reconnect.click();
      await page.getByRole('status').filter({hasText:/^Connected$/}).waitFor();
    }
    await home.getByRole('combobox',{name:/^Saved team/}).selectOption(teamIds[homeRoster]);
    await away.getByRole('combobox',{name:/^Saved team/}).selectOption(teamIds[homeRoster==='human'?'orc':'human']);
    await home.getByRole('button',{name:'Create game',exact:true}).click();
    await home.getByLabel('Invitation code',{exact:true}).waitFor();
    await home.waitForFunction(()=>document.querySelector('input[autocomplete="off"]')?.value.length===22);
    await away.getByLabel('Invitation code',{exact:true}).fill(await home.getByLabel('Invitation code',{exact:true}).inputValue());
    await away.getByRole('button',{name:'Join game',exact:true}).click();
    const matchId=await home.getByLabel('Match ID',{exact:true}).inputValue();
    await home.getByRole('button',{name:'Start game',exact:true}).waitFor();
    const gamePage=Promise.any([home.waitForEvent('popup'),home.waitForURL(/\/play\/match/).then(()=>home)]);
    await home.getByRole('button',{name:'Start game',exact:true}).click();
    const actualHome=await gamePage;await actualHome.waitForURL(/\/play\/match/);
    await away.goto('http://127.0.0.1:5173/play/match?matchId='+matchId);
    await pages.spectator.goto('http://127.0.0.1:5173/play/match?matchId='+matchId+'&watch=1');
    const rolePages=[actualHome,away,pages.spectator];
    for(const page of rolePages)await page.getByLabel('Live match pitch').waitFor();
    let game=await latest(actualHome);authoritative=game;
    for(let step=0;game.prompt&&step<6;step++){
      const actor=game.prompt.actor==='home'?actualHome:away;
      game=await request(actor,'choice',{promptId:game.prompt.id,optionId:game.prompt.kind==='coin'?'heads':'receive'});
      await actualHome.waitForFunction(revision=>window.nativeIncoming.some(item=>item.state?.revision===revision),game.revision);
    }
    for(let setup=0;game.phase==='SETUP'&&setup<2;setup++){
      const actor=game.actor==='home'?actualHome:away,role=game.actor;
      const players=game.players.filter(player=>player.role===role);
      for(const player of players)if(player.x!==null)game=await request(actor,'place',{playerId:player.id,to:null});
      const positions=[[12,6],[12,7],[12,8],[10,3],[10,5],[10,9],[10,11],[8,4],[8,6],[8,8],[8,10]];
      for(let i=0;i<11;i++)game=await request(actor,'place',{playerId:players[i].id,to:{x:role==='home'?positions[i][0]:25-positions[i][0],y:positions[i][1]}});
      game=await request(actor,'confirm');
      await actualHome.waitForFunction(revision=>window.nativeIncoming.some(item=>item.state?.revision===revision),game.revision);
    }
    assert.equal(game.phase,'READY_FOR_KICKOFF');
    await assertVenue(actualHome,homeRoster);
    const revisionBefore=(await latest(actualHome)).revision;
    const motion=await observeStadiumMotion(actualHome);
    assert.equal((await latest(actualHome)).revision,revisionBefore,'ambient movement cannot advance native match state');
    motionObservations.push({host:homeRoster,nativeRevisionStable:true,...motion});
    for(const page of rolePages)await page.waitForFunction(revision=>window.nativeIncoming.some(item=>item.state?.revision===revision),game.revision);
    for(const [index,page] of rolePages.entries()) {
      await page.getByLabel('Live match pitch').waitFor();
      const state=await latest(page);
      await assertVenue(page,homeRoster);
      assert.equal(state.homeTeamArt.rosterId,homeRoster);
      assert.equal(state.homeTeamArt.league,homeRoster==='human'?'Old World Classic':'Badlands Brawl');
      assert.equal(state.awayTeamArt.rosterId,homeRoster==='human'?'orc':'human');
      records.push({homeRoster,role:['home','away','spectator'][index],matchId,state});
      const debug=page.getByRole('button',{name:'Debug',exact:true});if(await debug.getAttribute('aria-expanded')==='false')await debug.click();
      if(index<2) {
        for(const view of ['30','40','50','top']) {
          if(view==='top')await page.getByRole('button',{name:'Top-down view',exact:true}).click();
          else await page.getByLabel('Perspective angle',{exact:true}).selectOption(view);
          for(const position of ['near','mid','far']) {
            if(position==='mid')await page.getByRole('button',{name:'Midfield',exact:true}).click();
            else {
              await travelToFocus(page,position==='near'?(index===0?1:25):(index===0?25:1));
            }
            assert.equal(await page.locator('[data-cell-x]').count(),390);
            await debug.click();
            await page.screenshot({path:resolve(output,homeRoster+'-'+index+'-'+view+'-'+position+'.png')});
            cameraMatrix.push({host:homeRoster,end:index===0?'home':'away',angle:view==='top'?90:Number(view),position,focus:Number(await page.locator('.live-pitch-scene').getAttribute('data-focus'))});
            await debug.click();
          }
        }
      }
    }
    for(const [index,page] of rolePages.entries()){
      await page.reload();await page.getByLabel('Live match pitch').waitFor();
      await assertVenue(page,homeRoster);
      const state=await latest(page);
      assert.deepEqual(state.homeTeamArt,game.homeTeamArt);assert.deepEqual(state.awayTeamArt,game.awayTeamArt);
      restorations.push({host:homeRoster,role:['home','away','spectator'][index],kind:'reconnect',passed:true});
    }
    const watcher=pages.spectator,debug=watcher.getByRole('button',{name:'Debug',exact:true});
    if(await debug.getAttribute('aria-expanded')==='false')await debug.click();
    await watcher.getByRole('button',{name:'Away coach view',exact:true}).click();
    await assertVenue(watcher,homeRoster);
    assert.equal(await watcher.locator('.live-pitch-scene').getAttribute('data-end'),'away');
    restorations.push({host:homeRoster,role:'spectator',kind:'view-change',passed:true});
    const revisions=await Promise.all(rolePages.map(latest));
    assert.ok(revisions.every(state=>state.revision===revisions[0].revision));
    await writeFile(resolve(output,'native-progress.json'),JSON.stringify({transport:'/browser/v2',records},null,2));
    authoritative=await latest(actualHome);await request(actualHome,'concede');
    await actualHome.goto('http://127.0.0.1:5173/play/result?matchId='+matchId);
    await actualHome.getByRole('button',{name:'First',exact:true}).click();
    await actualHome.waitForFunction(()=>window.nativeIncoming.some(item=>item.type==='matchResult'&&item.event?.revision===0));
    await assertVenue(actualHome,homeRoster);
    await actualHome.getByRole('button',{name:'Last',exact:true}).click();
    await actualHome.waitForFunction(()=>window.nativeIncoming.some(item=>item.type==='matchResult'&&item.event?.kind==='FULL_TIME'));
    await assertVenue(actualHome,homeRoster);
    const replay=await actualHome.evaluate(()=>window.nativeIncoming.filter(item=>item.type==='matchResult'&&item.event?.kind==='FULL_TIME').at(-1).event.state);
    assert.deepEqual(replay.homeTeamArt,game.homeTeamArt);assert.deepEqual(replay.awayTeamArt,game.awayTeamArt);
    restorations.push({host:homeRoster,role:'home',kind:'completed-replay-first-last',passed:true});
    await actualHome.screenshot({path:resolve(output,homeRoster+'-replay.png')});
    if(actualHome!==home)await actualHome.close();
  }
  await writeFile(resolve(output,'native-stadium.json'),JSON.stringify({passed:true,transport:'/browser/v2',records,cameraMatrix,restorations,motionObservations},null,2));
  console.log('PASS: 48 authenticated native Human/Orc camera cases, coaches/spectator reconnects, end change and completed replay retain frozen stadium identity.');
} catch(error) { console.error('Native stadium driver:',error.message.slice(0,600));throw error; } finally {try {await browser?.close();} finally {await server.close();}}
