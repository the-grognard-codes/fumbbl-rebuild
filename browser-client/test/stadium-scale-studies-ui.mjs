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
const atlasPng = await readFile(resolve(artwork, 'bay-six/supporters.png'), 'base64');
const landmarks = JSON.parse(await readFile(resolve(artwork, 'bay-six/pose-landmarks.json'), 'utf8'));
const poseColumns = ['seated-fist', 'seated-tankard', 'seated-bottle', 'seated-food', 'standing-fist', 'seated-folded'];
const poseCaptions = {
  'seated-fist': 'Seated · Raised fist',
  'seated-tankard': 'Seated · Tankard',
  'seated-bottle': 'Seated · Bottle',
  'seated-food': 'Seated · Eating',
  'standing-fist': 'Standing · Raised fist',
  'seated-folded': 'Seated · Folded arms',
};
const layout = JSON.parse(await readFile(resolve(artwork, 'empty-seating.json'), 'utf8'));
const benchLayout = JSON.parse(await readFile(resolve(artwork, 'gatehouse-benches.json'), 'utf8'));
const mask = await readFile(resolve(artwork, 'empty-seating.png'), 'base64');
const bay = layout.bays.find(({ id }) => id === 6);
const bayPlanks = benchLayout.bays.find(({ id }) => id === bay.id).planks;

async function benchReference(canvas, colors) {
  return canvas.evaluate(async (full, { benchLayout, layout, mask, colors }) => {
    const maskImage = new Image();
    maskImage.src = 'data:image/png;base64,' + mask;
    await maskImage.decode();
    const overlay = document.createElement('canvas');
    overlay.width = full.width;
    overlay.height = full.height;
    const context = overlay.getContext('2d');
    context.drawImage(maskImage, 0, 0);
    const ids = context.getImageData(0, 0, full.width, full.height).data;
    const pixels = context.createImageData(full.width, full.height);
    const counts = {};
    for (const { id, planks } of benchLayout.bays) {
      const bay = layout.bays.find(bay => bay.id === id);
      for (const { id } of planks) counts[id] = 0;
      for (let y = 0; y < bay.height; y++) {
        for (let x = 0; x < bay.width; x++) {
          const pixel = ((bay.y + y) * full.width + bay.x + x) * 4;
          if (ids[pixel] !== id) continue;
          const plank = planks.find(({ rects }) => rects.some(([left, top, width, height]) =>
            x >= left && x < left + width && y >= top && y < top + height));
          if (!plank) continue;
          pixels.data.set([...colors[plank.id % 10 - 1], 135], pixel);
          counts[plank.id]++;
        }
      }
    }
    context.putImageData(pixels, 0, 0);
    return { overlay: overlay.toDataURL(), counts };
  }, { benchLayout, layout, mask, colors });
}

function drawBenchReference(canvas, background, overlay) {
  return canvas.evaluate(async (full, { background, overlay }) => {
    async function decode(src) {
      const image = new Image();
      image.src = src;
      await image.decode();
      return image;
    }
    const expected = document.createElement('canvas');
    expected.width = full.width;
    expected.height = full.height;
    const context = expected.getContext('2d');
    context.drawImage(await decode(background), 0, 0);
    context.drawImage(await decode(overlay), 0, 0);
    return expected.toDataURL();
  }, { background, overlay });
}

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
  const benches = page.getByRole('checkbox', { name: 'Bench tops' });
  const benchKey = page.getByRole('list', { name: 'Bench top key' });
  assert.equal(await rail.isChecked(), true);
  assert.equal(await markers.isChecked(), false);
  assert.equal(await benches.isChecked(), false);
  assert.equal(await benchKey.count(), 0);

  await select.selectOption('empty');
  await page.getByLabel('Empty Gatehouse stadium').waitFor();
  await canvas.screenshot({ path: resolve(captures, 'layout-base.png') });
  const original = await canvas.evaluate(c => c.toDataURL());
  await benches.check();
  await benchKey.waitFor();
  const colors = await benchKey.locator('li span').evaluateAll(spans => spans.map(span =>
    getComputedStyle(span).backgroundColor.match(/\d+/g).map(Number)));
  const maxPlanks = Math.max(...benchLayout.bays.map(({ planks }) => planks.length));
  assert.equal(colors.length, maxPlanks);
  assert.equal(new Set(colors.map(color => color.join(','))).size, maxPlanks);
  assert.deepEqual(await benchKey.locator('li').allTextContents(), colors.map((_, index) => 'Plank ' + (index + 1)));
  assert.deepEqual(benchLayout.bays.map(({ id }) => id).sort((a, b) => a - b), layout.bays.map(({ id }) => id));
  const { overlay: benchOverlay, counts: plankCounts } = await benchReference(canvas, colors);
  for (const { id, planks } of benchLayout.bays) {
    assert.ok(planks.length > 0, 'Bench geometry exists for bay ' + id);
    assert.deepEqual(planks.map(plank => plank.id).sort((a, b) => a - b), planks.map((_, index) => id * 10 + index + 1));
    for (const plank of planks) assert.ok(plankCounts[plank.id] > 0, 'Visible pixels for plank ' + plank.id);
  }
  const benched = await drawBenchReference(canvas, original, benchOverlay);
  assert.equal(await canvas.evaluate(c => c.toDataURL()), benched, 'Bench tops draw exactly in the approved 15 bays');
  await canvas.screenshot({ path: resolve(captures, 'bench-tops.png') });
  await page.getByRole('main').screenshot({ path: resolve(captures, 'bench-tops-gallery.png') });
  await benches.uncheck();
  assert.equal(await canvas.evaluate(c => c.toDataURL()), original);

  const bayDraws = [];
  for (const { id, label, seats, spacing } of studies) {
    const nativeGaps = seats.slice(1).map((seat, index) => Math.abs(seat.y - seats[index].y));
    assert.deepEqual(spacing, { min: Math.min(...nativeGaps), max: Math.max(...nativeGaps) });
    await select.selectOption(id);
    await page.getByLabel('Gatehouse stadium with ' + label + ' in west bay 6').waitFor();
    const [crowdPng, railPng] = await Promise.all(['.png', '-rail.png'].map(suffix =>
      readFile(resolve(artwork, 'bay-six', id + suffix)).then(bytes => bytes.toString('base64'))));
    const [expectedBay, expectedBenchedBay] = await canvas.evaluate(async (c, { original, benched, bay, crowdPng, railPng }) => {
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
      const [empty, benches, crowd, rail] = await Promise.all([
        decode(original), decode(benched), decode('data:image/png;base64,' + crowdPng), decode('data:image/png;base64,' + railPng),
      ]);
      return [empty, benches].map(base => {
        ctx.drawImage(base, bay.x, bay.y, bay.width, bay.height, 0, 0, bay.width, bay.height);
        ctx.drawImage(crowd, 0, 0);
        const withoutRail = region.toDataURL();
        ctx.drawImage(rail, 0, 0);
        return { withoutRail, withRail: region.toDataURL() };
      });
    }, { original, benched, bay, crowdPng, railPng });
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
    const disclosure = review.locator('details');
    assert.equal(await disclosure.evaluate(element => element.open), false, id + ' starts with its pose inspection closed');
    await review.screenshot({ path: resolve(captures, 'west-bay-six-' + id + '.png') });

    await page.getByText('Inspect full poses', { exact: true }).press('Enter');
    const poses = review.getByRole('list', { name: 'Supporters in bay order' });
    await poses.waitFor();
    assert.deepEqual(await poses.locator('figcaption').allTextContents(), seats.map(({ pose }) => poseCaptions[pose]));
    const countLabel = seats.every(({ stance }) => stance === 'seated') ? /3 seated$/ : /2 seated, 1 standing$/;
    assert.ok(await review.getByText(countLabel).isVisible());
    const spacingLabel = spacing.min === spacing.max ? String(spacing.min) : `${spacing.min}–${spacing.max}`;
    assert.ok(await review.getByText(spacingLabel + ' px contact spacing', { exact: false }).isVisible());
    for (const { pose, origin, knee, otherSole, plankId, x, y } of seats) {
      const local = landmarks[pose];
      assert.deepEqual([x - origin.x, y - origin.y], local.contact, id + ' registers ' + pose + ' at its contact');
      assert.deepEqual(knee ? [knee.x - origin.x, knee.y - origin.y] : undefined, local.knee,
        id + ' preserves the authored knee position for ' + pose);
      assert.deepEqual(otherSole ? [otherSole.x - origin.x, otherSole.y - origin.y] : undefined, local.otherSole,
        id + ' preserves the authored second sole position for ' + pose);
      const plank = bayPlanks.find(({ id }) => id === plankId);
      assert.ok(plank, id + ' resolves plank ' + plankId + ' for ' + pose);
      const supports = ({ x, y }) => plank.rects.some(([left, top, width, height]) =>
        x >= left && x < left + width && y >= top && y < top + height);
      assert.ok(supports({ x, y }) && (!otherSole || supports(otherSole)),
        id + ' registers each contact with plank ' + plankId);
    }
    await poses.evaluate(async (list, { atlasPng, crowdPng, seats, bay }) => {
      const size = 48;
      const factor = 2;
      async function decode(bytes) {
        const img = new Image();
        img.src = 'data:image/png;base64,' + bytes;
        await img.decode();
        return img;
      }
      function surface(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas.getContext('2d');
      }
      const [atlas, crowd] = await Promise.all([decode(atlasPng), decode(crowdPng)]);
      if (atlas.width !== size * 6 || atlas.height !== size) throw Error('Expected one shared six-pose atlas row');
      const source = surface(atlas.width, atlas.height);
      source.drawImage(atlas, 0, 0);
      const assembled = surface(bay.width, bay.height);
      const canvases = list.querySelectorAll('canvas');
      if (canvases.length !== seats.length) throw Error('Missing isolated pose');
      for (const [index, { origin, column }] of seats.entries()) {
        const native = source.getImageData(column * size, 0, size, size).data;
        const zoom = canvases[index];
        if (zoom.width !== size * factor || zoom.height !== size * factor) throw Error('Expected a 2× isolated pose');
        const pixels = zoom.getContext('2d').getImageData(0, 0, zoom.width, zoom.height).data;
        for (let y = 0; y < zoom.height; y++) {
          for (let x = 0; x < zoom.width; x++) {
            const sample = (Math.floor(y / factor) * size + Math.floor(x / factor)) * 4;
            const target = (y * zoom.width + x) * 4;
            if (native.subarray(sample, sample + 4).some((value, channel) => value !== pixels[target + channel])) {
              throw Error('Isolated pose ' + index + ' differs from its original atlas cell');
            }
          }
        }
        if (!native.some((channel, index) => index % 4 === 3 && channel > 0)) throw Error('Empty isolated pose');
        assembled.drawImage(atlas, column * size, 0, size, size, origin.x, origin.y, size, size);
      }
      const expected = surface(bay.width, bay.height);
      expected.drawImage(crowd, 0, 0);
      if (assembled.canvas.toDataURL() !== expected.canvas.toDataURL()) {
        throw Error('Isolated pose colours or alignment differ from the assembled bay crowd');
      }
    }, { atlasPng, crowdPng, seats: seats.map(seat => ({ ...seat, column: poseColumns.indexOf(seat.pose) })), bay });
    await review.getByRole('heading', { name: 'West bay 6' }).click();
    await review.screenshot({ path: resolve(captures, 'west-bay-six-' + id + '-poses.png') });

    await rail.uncheck();
    assert.equal(await bayDraw(), expectedBay.withoutRail);
    await benches.check();
    assert.equal(await bayDraw(), expectedBenchedBay.withoutRail, id + ' bench colors sit under the crowd');
    await rail.check();
    assert.equal(await bayDraw(), expectedBenchedBay.withRail, id + ' bench colors sit under the foreground rail');
    await markers.check();
    assert.ok(await review.getByText('mark hip or boot contact.', { exact: false }).isVisible());
    assert.equal(await canvas.evaluate((c, { bay, seats }) => {
      const context = c.getContext('2d');
      const color = ({ x, y }) => context.getImageData(bay.x + x, bay.y + y, 1, 1).data.join(',');
      return seats.every(seat => color(seat) === '128,245,255,255' &&
        (!seat.knee || color(seat.knee) === '255,225,123,255') &&
        (!seat.otherSole || color(seat.otherSole) === '128,245,255,255'));
    }, { bay, seats }), true, id + ' marks hips, knees and both soles above the bench and rail layers');
    await review.screenshot({ path: resolve(captures, 'west-bay-six-' + id + '-benches.png') });
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
    assert.equal(await bayDraw(), expectedBenchedBay.withRail);
    await benches.uncheck();
    assert.equal(await bayDraw(), expectedBay.withRail);
  }
  assert.equal(new Set(bayDraws).size, 3);

  await select.selectOption('masks');
  await page.getByText('Teal marks home seating.',{exact:false}).waitFor();
  assert.equal(await page.getByText('Inspect full poses', { exact: true }).count(), 0);
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
  },{original,mask});
  assert.ok(counts.every(n=>n>100));
  await canvas.screenshot({path:resolve(captures,'empty-seating.png')});
  const masksOnly = await canvas.evaluate(c => c.toDataURL());
  await benches.check();
  const combined = await drawBenchReference(canvas, masksOnly, benchOverlay);
  assert.equal(await canvas.evaluate(c => c.toDataURL()), combined, 'Bench and seating masks compose independently');
  await canvas.screenshot({ path: resolve(captures, 'seating-and-bench-tops.png') });
  await select.selectOption('empty');
  await page.waitForFunction(src => document.querySelector('canvas').toDataURL() === src, benched);
  assert.equal(await benches.isChecked(), true);
  await benches.uncheck();
  await page.waitForFunction(src=>document.querySelector('canvas').toDataURL()===src,original);
  await page.goto(url+'?view=scale');
  await canvas.waitFor();
  assert.equal(await select.inputValue(), 'a');
  await page.setViewportSize({ width: 360, height: 800 });
  await benches.check();
  await benchKey.waitFor();
  await page.getByText('Inspect full poses', { exact: true }).click();
  assert.equal(await page.locator('.bay-six-zoom').evaluate(element =>
    element.scrollWidth > element.clientWidth && document.documentElement.scrollWidth === window.innerWidth), true);
  console.log('Bay 6 variants, isolated full poses, native and 4× crops, and independent rail, contact, bench and 15 seating masks passed.');
} finally {
  await browser?.close();await server.close();
}
