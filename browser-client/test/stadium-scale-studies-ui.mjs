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
const [atlasPng, authoringPng] = await Promise.all(['supporter-kits.png', 'supporters.png'].map(file =>
  readFile(resolve(artwork, 'bay-six', file), 'base64')));
const { ramps } = JSON.parse(await readFile(resolve(artwork, '../../../team-colors/v1/delivery/manifest.json'), 'utf8'));
const ramp = name => ramps.find(({ id }) => id === name).colors.map(color => parseInt(color.slice(1), 16));
const neutralPalette = [...ramp('slate'), ...ramp('brown')];
const kitPairs = [...ramp('teal'), ...ramp('violet')].map((color, index) => [color, neutralPalette[index]]);
const landmarks = JSON.parse(await readFile(resolve(artwork, 'bay-six/pose-landmarks.json'), 'utf8'));
const posesManifest = JSON.parse(await readFile(resolve(artwork, 'bay-six/poses.json'), 'utf8'));
const newPoses = [
  { id: 'seated-pretzel', label: 'Pretzel' },
  { id: 'seated-clap', label: 'Clapping' },
  { id: 'seated-bell', label: 'Handbell' },
  { id: 'standing-bell', label: 'Handbell' },
];
const poseColumns = posesManifest.map(({ id }) => id);
const caption = ({ pose, neutral }) => [
  pose.startsWith('standing-') ? 'Standing' : 'Seated',
  posesManifest.find(({ id }) => id === pose).label,
  neutral === undefined ? undefined : neutral ? 'Neutral kit' : 'Home kit',
].filter(Boolean).join(' · ');
const layout = JSON.parse(await readFile(resolve(artwork, 'empty-seating.json'), 'utf8'));
const benchLayout = JSON.parse(await readFile(resolve(artwork, 'gatehouse-benches.json'), 'utf8'));
const mask = await readFile(resolve(artwork, 'empty-seating.png'), 'base64');
const bay = layout.bays.find(({ id }) => id === 6);
const bayPlanks = benchLayout.bays.find(({ id }) => id === bay.id).planks;
const seatKey = ({ plankId, slot }) => `${plankId}:${slot.x},${slot.y}`;

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

async function verifyFullRoster(page) {
  const summary = page.getByText('Inspect all 10 poses', { exact: true });
  const roster = page.getByRole('list', { name: 'Full supporter roster' });
  assert.equal(await roster.isVisible(), false);
  await summary.press('Enter');
  await roster.waitFor();
  assert.deepEqual(await roster.locator('figcaption').allTextContents(),
    poseColumns.map(pose => caption({ pose })));
  const alternateKits = await roster.evaluate(async (list, { atlasPng, authoringPng, poseColumns, kitPairs }) => {
    const size = 48;
    async function decodedContext(bytes, width, height) {
      const image = new Image();
      image.src = 'data:image/png;base64,' + bytes;
      await image.decode();
      if (image.width !== width || image.height !== height) throw Error('Unexpected roster atlas dimensions');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return context;
    }
    const width = size * poseColumns.length;
    const [source, kits] = await Promise.all([
      decodedContext(authoringPng, width, size), decodedContext(atlasPng, width, size * 2),
    ]);
    const canvases = list.querySelectorAll('canvas');
    if (canvases.length !== poseColumns.length) throw Error('Roster is missing isolated poses');
    const kitPalette = new Map(kitPairs);
    const rgb = (pixels, i) => pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2];
    const uniquePoses = new Set();
    const alternateKits = [];
    for (const [column, pose] of poseColumns.entries()) {
      const x = column * size;
      const authoring = source.getImageData(x, 0, size, size).data;
      const home = kits.getImageData(x, 0, size, size).data;
      const neutral = kits.getImageData(x, size, size, size).data;
      if (home.some((value, i) => value !== authoring[i])) throw Error('Home kit changes the authored ' + pose);
      let recolored = false;
      for (let i = 0; i < home.length; i += 4) {
        if (home[i + 3] !== neutral[i + 3]) throw Error('Neutral kit changes the ' + pose + ' silhouette');
        if (rgb(home, i) !== rgb(neutral, i)) {
          if (kitPalette.get(rgb(home, i)) !== rgb(neutral, i)) throw Error('Neutral kit changes a fixed pixel of ' + pose);
          recolored = true;
        }
      }
      if (recolored) alternateKits.push(pose);
      if (!home.some((value, i) => i % 4 === 3 && value > 0)) throw Error('Empty roster pose ' + pose);
      uniquePoses.add(home.join(','));
      const enlarged = canvases[column];
      if (enlarged.width !== size * 2 || enlarged.height !== size * 2) throw Error('Expected a 2× roster pose');
      const visible = enlarged.getContext('2d').getImageData(0, 0, enlarged.width, enlarged.height).data;
      for (let y = 0; y < enlarged.height; y++) {
        for (let x = 0; x < enlarged.width; x++) {
          const i = (Math.floor(y / 2) * size + Math.floor(x / 2)) * 4;
          const target = (y * enlarged.width + x) * 4;
          if (home.subarray(i, i + 4).some((value, channel) => value !== visible[target + channel])) {
            throw Error('Wrong isolated sprite or zoom for ' + pose);
          }
        }
      }
    }
    if (uniquePoses.size !== poseColumns.length) throw Error('A roster pose duplicates another source sprite');
    return alternateKits;
  }, { atlasPng, authoringPng, poseColumns, kitPairs });
  await roster.screenshot({ path: resolve(captures, 'west-bay-six-roster.png') });
  await summary.press('Enter');
  await roster.waitFor({ state: 'hidden' });
  return alternateKits;
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
  assert.equal(await select.inputValue(), 'b');
  await page.getByText('9 of 12 occupied', { exact: true }).waitFor();
  assert.equal(new Set(poseColumns).size, 10);
  assert.equal(new Set(poseColumns.map(id => id.slice(id.indexOf('-') + 1))).size, 8);
  assert.deepEqual(posesManifest.slice(-4), newPoses);
  const newSupportersInB = studies[1].seats
    .filter(({ pose }) => newPoses.some(({ id }) => id === pose))
    .map(({ pose }) => pose.split('-')[1]);
  assert.ok(new Set(newSupportersInB).size >= 2, 'The preferred view seats at least two distinct new supporters');
  assert.ok(studies.some(({ seats }) => seats.some(({ pose }) => pose === 'standing-bell')),
    'At least one view displays the new standing supporter');
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
  const alternateKits = await verifyFullRoster(page);

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
  const fullPlan = new Map(studies[0].seats.map(seat => [seatKey(seat), seat]));
  const fullRows = Map.groupBy(fullPlan.values(), seat => seat.plankId);
  for (const row of fullRows.values()) row.sort((a, b) => a.slot.y - b.slot.y);
  const fullPosesWithBothKits = poseColumns.filter(pose =>
    [true, false].every(neutral => studies[0].seats.some(seat => seat.pose === pose && seat.neutral === neutral)));
  assert.equal(fullPlan.size, 12);
  assert.equal(fullPlan.size, studies[0].capacity);
  assert.ok(fullPosesWithBothKits.length > 0, 'One pose appears in both kits so the inspector exercises the kit axis');
  assert.ok(fullPosesWithBothKits.every(pose => alternateKits.includes(pose)), 'Both kit choices have visibly distinct colors');
  let previousLocations = new Set(fullPlan.keys());
  for (const [index, { id, label, seats, spacing, capacity }] of studies.entries()) {
    const percentage = [100, 75, 50][index];
    assert.equal(capacity, fullPlan.size);
    assert.equal(seats.length * 100, capacity * percentage);
    assert.ok(label.includes(percentage + '%'));
    const locations = new Set(seats.map(seatKey));
    assert.equal(locations.size, seats.length);
    assert.ok([...locations].every(location => previousLocations.has(location)), id + ' is a subset of the prior study');
    previousLocations = locations;
    const vacant = [...fullPlan.values()].filter(seat => !locations.has(seatKey(seat)));
    const standing = seats.filter(seat => seat.stance === 'standing');
    if (id === 'a') {
      assert.equal(standing.length, 0, 'A fills every seat, so the bell ringer sits');
      assert.ok(seats.some(({ pose }) => pose === 'seated-bell'));
    } else {
      assert.ok(standing.some(({ pose }) => pose === 'standing-bell'), id + ' includes the standing bell ringer');
    }
    const seatsByPlank = new Map();
    for (const seat of seats) {
      const planned = fullPlan.get(seatKey(seat));
      assert.ok(planned, id + ' uses a fixed slot from A');
      assert.equal(seat.neutral, planned.neutral, id + ' preserves its kit');
      if (seat.stance === 'standing') {
        assert.equal(planned.pose, seat.pose.replace(/^standing-/, 'seated-'), id + ' preserves supporter identity across stances');
        const row = fullRows.get(seat.plankId);
        const north = row[row.indexOf(planned) - 1];
        assert.ok(north, id + ' has a physical seat north of ' + seatKey(seat));
        assert.ok(!locations.has(seatKey(north)), id + ' leaves the immediately north seat ' + seatKey(north) + ' vacant');
      } else {
        assert.deepEqual(seat, planned, id + ' preserves the seated pose at ' + seatKey(seat));
      }
      assert.equal(typeof seat.neutral, 'boolean');
      const row = seatsByPlank.get(seat.plankId) ?? [];
      row.push(seat);
      seatsByPlank.set(seat.plankId, row);
    }
    assert.equal(seatsByPlank.size, 3, id + ' uses three planks');
    if (id === 'b') assert.ok([...seatsByPlank.values()].every(row => row.length === 3), '75% fills three seats per plank');
    const nativeGaps = [...seatsByPlank.entries()].flatMap(([plankId, row]) => {
      row.sort((a, b) => a.y - b.y);
      return row.slice(1).map((seat, index) => {
        const previous = row[index];
        assert.notEqual(seat.pose, previous.pose, id + ' repeats an adjacent pose on plank ' + plankId);
        return seat.y - previous.y;
      });
    });
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
    const disclosure = review.getByText('Inspect full poses', { exact: true });
    assert.equal(await disclosure.evaluate(summary => summary.parentElement.open), false, id + ' starts with its pose inspection closed');
    await review.screenshot({ path: resolve(captures, 'west-bay-six-' + id + '.png') });

    await disclosure.press('Enter');
    const poses = review.getByRole('list', { name: 'Supporters in bay order' });
    await poses.waitFor();
    assert.deepEqual(await poses.locator('figcaption').allTextContents(), seats.map(caption));
    assert.ok(await review.getByText(`${seats.length} of ${capacity} occupied`, { exact: true }).isVisible());
    const spacingLabel = spacing.min === spacing.max ? String(spacing.min) : `${spacing.min}–${spacing.max}`;
    assert.ok(await review.getByText(spacingLabel + ' px spacing along planks', { exact: false }).isVisible());
    for (const { pose, stance, origin, knee, otherSole, plankId, x, y } of seats) {
      const local = landmarks[pose];
      if (stance === 'standing') {
        assert.equal(local.behindSeat, undefined, pose + ' has no seated occlusion');
      } else {
        assert.ok(local.behindSeat?.length > 0, pose + ' defines its occluded calf region');
      }
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
    const revealsTimber = await poses.evaluate(async (list, {
      atlasPng, crowdPng, mask, withoutRail, seats, landmarks, bay, bayPlanks, poseCount,
    }) => {
      const size = 48;
      const factor = 2;
      async function decode(src) {
        const img = new Image();
        img.src = src;
        await img.decode();
        return img;
      }
      function surface(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas.getContext('2d');
      }
      const [atlas, crowd, seatingMask, cleanBay] = await Promise.all([
        ...[atlasPng, crowdPng, mask].map(bytes => decode('data:image/png;base64,' + bytes)),
        decode(withoutRail),
      ]);
      if (atlas.width !== size * poseCount || atlas.height !== size * 2) throw Error('Expected home and neutral pose rows');
      const source = surface(atlas.width, atlas.height);
      source.drawImage(atlas, 0, 0);
      const assembled = surface(bay.width, bay.height);
      const unoccluded = surface(bay.width, bay.height);
      const maskRegion = surface(bay.width, bay.height);
      maskRegion.drawImage(seatingMask, bay.x, bay.y, bay.width, bay.height, 0, 0, bay.width, bay.height);
      const seatingIds = maskRegion.getImageData(0, 0, bay.width, bay.height).data;
      const tile = surface(size, size);
      const contains = (rects, x, y) => rects.some(([left, top, width, height]) =>
        x >= left && x < left + width && y >= top && y < top + height);
      const canvases = list.querySelectorAll('canvas');
      if (canvases.length !== seats.length) throw Error('Missing isolated pose');
      for (const [index, { pose, plankId, origin, column, neutral }] of seats.entries()) {
        const x = column * size;
        const row = neutral ? size : 0;
        const cell = source.getImageData(x, row, size, size);
        const native = cell.data;
        const zoom = canvases[index];
        if (zoom.width !== size * factor || zoom.height !== size * factor) throw Error('Expected a 2× isolated pose');
        const pixels = zoom.getContext('2d').getImageData(0, 0, zoom.width, zoom.height).data;
        for (let y = 0; y < zoom.height; y++) {
          for (let x = 0; x < zoom.width; x++) {
            const sample = (Math.floor(y / factor) * size + Math.floor(x / factor)) * 4;
            const target = (y * zoom.width + x) * 4;
            if (native.subarray(sample, sample + 4).some((value, channel) => value !== pixels[target + channel])) {
              throw Error('Isolated pose ' + index + ' differs from its full ' + (neutral ? 'neutral' : 'home') + ' kit');
            }
          }
        }
        if (!native.some((channel, index) => index % 4 === 3 && channel > 0)) throw Error('Empty isolated pose');
        unoccluded.drawImage(atlas, x, row, size, size, origin.x, origin.y, size, size);

        const eligible = landmarks[pose].behindSeat ?? [];
        const support = bayPlanks.find(({ id }) => id === plankId).rects;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const pixel = (y * size + x) * 4;
            if (!native[pixel + 3] || !contains(eligible, x, y)) continue;
            const bx = origin.x + x, by = origin.y + y;
            if (bx < 0 || by < 0 || bx >= bay.width || by >= bay.height) continue;
            if (seatingIds[(by * bay.width + bx) * 4] === bay.id && contains(support, bx, by)) {
              native.fill(0, pixel, pixel + 4);
            }
          }
        }
        tile.putImageData(cell, 0, 0);
        assembled.drawImage(tile.canvas, origin.x, origin.y);
      }
      const expected = surface(bay.width, bay.height);
      expected.drawImage(crowd, 0, 0);
      if (assembled.canvas.toDataURL() !== expected.canvas.toDataURL()) {
        throw Error('Occluded pose recomposition differs from the assembled bay crowd');
      }
      const barePixels = unoccluded.getImageData(0, 0, bay.width, bay.height).data;
      const coveredPixels = assembled.getImageData(0, 0, bay.width, bay.height).data;
      const clean = surface(bay.width, bay.height);
      clean.drawImage(cleanBay, 0, 0);
      const cleanPixels = clean.getImageData(0, 0, bay.width, bay.height).data;
      for (let offset = 0; offset < barePixels.length; offset += 4) {
        if (barePixels[offset + 3] && !coveredPixels[offset + 3] &&
          barePixels.subarray(offset, offset + 3).some((value, channel) => value !== cleanPixels[offset + channel])) return true;
      }
      return false;
    }, { atlasPng, crowdPng, mask, withoutRail: expectedBay.withoutRail,
      seats: seats.map(seat => ({ ...seat, column: poseColumns.indexOf(seat.pose) })), landmarks, bay, bayPlanks,
      poseCount: poseColumns.length });
    await review.getByRole('heading', { name: 'West bay 6' }).click();
    await review.screenshot({ path: resolve(captures, 'west-bay-six-' + id + '-poses.png') });

    await rail.uncheck();
    assert.equal(await markers.isChecked(), false);
    assert.equal(await benches.isChecked(), false);
    // Transparent pixels in this reference show the original stadium below the crowd.
    assert.equal(await bayDraw(), expectedBay.withoutRail, id + ' renders the clean composite pixel for pixel');
    assert.ok(revealsTimber, id + ' visibly exposes timber where opaque calves were occluded');
    await review.screenshot({ path: resolve(captures, 'west-bay-six-' + id + '-occlusion.png') });
    await benches.check();
    assert.equal(await bayDraw(), expectedBenchedBay.withoutRail, id + ' bench colors sit under the crowd');
    await rail.check();
    assert.equal(await bayDraw(), expectedBenchedBay.withRail, id + ' bench colors sit under the foreground rail');
    await markers.check();
    assert.ok(await review.getByText('mark hip or boot contact.', { exact: false }).isVisible());
    assert.equal(await review.getByText('mark vacant seats.', { exact: false }).isVisible(), vacant.length > 0);
    assert.equal(await canvas.evaluate((c, { bay, seats, vacant }) => {
      const context = c.getContext('2d');
      const color = ({ x, y }) => context.getImageData(bay.x + x, bay.y + y, 1, 1).data.join(',');
      const vacantMark = ({ x, y }) => color({ x: x - 1, y: y - 1 }) === '212,205,193,255';
      return seats.every(seat => color(seat) === '128,245,255,255' &&
        (!seat.knee || color(seat.knee) === '255,225,123,255') &&
        (!seat.otherSole || color(seat.otherSole) === '128,245,255,255') && !vacantMark(seat.slot)) &&
        vacant.every(({ slot }) => vacantMark(slot));
    }, { bay, seats, vacant }), true, id + ' marks occupied contacts and vacant locations above the bench and rail layers');
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
  assert.equal(await select.inputValue(), 'b');
  await page.setViewportSize({ width: 360, height: 800 });
  await benches.check();
  await benchKey.waitFor();
  await page.getByText('Inspect full poses', { exact: true }).click();
  await page.getByText('Inspect all 10 poses', { exact: true }).click();
  assert.equal(await page.locator('.bay-six-zoom').evaluate(element =>
    element.scrollWidth > element.clientWidth && document.documentElement.scrollWidth === window.innerWidth), true);
  console.log('Bay 6 default, standing clearance, fixed slots, exact poses and crops, calf occlusion, rail and guides passed.');
} finally {
  await browser?.close();await server.close();
}
