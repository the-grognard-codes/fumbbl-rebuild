// Focused visual review for #211's wall-only development study.
import assert from 'node:assert/strict';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from './browser-test-server.mjs';
import {readRgbaPng,visibleBounds} from '../../assets/game/scripts/png-art.mjs';
import {WALL_MATERIAL_ART,WALL_ACCESSORY_ART,wallStudyFaces,WALL_STUDY_GEOMETRY} from '../src/stadium-wall-study.ts';

const evidence=fileURLToPath(new URL('../../.tools/stadium-wall-review/',import.meta.url));
const gallery=fileURLToPath(new URL('../../assets/game/references/stadiums/modular-wall-review/',import.meta.url));
await mkdir(evidence,{recursive:true});await mkdir(gallery,{recursive:true});
for(const sheet of [WALL_MATERIAL_ART,WALL_ACCESSORY_ART]) {
  const png=await readRgbaPng(fileURLToPath(new URL('../../assets/game/pitch/stadiums/prototype/'+sheet.file,import.meta.url)));
  assert.equal(png.width,sheet.width);assert.equal(png.height,sheet.height);
  let transparent=0;for(let i=3;i<png.rgba.length;i+=4)if(png.rgba[i]===0)transparent++;
  assert.ok(transparent>png.width*png.height*.3,'sprites retain real alpha instead of painted backgrounds');
  const regions=sheet===WALL_MATERIAL_ART?[...sheet.face,...sheet.coping]:[sheet.blueBanner,sheet.redBanner,sheet.torch,sheet.post];
  for(const region of regions)assert.deepEqual(visibleBounds(png,region),{x:region.x,y:region.y,width:region.width,height:region.height});
}
const faces=wallStudyFaces(),g=WALL_STUDY_GEOMETRY;
for(const face of faces)for(const point of [face.origin,{x:face.origin.x+face.across.x+face.down.x,y:face.origin.y+face.across.y+face.down.y,z:face.origin.z+face.across.z+face.down.z}])
  assert.ok(face.side==='north'?point.y<=-2:point.y>=17,'both sidelines keep the agreed two-square pitch apron');
assert.equal(Math.min(...faces.map(face=>face.origin.x)),g.x0);
assert.equal(Math.max(...faces.map(face=>face.origin.x+face.across.x)),g.x1);

const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),configFile:false,server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined)});
const errors=[],missing=[],cases=[];
const selected=new Set(['walls-default','walls-close','walls-40-away-13','walls-90-home-13','walls-compact-30']);
try {
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)missing.push(response.url());});
  await page.goto(server.resolvedUrls.local[0]+'pitch-preview?variant=stadium-hybrid&study=walls');
  const stage=page.getByTestId('hybrid-stage');await stage.waitFor();
  assert.equal(await stage.getAttribute('data-study'),'walls');
  await page.emulateMedia({reducedMotion:'reduce'});
  const capture=async name=>{
    await page.screenshot({path:evidence+'/'+name+'.png'});
    if(selected.has(name))await copyFile(evidence+'/'+name+'.png',gallery+'/'+name+'.png');
    assert.equal(await page.locator('[data-cell-x]').count(),390);
    assert.equal(await page.locator('.hybrid-group,.original-stadium-study,[data-stadium-role="crowd"],[data-jigsaw-role="crowd"]').count(),0,'wall-only view contains no spectator renderer');
    assert.equal(await page.getByLabel('Local gestures').isEnabled(),false);
    if(Number(await stage.getAttribute('data-transverse-focus'))===7.5 && Number(await stage.getAttribute('data-camera-zoom'))<=1)
      for(const side of ['north','south'])assert.ok(await page.locator(`[data-wall-face][data-wall-side="${side}"]`).count()>0,'both sidelines appear in a centered view');
    if(Number(await stage.getAttribute('data-camera-angle'))!==90) {
      assert.equal(await page.locator('[data-wall-side="north"][data-wall-prop="redBanner"],[data-wall-side="south"][data-wall-prop="blueBanner"]').count(),0,'pennant colors match the reference wall sides');
      const end=await stage.getAttribute('data-camera-end');
      assert.ok(await page.locator('[data-wall-prop="torch"],[data-wall-prop="post"]').evaluateAll((elements,end)=>elements.every(element=>
        (element.dataset.wallMirrored==='true')===((element.dataset.wallSide==='south')===(end==='home'))),end));
    }
    assert.ok(await page.locator('.wall-study-face').evaluateAll(elements=>elements.every(element=>!element.style.transform.match(/NaN|Infinity/))));
    const ratios=await page.locator('.wall-study-prop').evaluateAll(elements=>elements.filter(element=>element.dataset.wallProp.includes('Banner')||element.getAttribute('data-camera-mode')==='perspective').map(element=>{
      const box=element.viewBox.baseVal;
      return Math.abs(Number(element.getAttribute('width'))/Number(element.getAttribute('height'))-box.width/box.height);
    }));
    assert.ok(ratios.every(error=>error<.001),'intact accessories retain source proportions');
    const ids=await page.locator('.wall-study [id]').evaluateAll(elements=>elements.map(element=>element.id));
    assert.equal(new Set(ids).size,ids.length);
    cases.push({name,...await stage.evaluate(element=>({angle:element.dataset.cameraAngle,end:element.dataset.cameraEnd,focus:element.dataset.cameraFocus,zoom:element.dataset.cameraZoom,
      faces:element.querySelectorAll('[data-wall-face]').length,props:element.querySelectorAll('[data-wall-prop]').length}))});
  };
  await capture('walls-default');
  for(const end of ['home','away'])for(const angle of [40,90,30,50])for(const [focus,button] of [[0,'Home end'],[13,'Midfield'],[26,'Away end']]) {
    await page.getByLabel('Viewing end',{exact:true}).selectOption(end);await page.getByLabel('Camera angle',{exact:true}).selectOption(String(angle));
    await page.getByRole('button',{name:button,exact:true}).click();await capture('walls-'+angle+'-'+end+'-'+focus);
  }
  await page.getByRole('button',{name:'Reset view',exact:true}).click();
  await page.getByRole('button',{name:'Inspect wall',exact:true}).click();await capture('walls-close');
  await page.getByRole('button',{name:'Reset view',exact:true}).click();
  const box=await stage.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2+80,{steps:4});await page.mouse.up();
  assert.ok(Math.abs(Number(await stage.getAttribute('data-camera-focus'))-13)>.2);await capture('walls-scrolled');
  await page.mouse.wheel(0,-200);await page.waitForTimeout(100);assert.ok(Number(await stage.getAttribute('data-camera-zoom'))>1);await capture('walls-zoom');
  await page.setViewportSize({width:689,height:605});
  for(const angle of [30,40,50,90]){await page.getByLabel('Camera angle',{exact:true}).selectOption(String(angle));await capture('walls-compact-'+angle);}
  await page.setViewportSize({width:1440,height:960});await page.getByRole('button',{name:'Reset view',exact:true}).click();
  assert.ok((await page.locator('.wall-study-flame').evaluateAll(elements=>elements.map(element=>getComputedStyle(element).animationName))).every(name=>name==='none'));
  await page.emulateMedia({reducedMotion:'no-preference'});
  assert.ok((await page.locator('.wall-study-flame').evaluateAll(elements=>elements.map(element=>getComputedStyle(element).animationName))).every(name=>name==='hybrid-torch'));
  for(const label of ['Original artwork','Hybrid crowd','Structure only','Current rendering','Modular walls'])await page.getByRole('button',{name:label,exact:true}).click();
  assert.equal(await stage.getAttribute('data-study'),'walls');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  await writeFile(gallery+'/review-results.json',JSON.stringify({verdict:'technical checks passed; owner wall-art review pending',cases,errors,missing},null,2)+'\n');
  console.log(JSON.stringify({cases:cases.length,errors,missing,evidence},null,2));
} finally {await browser.close();await server.close();}
