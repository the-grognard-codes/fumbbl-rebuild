import assert from 'node:assert/strict';
import test from 'node:test';
import { PitchProjection, PITCH_LENGTH, PITCH_WIDTH } from '../src/pitch-projection.ts';
import type { PitchEnd, PitchProjectionMode } from '../src/pitch-projection.ts';

const close = (actual: number, expected: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const ends: PitchEnd[] = ['home', 'away'];
const modes: PitchProjectionMode[] = ['perspective', 'top-down'];

test('production camera matches the independently captured approved 40-degree geometry', () => {
  const camera = new PitchProjection({ width: 1672, height: 941 });
  close(camera.scale, 66.3911213608501);
  close(camera.distance, 20.80721979332643);
  assert.deepEqual(camera.center, { x: 836, y: 445 });
  close(camera.project({ x: 9.5, y: 7.5 })!.y, 616.457341291825);
  close(camera.project({ x: 16.5, y: 11.5 })!.x, 1071.2507798832);
  close(camera.vanishingPoint!.y, -714.1445270775755);
});

test('every canonical center and corner round trips at both ends, modes, pan extremes and viewport sizes', () => {
  assert.equal(PITCH_LENGTH * PITCH_WIDTH, 390);
  for (const end of ends) for (const mode of modes) for (const focus of [0, 3.5, 13, 22.5, 26])
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1920, height: 900 }, { width: 1920, height: 820 },
      { width: 1280, height: 660 }, { width: 375, height: 660 }])
      for (const zoom of [1, 2]) {
        const camera = new PitchProjection({ ...viewport, end, mode, focus, zoom });
        for (let x = 0; x <= 26; x++) for (let y = 0; y <= 15; y++)
          for (const point of [{ x, y }, ...(x < 26 && y < 15 ? [{ x: x + 0.5, y: y + 0.5 }] : [])]) {
            const screen = camera.project(point);
            assert.ok(screen, JSON.stringify({ end, mode, focus, point }));
            const restored = camera.unproject(screen);
            assert.ok(restored);
            close(restored.x, point.x); close(restored.y, point.y);
            if (point.x % 1 && point.y % 1 && camera.isVisible(point))
              assert.deepEqual(camera.cellAt(screen), { x, y });
          }
      }
});

test('touchlines and finite end zones reject outside intents and use the same boundary ownership in either view', () => {
  for (const end of ends) for (const mode of modes) {
    const camera = new PitchProjection({ width: 1280, height: 660, end, mode, focus: 0.5 });
    for (const point of [{ x: 0, y: 7 }, { x: 1, y: 4 }, { x: 1, y: 11 }]) {
      const focused = camera.reveal(point, 0);
      assert.deepEqual(focused.cellAt(focused.project(point)!), point);
    }
    for (const point of [{ x: -0.1, y: 7 }, { x: 26, y: 7 }, { x: 13, y: -0.1 }, { x: 13, y: 15 }]) {
      const focused = camera.with({ focus: Math.max(0, Math.min(26, point.x)) });
      assert.equal(focused.cellAt(focused.project(point)!), null);
    }
    assert.equal(camera.cellAt({ x: -1, y: 200 }), null);
    assert.equal(camera.cellAt({ x: 1281, y: 200 }), null);
  }
});

test('CSS viewport offsets and scaling preserve the same canonical intent', () => {
  for (const end of ends) for (const mode of modes) for (const scale of [0.5, 1, 2]) {
    const camera = new PitchProjection({ width: 1280, height: 660, end, mode });
    const screen = camera.project({ x: 13.5, y: 7.5 })!;
    const bounds = { left: 170, top: 83, width: 1280 * scale, height: 660 * scale };
    const client = { x: bounds.left + screen.x * scale, y: bounds.top + screen.y * scale };
    assert.deepEqual(camera.cellAt(camera.fromClient(client, bounds)!), { x: 13, y: 7 });
    assert.equal(camera.fromClient(client, { ...bounds, width: 0 }), null);
  }
});

test('travel holds lens and square size at equal camera-relative distance instead of fitting remaining pitch', () => {
  for (const end of ends) for (const mode of modes) {
    const origin = new PitchProjection({ width: 1672, height: 941, end, mode, focus: 13 });
    for (const focus of [0, 5, 13, 21, 26]) {
      const camera = origin.with({ focus });
      assert.equal(camera.scale, origin.scale);
      assert.deepEqual(camera.vanishingPoint, origin.vanishingPoint);
      for (const offset of [-3, 0, 3, 7]) {
        const point = camera.project({ x: focus + offset, y: 8.5 })!;
        const reference = origin.project({ x: 13 + offset, y: 8.5 })!;
        close(point.x, reference.x); close(point.y, reference.y);
        close(point.pixelsPerSquare, reference.pixelsPerSquare);
      }
    }
  }
});

test('tactical cells are square and parallel while perspective rails share a vanishing point', () => {
  for (const end of ends) {
    const tactical = new PitchProjection({ width: 1672, height: 941, end, mode: 'top-down' });
    assert.equal(tactical.vanishingPoint, null);
    for (const x of [0, 12, 25]) {
      const [a, b, c, d] = tactical.square({ x, y: 7 });
      close(Math.hypot(a.x - b.x, a.y - b.y), Math.hypot(b.x - c.x, b.y - c.y));
      close(a.x, b.x); close(b.y, c.y); close(c.x, d.x); close(d.y, a.y);
    }
    const perspective = tactical.with({ mode: 'perspective' });
    for (const y of [0, 15, -1.5, 16.5]) {
      const a = perspective.project({ x: 5, y })!, b = perspective.project({ x: 21, y })!, v = perspective.vanishingPoint!;
      close((b.x - a.x) * (v.y - a.y) - (b.y - a.y) * (v.x - a.x), 0, 1e-6);
    }
    const toward = end === 'home' ? 1 : -1;
    assert.ok(perspective.project({ x: 13 - 4 * toward, y: 7.5 })!.pixelsPerSquare
      > perspective.project({ x: 13 + 4 * toward, y: 7.5 })!.pixelsPerSquare);
  }
});

test('near-plane and viewport clipping yield finite registered polygons and bounded visible cells', () => {
  for (const end of ends) for (const mode of modes) {
    const camera = new PitchProjection({ width: 1280, height: 660, end, mode });
    const scenery = camera.polygon([{ x: -100, y: -10 }, { x: 100, y: -10 }, { x: 100, y: 25 }, { x: -100, y: 25 }], true);
    assert.ok(scenery.length >= 3);
    for (const point of scenery) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= -1e-7 && point.x <= 1280 + 1e-7 && point.y >= -1e-7 && point.y <= 660 + 1e-7);
    }
    const cells = camera.visibleCells(), bounds = camera.visibleBounds()!;
    assert.ok(cells.length > 0 && cells.length < 390);
    assert.equal(new Set(cells.map(p => `${p.x},${p.y}`)).size, cells.length);
    assert.ok(bounds.minX >= 0 && bounds.maxX <= 25 && bounds.minY >= 0 && bounds.maxY <= 14);
    assert.deepEqual(camera.square({ x: 26, y: 7 }), []);
    assert.deepEqual(camera.polygon([{ x: NaN, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }]), []);
  }
  const camera = new PitchProjection({ width: 1280, height: 660 });
  assert.equal(camera.project({ x: -100, y: 7.5 }), null);
  assert.equal(camera.unproject(camera.vanishingPoint!), null);
  assert.equal(camera.unproject({ x: 640, y: camera.vanishingPoint!.y - 1 }), null);
});

test('navigation and travel follow the camera and reveal offscreen targets including detail zoom', () => {
  for (const end of ends) for (const mode of modes) {
    const camera = new PitchProjection({ width: 1280, height: 660, end, mode });
    const up = camera.neighbor({ x: 13, y: 7 }, 'up'), right = camera.neighbor({ x: 13, y: 7 }, 'right');
    assert.ok(camera.project({ x: up.x + 0.5, y: 7.5 })!.y < camera.project({ x: 13.5, y: 7.5 })!.y);
    assert.ok(camera.project({ x: 13.5, y: right.y + 0.5 })!.x > camera.project({ x: 13.5, y: 7.5 })!.x);
    assert.equal(camera.travel(2).focus, end === 'home' ? 15 : 11);
    for (const point of [{ x: 0.5, y: 0.5 }, { x: 25.5, y: 14.5 }]) {
      const detailed = camera.with({ zoom: 3 });
      assert.ok(detailed.reveal(point).isVisible(point, 24));
    }
    const changed = camera.with({ mode: mode === 'perspective' ? 'top-down' : 'perspective' });
    assert.equal(changed.focus, camera.focus); assert.equal(changed.end, camera.end);
    assert.equal(changed.zoom, camera.zoom);
    assert.equal(camera.focus, 13);
  }
});

test('dragging translates the entire world and does not silently change the zoom', () => {
  const camera = new PitchProjection({ width: 1280, height: 660 });
  const dragged = camera.panPixels({ x: 40, y: 40 });
  assert.ok(dragged.focus > camera.focus);
  assert.equal(dragged.scale, camera.scale);
  assert.equal(dragged.transverseFocus, camera.transverseFocus);
  assert.equal(dragged.zoom, camera.zoom);
  const point = { x: camera.focus, y: camera.transverseFocus };
  assert.ok(dragged.project(point)!.y > camera.project(point)!.y);
});

test('invalid numbers cannot escape as screen geometry', () => {
  assert.throws(() => new PitchProjection({ width: 0, height: 660 }), RangeError);
  assert.throws(() => new PitchProjection({ width: 1280, height: Infinity }), RangeError);
  assert.throws(() => new PitchProjection({ width: 1280, height: 660, zoom: NaN }), RangeError);
  const camera = new PitchProjection({ width: 1280, height: 660 });
  for (const point of [{ x: NaN, y: 7 }, { x: 13, y: Infinity }]) {
    assert.equal(camera.project(point), null); assert.equal(camera.unproject(point), null); assert.equal(camera.cellAt(point), null);
  }
  assert.equal(camera.with({ mode: 'top-down' }).project({ x: 1e308, y: 1e308 }), null);
});

test('30 and 50 degree presets retain canonical targeting and fixed travel calibration at either coach end', () => {
  for (const end of ends) for (const perspectiveElevation of [30, 40, 50] as const) {
    const origin = new PitchProjection({ width: 1280, height: 660, end, perspectiveElevation });
    assert.equal(origin.elevation, perspectiveElevation);
    for (const focus of [0, 5, 13, 21, 26]) {
      const camera = origin.with({ focus });
      assert.equal(camera.elevation, perspectiveElevation);
      assert.equal(camera.scale, origin.scale);
      assert.deepEqual(camera.vanishingPoint, origin.vanishingPoint);
      for (let x = 0; x < 26; x++) for (let y = 0; y < 15; y++) {
        const point = { x: x + .5, y: y + .5 }, screen = camera.project(point);
        if (!screen) { assert.equal(camera.isVisible(point), false); continue; }
        const restored = camera.unproject(screen)!;
        close(restored.x, point.x); close(restored.y, point.y);
        if (camera.isVisible(point)) assert.deepEqual(camera.cellAt(screen), { x, y });
      }
      const tactical = camera.with({ mode: 'top-down' });
      assert.equal(tactical.elevation, 90);
      assert.equal(tactical.with({ mode: 'perspective' }).elevation, perspectiveElevation);
      assert.equal(tactical.focus, focus);
      assert.equal(tactical.end, end);
      assert.ok(camera.reveal({ x: .5, y: .5 }).isVisible({ x: .5, y: .5 }, 24));
      assert.ok(camera.reveal({ x: 25.5, y: 14.5 }).isVisible({ x: 25.5, y: 14.5 }, 24));
    }
  }
});

test('raised plane corners and sprite anchors share a world projection at every depth', () => {
  const matrix = [[0, 1/64, -5.5], [1/64, 0, -5.5], [0, 0, 1]];
  for (const end of ends) for (const mode of modes) for (const perspectiveElevation of [30,40,50] as const)
    for (const focus of [0,13,26]) for (const rise of [0,.3,1.2]) {
      const camera = new PitchProjection({width:1280,height:660,end,mode,focus,perspectiveElevation});
      const css = camera.planeImageTransform(matrix,rise).slice(9,-1).split(',').map(Number);
      for (const x of [0,400,1600]) for (const y of [0,600,2200]) {
        const point = camera.projectRaised({x:y/64-5.5,y:x/64-5.5},rise);
        if (!point) continue;
        const divisor = css[3]*x+css[7]*y+css[15];
        close((css[0]*x+css[4]*y+css[12])/divisor,point.x);
        close((css[1]*x+css[5]*y+css[13])/divisor,point.y);
      }
    }
});

test('registered source pixels share the production lens and remain clipped inside the viewport',()=>{
  const origin={x:10,y:3,z:1},across={x:0,y:.02,z:0},down={x:0,y:0,z:.015};
  const registration=[[1,0,0],[0,1,0],[0,0,1]];
  for(const end of ends)for(const mode of modes)for(const perspectiveElevation of [30,40,50] as const){
    const camera=new PitchProjection({width:1280,height:660,end,mode,perspectiveElevation,focus:10});
    const surface=camera.registeredSurfaceImage(300,200,registration,origin,across,down,{x0:0,y0:0,x1:300,y1:200});
    if(!surface){assert.equal(mode,'top-down','an edge-on upright plane is correctly omitted');continue;}
    const css=surface.transform.slice(9,-1).split(',').map(Number);
    for(const [x,y] of [[150,100],[50,50],[250,150]]) {
      const expected=camera.projectRaised({x:10,y:3+x*.02},1+y*.015)!;
      const u=x-surface.left,v=y-surface.top,d=css[3]*u+css[7]*v+css[15];
      close((css[0]*u+css[4]*v+css[12])/d,expected.x);
      close((css[1]*u+css[5]*v+css[13])/d,expected.y);
    }
  }
  const camera=new PitchProjection({width:1280,height:660});
  assert.throws(()=>camera.registeredSurfaceImage(0,10,registration,origin,across,down,{x0:0,y0:0,x1:2,y1:2}),RangeError);
  assert.throws(()=>camera.registeredSurfaceImage(10,10,registration,origin,across,down,{x0:NaN,y0:0,x1:2,y1:2}),RangeError);
});

test('affine and registered surfaces share viewport and near-plane clipping',()=>{
  const identity=[[1,0,0],[0,1,0],[0,0,1]];
  const origin={x:-100,y:-40,z:0},across={x:.2,y:0,z:0},down={x:0,y:.1,z:0};
  for(const end of ends)for(const mode of modes)for(const perspectiveElevation of [30,40,50] as const)for(const focus of [0,13,26]) {
    const camera=new PitchProjection({width:1280,height:660,end,mode,perspectiveElevation,focus});
    const affine=camera.surfaceImage(1000,1000,origin,across,down)!;
    const registered=camera.registeredSurfaceImage(1000,1000,identity,origin,across,down,{x0:0,y0:0,x1:1000,y1:1000})!;
    assert.deepEqual(registered,affine);
    assert.ok(registered.sourcePolygon.length>=3);
    assert.ok(registered.width<1000||registered.height<1000,'viewport clips the oversized source');
    const css=registered.transform.slice(9,-1).split(',').map(Number);
    for(const p of registered.sourcePolygon) {
      const u=p.x-registered.left,v=p.y-registered.top,d=css[3]*u+css[7]*v+css[15];
      const x=(css[0]*u+css[4]*v+css[12])/d,y=(css[1]*u+css[5]*v+css[13])/d;
      assert.ok(x>=-1e-6&&x<=1280+1e-6&&y>=-1e-6&&y<=660+1e-6);
    }
  }
});
