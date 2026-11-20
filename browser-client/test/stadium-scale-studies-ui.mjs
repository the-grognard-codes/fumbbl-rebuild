import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const captures = process.env.STADIUM_MOCKUP_OUTPUT || resolve(root, '../.tools/stadium-mockup');
const artwork = resolve(root, '../assets/game/references/stadiums/scale-studies');
const studies = JSON.parse(await readFile(resolve(artwork, 'bay-six/seats.json'), 'utf8'));
const layout = JSON.parse(await readFile(resolve(artwork, 'empty-seating.json'), 'utf8'));
const bay = layout.bays.find(({ id }) => id === 6);
await mkdir(captures, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const page = await browser.newPage({ viewport: { width: 1200, height: 960 } });
  const url = 'http://127.0.0.1:' + server.httpServer.address().port + '/stadium-mockup';
  await page.goto(url);
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor();
  const select = page.getByLabel('Gallery view');
  assert.deepEqual(studies.map(({ id }) => id), ['a', 'b', 'c']);
  assert.equal(await select.inputValue(), 'a');
  assert.deepEqual(await select.locator('option').allTextContents(),
    [...studies.map(({ label }) => label), 'Empty stadium', 'Show seating masks']);
  const rail = page.getByRole('checkbox', { name: 'Front rail' });
  const markers = page.getByRole('checkbox', { name: 'Seat markers' });
  assert.equal(await rail.isChecked(), true);
  assert.equal(await markers.isChecked(), false);

  await select.selectOption('empty');
  await page.getByLabel('Empty Gatehouse stadium').waitFor();
  await canvas.screenshot({ path: resolve(captures, 'layout-base.png') });
  const original = await canvas.evaluate(c => c.toDataURL());

  const bayDraws = [];
  for (const { id, label, seats } of studies) {
    await select.selectOption(id);
    await page.getByLabel('Gatehouse stadium with ' + label + ' in west bay 6').waitFor();
    const [crowdPng, railPng] = await Promise.all(['.png', '-rail.png'].map(suffix =>
      readFile(resolve(artwork, 'bay-six', id + suffix)).then(bytes => bytes.toString('base64'))));
    const expectedBay = await canvas.evaluate(async (c, { original, bay, crowdPng, railPng }) => {
      async function decode(src) {
        const image = new Image();
        image.src = src;
        await image.decode();
        return image;
      }
      const region = document.createElement('canvas');
      region.width = bay.width;
      region.height = bay.height;
      const ctx = region.getContext('2d');
      const base = await decode(original);
      ctx.drawImage(base, bay.x, bay.y, bay.width, bay.height, 0, 0, bay.width, bay.height);
      ctx.drawImage(await decode('data:image/png;base64,' + crowdPng), 0, 0);
      const withoutRail = region.toDataURL();
      ctx.drawImage(await decode('data:image/png;base64,' + railPng), 0, 0);
      return { withoutRail, withRail: region.toDataURL() };
    }, { original, bay, crowdPng, railPng });
    const bayDraw = () => canvas.evaluate((c, { x, y, width, height }) => {
      const region = document.createElement('canvas');
      region.width = width;
      region.height = height;
      region.getContext('2d').drawImage(c, x, y, width, height, 0, 0, width, height);
      return region.toDataURL();
    }, bay);

    assert.equal(await bayDraw(), expectedBay.withRail, id + ' uses its exact crowd and rail artwork');
    assert.notEqual(expectedBay.withRail, expectedBay.withoutRail, id + ' rail changes visible pixels');
    bayDraws.push(expectedBay.withRail);

    const review = page.getByRole('region', { name: 'West bay 6' });
    const native = review.locator('canvas[aria-labelledby="bay-six-native"]');
    const zoom = review.locator('canvas[aria-labelledby="bay-six-zoom"]');
    const [nativeBox, zoomBox] = await Promise.all([native.boundingBox(), zoom.boundingBox()]);
    assert.equal(zoomBox.width, nativeBox.width * 4);
    assert.equal(zoomBox.height, nativeBox.height * 4);
    await review.screenshot({ path: resolve(captures, 'west-bay-six-' + id + '.png') });

    await rail.uncheck();
    assert.equal(await bayDraw(), expectedBay.withoutRail);
    await markers.check();
    assert.equal(await canvas.evaluate((c, { bay, seats }) => {
      const context = c.getContext('2d');
      return seats.every(({ x, y }) =>
        context.getImageData(bay.x + x, bay.y + y, 1, 1).data.join(',') === '128,245,255,255');
    }, { bay, seats }), true, id + ' shows each seat marker at its exported coordinates');
    assert.equal(await native.evaluate(async (c, original) => {
      const full = document.querySelector('canvas[data-ready="true"]');
      const zoom = document.querySelector('canvas[aria-labelledby="bay-six-zoom"]');
      const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const enlarged = zoom.getContext('2d').getImageData(0, 0, zoom.width, zoom.height).data;
      const frame = { x: 0, y: 572 };
      const fullPixels = full.getContext('2d').getImageData(frame.x, frame.y, c.width, c.height).data;
      if (pixels.some((value, index) => value !== fullPixels[index])) return false;
      for (let y = 0; y < zoom.height; y++) {
        for (let x = 0; x < zoom.width; x++) {
          const source = (Math.floor(y / 4) * c.width + Math.floor(x / 4)) * 4;
          const target = (y * zoom.width + x) * 4;
          if (pixels.subarray(source, source + 4).some((value, i) => value !== enlarged[target + i])) return false;
        }
      }

      // The native frame extends onto the pitch and contains the scale player's real draw.
      const empty = new Image();
      empty.src = original;
      await empty.decode();
      const base = document.createElement('canvas');
      base.width = c.width;
      base.height = c.height;
      const context = base.getContext('2d');
      context.drawImage(empty, -frame.x, -frame.y);
      const firstSquare = { x: 156, width: 32 };
      const originalPitch = context.getImageData(firstSquare.x, 0, firstSquare.width, c.height).data;
      const mockupPitch = c.getContext('2d').getImageData(firstSquare.x, 0, firstSquare.width, c.height).data;
      return mockupPitch.some((value, index) => value !== originalPitch[index]);
    }, original), true, id + ' draws the real crop and enlarges each native pixel to a 4×4 block');
    await markers.uncheck();
    assert.equal(await bayDraw(), expectedBay.withoutRail);
    await rail.check();
  }
  assert.equal(new Set(bayDraws).size, 3);

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
  assert.equal(await select.inputValue(), 'a');
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(await page.locator('.bay-six-zoom').evaluate(element =>
    element.scrollWidth > element.clientWidth && document.documentElement.scrollWidth === window.innerWidth), true);
  console.log('Bay 6 variants, native and 4× crops, rail and seat toggles, empty stadium, and 15 seating masks passed.');
} finally {
  await browser?.close();await server.close();
}
