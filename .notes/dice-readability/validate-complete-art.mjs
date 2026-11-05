import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const manifest = JSON.parse(await readFile(new URL('../../assets/game/ui/dice-events-v1/manifest.json',import.meta.url),'utf8'));
const source = await readFile(new URL('../../browser-client/src/dice-presentation.ts',import.meta.url),'utf8');
const scalarIds = [...source.match(/const scalarD6 = new Set\(\[([\s\S]*?)\]\);/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
const covered = new Set(manifest.events.flatMap(e=>e.reportIds));
assert.deepEqual(scalarIds.filter(id=>!covered.has(id)),[], 'Missing scalar report artwork');
assert.equal(new Set(manifest.events.map(e=>e.id)).size,manifest.events.length);
for (const entry of manifest.events.filter(e=>e.approvedSampleVersion)) {
  assert.equal(await readFile(new URL(`../../assets/game/ui/dice-events-v1/${entry.file}`,import.meta.url),'utf8'),
    await readFile(new URL(`./art-samples/${entry.id}-v${entry.approvedSampleVersion}.svg`,import.meta.url),'utf8'),entry.id);
}
const browser = await chromium.launch({headless:true});
const checks=[];
const geometryNotes=[];
try {
  const page=await browser.newPage();
  for (const width of [1440,390]) for(let part=1;part<=4;part++) {
    await page.setViewportSize({width,height:1000});
    await page.goto(new URL(`./complete-art/sheet-${part}.html`,import.meta.url).href);
    await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
    const state=await page.evaluate(()=>({cards:document.querySelectorAll('article').length,
      images:[...document.images].every(img=>img.complete&&img.naturalWidth>0),
      overflow:document.documentElement.scrollWidth>innerWidth}));
    assert.ok(state.cards>0&&state.images&&!state.overflow,JSON.stringify(state));
    await page.screenshot({path:fileURLToPath(new URL(`./complete-art/sheet-${part}-${width}.png`,import.meta.url)),fullPage:true});
    checks.push({part,width,...state});
  }
  // Parse each standalone SVG, rather than trusting successful image decoding alone.
  for(const entry of manifest.events) {
    const xml=await readFile(new URL(`../../assets/game/ui/dice-events-v1/${entry.file}`,import.meta.url),'utf8');
    const result=await page.evaluate(xml=>{
      const doc=new DOMParser().parseFromString(xml,'image/svg+xml');
      return {error:!!doc.querySelector('parsererror'),viewBox:doc.documentElement.getAttribute('viewBox'),
        unsafe:!!doc.querySelector('script,foreignObject,animate,animateTransform,image'),
        label:doc.documentElement.getAttribute('aria-label')};
    },xml);
    assert.ok(!result.error&&!result.unsafe&&result.viewBox==='0 0 48 48'&&result.label,entry.id);
    const bounds=await page.evaluate(xml=>{
      const host=document.createElement('div');host.innerHTML=xml;document.body.append(host);
      const box=host.querySelector('svg').getBBox();
      const result={x:box.x,y:box.y,right:box.x+box.width,bottom:box.y+box.height};host.remove();return result;
    },xml);
    if (!(bounds.x>=-1&&bounds.y>=-1&&bounds.right<=49&&bounds.bottom<=49)) geometryNotes.push({id:entry.id,approved:!!entry.approvedSampleVersion,...bounds});
  }
} finally {await browser.close();}
const results={assets:manifest.events.length,scalarReportIdsCovered:scalarIds.length,approvedSamplesUnchanged:8,geometryNotes,checks};
await writeFile(new URL('./complete-art/validation.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results));
assert.deepEqual(geometryNotes.filter(note=>!note.approved),[], 'New artwork must stay within the canvas');
