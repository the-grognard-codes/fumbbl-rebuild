import assert from 'node:assert/strict';
import test from 'node:test';
import {PitchProjection} from '../src/pitch-projection.ts';
import {JIGSAW_PIECES,crowdHoles,crowdOutline,jigsawModules,registerJigsaw,mapJigsaw,jigsawDepth} from '../src/stadium-jigsaw.ts';
import {stadiumPresentation,stadiumGeometry as geometry} from '../src/stadium-presentation.ts';

test('ten replaceable slots cover the bowl exactly once and leave all two-square apron cells empty',()=>{
  assert.equal(JIGSAW_PIECES.length,10);
  const coverage=new Set<string>();
  for(const piece of JIGSAW_PIECES) {
    const b=piece.bounds;
    for(let x=b.x0;x<b.x1;x++)for(let y=b.y0;y<b.y1;y++) {
      assert.ok(x<-2||x>=28||y<-2||y>=17,'crowd cannot occupy the apron');
      const key=x+','+y;assert.ok(!coverage.has(key),'slots must not overlap');coverage.add(key);
    }
    if(piece.edge==='north'||piece.edge==='south')
      assert.ok(piece.team==='home'?b.x1===13:b.x0===13,'the joint is physical midfield');
  }
  assert.equal(coverage.size,38*27-30*19);
});
test('Human and Orc pieces retain physical ownership and bounds through both ends and all supported angles',()=>{
  const human={rosterId:'human',league:'Old World Classic'},orc={rosterId:'orc',league:'Badlands Brawl'};
  for(const [homeTeamArt,awayTeamArt] of [[human,orc],[orc,human]]) {
    const presentation=stadiumPresentation({homeTeamArt,awayTeamArt});
    for(const end of ['home','away'] as const)for(const elevation of [30,40,50,90] as const)for(const focus of [0,13,26]) {
      const camera=new PitchProjection({width:1280,height:660,end,focus,mode:elevation===90?'top-down':'perspective',perspectiveElevation:elevation===90?40:elevation});
      const modules=jigsawModules(camera,presentation.venue,presentation.home,presentation.away);
      const sections=new Map(modules.filter(m=>m.role==='crowd').map(m=>[m.piece,m]));
      assert.equal(sections.size,10);
      for(const piece of JIGSAW_PIECES) {
        const module=sections.get(piece.id)!;
        assert.equal(module.team,piece.team);assert.deepEqual(module.sectionBounds,piece.bounds);
        assert.equal(module.profile.id,piece.team==='home'?presentation.home.id:presentation.away.id);
        assert.ok(Number.isFinite(jigsawDepth(module,camera)));
        assert.ok(elevation===90?module.art.file.includes('overhead'):module.art.file.includes('crowd'));
      }
      assert.ok(modules.filter(m=>m.role==='wall').every(m=>m.profile.id===presentation.venue.id));
      // Upright row planes face the lens; their top and bottom have equal camera depth.
      if(elevation!==90)for(const module of modules.filter(m=>m.role==='crowd')) {
        const theta=elevation*Math.PI/180;
        assert.ok(Math.abs(module.down.x*(end==='home'?1:-1)*Math.cos(theta)-module.down.z*Math.sin(theta))<1e-12);
      }
    }
  }
});
test('walls retain precisely two portals and field-level bench bays outside the apron',()=>{
  const p=stadiumPresentation({}),camera=new PitchProjection({width:1280,height:660});
  const walls=jigsawModules(camera,p.venue,p.home,p.away).filter(m=>m.role==='wall');
  for(const edge of ['north','south','home','away']) {
    const spans=walls.filter(m=>m.edge===edge).map(m=>m.bounds.x1-m.bounds.x0);
    const portal=geometry.lockerRooms.find(p=>p.side===edge);
    assert.ok(Math.abs(spans.reduce((a,b)=>a+b,0)-(edge==='north'||edge==='south'?30-portal!.span:19))<1e-8);
  }
  assert.equal(crowdHoles().length,3);
  for(const bench of geometry.benches) {
    const lip=walls.find(m=>m.edge===bench.side&&m.bounds.x0===bench.x-bench.along/2&&m.bounds.x1===bench.x+bench.along/2)!;
    assert.equal(lip.bounds.y1,.35,'bench bays keep a low lip instead of another doorway');
    const pocket=crowdHoles().find(h=>h.x0===bench.x-bench.along/2)!;
    assert.equal(bench.side==='north'?pocket.y1:pocket.y0,bench.side==='north'?-2:17,'bench pocket opens at the apron edge');
  }
  for(const hole of crowdHoles()) {
    assert.ok(hole.y1<=-2||hole.y0>=17);
    assert.ok(hole.x1-hole.x0<=3 && hole.y1-hole.y0<=2.65+1e-8);
    for(const portal of geometry.lockerRooms)
      assert.ok(hole.y1<=portal.y-.4||hole.y0>=portal.y+.4||hole.x1<=portal.x-portal.span/2||hole.x0>=portal.x+portal.span/2);
  }
});
test('four anchor registration preserves authored corners and rejects missing or degenerate anchors',()=>{
  const source=[{x:30,y:43},{x:303,y:43},{x:303,y:955},{x:30,y:955}];
  const target=[{x:28,y:-6},{x:28,y:-2},{x:-2,y:-2},{x:-2,y:-6}];
  const matrix=registerJigsaw(source,target);
  for(let i=0;i<4;i++){
    const mapped=mapJigsaw(matrix,source[i]);
    assert.ok(Math.abs(mapped.x-target[i].x)<1e-8&&Math.abs(mapped.y-target[i].y)<1e-8);
  }
  assert.throws(()=>registerJigsaw(source.slice(1),target),RangeError);
  assert.throws(()=>registerJigsaw(Array(4).fill({x:0,y:0}),target),RangeError);
  assert.throws(()=>registerJigsaw(source.map(p=>({...p,x:NaN})),target),RangeError);
});

test('lens tilt changes row overlap while keeping authored head proportions stable',()=>{
  const p=stadiumPresentation({});
  const rows=(elevation:30|50)=>jigsawModules(new PitchProjection({width:1280,height:660,perspectiveElevation:elevation}),p.venue,p.home,p.away)
    .filter(m=>m.role==='crowd').map(m=>[m.id,m.bounds]);
  assert.deepEqual(rows(30),rows(50));
});

test('rounded corners stay inside their slots and join the full side and end banks in either view',()=>{
  const p=stadiumPresentation({});
  for(const piece of JIGSAW_PIECES.filter(p=>p.id.endsWith('-corner'))) {
    const outline=crowdOutline(piece),center=outline[0],b=piece.bounds;
    assert.equal(outline.length,18);
    for(const point of outline) {
      assert.ok(point.x>=b.x0-1e-10&&point.x<=b.x1+1e-10&&point.y>=b.y0-1e-10&&point.y<=b.y1+1e-10);
      assert.ok(Math.hypot(point.x-center.x,point.y-center.y)<=4+1e-10);
    }
    for(const end of ['home','away'] as const) {
      const camera=new PitchProjection({width:1280,height:660,end,mode:'top-down'});
      assert.deepEqual(jigsawModules(camera,p.venue,p.home,p.away).find(m=>m.id===piece.id)!.outline,outline);
    }
  }
});

test('retaining caps have real thickness outside the clear apron in perspective and overhead',()=>{
  const p=stadiumPresentation({});
  for(const end of ['home','away'] as const)for(const mode of ['perspective','top-down'] as const) {
    const camera=new PitchProjection({width:1280,height:660,end,mode});
    const caps=jigsawModules(camera,p.venue,p.home,p.away).filter(m=>m.role===(mode==='perspective'?'wall-rim':'wall'));
    assert.ok(caps.length>0);
    for(const cap of caps) {
      assert.equal(cap.bounds.y1,.24);
      for(const u of [cap.bounds.x0,cap.bounds.x1])for(const v of [0,.24]) {
        const x=cap.origin.x+cap.across.x*u+cap.down.x*v,y=cap.origin.y+cap.across.y*u+cap.down.y*v;
        assert.ok(x<=-2||x>=28||y<=-2||y>=17,'caps leave the two-square apron clear');
        assert.ok(Number.isFinite(jigsawDepth(cap,camera)));
      }
    }
  }
});

test('side and corner source pixels keep equal horizontal and vertical scales throughout camera travel',()=>{
  const p=stadiumPresentation({});
  for(const end of ['home','away'] as const)for(const elevation of [30,40,50] as const)for(const focus of [0,13,26]) {
    const camera=new PitchProjection({width:1280,height:660,end,focus,perspectiveElevation:elevation});
    for(const module of jigsawModules(camera,p.venue,p.home,p.away).filter(m=>m.sourceCrop)) {
      const crop=module.sourceCrop!,point={x:crop.x+crop.width/2,y:crop.y+crop.height/2};
      const a=mapJigsaw(module.registration,point),x=mapJigsaw(module.registration,{...point,x:point.x+1}),y=mapJigsaw(module.registration,{...point,y:point.y+1});
      assert.ok(Math.abs(Math.hypot(x.x-a.x,x.y-a.y)-Math.hypot(y.x-a.x,y.y-a.y))<1e-10,'authored heads retain their aspect ratio');
    }
  }
});

test('towels and spare jerseys follow the participating team and stay within each bench recess',()=>{
  const human={rosterId:'human',league:'Old World Classic'},orc={rosterId:'orc',league:'Badlands Brawl'};
  for(const [homeTeamArt,awayTeamArt] of [[human,orc],[orc,human]])for(const end of ['home','away'] as const)for(const mode of ['perspective','top-down'] as const) {
    const p=stadiumPresentation({homeTeamArt,awayTeamArt}),camera=new PitchProjection({width:1280,height:660,end,mode});
    const gear=jigsawModules(camera,p.venue,p.home,p.away).filter(m=>m.role==='sideline-gear');
    assert.equal(gear.length,2);
    for(const module of gear) {
      const bench=geometry.benches.find(b=>b.team===module.team)!;
      assert.equal(module.profile.id,module.team==='home'?p.home.id:p.away.id);
      for(const u of [module.bounds.x0,module.bounds.x1])for(const v of [module.bounds.y0,module.bounds.y1]) {
        const x=module.origin.x+module.across.x*u+module.down.x*v,y=module.origin.y+module.across.y*u+module.down.y*v;
        assert.ok(Math.abs(x-bench.x)<=bench.along/2&&Math.abs(y-bench.y)<=bench.across/2);
      }
    }
  }
});
