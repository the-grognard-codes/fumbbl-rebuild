// Reproducible visual review driver for the throwaway #211 experiment, not a production suite.
import assert from 'node:assert/strict';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { readRgbaPng, visibleBounds } from '../../assets/game/scripts/png-art.mjs';
import { HYBRID_ATLAS } from '../src/stadium-hybrid-prototype.ts';

const evidence = fileURLToPath(new URL('../../.tools/stadium-hybrid-review/', import.meta.url));
const gallery = fileURLToPath(new URL('../../assets/game/references/stadiums/hybrid-prototype-review/', import.meta.url));
const selected = new Set(['01-hybrid-40-home-near','02-structure-40-home-near','03-current-40-home-near','05-local-gesture',
  'camera-40-away-0','camera-90-home-0','compact-30','07-inspect-join',
  'original-40-home-13','original-40-away-13','original-compact-30']);
await mkdir(evidence, { recursive: true });
await mkdir(gallery, { recursive: true });
const atlas = await readRgbaPng(fileURLToPath(new URL('../../assets/game/pitch/stadiums/prototype/human-groups-v1.png', import.meta.url)));
assert.equal(atlas.width, HYBRID_ATLAS.width); assert.equal(atlas.height, HYBRID_ATLAS.height);
for (const row of HYBRID_ATLAS.rows) for (let frame=0; frame<3; frame++) {
  const rect={x:frame*HYBRID_ATLAS.cellWidth,y:row.y,width:HYBRID_ATLAS.cellWidth,height:row.height};
  const bounds=visibleBounds(atlas,rect);
  assert.ok(bounds.width>100&&bounds.height>100,'each measured view/frame contains a group');
  assert.ok(bounds.x>rect.x&&bounds.x+bounds.width<rect.x+rect.width,'whole groups fit between atlas columns');
  assert.ok(bounds.y>rect.y&&bounds.y+bounds.height<rect.y+rect.height,'whole groups fit between atlas rows');
}
const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),configFile:false,server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined)});
const errors=[],missing=[],cases=[],motionFrames=new Set();
try {
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)missing.push(response.url());});
  await page.goto(server.resolvedUrls.local[0]+'pitch-preview?variant=stadium-hybrid');
  await page.getByTestId('hybrid-stage').waitFor();
  await page.waitForFunction(()=>[...document.images].every(image=>image.complete));
  const capture=async name=>{
    await page.screenshot({path:evidence+'/'+name+'.png'});
    if(selected.has(name))await copyFile(evidence+'/'+name+'.png',gallery+'/'+name+'.png');
    const state=await page.getByTestId('hybrid-stage').evaluate(stage=>({width:stage.clientWidth,height:stage.clientHeight,
      study:stage.dataset.study,end:stage.dataset.cameraEnd,angle:stage.dataset.cameraAngle,focus:stage.dataset.cameraFocus,zoom:stage.dataset.cameraZoom,transverseFocus:stage.dataset.transverseFocus,
      cells:stage.querySelectorAll('[data-cell-x]').length,groups:stage.querySelectorAll('[data-hybrid-group]').length,
      faces:stage.querySelectorAll('[data-hybrid-face]').length,originalPlates:stage.querySelectorAll('.original-stadium-plate').length}));
    assert.equal(state.cells,390);
    if(Number(state.focus)===0 && ['hybrid','structure'].includes(state.study)) assert.ok(state.faces>0,'the near section cannot disappear as a whole');
    if(state.study==='original') {
      assert.equal(state.groups,0);assert.equal(state.faces,0);
      assert.equal(await page.getByLabel('Local gestures').isEnabled(),false,'static original painting has no gesture controls');
      if(Number(state.angle)!==90) {
        assert.ok(state.originalPlates>0,'original wall/crowd painting remains visible');
        assert.ok(await page.locator('.original-stadium-plate image').evaluateAll(images=>images.every(image=>image.href.baseVal.endsWith('/assets/game/pitch/stadium-v1.png'))));
        assert.ok(await page.locator('.original-stadium-plate').evaluateAll(plates=>plates.every(plate=>!plate.style.transform.match(/NaN|Infinity/))));
        const ids=await page.locator('.original-stadium-study [id]').evaluateAll(elements=>elements.map(element=>element.id));
        assert.equal(new Set(ids).size,ids.length,'each repeated painting owns its mask/pattern identifiers');
      } else assert.equal(state.originalPlates,0,'do not flatten baked perspective art into the overhead view');
    }
    const ratios=await page.locator('[data-hybrid-group]').evaluateAll(elements=>elements.map(element=>{
      const svg=element.querySelector('svg'),source=svg.viewBox.baseVal;
      return Math.abs(parseFloat(element.style.width)/parseFloat(element.style.height)-source.width/source.height);
    }));
    assert.ok(ratios.every(error=>error<.002),'uniform scaling preserves each entire group aspect ratio');
    cases.push({name,...state});
  };
  assert.equal(await page.getByTestId('hybrid-stage').getAttribute('data-study'),'original','restored artwork is the default preview');
  for(const end of ['home','away'])for(const angle of [40,30,50,90])for(const [focus,button] of [[0,'Home end'],[13,'Midfield'],[26,'Away end']]) {
    await page.getByLabel('Viewing end',{exact:true}).selectOption(end);
    await page.getByLabel('Camera angle',{exact:true}).selectOption(String(angle));
    await page.getByRole('button',{name:button,exact:true}).click();
    await capture('original-'+angle+'-'+end+'-'+focus);
  }
  await page.getByRole('button',{name:'Reset view',exact:true}).click();
  const originalBox=await page.getByTestId('hybrid-stage').boundingBox();
  await page.mouse.move(originalBox.x+originalBox.width/2,originalBox.y+originalBox.height/2);await page.mouse.down();
  await page.mouse.move(originalBox.x+originalBox.width/2,originalBox.y+originalBox.height/2+80,{steps:4});await page.mouse.up();
  assert.ok(Math.abs(Number(await page.getByTestId('hybrid-stage').getAttribute('data-camera-focus'))-13)>.2);
  await capture('original-scrolled');
  await page.mouse.wheel(0,-200);await page.waitForTimeout(100);
  assert.ok(Number(await page.getByTestId('hybrid-stage').getAttribute('data-camera-zoom'))>1);
  await capture('original-zoom');
  await page.setViewportSize({width:689,height:605});
  await page.getByLabel('Camera angle',{exact:true}).selectOption('30');await capture('original-compact-30');
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'Hybrid crowd',exact:true}).click();
  await page.getByRole('button',{name:'Reset view',exact:true}).click();
  await page.getByLabel('Local gestures').uncheck();
  await capture('01-hybrid-40-home-near');
  await page.getByRole('button',{name:'Inspect join',exact:true}).click();await capture('07-inspect-join');
  await page.getByRole('button',{name:'Reset view',exact:true}).click();
  await page.getByRole('button',{name:'Structure only',exact:true}).click();await capture('02-structure-40-home-near');
  await page.getByRole('button',{name:'Current rendering',exact:true}).click();await capture('03-current-40-home-near');
  await page.getByRole('button',{name:'Hybrid crowd',exact:true}).click();
  for(const end of ['home','away'])for(const angle of [40,90,30,50])for(const [focus,button] of [[0,'Home end'],[13,'Midfield'],[26,'Away end']]) {
    await page.getByLabel('Viewing end',{exact:true}).selectOption(end);
    await page.getByLabel('Camera angle',{exact:true}).selectOption(String(angle));
    await page.getByRole('button',{name:button,exact:true}).click();
    await capture('camera-'+angle+'-'+end+'-'+focus);
  }
  await page.getByRole('button',{name:'Reset view',exact:true}).click();
  await page.getByRole('button',{name:'Midfield',exact:true}).click();
  const box=await page.getByTestId('hybrid-stage').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2+80,{steps:4});await page.mouse.up();
  const moved=Number(await page.getByTestId('hybrid-stage').getAttribute('data-camera-focus'));
  assert.ok(Math.abs(moved-13)>.2,'drag actually changes camera focus');
  await capture('04-scrolled');
  await page.getByRole('button',{name:'Reset view',exact:true}).click();
  await page.getByLabel('Local gestures').check();
  for(let sample=0;sample<60;sample++){
    const active=await page.locator('[data-hybrid-group]').evaluateAll(elements=>elements.filter(e=>Number(e.dataset.frame)>0).map(e=>({id:e.dataset.hybridGroup,frame:Number(e.dataset.frame)})));
    assert.ok(active.length<=1,'random gestures move only one group');
    for(const item of active){motionFrames.add(item.frame);if(item.frame===2){await page.screenshot({path:evidence+'/05-local-gesture.png'});await copyFile(evidence+'/05-local-gesture.png',gallery+'/05-local-gesture.png');}}
    if(motionFrames.has(1)&&motionFrames.has(2))break;
    await page.waitForTimeout(150);
  }
  assert.ok(motionFrames.has(1)&&motionFrames.has(2),'both authored gesture states appear');
  await page.emulateMedia({reducedMotion:'reduce'});
  for(let sample=0;sample<12;sample++){
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-hybrid-group][data-frame="1"],[data-hybrid-group][data-frame="2"]').count(),0,'reduced motion freezes an active gesture immediately and keeps it frozen');
  }
  assert.ok((await page.locator('.hybrid-prop.torch').evaluateAll(elements=>elements.map(e=>getComputedStyle(e).animationName))).every(name=>name==='none'));
  await page.setViewportSize({width:689,height:605});
  for(const angle of [30,40,50,90]){await page.getByLabel('Camera angle',{exact:true}).selectOption(String(angle));await capture('compact-'+angle);}
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'Reset view',exact:true}).click();await page.getByLabel('Local gestures').uncheck();
  await page.mouse.move(700,500);await page.mouse.wheel(0,-400);await page.waitForTimeout(150);
  assert.ok(Number(await page.getByTestId('hybrid-stage').getAttribute('data-camera-zoom'))>.75);
  await capture('06-zoom');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  await writeFile(gallery+'/review-results.json',JSON.stringify({verdict:'technical checks passed; owner visual review pending',cases,motionFrames:[...motionFrames],errors,missing,dragFocus:moved},null,2)+'\n');
  console.log(JSON.stringify({cases:cases.length,motionFrames:[...motionFrames],errors,missing,evidence},null,2));
}finally{await browser.close();await server.close();}
