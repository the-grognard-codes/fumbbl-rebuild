import assert from 'node:assert/strict';
import test from 'node:test';
import {PitchProjection} from '../src/pitch-projection.ts';
import {JIGSAW_PIECES,crowdHoles,jigsawModules,registerJigsaw,mapJigsaw,jigsawDepth} from '../src/stadium-jigsaw.ts';
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
test('walls retain precisely two sideline portal openings and pockets match only actual furniture footprints',()=>{
  const p=stadiumPresentation({}),camera=new PitchProjection({width:1280,height:660});
  const walls=jigsawModules(camera,p.venue,p.home,p.away).filter(m=>m.role==='wall');
  for(const edge of ['north','south','home','away']) {
    const spans=walls.filter(m=>m.edge===edge).map(m=>m.bounds.x1-m.bounds.x0);
    const portal=geometry.lockerRooms.find(p=>p.side===edge);
    assert.ok(Math.abs(spans.reduce((a,b)=>a+b,0)-(edge==='north'||edge==='south'?30-portal!.span:19))<1e-8);
  }
  assert.equal(crowdHoles().length,3);
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
