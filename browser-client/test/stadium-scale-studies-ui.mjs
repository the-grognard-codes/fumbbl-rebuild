import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const captures = process.env.STADIUM_MOCKUP_OUTPUT || resolve(root, '../.tools/stadium-mockup');
await mkdir(captures, {recursive:true});
const server = await createServer({ root, server: {host:'127.0.0.1', port:0} });
await server.listen();
let browser;
try {
  browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  const page = await browser.newPage({viewport:{width:1200,height:960}});
  const url = 'http://127.0.0.1:' + server.httpServer.address().port + '/stadium-mockup';
  await page.goto(url);
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor();
  const select = page.getByLabel('Gallery view');
  assert.deepEqual(await select.locator('option').allTextContents(), ['Empty stadium','Show seating masks']);
  await canvas.screenshot({path:resolve(captures,'layout-base.png')});
  const original = await canvas.evaluate(c=>c.toDataURL());
  await select.selectOption('masks');
  await page.getByText('Teal marks home seating.',{exact:false}).waitFor();
  const mask = await readFile(resolve(root,'../assets/game/references/stadiums/scale-studies/empty-seating.png'));
  const counts = await canvas.evaluate(async(c,{original,mask})=>{
    async function pixels(src) {
      const im=new Image(); im.src=src; await im.decode();
      const tmp=document.createElement('canvas');tmp.width=c.width;tmp.height=c.height;
      const ctx=tmp.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;
    }
    const before=await pixels(original), ids=await pixels('data:image/png;base64,'+mask);
    const after=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    const counts=Array(16).fill(0);
    for(let i=0;i<ids.length;i+=4){
      const id=ids[i], changed=before[i]!==after[i] || before[i+1]!==after[i+1] || before[i+2]!==after[i+2];
      if(changed!==Boolean(id) || id>15) throw Error('Unexpected mask pixel '+i/4);
      counts[id]++;
    }
    return counts;
  },{original,mask:mask.toString('base64')});
  assert.ok(counts.every(n=>n>100));
  await canvas.screenshot({path:resolve(captures,'empty-seating.png')});
  await select.selectOption('empty');
  await page.waitForFunction(src=>document.querySelector('canvas').toDataURL()===src,original);
  await page.goto(url+'?view=scale');
  await canvas.waitFor();
  assert.equal(await select.inputValue(),'empty');
  console.log('Empty stadium, 15 seating bays and reversible overlay passed.');
} finally {
  await browser?.close();await server.close();
}
