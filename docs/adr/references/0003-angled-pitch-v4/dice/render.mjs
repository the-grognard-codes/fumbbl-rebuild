// Render reference-only dice exports with the existing Playwright and local Chrome.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(new URL('../../../../../browser-client/package.json',import.meta.url));
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('.',import.meta.url));
const url = pathToFileURL(path.join(root,'index.html')).href;
const browser = await chromium.launch({channel:'chrome',headless:true});
const errors = [], report = { sets: [], animation: { milliseconds:440, maximumTranslation:3, looping:false }, errors };
const page = await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(url); await page.evaluate(()=>window.diceReviewReady);
  const sets = await page.evaluate(()=>window.mutpDice.sets);
  assert.equal(sets.length,3);
  for(const set of sets) {
    const faces = await page.locator(`.set[data-set="${set.id}"] .face-row[data-kind="block"] .die`).evaluateAll(nodes=>nodes.map(n=>n.dataset.face));
    assert.deepEqual(faces,['SKULL','BOTH DOWN','PUSHBACK','PUSHBACK','POW/PUSH','POW']);
    const pips = await page.locator(`.set[data-set="${set.id}"] .face-row[data-kind="d6"] .die`).evaluateAll(nodes=>nodes.map(n=>n.querySelectorAll('[data-pip]').length));
    assert.deepEqual(pips,[1,2,3,4,5,6]);
    await page.locator(`.set[data-set="${set.id}"] .roll-button`).click();
    assert.equal(await page.locator(`.set[data-set="${set.id}"] .sample-pair`).getAttribute('aria-busy'),'true');
    const animations = await page.locator(`.set[data-set="${set.id}"] .sample-pair`).evaluate(n=>n.getAnimations({subtree:true}).map(a=>({duration:a.effect.getTiming().duration,iterations:a.effect.getTiming().iterations,frames:a.effect.getKeyframes().map(f=>f.transform)})));
    assert.equal(animations.length,2);
    animations.forEach(a=>{assert.equal(a.duration,440);assert.equal(a.iterations,1);});
    await page.waitForFunction(id=>document.querySelector(`.set[data-set="${id}"] .sample-pair`).dataset.rolling==='false',set.id);
    assert.equal(await page.locator(`.set[data-set="${set.id}"] .roll-result`).innerText(),'Pow · d6 5');
    assert.equal(await page.locator(`.set[data-set="${set.id}"] .sample-pair`).evaluate(n=>n.getAnimations({subtree:true}).length),0);
    report.sets.push({id:set.id,blockFaces:faces,d6Pips:pips,animations});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#roll-all').click();
  assert.equal(await page.locator('.sample-pair[aria-busy=true]').count(),0);
  assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
  for(const status of await page.locator('.set .roll-result').allTextContents()) assert.equal(status,'Push · d6 2 · reduced motion');
  report.reducedMotion = 'instant final faces; no spin or cycling';
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const set of sets) {
    await page.selectOption('#pitch-set',set.id);
    assert.equal(await page.locator('#pitch-dice .die').first().getAttribute('data-set'),set.id);
    await page.locator('#roll-pitch').click();
    await page.waitForFunction(()=>document.querySelector('#pitch-dice .sample-pair').dataset.rolling==='false');
  }
  for(const size of ['64','96','128']) {
    await page.selectOption('#preview-size',size);
    assert.equal(await page.locator('.set .sample-pair .die').first().evaluate(n=>n.getBoundingClientRect().width),Number(size));
  }
  report.layouts = [];
  for(const width of [1440,1224,390]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    report.layouts.push({width,overflow:false});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(url);await page.evaluate(()=>window.diceReviewReady);
  await page.locator('#sets').screenshot({path:path.join(root,'comparison.png')});
  await page.locator('.pitch-review').screenshot({path:path.join(root,'pitch-preview.png')});
  await mkdir(path.join(root,'exports'),{recursive:true});
  report.exports = [];
  await page.addStyleTag({content:'main { display:none; } :root,body { background:transparent !important; } .export-strip { display:flex; width:768px; height:128px; } .export-strip .die { width:128px; height:128px; }'});
  for(const set of sets) for(const kind of ['block','d6']) {
    await page.evaluate(({id,kind})=>{
      document.getElementById('export-strip')?.remove();
      const strip=document.createElement('div');strip.id='export-strip';strip.className='export-strip';
      for(let value=1;value<=6;value++)strip.append(window.mutpDice.die(id,kind,value));
      document.body.append(strip);
    },{id:set.id,kind});
    const png = await page.locator('#export-strip').screenshot({path:path.join(root,`exports/${set.id}-${kind}-atlas.png`),omitBackground:true});
    const alpha = await page.evaluate(async src=>{
      const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
      let transparent=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]===0)transparent++;
      return {width:c.width,height:c.height,cornerAlpha:pixels[3],transparentPixels:transparent};
    },'data:image/png;base64,'+png.toString('base64'));
    assert.equal(alpha.cornerAlpha,0);assert.equal(alpha.width,768);assert.equal(alpha.height,128);assert.ok(alpha.transparentPixels>1000);
    report.exports.push({set:set.id,kind,...alpha});
  }
  // Capture the actual Web Animation at eight sample times, then encode an
  // animated PNG. It plays once and needs no external video encoder.
  const motionContext=await browser.newContext({viewport:{width:1200,height:264}});
  const motionPage=await motionContext.newPage();motionPage.on('pageerror',e=>errors.push(e.message));
  await motionPage.goto(url+'?capture=motion');await motionPage.evaluate(()=>window.diceReviewReady);
  const frames=[{png:await motionPage.screenshot(),delay:160}];
  await motionPage.locator('#roll-all').evaluate(button=>button.click());
  await motionPage.evaluate(async ()=>{
    const animations=document.getAnimations();animations.forEach(a=>a.pause());await Promise.all(animations.map(a=>a.ready));
  });
  for(const time of [0,55,110,165,220,275,330,385]) {
    await motionPage.evaluate(time=>{document.getAnimations().forEach(a=>a.currentTime=time);return new Promise(requestAnimationFrame);},time);
    if(time===220) {
      const matrix=await motionPage.locator('.set .sample-pair .die').first().evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).b);
      assert.ok(Math.abs(matrix)>.1,'The capture must visibly rotate the die body, not just cycle marks');
    }
    frames.push({png:await motionPage.screenshot(),delay:55});
  }
  await motionPage.evaluate(()=>document.getAnimations().forEach(a=>{a.currentTime=440;a.play();}));
  await motionPage.waitForFunction(()=>[...document.querySelectorAll('.set .sample-pair')].every(n=>n.dataset.rolling==='false'));
  frames.push({png:await motionPage.screenshot(),delay:500});
  function chunks(png) {
    const result=[];let offset=8;
    while(offset<png.length){const length=png.readUInt32BE(offset);const type=png.toString('ascii',offset+4,offset+8);result.push({type,data:png.subarray(offset+8,offset+8+length)});offset+=length+12;}
    return result;
  }
  function chunk(type,data) {
    const name=Buffer.from(type),content=Buffer.concat([name,data]);let crc=0xffffffff;
    for(const byte of content){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    const length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
    return Buffer.concat([length,content,checksum]);
  }
  const first=chunks(frames[0].png),header=first.find(c=>c.type==='IHDR').data;
  const control=Buffer.alloc(8);control.writeUInt32BE(frames.length);control.writeUInt32BE(1,4);
  const output=[frames[0].png.subarray(0,8),chunk('IHDR',header),...first.filter(c=>c.type!=='IHDR'&&c.type!=='IDAT'&&c.type!=='IEND').map(c=>chunk(c.type,c.data)),chunk('acTL',control)];
  let sequence=0;
  for(const [index,frame] of frames.entries()) {
    const parts=chunks(frame.png);assert.deepEqual(parts.find(c=>c.type==='IHDR').data,header);
    const fc=Buffer.alloc(26);fc.writeUInt32BE(sequence++);fc.writeUInt32BE(1200,4);fc.writeUInt32BE(264,8);fc.writeUInt16BE(frame.delay,20);fc.writeUInt16BE(1000,22);
    output.push(chunk('fcTL',fc));
    for(const part of parts.filter(c=>c.type==='IDAT')) {
      if(index===0)output.push(chunk('IDAT',part.data));
      else {const seq=Buffer.alloc(4);seq.writeUInt32BE(sequence++);output.push(chunk('fdAT',Buffer.concat([seq,part.data])));}
    }
  }
  output.push(chunk('IEND',Buffer.alloc(0)));
  await writeFile(path.join(root,'roll-preview.png'),Buffer.concat(output));
  report.recording={format:'APNG',width:1200,height:264,frames:frames.length,plays:1,milliseconds:frames.reduce((sum,f)=>sum+f.delay,0)};
  await motionContext.close();
  assert.deepEqual(errors,[]);
  await writeFile(path.join(root,'verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log('Three complete block/d6 sets, exact pips, 440 ms rolls, reduced motion, pitch previews, six transparent sprite strips and responsive layouts passed.');
} finally { await browser.close(); }
