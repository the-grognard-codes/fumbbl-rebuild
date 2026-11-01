import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { createServer } from '../../browser-client/test/browser-test-server.mjs';

// Research fixture only. Product components/styles remain unchanged.
const root = fileURLToPath(new URL('../../browser-client/', import.meta.url));
const output = fileURLToPath(new URL('../../.tools/hardware-research/replay-minima/', import.meta.url));
const harnessPath = fileURLToPath(new URL('./replay-layout-minima-harness.tsx', import.meta.url));
const reportPath = `${output}/${process.env.REPLAY_REPORT ?? 'measurements.json'}`;
await mkdir(output, { recursive: true });
const fixtureBase = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].spectator;
const pairs = process.env.REPLAY_PAIRS ? JSON.parse(process.env.REPLAY_PAIRS) : [
  [1920,945],[1280,720],[1024,768],[863,360],[734,343],[667,375],[640,320],
  [600,320],[560,320],[520,320],[480,320],[440,320],[400,320],[375,320],[360,320],
  [340,320],[320,320],[300,320],[280,320],[260,320],[240,320],
  [734,240],[734,180],[734,120],[734,80],[734,60],
];
function fixture(stress) {
  const homeTeamName = stress ? 'The Extraordinary Altdorf Imperial Championship All Stars' : 'Home Team';
  const awayTeamName = stress ? 'The Legendary Middenheim Northern Conference Champions' : 'Away Team';
  const players = Array.from({length: stress ? 32 : 4}, (_, i) => ({ ...fixtureBase.players[i % 2],
    id: `p${i}`, name: stress ? `Extraordinarily Long Player Name ${i + 1}` : `Player ${i + 1}`,
    number: i % 16 + 1, slot: i % 16 + 1, role: i < (stress ? 16 : 2) ? 'home' : 'away',
    x: i % 16 < 11 ? 8 + i % 6 : null, y: i % 16 < 11 ? 5 + Math.floor(i / 6) : null,
    offPitch: i % 16 < 11 ? 'pitch' : ['reserve','knockedOut','casualty','sentOff','other'][i % 16 - 11],
    state: 'standing', status: 'Standing', art: { rosterId: 'human', positionId: 'lineman' },
  }));
  const state = { ...fixtureBase, homeTeamName, awayTeamName, players, actions: [], prompt: null,
    activePlayerId: null, movementForecast: undefined, blockContext: undefined, homeTurn: 8, awayTurn: 8 };
  const records = Array.from({length: 8}, (_, index) => ({ index, revision: index,
    kind: index ? 'ACTION' : 'START', actor: index ? index % 2 ? 'home' : 'away' : 'system',
    at: 1793400000000 + index * 1000, decision: null, native: [],
    state: { ...state, revision: index, phase: 'PLAY', half: index < 4 ? 1 : 2, homeTurn: Math.ceil(index / 2), awayTurn: Math.floor(index / 2) },
  }));
  return { state, records, result: { formatVersion: 3, engineVersion: 'research', ruleset: 'BB2025', catalogVersion: 'fixture',
    presetId: 'fixture', presetVersion: 'fixture', matchId: state.matchId, homeScore: 2, awayScore: 1, finalRevision: 7, eventCount: 8 },
    chat: [{ index: 0, revision: 0, at: 1793400000000, role: 'home', text: stress ? 'A long recorded chat message '.repeat(12) : 'Good game!', speaker: 'Coach' }] };
}
const server = await createServer({ root, configFile: false, cacheDir: `${output}/vite-cache`,
  server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } } });
await server.listen();
let browser;
const report = { generatedAt: new Date().toISOString(), node: process.version,
  playwright: JSON.parse(await readFile(new URL('../../browser-client/node_modules/playwright/package.json', import.meta.url))).version,
  scope: 'Actual HostedResult with local reactive fixture, product CSS, CSS pixel viewport, DPR 1, default dark appearance, connected, history v3, compact dugouts, default camera', results: [] };
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  report.browser = browser.version();
  for (const stress of [false, true]) {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    await context.addInitScript(data => { window.replayFixture = data; window.replayCalls = []; }, fixture(stress));
    await context.route('**/research-replay', route => route.fulfill({contentType:'text/html', body:
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script type="module" src="/@fs/' + harnessPath.replaceAll('\\','/') + '"></script></body></html>'}));
    const page = await context.newPage();
    let errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const [width,height] of pairs) {
      const result = { state: stress ? 'long-crowded' : 'normal', width, height };
      errors = [];
      try {
        await page.setViewportSize({width,height});
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/research-replay`);
        await page.getByRole('navigation',{name:'Replay controls'}).waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.locator('.live-pitch-scene').waitFor();
        await page.waitForTimeout(150);
        result.geometry = await page.evaluate(() => {
          const box = el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
          const rects = selector => [...document.querySelectorAll(selector)].map(el => ({name:el.getAttribute('aria-label') || el.textContent.trim().slice(0,100), ...box(el)}));
          const controls = [...document.querySelectorAll('.replay-controls button,.replay-seek button,.replay-seek input,.replay-seek select')];
          const overlap = [];
          for (let i=0;i<controls.length;i++) for(let j=i+1;j<controls.length;j++) {
            const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();
            if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)
              overlap.push([controls[i].outerHTML,controls[j].outerHTML]);
          }
          const outOfWidth = controls.filter(el => {const r=el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth+1;}).map(el=>el.outerHTML);
          const blocks=rects('.hosted-result,.match-scoreboard,.replay-controls,.replay-seek,[aria-label="Replay event"],.live-pitch,.live-pitch-viewport,.live-dugouts,.match-history');
          const supportingOverlap=[];
          const supportingClipping=[];
          for(const group of document.querySelectorAll('.live-dugout-zones,.live-dugout-heading,.live-pitch-toolbar,.live-camera-controls,.live-camera-buttons,.match-history-tabs,.log-font-controls,.match-log-options')) {
            const items=[...group.querySelectorAll('button,input,select')];
            for(let i=0;i<items.length;i++) for(let j=i+1;j<items.length;j++) {
              const a=items[i].getBoundingClientRect(),b=items[j].getBoundingClientRect();
              if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)
                supportingOverlap.push({group:group.className,a:items[i].outerHTML,b:items[j].outerHTML});
            }
          }
          for(const el of document.querySelectorAll('.live-dugout-zone-summary')) {
            const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();
            if(r.right>p.right+1 || r.left<p.left-1) supportingClipping.push({name:el.textContent.trim(),element:box(el),parent:box(el.parentElement)});
          }
          const textOverflow = rects('.match-scoreboard > div,.live-dugout-heading');
          return {documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,loadedFonts:[...document.fonts].filter(font=>font.status==='loaded').map(font=>({family:font.family,weight:font.weight})),
            horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,verticalScroll:document.documentElement.scrollHeight>innerHeight,
            controlOverlap:overlap, controlsOutsideWidth:outOfWidth,blocks,textOverflow,supportingOverlap,supportingClipping,
            controlBoxes:rects('.replay-controls button,.replay-seek button,.replay-seek input,.replay-seek select')};
        });
        // Real Playwright actions scroll controls into view and require hit testing.
        result.reachability = [];
        const act = async (name, callback) => {try {await callback();result.reachability.push({name,status:'pass'});}catch(error){result.reachability.push({name,status:'fail',error:error.message.split('\n').slice(0,3).join(' ')});}};
        for (const name of ['First','Next','Previous','Last']) await act(name, () => page.getByRole('button',{name,exact:true}).click({timeout:900}));
        await act('Turn select', () => page.locator('.replay-seek select').nth(0).selectOption('3',{timeout:900}));
        await act('Event + Seek', async () => { await page.getByLabel('Event',{exact:true}).fill('4',{timeout:900}); await page.getByRole('button',{name:'Seek',exact:true}).click({timeout:900}); });
        await act('Speed select', () => page.locator('.replay-seek select').nth(1).selectOption('0.5',{timeout:900}));
        await act('Play + Pause', async () => {await page.getByRole('button',{name:'Play',exact:true}).click({timeout:900}); await page.getByRole('button',{name:'Pause',exact:true}).click({timeout:900});});
        await act('Skip animations', async () => {await page.getByLabel('Skip animations',{exact:true}).uncheck({timeout:900});await page.getByLabel('Skip animations',{exact:true}).check({timeout:900});});
        await act('Reload result', () => page.getByRole('button',{name:'Reload result',exact:true}).click({timeout:900}));
        await act('Chat + Log tabs', async () => {await page.getByRole('tab',{name:'Chat',exact:true}).click({timeout:900}); await page.getByRole('tab',{name:'Log',exact:true}).click({timeout:900});});
        result.callbackValues=await page.evaluate(()=>window.replayCalls);
        assert.deepEqual(result.callbackValues,[0,1,0,7,3,3,'load'],'Replay controls must invoke their real callbacks in order');
        await page.evaluate(()=>window.scrollTo(0,0));
        if ([1920,1280,1024,980,975,970,967,965,960,863,734,400,320,260].includes(width) && height>=300) {
          const stem=`${result.state}-${width}x${height}`;
          await page.screenshot({path:`${output}/${stem}-full.png`,fullPage:true});
          await page.locator('.live-pitch-viewport').scrollIntoViewIfNeeded();
          await page.screenshot({path:`${output}/${stem}-pitch.png`});
          result.screenshots=[`${stem}-full.png`,`${stem}-pitch.png`];
        }
        await act('Game Menu tabs + close', async () => {
          await page.getByRole('button',{name:'Game Menu',exact:true}).click({timeout:900});
          const dialog=page.getByRole('dialog',{name:'Game Menu',exact:true});
          result.dialog=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:el.clientWidth,height:el.clientHeight,scrollWidth:el.scrollWidth,scrollHeight:el.scrollHeight,outsideViewport:r.left < -1 || r.top < -1 || r.right>innerWidth+1 || r.bottom>innerHeight+1};});
          for(const name of ['Game Settings','Skills & Traits','Interface','Key Bindings','Game Log','Game Options']) await dialog.getByRole('tab',{name,exact:true}).click({timeout:900});
          if(width===734 && height===343 || width===1280 && height<=60) await page.screenshot({path:`${output}/${result.state}-${width}x${height}-menu.png`});
          await page.getByRole('button',{name:'Close Game Menu',exact:true}).click({timeout:900});
        });
        result.pageErrors=[...errors];
        result.replayControlsStatus = !result.geometry.controlOverlap.length && !result.geometry.controlsOutsideWidth.length && result.reachability.every(item=>item.status==='pass') && !errors.length ? 'pass':'fail';
        // A button can extend into a visible grid gap without clipping/overlap.
        // supportingClipping records that advisory cell overflow, not failure.
        result.status = result.replayControlsStatus==='pass' && !result.geometry.horizontalOverflow && !result.geometry.supportingOverlap.length && !result.dialog?.outsideViewport ? 'pass':'fail';
      } catch(error) {result.status='error';result.error=error.message;result.pageErrors=[...errors];}
      report.results.push(result);
      console.log(`${result.state} ${width}x${height} ${result.status} ${result.geometry?.documentWidth ?? ''} ${result.reachability?.filter(item=>item.status==='fail').map(item=>item.name).join(',') ?? ''}`);
      await writeFile(reportPath,JSON.stringify(report,null,2));
    }
    await context.close();
  }
} finally {await browser?.close();await server.close();}
assert.ok(report.results.length,'No viewports measured');
