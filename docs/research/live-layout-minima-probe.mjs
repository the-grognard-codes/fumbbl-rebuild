import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '../../browser-client/node_modules/playwright/index.mjs';
import { createServer } from '../../browser-client/test/browser-test-server.mjs';

// Research instrument, not product code or a claim of complete-match usability.
const output = fileURLToPath(new URL('../../.tools/hardware-research/live-minima/', import.meta.url));
await mkdir(output, { recursive: true });
const base = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const players = ['home', 'away'].flatMap((role, team) => Array.from({ length: 16 }, (_, i) => ({
  ...base.players[team], id: `${role}-${i}`, role, number: i + 1, slot: i + 1,
  name: `${role === 'home' ? 'Human' : 'Orc'} Veteran ${i + 1}`, state: 'is standing',
  x: i < 11 ? (team ? 14 : 11) + (i % 2) : null, y: i < 11 ? i + 2 : null,
  offPitch: i < 11 ? 'pitch' : ['reserve','knockedOut','casualty','sentOff','other'][i - 11],
  art: { rosterId: team ? 'orc' : 'human', positionId: team ? 'orc-blitzer' : 'blitzer' },
})));
const state = { ...base, matchId: 'layout-research', revision: 1, phase: 'PLAY', actor: 'home', callerRole: 'home',
  prompt: null, reaction: null, activePlayerId: null, players,
  homeTeamName: 'Ironbank Rovers of the Underground Championship', awayTeamName: 'Cinderclaw Veterans of the Northern Championship',
  homeTurn: 4, awayTurn: 3, homeRerolls: 3, awayRerolls: 3,
  homeResources: { apothecaries: 1, assistantCoaches: 2, cheerleaders: 2, bribes: 2 },
  awayResources: { apothecaries: 1, assistantCoaches: 2, cheerleaders: 2, bribes: 2 },
  clock: { activeRole: 'home', turnElapsedMs: 28000, homeReserveMs: 465000, awayReserveMs: 370000 },
  actions: [{ id:'select', kind:'select', label:'Move Human Veteran 1', actor:'home', sourcePlayerId:'home-0', target:null },
    { id:'end', kind:'endTurn', label:'End Turn', actor:'home', sourcePlayerId:null, target:null }],
};
if (process.env.LAYOUT_RESOURCES === 'typical') { state.homeResources.bribes=0; state.awayResources.bribes=0; }
const sizes = JSON.parse(process.env.LAYOUT_SIZES || '[[1920,1080],[1280,720],[1024,768],[863,360],[734,343],[640,330],[375,300]]');
const roles = (process.env.LAYOUT_ROLES || 'home,away,spectator').split(',');
const phases = (process.env.LAYOUT_PHASES || 'play,setup-home,setup-away').split(',');
const panelStates = process.env.LAYOUT_PANEL_MATRIX === '1'
  ? ['condensed','compact','expanded'].flatMap(home=>['condensed','compact','expanded'].flatMap(away=>['minimized','default','maximized'].flatMap(chat=>['minimized','default','maximized'].map(log=>[home,away,chat,log].join(':')))))
  : (process.env.LAYOUT_PANELS || 'default,expanded,maximized').split(',');
const engineName = process.env.LAYOUT_ENGINE || 'chromium';
const label = process.env.LAYOUT_RUN || 'initial';
const harness = (await readFile(new URL('../../browser-client/test/coach-hud-harness.tsx',import.meta.url),'utf8'))
  .replace('<GameView hosted', '<GameView key={view.revision} hosted');
const server = await createServer({ root:fileURLToPath(new URL('../../browser-client/',import.meta.url)), configFile:false,
  plugins:[{name:'research-fixture-remount',load(id){if(id.endsWith('/test/coach-hud-harness.tsx'))return harness;}}],
  cacheDir:`${output}/vite-${label}`, server:{host:'127.0.0.1',port:0} });
await server.listen();
const browser = await ({chromium,firefox,webkit})[engineName].launch({ headless:true,
  ...(engineName === 'chromium' && process.platform === 'win32' ? {executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'} : {}) });
const results = [], interactions = [], pageErrors = [];
const context = await browser.newContext({ viewport:{width:1920,height:1080}, hasTouch:process.env.LAYOUT_TOUCH === '1' });
await context.addInitScript(state => {window.hudState=state;window.hudIntents=[];window.hudMessages=[];},state);
await context.route('**/layout-research',route=>route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>'}));
const page = await context.newPage();
page.on('pageerror',e=>pageErrors.push(e.message));
await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/layout-research`);
await page.locator('.coach-match').waitFor(); await page.evaluate(()=>document.fonts.ready);
let revision=1;
const settle = () => page.evaluate(() => new Promise(resolve => {
  let prior='', same=0, n=0;
  function frame(){const next=JSON.stringify([...document.querySelectorAll('.live-dugout,.match-history>section,.drive-phase-tracker,.coach-score-center')].map(e=>e.getBoundingClientRect().toJSON()));same=next===prior?same+1:0;prior=next;if(same>=3||++n>=30)resolve();else requestAnimationFrame(frame);} requestAnimationFrame(frame);
}));
async function panels(target){
  // Programmatic UI clicks select the specimen state even when a collision prevents a pointer click.
  // They are not evidence of user reachability; geometry and targeted trial clicks are separate.
  await page.evaluate(async target=>{
    const frame=()=>new Promise(r=>requestAnimationFrame(r));
    const custom=target.includes(':')?target.split(':'):null;
    for(const role of ['home','away']) for(let tries=0;tries<4;tries++){
      const p=document.querySelector(`.live-dugout.${role}`), modes=['condensed','compact','expanded'];
      const want=custom?custom[role==='home'?0:1]:target==='default'?'compact':target==='minimized'?'condensed':'expanded';
      const current=modes.find(x=>p.classList.contains(x));if(current===want)break;
      p.querySelectorAll('.live-dugout-controls button')[modes.indexOf(current)<modes.indexOf(want)?0:current==='expanded'?0:1].click();await frame();
    }
    for(const subject of ['chat','log'])for(let tries=0;tries<4;tries++){
      const p=document.querySelector(`.match-history-${subject}`),modes=['minimized','default','maximized'];
      const want=custom?custom[subject==='chat'?2:3]:target==='maximized'?'maximized':target==='minimized'?'minimized':'default';
      const current=p.dataset.windowSize;if(current===want)break;
      p.querySelectorAll('.match-window-controls button')[modes.indexOf(current)<modes.indexOf(want)?0:current==='maximized'?0:1].click();await frame();
    }
    document.activeElement?.blur();
  },target);await settle();
}
async function measure(){return page.evaluate(()=>{
  const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
  const selectors=['.coach-score-center','.live-resources.home','.live-resources.away','.live-chess-clock.home','.live-chess-clock.away','.clock-end-turn','.live-turn-track.home','.live-turn-track.away','.coach-weather-slot','.drive-phase-tracker','.match-menu-triggers','.match-debug-toggle','.match-history-chat','.match-history-log','.live-dugout.home','.live-dugout.away','.confirmation-row','.command-preview','.match-command-bar','.match-game-step'];
  const nodes=selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(visible).map(e=>({e,selector,rect:e.getBoundingClientRect().toJSON()})));
  for(const e of document.querySelectorAll('.live-resource'))if(visible(e))nodes.push({e,selector:`.live-resource:${e.getAttribute('aria-label')}:${e.closest('.live-resources').className}`,rect:e.getBoundingClientRect().toJSON()});
  const boxes=nodes.map(({selector,rect})=>({selector,rect}));
  const failures=[];
  for(const a of boxes){const r=a.rect;if(r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)failures.push(`viewport:${a.selector}`);}
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    if(nodes[i].e.contains(nodes[j].e)||nodes[j].e.contains(nodes[i].e))continue;
    const a=boxes[i],b=boxes[j],x=Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left),y=Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top);
    if(x>1&&y>1)failures.push(`overlap:${a.selector}|${b.selector}`);
  }
  for(const p of document.querySelectorAll('.match-history>section,.live-dugout,.live-resources')){
    const r=p.getBoundingClientRect();
    for(const b of p.querySelectorAll('header button,.live-resource'))if(visible(b)){
      const t=b.getBoundingClientRect();if(t.left<r.left-1||t.right>r.right+1||t.top<r.top-1||t.bottom>r.bottom+1)failures.push(`control-outside-panel:${p.className}:${b.getAttribute('aria-label')}`);
    }
  }
  const nameMetrics=[...document.querySelectorAll('.live-team-nameplate strong')].map(n=>({text:n.textContent,clientWidth:n.clientWidth,clientHeight:n.clientHeight,scrollWidth:n.scrollWidth,scrollHeight:n.scrollHeight,bounds:n.getBoundingClientRect().toJSON(),parentBounds:n.parentElement.getBoundingClientRect().toJSON(),fontSize:getComputedStyle(n).fontSize}));
  // Firefox glyph ink can exceed the strong element's line box while remaining inside
  // the padded nameplate. Measure real plate clipping, not harmless line-box overflow.
  for(const n of nameMetrics)if(n.scrollWidth>n.clientWidth+1||n.bounds.top<n.parentBounds.top-1||n.bounds.bottom+Math.max(0,n.scrollHeight-n.clientHeight)>n.parentBounds.bottom+1)failures.push('team-name-overflow');
  return {failures:[...new Set(failures)],boxes,nameMetrics,viewport:{width:innerWidth,height:innerHeight},bodyOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
});}
async function interactiveSpecimens(width,height){
 for(const role of ['home','spectator']){
  const record={width,height,role,checks:[]};interactions.push(record);
  const check=async(name,run)=>{try{const detail=await run();record.checks.push({name,status:'pass',detail});}catch(error){record.checks.push({name,status:'fail',error:error.message.split('\n')[0]});}};
  const publish=async changes=>{const next={...state,callerRole:role,revision:++revision,...changes};await page.evaluate(next=>window.publishHud(next),next);await page.waitForFunction(rev=>Number(document.querySelector('.coach-match')?.dataset.presentedRevision)===rev,revision);await settle();};
  await publish({});await panels('default');
  await check('menu-six-tabs-and-close',async()=>{
   await page.getByRole('button',{name:'Game Menu',exact:true}).click({timeout:1500});
   const menu=page.getByRole('dialog',{name:'Game Menu',exact:true});
   for(const tab of ['Game Options','Game Settings','Skills & Traits','Interface','Key Bindings','Game Log'])await menu.getByRole('tab',{name:tab,exact:true}).click({timeout:1500});
   const bounds=await menu.boundingBox();if(bounds.x<0||bounds.y<0||bounds.x+bounds.width>width+1||bounds.y+bounds.height>height+1)throw Error('Menu outside viewport');
   await menu.getByRole('button',{name:'Close Game Menu',exact:true}).click({timeout:1500});return {bounds,internalScrollingAllowed:true};
  });
  await publish({});await panels('default');
  await check('overhead-camera-and-player-inspection',async()=>{
   for(let n=0;n<4;n++){const button=page.locator('.camera-angle');if((await button.getAttribute('aria-label')).includes('Overhead'))break;await button.click({timeout:1500});}
   if(!(await page.locator('.camera-angle').getAttribute('aria-label')).includes('Overhead'))throw Error('Could not select overhead');
   await page.locator('.live-marker[data-player-id="home-0"]').focus();
   const card=page.locator('.live-player-hover');await card.waitFor({timeout:1500});
   const b=await card.boundingBox();if(b.x<0||b.y<0||b.x+b.width>width+1||b.y+b.height>height+1)throw Error('Player card outside viewport');
   return {bounds:b,focusInspection:true};
  });
  await publish({});await panels('default');
  if(role==='home')await check('end-turn-preview-and-confirm-intent',async()=>{
   await page.getByRole('button',{name:'End Turn',exact:true}).click({timeout:1500});await settle();
   const geometry=await measure();
   await page.getByRole('button',{name:'Confirmed!',exact:true}).click({timeout:1500});
   const intent=await page.evaluate(()=>window.hudIntents.at(-1));if(intent?.fields?.actionId!=='end')throw Error('Wrong confirmation intent');return {geometryFailures:geometry.failures,intent};
  });
  if(role==='home'){
   await publish({phase:'PRE_MATCH',actions:[],prompt:{id:'coin',actor:'home',kind:'coin',options:['heads','tails']}});
   await check('coin-decision-controls',async()=>{
    const dialog=page.getByRole('dialog',{name:'Match decision',exact:true});await dialog.waitFor({timeout:1500});
    const b=await dialog.boundingBox();if(b.x<0||b.y<0||b.x+b.width>width+1||b.y+b.height>height+1)throw Error('Decision outside viewport');
    await dialog.getByRole('button',{name:'Tails',exact:true}).click({trial:true,timeout:1500});await dialog.getByRole('button',{name:'Heads',exact:true}).click({timeout:1500});
    return {bounds:b,intent:await page.evaluate(()=>window.hudIntents.at(-1)),intentionalOverlay:true};
   });
  }
 }
}
try{
 for(const [width,height] of sizes){
  await page.setViewportSize({width,height});
  for(const role of roles)for(const phase of phases){
   const playing=phase==='play', receivingRole=phase.endsWith('away')?'away':'home', actor=playing?(role==='away'?'away':'home'):(receivingRole==='home'?'away':'home');
   const next={...state,revision:++revision,callerRole:role,actor,phase:playing?'PLAY':'SETUP',turnMode:playing?'REGULAR':'SETUP',
    actions:playing?state.actions.map(a=>({...a,actor,sourcePlayerId:a.sourcePlayerId?`${actor}-0`:null})):[],
    driveTracker:playing?null:{version:1,receivingRole,phase:'KICKING_SETUP',secretWeapons:true,knockouts:true,event:null,eventComplete:false}};
   await page.evaluate(next=>window.publishHud(next),next);
   await page.waitForFunction(rev=>{const e=document.querySelector('.coach-match');return Number(e?.dataset.revision)===rev&&Number(e?.dataset.presentedRevision)===rev&&e?.dataset.playbackActive==='false';},revision);
   await settle();
   for(const panelState of panelStates){
    await panels(panelState);
    const result={width,height,role,phase,panelState,...await measure()};results.push(result);
    if(process.env.LAYOUT_SCREENSHOTS==='1'&&role==='home'&&phase==='setup-away'&&panelState==='expanded')await page.screenshot({path:`${output}/${label}-${width}x${height}.png`});
   }
  }
  const subset=results.filter(r=>r.width===width&&r.height===height);
  console.log(`${width}x${height}: ${subset.filter(r=>!r.failures.length).length}/${subset.length} fit; ${[...new Set(subset.flatMap(r=>r.failures))].slice(0,5).join('; ')}`);
  if(process.env.LAYOUT_INTERACTIONS==='1'){await interactiveSpecimens(width,height);console.log('interaction failures:',JSON.stringify(interactions.filter(r=>r.width===width&&r.height===height).flatMap(r=>r.checks.filter(c=>c.status==='fail').map(c=>({role:r.role,...c})))));}
  await writeFile(`${output}/${label}.json`,JSON.stringify({engine:engineName,version:browser.version(),resourceProfile:process.env.LAYOUT_RESOURCES||'rich',scope:'Synthetic 22 on-pitch + 10 off-pitch players, long team names, viewport geometry; not complete-match or usability acceptance',pageErrors,results,interactions},null,2));
 }
}finally{await browser.close();await server.close();}
