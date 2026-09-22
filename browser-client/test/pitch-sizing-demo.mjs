import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 await page.goto('http://127.0.0.1:5173/pitch-preview');await page.locator('.pitch-player').first().waitFor();
 assert.equal(await page.getByRole('slider').count(),0);
 assert.equal(await page.locator('.pitch-player').first().evaluate(el=>el.getBoundingClientRect().width),48);
 const checkRatio=async()=>{
  const square=await page.locator('.pitch-player').first().evaluate(el=>el.getBoundingClientRect().width);
  for(const [id,native] of [[1,64],[3,80]]) {
   const width=await page.locator(`[data-player="${id}"] img`).evaluate(el=>el.getBoundingClientRect().width);
   assert.ok(Math.abs(width-square*native/56)<.04);
  }
 };
 await checkRatio();
 await page.getByRole('button',{name:'1.5×',exact:true}).click();await checkRatio();
 await page.getByRole('button',{name:'Fit',exact:true}).click();
 await page.setViewportSize({width:1920,height:1440});
 await page.waitForFunction(()=>document.querySelector('.pitch-player').getBoundingClientRect().width===56);
 await checkRatio();
 await page.setViewportSize({width:1920,height:1080});
 await page.waitForFunction(()=>document.querySelector('.pitch-player').getBoundingClientRect().width===48);

 // Fractional content-box heights used to round up, create scrollbars, then shrink.
 for(const height of ['751.6px','629.6px','503.6px']) {
  await page.locator('.stadium-viewport').evaluate((el,height)=>{el.style.flex='none';el.style.height=height},height);
  await page.waitForTimeout(100);
  const sizes=await page.evaluate(async()=>{const sizes=[];for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);sizes.push(document.querySelector('.stadium-scene').getBoundingClientRect().width)}return sizes});
  assert.equal(new Set(sizes).size,1,`Fit oscillates at ${height}`);
 }
 await page.locator('.stadium-viewport').evaluate(el=>{el.style.flex='';el.style.height=''});
 await page.evaluate(()=>document.documentElement.requestFullscreen());
 assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true);
 await page.getByRole('button',{name:'Fit',exact:true}).click();await page.waitForTimeout(150);
 const widths=await page.evaluate(async()=>{const a=[];for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);a.push(document.querySelector('.stadium-scene').getBoundingClientRect().width)}return a});
 assert.equal(new Set(widths).size,1);
 await page.evaluate(()=>document.exitFullscreen());
 await page.getByRole('button',{name:'Fit',exact:true}).click();await page.screenshot({path:'test-output/pitch-preview/size-fit.png',fullPage:true});
 console.log('PASS: restored responsive sizing, fractional-height stability and browser Fullscreen API stability.');
}finally{await browser.close();}
