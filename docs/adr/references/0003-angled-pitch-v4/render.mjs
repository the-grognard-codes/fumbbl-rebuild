// Run from any directory: node docs/adr/references/0003-angled-pitch-v4/render.mjs
// Uses the browser-client's existing Playwright installation and local Chrome.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(new URL('../../../../browser-client/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('.', import.meta.url));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = pathToFileURL(path.join(root, 'viewer.html'));
await page.goto(`${url}?capture=1`);
await page.evaluate(() => window.pitchReferenceReady);
const scene = await page.evaluate(() => window.pitchReferenceScene);
const followUpOnly = process.argv.includes('--follow-up');
const views = scene.views.filter(view => !followUpOnly || [30, 50].includes(view.elevation));
assert.equal(scene.length, 26);
assert.equal(scene.width, 15);
assert.equal(scene.players.length, 22);
assert.equal(new Set(scene.players.map(p => p.id)).size, 22);
assert.equal(new Set(scene.players.map(p => `${p.x},${p.y}`)).size, 22);
for (const team of ['home', 'away']) {
  const players = scene.players.filter(p => p.team === team);
  assert.equal(players.length, 11);
  assert.equal(new Set(players.map(p => p.number)).size, 11);
}
const captures = [];
const cameraChecks = [];
await mkdir(path.join(root, 'full-pitch'), { recursive: true });

try {
  for (const view of views) for (const framing of ['play', 'full']) {
    await page.goto(`${url}?capture=1&view=${view.id}&framing=${framing}`);
    await page.evaluate(() => window.pitchReferenceReady);
    const checks = await page.evaluate(() => {
      const api = window.pitchReference;
      const cells = [...document.querySelectorAll('.square')];
      const problems = [];
      let maximumAnchorError = 0;
      const spriteExtents = [];
      // Independent check from source alpha bounds: overhead artwork center or
      // perspective feet must meet the actual polygon's diagonal intersection.
      function diagonalIntersection(points) {
        const [a, b, c, d] = points;
        const rx = c.x - a.x, ry = c.y - a.y, sx = d.x - b.x, sy = d.y - b.y;
        const t = ((b.x - a.x) * sy - (b.y - a.y) * sx) / (rx * sy - ry * sx);
        return { x: a.x + t * rx, y: a.y + t * ry };
      }
      for (const actor of api.anchors) {
        const cell = cells.find(c => Number(c.dataset.x) === actor.square.x && Number(c.dataset.y) === actor.square.y);
        const center = diagonalIntersection([...cell.points].map(p => ({ x: p.x, y: p.y })));
        const node = [...document.querySelectorAll('#occupants > g')].find(g => g.dataset.id === actor.id);
        const img = node.querySelector('image');
        const asset = window.pitchReferenceSprites.players.find(a => a.id === actor.asset);
        const scale = Number(img.dataset.spriteScale);
        const bounds = { top: Number(img.getAttribute('y')) + asset.bounds.y * scale,
          bottom: Number(img.getAttribute('y')) + (asset.bounds.y + asset.bounds.height) * scale,
          left: Number(img.getAttribute('x')) + asset.bounds.x * scale,
          right: Number(img.getAttribute('x')) + (asset.bounds.x + asset.bounds.width) * scale };
        const anchorX = api.camera.perspective ? Number(img.getAttribute('x')) + asset.anchorX * scale : (bounds.left + bounds.right) / 2;
        const anchorY = api.camera.perspective ? bounds.bottom : (bounds.top + bounds.bottom) / 2;
        const error = Math.hypot(anchorX - center.x, anchorY - center.y);
        spriteExtents.push(bounds);
        maximumAnchorError = Math.max(maximumAnchorError, error);
        // SVGPointList stores float32, while DOM image attributes preserve doubles.
        if (error > 0.001) problems.push(`${actor.id}: anchor error ${error}`);
      }
      const coordinates = cells.map(c => `${c.dataset.x},${c.dataset.y}`);
      const zones = { 'end-zone': 0, wide: 0, central: 0 };
      for (const cell of cells) zones[cell.dataset.zone]++;
      const allPoints = cells.flatMap(c => [...c.points].map(p => ({ x: p.x, y: p.y })));
      const extent = { left: Math.min(...allPoints.map(p => p.x)), right: Math.max(...allPoints.map(p => p.x)),
        top: Math.min(...allPoints.map(p => p.y)), bottom: Math.max(...allPoints.map(p => p.y)) };
      let maximumRoundTripError = 0;
      // Both coach ends and pan extremes, including every square center and all pitch corners.
      for (const end of ['home', 'away']) for (const focus of [0, 6.5, 13, 19.5, 26]) {
        const camera = api.cameraFor({ ...api.camera, end }, 'play', focus);
        const worldPoints = [[0, 0], [26, 0], [26, 15], [0, 15]];
        for (let x = 0; x < 26; x++) for (let y = 0; y < 15; y++) worldPoints.push([x + 0.5, y + 0.5]);
        for (const [x, y] of worldPoints) {
          const screen = api.projectWith(x, y, camera);
          const world = api.unprojectWith(screen.x, screen.y, camera);
          maximumRoundTripError = Math.max(maximumRoundTripError, Math.hypot(x - world.x, y - world.y));
        }
      }
      const home = api.cameraFor({ ...api.camera, end: 'home' }, 'play', 13);
      const away = api.cameraFor({ ...api.camera, end: 'away' }, 'play', 13);
      const firstHome = api.projectWith(0.5, 0.5, home), lastHome = api.projectWith(25.5, 14.5, home);
      const firstAway = api.projectWith(0.5, 0.5, away), lastAway = api.projectWith(25.5, 14.5, away);
      const scaleRatios = [];
      for (const x of [0.5, 13, 25.5]) {
        const p = api.projectWith(x, 7, home), q = api.projectWith(x, 8, home);
        scaleRatios.push(Math.hypot(q.x - p.x, q.y - p.y));
      }
      return { problems, count: cells.length, coordinates, zones, extent, spriteExtents, maximumAnchorError, maximumRoundTripError,
        orientation: { firstHome, lastHome, firstAway, lastAway }, scaleRatios, exported: api.export() };
    });
    assert.equal(checks.count, 390, `${view.id}: cell count`);
    assert.equal(new Set(checks.coordinates).size, 390);
    for (let x = 0; x < 26; x++) for (let y = 0; y < 15; y++) assert.ok(checks.coordinates.includes(`${x},${y}`));
    assert.deepEqual(checks.zones, { 'end-zone': 30, wide: 192, central: 168 });
    assert.deepEqual(checks.problems, []);
    assert.ok(checks.maximumRoundTripError < 1e-10);
    if (view.yaw === 0) {
      const { firstHome, lastHome, firstAway, lastAway } = checks.orientation;
      assert.ok(firstHome.x < lastHome.x && firstHome.y > lastHome.y);
      assert.ok(firstAway.x > lastAway.x && firstAway.y < lastAway.y);
    }
    if (!view.perspective) assert.ok(Math.max(...checks.scaleRatios) - Math.min(...checks.scaleRatios) < 1e-10);
    if (framing === 'full') {
      assert.ok(checks.extent.top >= 140 && checks.extent.bottom <= 745);
      assert.ok(checks.extent.left >= 0 && checks.extent.right <= 1672);
    }
    for (const bounds of checks.spriteExtents) {
      assert.ok(bounds.top >= 115 && bounds.bottom <= 750, `${view.id}: standing player under the HUD`);
      assert.ok(bounds.left >= 0 && bounds.right <= 1672, `${view.id}: standing player cropped horizontally`);
    }
    const image = `${framing === 'full' ? 'full-pitch/' : ''}${view.id}.png`;
    await page.locator('#stage').screenshot({ path: path.join(root, image) });
    captures.push({ ...checks.exported, image, validation: { cells: checks.count, zones: checks.zones,
      maximumAnchorErrorPixels: checks.maximumAnchorError, maximumRoundTripErrorSquares: checks.maximumRoundTripError,
      extent: checks.extent } });
    console.log(`${image}: 390 cells, 22 centered players`);
  }
  await mkdir(path.join(root, 'pan'), { recursive: true });
  for (const view of views) {
    await page.goto(`${url}?capture=1&view=${view.id}`);
    await page.evaluate(() => window.pitchReferenceReady);
    const baseline = await page.evaluate(() => ({ camera: window.pitchReference.export().camera,
      hud: document.getElementById('hud').getBoundingClientRect().toJSON() }));
    for (const focus of [0, 6.5, 13, 19.5, 26]) {
      await page.locator('#pan').evaluate((node,value) => { node.value=value; node.dispatchEvent(new Event('input',{bubbles:true})); },focus);
      await page.evaluate(() => window.pitchReferenceReady);
      const checks = await page.evaluate(() => {
        const api=window.pitchReference,c=api.camera;
        const relativeWidths=[-3,0,3,6].map(along => {
          const x=c.focus+c.orientation*along;
          const a=api.project(x,7),b=api.project(x,8);
          return Math.abs(b.x-a.x);
        });
        function intersect(a,b,c,d) {
          const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y;
          const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/(rx*sy-ry*sx);
          return {x:a.x+t*rx,y:a.y+t*ry};
        }
        const expectedVP=api.export().camera.vanishingPoint;
        const vp=c.perspective?intersect(api.project(8,0),api.project(18,0),api.project(8,-1.5),api.project(18,-1.5)):null;
        let parallelEdgeError=0,squareShapeError=0;
        if(!c.perspective) {
          const a=api.project(8,0),b=api.project(18,0),d=api.project(8,-1.5),e=api.project(18,-1.5);
          parallelEdgeError=Math.abs((b.x-a.x)*(e.y-d.y)-(b.y-a.y)*(e.x-d.x));
          for(const cell of document.querySelectorAll('.square')) {
            const [a,b,c,d]=[...cell.points];
            squareShapeError=Math.max(squareShapeError,Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-Math.hypot(c.x-b.x,c.y-b.y)));
          }
        }
        const plates=[...document.querySelectorAll('.stadium-plate')];
        const plate=plates.find(n=>Number(n.dataset.worldOffset)===0)||plates[0];
        const offset=Number(plate.dataset.worldOffset);
        const samples=[[140,170],[835,530],[1510,400]].map(([x,y])=>{
          // Measure an actual transformed DOM point. CSS matrix serialization rounds
          // coefficients and cannot serve as subpixel rendering evidence.
          const probe=document.createElement('span');
          Object.assign(probe.style,{position:'absolute',left:x+'px',top:y+'px',width:'0',height:'0'});
          plate.append(probe);const bounds=probe.getBoundingClientRect();probe.remove();
          const actual={x:bounds.x,y:bounds.y};
          const expected=api.sceneryRegistration(x,y,offset,c);
          return {source:{x,y,plateOffset:offset},world:expected.world,screen:actual,error:Math.hypot(actual.x-expected.screen.x,actual.y-expected.screen.y)};
        });
        let anchorError=0;
        for(const actor of api.anchors) {
          const img=document.querySelector(`[data-id="${actor.id}"] image`);
          const asset=window.pitchReferenceSprites.players.find(a=>a.id===actor.asset),s=Number(img.dataset.spriteScale);
          const anchor={x:Number(img.getAttribute('x'))+(c.perspective?asset.anchorX:asset.bounds.x+asset.bounds.width/2)*s,
            y:Number(img.getAttribute('y'))+(asset.bounds.y+asset.bounds.height*(c.perspective?1:0.5))*s};
          const expected=api.project(actor.square.x+0.5,actor.square.y+0.5);
          anchorError=Math.max(anchorError,Math.hypot(anchor.x-expected.x,anchor.y-expected.y));
        }
        const near=api.unproject(c.cx,750),far=api.unproject(c.cx,115);
        const clippedLength=Math.max(0,Math.min(26,Math.max(near.x,far.x))-Math.max(0,Math.min(near.x,far.x)));
        return { camera:api.export().camera,relativeWidths,vanishingPointError:c.perspective?Math.hypot(vp.x-expectedVP.x,vp.y-expectedVP.y):0,
          parallelEdgeError,squareShapeError,trackedPlayerCenter:api.anchors.find(a=>a.id==='home-3').screenCenter,
          samples,anchorError,clippedLength,cells:document.querySelectorAll('.square').length,players:api.anchors.length,
          allGeometryFinite:[...document.querySelectorAll('.square')].every(n=>[...n.points].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))),
          hud:document.getElementById('hud').getBoundingClientRect().toJSON() };
      });
      assert.deepEqual(checks.hud,baseline.hud);
      for(const key of ['height','focalPixels','scale','elevation','distance']) assert.equal(checks.camera[key],baseline.camera[key],`${view.id}: fixed ${key}`);
      assert.deepEqual(checks.camera.vanishingPoint,baseline.camera.vanishingPoint);
      assert.equal(checks.cells,390);assert.equal(checks.players,22);assert.ok(checks.allGeometryFinite);
      assert.ok(checks.anchorError<0.001);assert.ok(checks.vanishingPointError<1e-6);
      if(!view.perspective) {
        assert.equal(checks.camera.vanishingPoint,null);assert.ok(checks.parallelEdgeError<1e-10);
        assert.ok(checks.squareShapeError<0.001);
        assert.ok(Math.max(...checks.relativeWidths)-Math.min(...checks.relativeWidths)<1e-10);
      }
      assert.ok(checks.samples.every(s=>s.error<0.02),'CSS projective plate must match the ground camera');
      if(cameraChecks.some(p=>p.view===view.id)) {
        const first=cameraChecks.find(p=>p.view===view.id);
        checks.relativeWidths.forEach((w,i)=>assert.ok(Math.abs(w-first.relativeWidths[i])<1e-9));
        if(focus===13)assert.ok(Math.abs(checks.trackedPlayerCenter.y-first.trackedPlayerCenter.y)>10,'The world must move with camera travel');
      }
      cameraChecks.push({view:view.id,focus,camera:checks.camera,relativeWidths:checks.relativeWidths,
        canonicalVisibleLength:checks.clippedLength,vanishingPointErrorPixels:checks.vanishingPointError,
        parallelEdgeError:checks.parallelEdgeError,squareShapeErrorPixels:checks.squareShapeError,trackedPlayerCenter:checks.trackedPlayerCenter,
        sceneryRegistration:checks.samples,anchorErrorPixels:checks.anchorError,hudFixed:true,cells:390,players:22});
      if(view.elevation===40&&(focus===0||focus===26)) {
        const ownEnd=view.end==='home'?0:26;
        await page.locator('#stage').screenshot({path:path.join(root,`pan/${view.id}-${focus===ownEnd?'near':'far'}.png`)});
      }
    }
    console.log(`${view.id}: ${view.perspective?'fixed lens/height, shared vanishing point':'square cells, parallel edges, no vanishing point'}, consistent scale, moving stadium, fixed HUD`);
  }
  if (followUpOnly) {
    assert.deepEqual(errors, []);
    await writeFile(path.join(root, 'geometry-follow-up.json'), `${JSON.stringify({
      pitch: { length: 26, width: 15, squares: 390 }, fixture: scene.players, captures, cameraChecks
    }, null, 2)}\n`);
  } else {
  await mkdir(path.join(root, 'hover'), { recursive: true });
  await page.goto(`${url}?capture=1&view=perspective-40-home`);
  await page.evaluate(() => window.pitchReferenceReady);
  assert.equal(await page.locator('#player-card').isVisible(), false);
  await page.locator('#occupants [data-player-id="home-3"] image').hover();
  assert.equal(await page.locator('#player-card').isVisible(), true);
  assert.equal(await page.locator('#player-card').getAttribute('data-player-id'), 'home-3');
  assert.equal(await page.locator('#player-card-art').isVisible(), true);
  assert.equal(await page.locator('#generic-player-summary').isVisible(), false);
  await page.locator('#stage').screenshot({ path: path.join(root, 'hover/player-card.png') });
  await page.locator('#occupants [data-player-id="away-11"] image').hover();
  assert.equal(await page.locator('#player-card').getAttribute('data-player-id'), 'away-11');
  assert.equal(await page.locator('#player-card-art').isVisible(), false);
  assert.equal(await page.locator('#generic-player-summary').isVisible(), true);
  await page.locator('#player-summary-sprite').evaluate(image => image.decode());
  await page.locator('#stage').screenshot({ path: path.join(root, 'hover/other-player.png') });
  await page.locator('#home-resources .resource').first().hover();
  assert.equal(await page.locator('#resource-tooltip').isVisible(), true);
  assert.equal(await page.locator('#resource-tooltip').innerText(), 'Rerolls: 3');
  await page.locator('#stage').screenshot({ path: path.join(root, 'hover/resource-tooltip.png') });
  await mkdir(path.join(root, 'hud'), { recursive: true });
  await page.goto(`${url}?capture=1&view=perspective-40-home`);
  await page.evaluate(() => window.pitchReferenceReady);
  for (const period of [2, 3]) {
    await page.selectOption('#turn-period', String(period), { force: true });
    await page.locator('#stage').screenshot({ path: path.join(root, `hud/turns-${period === 2 ? '9-16' : '17-24'}.png`) });
  }
  await page.selectOption('#turn-period', '1', { force: true });
  await page.locator('#toggle-other').click();
  await page.locator('#stage').screenshot({ path: path.join(root, 'hud/other-actions.png') });
  assert.deepEqual(errors, []);
  await writeFile(path.join(root, 'geometry.json'), `${JSON.stringify({
    pitch: { length: 26, width: 15, squares: 390, endZoneRows: [0, 25], midfieldBoundary: 13, wideZoneBoundaries: [4, 11] },
    fixture: scene.players, captures, cameraChecks
  }, null, 2)}\n`);
  }
} finally {
  await browser.close();
}
