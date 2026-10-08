import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '../browser-client/node_modules/playwright/index.mjs';
import {createServer} from '../browser-client/node_modules/vite/dist/node/index.js';
import {travelToFocus} from '../browser-client/test/projected-pitch-helper.mjs';
const server=await createServer({root:fileURLToPath(new URL('../browser-client/',import.meta.url)),configFile:false,server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const initial=JSON.parse(await readFile('browser-client/test/fixtures/m5a-blitz-projections.json','utf8'))[0].actor;
const output=process.argv[2]??'.tools/stadium/piece-review';await mkdir(output,{recursive:true});
const errors=[];
try {
 for(const host of ['human','orc'])for(const end of ['home','away']){
 const page=await browser.newPage({viewport:{width:1280,height:660}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({state,end,host})=>{window.initial={...state,callerRole:end,players:[],ball:null,homeTeamArt:{rosterId:host,league:host==='human'?'Old World Classic':'Badlands Brawl'},awayTeamArt:{rosterId:host==='human'?'orc':'human',league:host==='human'?'Badlands Brawl':'Old World Classic'}};window.intents=[]},{state:initial,end,host});
 await page.route('**/jigsaw-test',route=>route.fulfill({contentType:'text/html',body:'<style>html,body{margin:0;height:100%;background:#101c2b}.play-runtime{height:100%}#app .live-pitch{height:100%;display:flex;flex-direction:column;margin:0;padding:0;box-sizing:border-box}#app .live-pitch-viewport{flex:1;max-height:none;min-height:0;aspect-ratio:auto}</style><div id="app" class="play-runtime"></div><script type="module" src="/test/projected-pitch-harness.tsx"></script>'}));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/jigsaw-test');
 await page.locator('.live-pitch-scene').waitFor();await page.emulateMedia({reducedMotion:'reduce'});
 for(const [angle,focus] of [[40,13],[40,0],[40,26],[30,13],[50,13],[90,13]]){
  if(angle===90)await page.getByRole('button',{name:'Top-down view',exact:true}).click();else await page.getByLabel('Perspective angle',{exact:true}).selectOption(String(angle));
  await travelToFocus(page,focus);
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-jigsaw-piece] img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({path:output+'/assembled-'+host+'-'+end+'-'+angle+'-focus-'+focus+'.png'});
 }
 await page.getByRole('button',{name:'Perspective view',exact:true}).click();await page.getByLabel('Perspective angle',{exact:true}).selectOption('40');
 await page.getByRole('button',{name:'Fit',exact:true}).click();
 for(let zoomStep=0;zoomStep<6;zoomStep++){await page.locator('.live-pitch-viewport').dispatchEvent('wheel',{deltaY:1000});await page.waitForTimeout(40);}
 await page.waitForFunction(()=>Number(document.querySelector('.live-pitch-scene').dataset.zoom)===.75);await travelToFocus(page,8);
 await page.screenshot({path:output+'/assembled-'+host+'-'+end+'-overview.png'});
 await page.close();
 }
 console.log(JSON.stringify({errors}));
}finally{await browser.close();await server.close();}
