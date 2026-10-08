import assert from 'node:assert/strict';
import test from 'node:test';
import { PitchProjection } from '../src/pitch-projection.ts';

test('painted scenery homography registers every interior sample to the shared camera', () => {
  const source = [[0, -13.350726120762829, 22824.563196736133], [17.044276629673718, 4.301823272632846, -6422.851576615379], [0, .5735764363510462, 1043.4884914389131]];
  for (const end of ['home', 'away'] as const) for (const mode of ['perspective', 'top-down'] as const) for (const focus of [0, 13, 26]) {
    const camera = new PitchProjection({ width: 1280, height: 660, end, mode, focus, zoom: 1.5, transverseFocus: 6 });
    const matrix = camera.planeImageTransform(source).slice(9, -1).split(',').map(Number);
    for (const x of [0, 285, 836, 1387, 1672]) for (const y of [0, 300, 700, 941]) {
      const divisor = source[2][1] * y + source[2][2];
      const world = { x: (source[0][1] * y + source[0][2]) / divisor, y: (source[1][0] * x + source[1][1] * y + source[1][2]) / divisor };
      const expected = camera.project(world)!;
      const w = matrix[3] * x + matrix[7] * y + matrix[15];
      assert.ok(Math.abs((matrix[0] * x + matrix[4] * y + matrix[12]) / w - expected.x) < 1e-7);
      assert.ok(Math.abs((matrix[1] * x + matrix[5] * y + matrix[13]) / w - expected.y) < 1e-7);
    }
  }
  assert.throws(() => new PitchProjection({ width: 100, height: 100 }).planeImageTransform([[NaN]]), RangeError);
});

test('upright and ground modules use the same world lens at every viewing end and elevation',()=>{
  for(const end of ['home','away'] as const)for(const mode of ['perspective','top-down'] as const)
    for(const perspectiveElevation of [30,40,50] as const)for(const focus of [0,13,26])for(const zoom of [.5,1,3]){
      const camera=new PitchProjection({width:1280,height:660,end,mode,perspectiveElevation,focus,zoom});
      for(const [origin,across,down] of [
        [{x:focus-1,y:-2,z:1.8},{x:2/200,y:0,z:0},{x:0,y:0,z:-1/100}],
        [{x:focus+1,y:5,z:1.8},{x:0,y:2/200,z:0},{x:0,y:0,z:-1/100}],
        [{x:focus-1,y:6,z:.8},{x:2/200,y:0,z:0},{x:0,y:2/100,z:0}],
      ]){
        const surface=camera.surfaceImage(200,100,origin,across,down);
        if(!surface)continue;
        const matrix=surface.transform.slice(9,-1).split(',').map(Number);
        for(const [u,v] of [[surface.width*.25,surface.height*.25],[surface.width*.5,surface.height*.5]]){
          const sx=u+surface.left,sy=v+surface.top;
          const expected=camera.projectRaised({x:origin.x+across.x*sx+down.x*sy,y:origin.y+across.y*sx+down.y*sy},origin.z+across.z*sx+down.z*sy);
          if(!expected)continue;
          const w=matrix[3]*u+matrix[7]*v+matrix[15];
          assert.ok(Math.abs((matrix[0]*u+matrix[4]*v+matrix[12])/w-expected.x)<1e-7);
          assert.ok(Math.abs((matrix[1]*u+matrix[5]*v+matrix[13])/w-expected.y)<1e-7);
        }
      }
    }
});
test('world modules crossing the lens are clipped before their visible source pixels are projected',()=>{
  const camera=new PitchProjection({width:1280,height:660,focus:26,perspectiveElevation:30,zoom:3});
  const surface=camera.surfaceImage(200,100,{x:-15,y:6,z:0},{x:50/200,y:0,z:0},{x:0,y:3/100,z:0});
  assert.ok(surface);
  const matrix=surface.transform.slice(9,-1).split(',').map(Number);
  const vertices=[...surface.clipPath.matchAll(/([-\d.e+]+)% ([-\d.e+]+)%/g)].map(m=>[Number(m[1])*surface.width/100,Number(m[2])*surface.height/100]);
  assert.ok(vertices.length>=3);
  for(const [x,y] of vertices){
    const w=matrix[3]*x+matrix[7]*y+matrix[15],px=(matrix[0]*x+matrix[4]*y+matrix[12])/w,py=(matrix[1]*x+matrix[5]*y+matrix[13])/w;
    assert.ok(w>0&&Number.isFinite(px)&&Number.isFinite(py));
    assert.ok(px>=-1e-6&&px<=camera.width+1e-6&&py>=-1e-6&&py<=camera.height+1e-6);
  }
  assert.throws(()=>camera.surfaceImage(0,100,{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0}),RangeError);
});
