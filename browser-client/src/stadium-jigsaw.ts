import { PitchProjection, type PlaneMatrix, type Point, type WorldPoint } from './pitch-projection.ts';
import { stadiumGeometry as geometry, type StadiumProfile } from './stadium-presentation.ts';
import { jigsawCatalog } from './generated-stadium-jigsaw.ts';

export type JigsawBounds={x0:number;y0:number;x1:number;y1:number};
export type JigsawPiece={id:string;edge:'north'|'south'|'home'|'away';team:'home'|'away';bounds:JigsawBounds};

/** Large bank and corner slots; their ownership never depends on the viewing end. */
export const JIGSAW_PIECES:readonly JigsawPiece[]=[
  {id:'north-home',edge:'north',team:'home',bounds:{x0:-2,y0:-6,x1:13,y1:-2}},
  {id:'north-away',edge:'north',team:'away',bounds:{x0:13,y0:-6,x1:28,y1:-2}},
  {id:'south-home',edge:'south',team:'home',bounds:{x0:-2,y0:17,x1:13,y1:21}},
  {id:'south-away',edge:'south',team:'away',bounds:{x0:13,y0:17,x1:28,y1:21}},
  {id:'home-bank',edge:'home',team:'home',bounds:{x0:-6,y0:-2,x1:-2,y1:17}},
  {id:'away-bank',edge:'away',team:'away',bounds:{x0:28,y0:-2,x1:32,y1:17}},
  {id:'home-north-corner',edge:'home',team:'home',bounds:{x0:-6,y0:-6,x1:-2,y1:-2}},
  {id:'home-south-corner',edge:'home',team:'home',bounds:{x0:-6,y0:17,x1:-2,y1:21}},
  {id:'away-north-corner',edge:'away',team:'away',bounds:{x0:28,y0:-6,x1:32,y1:-2}},
  {id:'away-south-corner',edge:'away',team:'away',bounds:{x0:28,y0:17,x1:32,y1:21}},
];

/** Corner slots retain their joins while the exposed outside follows the bowl's four-square radius. */
export function crowdOutline(piece:JigsawPiece):Point[] {
  const b=piece.bounds;
  if(!piece.id.endsWith('-corner'))return [{x:b.x0,y:b.y0},{x:b.x1,y:b.y0},{x:b.x1,y:b.y1},{x:b.x0,y:b.y1}];
  const home=piece.team==='home',north=piece.id.includes('north');
  const center={x:home?-2:28,y:north?-2:17};
  return [center,...Array.from({length:17},(_,i)=>{
    const angle=i*Math.PI/32;
    return {x:center.x+(home?-1:1)*4*Math.cos(angle),y:center.y+(north?-1:1)*4*Math.sin(angle)};
  })];
}

/** Four authored anchors determine one perspective registration, not resized PNGs. */
export function registerJigsaw(source:readonly Point[],target:readonly Point[]):PlaneMatrix {
  if(source.length!==4||target.length!==4||![...source,...target].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw new RangeError('A jigsaw registration needs four matching anchors');
  const rows=source.flatMap((p,i)=>{const t=target[i];return [
    [p.x,p.y,1,0,0,0,-t.x*p.x,-t.x*p.y,t.x],
    [0,0,0,p.x,p.y,1,-t.y*p.x,-t.y*p.y,t.y]]});
  for(let col=0;col<8;col++){
    let pivot=col;
    for(let row=col+1;row<8;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const divisor=rows[col][col];
    if(!Number.isFinite(divisor)||Math.abs(divisor)<1e-9)throw new RangeError('Degenerate jigsaw anchors');
    rows[col]=rows[col].map(v=>v/divisor);
    for(let row=0;row<8;row++)if(row!==col){const f=rows[row][col];rows[row]=rows[row].map((v,i)=>v-f*rows[col][i]);}
  }
  const v=rows.map(r=>r[8]);
  return [v.slice(0,3),v.slice(3,6),[...v.slice(6,8),1]];
}
export function mapJigsaw(matrix:PlaneMatrix,p:Point):Point {
  const d=matrix[2][0]*p.x+matrix[2][1]*p.y+matrix[2][2];
  return {x:(matrix[0][0]*p.x+matrix[0][1]*p.y+matrix[0][2])/d,
    y:(matrix[1][0]*p.x+matrix[1][1]*p.y+matrix[1][2])/d};
}
function jigsawFamilyId(profile:string) {
  return Object.hasOwn(jigsawCatalog.profiles,profile)?jigsawCatalog.profiles[profile as keyof typeof jigsawCatalog.profiles]:'human';
}
export function jigsawFamily(profile:string) {
  return jigsawCatalog.families[jigsawFamilyId(profile)];
}
type CrowdPose=keyof typeof jigsawCatalog.families.human.crowd.regions;
function crowdPose(piece:JigsawPiece,end:'home'|'away'):CrowdPose {
  const key=piece.id.endsWith('-corner')?piece.id:piece.edge;
  return (end==='home'?key:key.replace(/home|away|north|south/g,p=>({home:'away',away:'home',north:'south',south:'north'}[p]!))) as CrowdPose;
}
export function crowdRegistration(profile:string,end:'home'|'away',piece:JigsawPiece,top=false):PlaneMatrix {
  const family=jigsawFamily(profile),art=top?family.overhead:family.crowd;
  const view=crowdPose(piece,end);
  const rect=art.regions[view as keyof typeof art.regions];
  const source=[{x:rect.x,y:rect.y},{x:rect.x+rect.width,y:rect.y},{x:rect.x+rect.width,y:rect.y+rect.height},{x:rect.x,y:rect.y+rect.height}];
  const b=piece.bounds,points=[{x:b.x1,y:b.y0},{x:b.x1,y:b.y1},{x:b.x0,y:b.y1},{x:b.x0,y:b.y0}];
  return registerJigsaw(source,end==='home'?points:[points[2],points[3],points[0],points[1]]);
}
export function crowdHoles():JigsawBounds[] {
  const benches=geometry.benches.map(b=>({x0:b.x-b.along/2,y0:b.side==='north'?b.y-b.across/2:17,x1:b.x+b.along/2,y1:b.side==='north'?-2:b.y+b.across/2}));
  const p=geometry.pavilion;
  return [...benches,{x0:p.x-p.along/2,y0:p.y-p.across/2,x1:p.x+p.along/2,y1:p.y+p.across/2}];
}
export const wallPlane=(edge:string):{origin:WorldPoint;across:WorldPoint;down:WorldPoint}=>({
  origin:edge==='north'?{x:0,y:-2,z:0}:edge==='south'?{x:0,y:17,z:0}:edge==='home'?{x:-2,y:0,z:0}:{x:28,y:0,z:0},
  across:edge==='north'||edge==='south'?{x:1,y:0,z:0}:{x:0,y:1,z:0},down:{x:0,y:0,z:1}});

export type JigsawModule={jigsaw:true;id:string;role:'crowd'|'wall'|'wall-rim'|'sideline-gear';profile:StadiumProfile;origin:WorldPoint;
  across:WorldPoint;down:WorldPoint;registration:PlaneMatrix;bounds:JigsawBounds;art:{file:string;width:number;height:number};
  team?:'home'|'away';edge:string;piece?:string;anchor?:{x:number;y:number};holes?:JigsawBounds[];outline?:readonly Point[];sectionBounds?:JigsawBounds;
  pose?:string;sourceCrop?:{x:number;y:number;width:number;height:number};gesture?:{file:string;zone:{x:number;y:number;width:number;height:number};frames?:readonly {file:string;width:number;height:number;sha256:string}[]};};
export function jigsawModules(camera:PitchProjection,venue:StadiumProfile,home:StadiumProfile,away:StadiumProfile):JigsawModule[]{
  const modules:JigsawModule[]=[];
  for(const bench of geometry.benches) {
    const profile=bench.team==='home'?home:away,top=camera.mode==='top-down';
    const art=jigsawCatalog.accessories,rect=art.regions[jigsawFamilyId(profile.id)][top?'overhead':'perspective'];
    const source=[{x:rect.x,y:rect.y},{x:rect.x+rect.width,y:rect.y},{x:rect.x+rect.width,y:rect.y+rect.height},{x:rect.x,y:rect.y+rect.height}];
    const height=rect.height/rect.width,sign=camera.end==='home'?1:-1;
    modules.push({jigsaw:true,id:'gear-'+bench.team,role:'sideline-gear',profile,team:bench.team,edge:bench.side,art,
      origin:top?{x:bench.x-.1,y:bench.y-height/2,z:.65}:{x:bench.x+.4,y:bench.y-sign*.5,z:.65},
      across:top?{x:1,y:0,z:0}:{x:0,y:sign,z:0},down:top?{x:0,y:1,z:0}:{x:0,y:0,z:1},
      registration:registerJigsaw(source,top?[{x:0,y:0},{x:1,y:0},{x:1,y:height},{x:0,y:height}]:[{x:0,y:height},{x:1,y:height},{x:1,y:0},{x:0,y:0}]),
      bounds:{x0:0,y0:0,x1:1,y1:height}});
  }
  for(const piece of JIGSAW_PIECES){
    const profile=piece.team==='home'?home:away,family=jigsawFamily(profile.id);
    if(camera.mode==='top-down'){
      modules.push({jigsaw:true,id:piece.id,piece:piece.id,role:'crowd',profile,team:piece.team,edge:piece.edge,bounds:piece.bounds,
        anchor:{x:(piece.bounds.x0+piece.bounds.x1)/2,y:(piece.bounds.y0+piece.bounds.y1)/2},
        origin:{x:0,y:0,z:1.4},across:{x:1,y:0,z:0},down:{x:0,y:1,z:0},
        registration:crowdRegistration(profile.id,camera.end,piece,true),art:family.overhead,holes:crowdHoles(),outline:crowdOutline(piece),sectionBounds:piece.bounds,pose:crowdPose(piece,camera.end),
        gesture:gestureFor(profile.id,camera.end,piece,true)});
      continue;
    }
    const pose=crowdPose(piece,camera.end);
    const rect=family.crowd.regions[pose as keyof typeof family.crowd.regions];
    const side=piece.edge==='north'||piece.edge==='south',corner=piece.id.endsWith('-corner'),rowBank=side||corner,rows=side?30:corner?8:1,span=piece.bounds.x1-piece.bounds.x0;
    for(let row=0;row<rows;row++){
      const near=piece.edge===camera.end;
      const x=rowBank?piece.bounds.x0+(row+.5)*span/rows:near?(camera.end==='home'?piece.bounds.x0:piece.bounds.x1):(piece.edge==='home'?piece.bounds.x1-.2:piece.bounds.x0+.2),sourceRow=camera.end==='home'?rows-1-row:row;
      const overscan=rowBank?8:0,top=rect.y+sourceRow*rect.height/rows-overscan,bottom=rect.y+(sourceRow+1)*rect.height/rows+overscan;
      const source=[{x:rect.x,y:top},{x:rect.x+rect.width,y:top},{x:rect.x+rect.width,y:bottom},{x:rect.x,y:bottom}];
      // Camera-facing planes give source pixels the same horizontal and vertical scale.
      // Lens tilt changes row overlap, rather than widening or flattening the spectators.
      const height=(bottom-top)*(piece.bounds.y1-piece.bounds.y0)/rect.width;
      const target=[{x:piece.bounds.y0,y:height},{x:piece.bounds.y1,y:height},{x:piece.bounds.y1,y:0},{x:piece.bounds.y0,y:0}];
      if(camera.end==='away')for(const p of target)p.x=piece.bounds.y0+piece.bounds.y1-p.x;


      // Field-level benches sit below the raised crowd: retain the supporters above their bays.
      // Only the taller pavilion needs a perspective crowd cutout; overhead still clears all footprints.
      const holes=crowdHoles().filter((h,i)=>i>=geometry.benches.length&&x>=h.x0&&x<=h.x1).map(h=>({x0:h.y0,y0:0,x1:h.y1,y1:height}));
      // The corner slots share a rounded exterior, rather than projecting their square outer corners.
      const radius=4,cornerCenter=piece.team==='home'?-2:28;
      const reach=corner?Math.sqrt(Math.max(0,radius*radius-(x-cornerCenter)**2)):radius;
      const y0=corner&&piece.id.includes('north')?-2-reach:piece.bounds.y0;
      const y1=corner&&piece.id.includes('south')?17+reach:piece.bounds.y1;
      modules.push({jigsaw:true,id:piece.id+'-row-'+row,piece:piece.id,role:'crowd',profile,team:piece.team,edge:piece.edge,
        anchor:{x,y:(piece.bounds.y0+piece.bounds.y1)/2},bounds:{x0:y0,y0:0,x1:y1,y1:height},
        origin:{x,y:0,z:rowBank?1.1+(corner?(x<-2?-2-x:x-28)*.15:0):0},across:{x:0,y:1,z:0},down:{x:(camera.end==='home'?1:-1)*Math.sin(camera.elevation*Math.PI/180),y:0,z:Math.cos(camera.elevation*Math.PI/180)},
        registration:registerJigsaw(source,target),art:family.crowd,holes,sectionBounds:piece.bounds,pose,
        sourceCrop:{x:rect.x,y:top,width:rect.width,height:bottom-top},gesture:gestureFor(profile.id,camera.end,piece)});
    }
  }

  for(const edge of ['north','south','home','away']){
    const side=edge==='north'||edge==='south',family=jigsawFamily(venue.id),rect=camera.mode==='top-down'?family.walls.rim:family.walls.straight;
    const source=[{x:rect.x,y:rect.y},{x:rect.x+rect.width,y:rect.y},{x:rect.x+rect.width,y:rect.y+rect.height},{x:rect.x,y:rect.y+rect.height}];
    const plane=camera.mode==='top-down'?{
      origin:edge==='north'?{x:0,y:-2.24,z:1.1}:edge==='south'?{x:0,y:17,z:1.1}:edge==='home'?{x:-2.24,y:0,z:1.1}:{x:28,y:0,z:1.1},
      across:side?{x:1,y:0,z:0}:{x:0,y:1,z:0},down:side?{x:0,y:1,z:0}:{x:1,y:0,z:0}
    }:wallPlane(edge),wallHeight=camera.mode==='top-down'?.24:geometry.wallHeight,portal=geometry.lockerRooms.find(p=>p.side===edge);
    for(const [half,[start,finish]] of (side?[[-2,13],[13,28]]:[[-2,17]]).entries()){
      const target=[{x:start,y:wallHeight},{x:finish,y:wallHeight},{x:finish,y:0},{x:start,y:0}];
      const registration=registerJigsaw(source,camera.end==='home'?target:target.map(p=>({x:start+finish-p.x,y:p.y})));
      const spans=portal&&portal.x>start&&portal.x<finish?[[start,portal.x-portal.span/2],[portal.x+portal.span/2,finish]]:[[start,finish]];
      const bench=geometry.benches.find(b=>b.side===edge),bay=bench?[bench.x-bench.along/2,bench.x+bench.along/2]:null;
      for(const [i,[from,to]] of spans.entries()) {
        const cuts=[from,...(bay??[]).filter(x=>x>from&&x<to),to];
        for(let part=0;part<cuts.length-1;part++) {
          const low=cuts[part],high=cuts[part+1],recess=bay&&low>=bay[0]&&high<=bay[1];
          // A low retaining lip leaves field-level bench bays open; these are not extra gates.
          const height=recess&&camera.mode!=='top-down'?.35:wallHeight;
          const localRegistration=recess&&camera.mode!=='top-down'?registerJigsaw(source,(camera.end==='home'?target:target.map(p=>({x:start+finish-p.x,y:p.y}))).map(p=>({...p,y:p.y/wallHeight*height}))):registration;
          modules.push({jigsaw:true,id:'shell-'+edge+'-'+half+'-'+i+'-'+part,role:'wall',profile:venue,edge,...plane,
            origin:recess&&camera.mode==='top-down'?{...plane.origin,z:.35}:plane.origin,registration:localRegistration,
            bounds:{x0:low,y0:0,x1:high,y1:height},art:family.walls});
          if(camera.mode!=='top-down') {
            const rim=family.walls.rim;
            const rimSource=[{x:rim.x,y:rim.y},{x:rim.x+rim.width,y:rim.y},{x:rim.x+rim.width,y:rim.y+rim.height},{x:rim.x,y:rim.y+rim.height}];
            const rimTarget=[{x:start,y:.24},{x:finish,y:.24},{x:finish,y:0},{x:start,y:0}];
            modules.push({jigsaw:true,id:'rim-'+edge+'-'+half+'-'+i+'-'+part,role:'wall-rim',profile:venue,edge,
              origin:edge==='north'?{x:0,y:-2.24,z:height}:edge==='south'?{x:0,y:17,z:height}:edge==='home'?{x:-2.24,y:0,z:height}:{x:28,y:0,z:height},
              across:side?{x:1,y:0,z:0}:{x:0,y:1,z:0},down:side?{x:0,y:1,z:0}:{x:1,y:0,z:0},
              registration:registerJigsaw(rimSource,camera.end==='home'?rimTarget:rimTarget.map(p=>({...p,x:start+finish-p.x}))),
              bounds:{x0:low,y0:0,x1:high,y1:.24},art:family.walls});
          }
        }
      }
    }
  }
  return modules;
}
export function jigsawDepth(module:JigsawModule,camera:PitchProjection):number{
  const u=(module.bounds.x0+module.bounds.x1)/2,v=(module.bounds.y0+module.bounds.y1)/2;
  const x=module.origin.x+u*module.across.x+v*module.down.x;
  const z=module.origin.z+u*module.across.z+v*module.down.z;
  return camera.distance+(x-camera.focus)*(camera.end==='home'?1:-1)*Math.cos(camera.elevation*Math.PI/180)
    -z*Math.sin(camera.elevation*Math.PI/180);
}

function gestureFor(profile:string,end:'home'|'away',piece:JigsawPiece,top=false){
 const art=jigsawFamily(profile)[top?'overhead':'crowd'],pose=crowdPose(piece,end);
 const gesture=art.gesture as typeof art.gesture&{frames?:readonly {file:string;width:number;height:number;sha256:string}[]};
 return {file:gesture.file,zone:gesture.zones[pose as keyof typeof gesture.zones],frames:gesture.frames};
}
export function visibleGesturePieces(modules:readonly JigsawModule[],camera:PitchProjection):string[] {
  const pieces=new Set<string>();
  for(const module of modules) {
    if(!module.piece||!module.gesture)continue;
    const z=module.gesture.zone;
    const points=[{x:z.x,y:z.y},{x:z.x+z.width,y:z.y},{x:z.x+z.width,y:z.y+z.height},{x:z.x,y:z.y+z.height}]
      .map(p=>mapJigsaw(module.registration,p));
    // Atlas rectangles register to axis-aligned local planes. Let the lens clip the gesture itself.
    const bounds={x0:Math.max(module.bounds.x0,Math.min(...points.map(p=>p.x))),
      x1:Math.min(module.bounds.x1,Math.max(...points.map(p=>p.x))),
      y0:Math.max(module.bounds.y0,Math.min(...points.map(p=>p.y))),
      y1:Math.min(module.bounds.y1,Math.max(...points.map(p=>p.y)))};
    if(bounds.x1>bounds.x0&&bounds.y1>bounds.y0&&camera.registeredSurfaceImage(
      module.art.width,module.art.height,module.registration,module.origin,module.across,module.down,bounds))pieces.add(module.piece);
  }
  return [...pieces];
}
