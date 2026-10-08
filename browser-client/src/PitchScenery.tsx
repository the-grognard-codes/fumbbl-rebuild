import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { PitchProjection, type PlaneMatrix, type WorldPoint } from './pitch-projection.ts';
import type { SetupState } from './setup-protocol.ts';
import { stadiumPresentation, stadiumSeats, stadiumMotion, stadiumGeometry as geometry,
  STADIUM_RECESSES, SIDELINE_MARGIN, STADIUM_ROWS, type StadiumProfile, type StadiumRole } from './stadium-presentation.ts';
import './pitch-scenery.css';
const WIDTH=1672,HEIGHT=941;
const url=`${import.meta.env.BASE_URL}assets/game/pitch/stadium-v1.png`;
// Only the registered grass from the approved painting is retained.
const registration:PlaneMatrix=[[0,-13.350726120762829,22824.563196736133],
  [17.044276629673718,4.301823272632846,-6422.851576615379],[0,.5735764363510462,1043.4884914389131]];
const sourceWorld=(x:number,y:number)=>{
  const d=registration[2][1]*y+registration[2][2];
  return {x:(registration[0][1]*y+registration[0][2])/d,y:(registration[1][0]*x+registration[1][1]*y+registration[1][2])/d};
};
const a=sourceWorld(0,0).x,b=sourceWorld(0,HEIGHT).x,period=Math.abs(a-b)/2;
const atlasUrl=(profile:StadiumProfile)=>import.meta.env.BASE_URL+'assets/game/pitch/stadiums/'+profile.atlas;
const AtlasFailures=createContext<{failed:ReadonlySet<string>;mark:(profile:StadiumProfile)=>void}>({failed:new Set(),mark:()=>{}});
type Module={id:string;role:StadiumRole;profile:StadiumProfile;origin:WorldPoint;across:WorldPoint;down:WorldPoint;
  team?:'home'|'away';seat?:string;anchor?:{x:number;y:number};edge?:string;row?:number;tile?:boolean};
/** Original pixels are clipped and projected once onto their world surface. */
function Surface({camera,module}:{camera:PitchProjection;module:Module}) {
  const pattern=useId().replace(/:/g,''),{failed,mark}=useContext(AtlasFailures),region=module.profile.regions[module.role];
  const w=module.tile?Math.hypot(module.across.x,module.across.y)*64:region.width,
    h=module.tile?Math.hypot(module.down.x,module.down.y)*64:region.height;
  const surface=camera.surfaceImage(w,h,module.origin,
    {x:module.across.x/w,y:module.across.y/w,z:module.across.z/w},
    {x:module.down.x/h,y:module.down.y/h,z:module.down.z/h});
  const metadata={'data-stadium-role':module.role,'data-stadium-profile':module.profile.id,'data-team':module.team,
    'data-crowd-team':module.seat?module.team:undefined,'data-seat':module.seat,'data-stand-edge':module.edge,
    'data-world-x':module.anchor?.x??module.origin.x,'data-world-y':module.anchor?.y??module.origin.y,'data-art-view':camera.mode,
'data-stand-row':module.tile&&module.row!==undefined?module.row+1:undefined};
  if(!surface)return <div className={"stadium-surface stadium-sprite"+(module.seat?" pitch-stadium-crowd":"")} {...metadata} style={{display:'none'}}/>;
  const motion=stadiumMotion(module.role,module.origin.x,module.origin.y);
  const style:CSSProperties & {'--stadium-sway':string}={width:surface.width,height:surface.height,
    transform:surface.transform,clipPath:surface.clipPath,'--stadium-sway':'1px',
    animationDuration:motion.duration+'s',animationDelay:motion.delay+'s'};
  const image=<image href={atlasUrl(module.profile)} width={module.profile.width} height={module.profile.height}
    onError={()=>mark(module.profile)}/>;
  return <div className={"stadium-surface stadium-sprite"+(module.seat?" pitch-stadium-crowd":"")} {...metadata} style={style}>
    <svg width={surface.width} height={surface.height} viewBox={(module.tile?surface.left:region.x+surface.left)+' '+(module.tile?surface.top:region.y+surface.top)+' '+surface.width+' '+surface.height}
      preserveAspectRatio="none">
      <g className="stadium-ambient" data-motion={failed.has(module.profile.id)?'static':motion.kind}
        style={{animationDuration:motion.duration+'s',animationDelay:motion.delay+'s','--stadium-sway':'1px'} as CSSProperties}>
        {failed.has(module.profile.id)?<rect data-art-fallback={module.role} x={module.tile?0:region.x} y={module.tile?0:region.y}
          width={w} height={h} fill={module.profile.palette.stone} stroke={module.profile.palette.rail}/>
          :module.tile?<><defs><pattern id={pattern} width={32} height={32} patternUnits="userSpaceOnUse">
            <svg width={32} height={32} viewBox={region.x+' '+region.y+' '+region.width+' '+region.height} preserveAspectRatio="none">{image}</svg>
          </pattern></defs><rect width={w} height={h} fill={'url(#'+pattern+')'}/></>:image}
      </g>
    </svg>
  </div>;
}
const ground=(id:string,role:StadiumRole,profile:StadiumProfile,x0:number,y0:number,x1:number,y1:number,z=0):Module=>
  ({id,role,profile,origin:{x:x0,y:y0,z},across:{x:x1-x0,y:0,z:0},down:{x:0,y:y1-y0,z:0}});
function vertical(id:string,role:StadiumRole,profile:StadiumProfile,x:number,y:number,dx:number,dy:number,height:number,base=0):Module {
  return {id,role,profile,origin:{x,y,z:base+height},across:{x:dx,y:dy,z:0},down:{x:0,y:0,z:-height}};
}
function bowlModules(camera:PitchProjection,venue:StadiumProfile,home:StadiumProfile,away:StadiumProfile):Module[] {
  const top=camera.mode==='top-down',modules:Module[]=[];
  // Raised standing ground is mostly concealed by the packed crowd, not empty stairs.
  for(let row=0;row<STADIUM_ROWS;row++){
    const rise=geometry.crowdRise+row*geometry.crowdRowRise;
    const inner=2+row,outer=inner+1;
    const bands=[
      {edge:'north',x0:-2,y0:-outer,x1:28,y1:-inner},
      {edge:'south',x0:-2,y0:15+inner,x1:28,y1:15+outer},
      {edge:'home',x0:-outer,y0:-6,x1:-inner,y1:21},
      {edge:'away',x0:26+inner,y0:-6,x1:26+outer,y1:21},
    ];
    for(const band of bands){
      let pieces=[band];
      for(const recess of STADIUM_RECESSES)if(band.edge===recess.side&&row<recess.depth)
        pieces=pieces.flatMap(p=>p.x1<=recess.start||p.x0>=recess.end?[p]:
          [{...p,x1:Math.min(p.x1,recess.start)},{...p,x0:Math.max(p.x0,recess.end)}].filter(p=>p.x1>p.x0));
      for(const [i,p] of pieces.entries())modules.push({...ground('floor-'+row+'-'+p.edge+'-'+i,'stone',venue,p.x0,p.y0,p.x1,p.y1,rise),
        tile:true,edge:p.edge,row});
    }
  }
  const wall=(edge:string,start:number,end:number,fixed:number,alongX:boolean)=>{
    for(let from=start;from<end;from+=3){
      const span=Math.min(3,end-from),id='wall-'+edge+'-'+from;
      modules.push({...top?ground(id,'timber',venue,alongX?from:fixed-.12,alongX?fixed-.12:from,
        alongX?from+span:fixed+.12,alongX?fixed+.12:from+span,geometry.wallHeight):
        vertical(id,'timber',venue,alongX?from:fixed,alongX?fixed:from,alongX?span:0,alongX?0:span,geometry.wallHeight),edge});
    }
  };
  for(const side of ['north','south'] as const){
    const portal=geometry.lockerRooms.find(p=>p.side===side)!;
    wall(side,-2,portal.x-portal.span/2,portal.y,true);
    wall(side,portal.x+portal.span/2,28,portal.y,true);
    modules.push({...top?ground(portal.id,'gateTop',venue,portal.x-portal.span/2,portal.y-.4,portal.x+portal.span/2,portal.y+.4):
      vertical(portal.id,'gate',venue,portal.x-portal.span/2,portal.y,portal.span,0,geometry.wallHeight),edge:side,team:portal.team});
  }
  wall('home',-6,21,-2,false);wall('away',-6,21,28,false);
  wall('outer-home',-6,21,-6,false);wall('outer-away',-6,21,32,false);
  wall('outer-north',-6,32,-6,true);wall('outer-south',-6,32,21,true);
  for(const seat of stadiumSeats()){
    const profile=seat.team==='home'?home:away,side=seat.side==='north'||seat.side==='south';
    const rise=geometry.crowdRise+seat.row*geometry.crowdRowRise;
    const role:StadiumRole=top?'crowdTop':side?(seat.side==='north'?(camera.end==='home'?'crowdSide':'crowdSideReverse'):
      (camera.end==='home'?'crowdSideReverse':'crowdSide')):seat.side===camera.end?'crowdBack':'crowd';
    const m=top?ground(seat.id,role,profile,seat.x-(side?seat.span/2:.4),seat.y-(side?.4:seat.span/2),
      seat.x+(side?seat.span/2:.4),seat.y+(side?.4:seat.span/2),rise):
      vertical(seat.id,role,profile,seat.x,seat.y-(side?(camera.end==='home'?1:-1)*.8:seat.span/2),
        0,side?(camera.end==='home'?1:-1)*1.6:seat.span,side?1.4:geometry.crowdHeight,rise);
    modules.push({...m,seat:seat.id,anchor:{x:seat.x,y:seat.y},team:seat.team,edge:seat.side,row:seat.row});
  }
  for(const p of geometry.partitions)modules.push(top?ground(p.id,'timber',venue,p.x-.1,p.y0,p.x+.1,p.y1,1.8):
    vertical(p.id,'timber',venue,p.x,p.y0,0,p.y1-p.y0,1,geometry.crowdRise));
  // Recess furniture is authored in the same canonical footprint as the layout study.
  for(const b of geometry.benches)modules.push({...top?
    ground('bench-'+b.team,'benchTop',b.team==='home'?home:away,b.x-b.along/2,b.y-b.across/2,b.x+b.along/2,b.y+b.across/2):
    vertical('bench-'+b.team,'bench',b.team==='home'?home:away,b.x,b.y-(camera.end==='home'?1:-1)*.65,0,(camera.end==='home'?1:-1)*1.3,.65),team:b.team});
  const p=geometry.pavilion;
  modules.push(top?ground('pavilion','pavilionTop',venue,p.x-p.along/2,p.y-p.across/2,p.x+p.along/2,p.y+p.across/2):
    vertical('pavilion','pavilion',venue,p.x,p.y-p.across/2,0,p.across,2.2));
  return modules;
}
function props(camera:PitchProjection,venue:StadiumProfile,home:StadiumProfile,away:StadiumProfile):Module[] {
  const top=camera.mode==='top-down',modules:Module[]=[];
  const add=(id:string,role:StadiumRole,profile:StadiumProfile,x:number,y:number,width:number,height:number,team?:'home'|'away')=>{
    // Perspective props stand upright across the camera's horizontal world axis.
    modules.push({...top?ground(id,role,profile,x-width/2,y-height/2,x+width/2,y+height/2):
      vertical(id,role,profile,x,y-width/2,0,width,height),team});
  };
  for(const b of geometry.benches)add('mugs-'+b.team,'mugs',b.team==='home'?home:away,b.x+.5,b.y,.4,top?.4:.3,b.team);
  for(const [x,y,team] of [[8,-2.1,'home'],[18,17.1,'away']] as const)add('banner-'+team,'banner',team==='home'?home:away,x,y,.7,top?.65:1.2,team);
  for(const x of [4,22])for(const y of [-2.2,17.2])add('pennant-'+x+'-'+y,'pennant',x<13?home:away,x,y,.65,top?.5:1.6,x<13?'home':'away');
  for(const x of [3,10,16,23])for(const y of [-2.1,17.1])add('torch-'+x+'-'+y,top?'torchTop':'torch',venue,x,y,.32,top?.32:1.3);
  return modules;
}
function GrassGround({camera,onError}:{camera:PitchProjection;onError:()=>void}) {
  const pattern=useId().replace(/:/g,''),w=38*48,h=27*48;
  const surface=camera.surfaceImage(w,h,{x:-6,y:-6,z:0},{x:1/48,y:0,z:0},{x:0,y:1/48,z:0});
  if(!surface)return null;
  return <div className="stadium-surface" style={{width:surface.width,height:surface.height,transform:surface.transform,clipPath:surface.clipPath}}>
    <svg width={surface.width} height={surface.height} viewBox={surface.left+' '+surface.top+' '+surface.width+' '+surface.height}>
      <defs><pattern id={pattern} width={48} height={48} patternUnits="userSpaceOnUse">
        <svg width={48} height={48} viewBox="720 400 96 96" preserveAspectRatio="none">
          <image data-grass-sample="true" href={url} width={WIDTH} height={HEIGHT} onError={onError}/>
        </svg>
      </pattern></defs><rect width={w} height={h} fill={'url(#'+pattern+')'}/>
    </svg>
  </div>;
}

/** Interchangeable League bowl and fixed participating-team sections share the pitch lens. */
export function PitchScenery({camera,view,onError}:{camera:PitchProjection;view:SetupState;onError:()=>void}) {
  const presentation=stadiumPresentation(view),[failed,setFailed]=useState<ReadonlySet<string>>(new Set()),reported=useRef(new Set<string>());
  const mark=(profile:StadiumProfile)=>{
    if(reported.current.has(profile.id))return;reported.current.add(profile.id);
    console.warn('Stadium atlas unavailable: '+atlasUrl(profile)+'; inspect assets:check. Using simple scenery for this profile.');
    setFailed(previous=>new Set([...previous,profile.id]));
  };
  const diagnostic=presentation.diagnostics.join('; ');
  useEffect(()=>{if(diagnostic)console.warn(diagnostic+'. Add canonical stadium catalog mappings to supply this theme.');},[diagnostic]);
  const top=camera.unproject({x:camera.center.x,y:0}),bottom=camera.unproject({x:camera.center.x,y:camera.height});
  if(!top||!bottom)return null;
  const lo=Math.min(top.x,bottom.x),hi=Math.max(top.x,bottom.x),first=camera.end==='home'?a:26-a,last=camera.end==='home'?b:26-b;
  const offsets=Array.from({length:17},(_,i)=>(i-8)*period).filter(offset=>Math.max(first,last)+offset>=lo&&Math.min(first,last)+offset<=hi)
    .sort((first,second)=>camera.end==='home'?second-first:first-second);
  const footprint=camera.polygon([{x:-6,y:-6},{x:32,y:-6},{x:32,y:21},{x:-6,y:21}],true);
  const turfClip=footprint.length>=3?'polygon('+footprint.map(p=>p.x/camera.width*100+'% '+p.y/camera.height*100+'%').join(',')+')':'inset(100%)';
  const modules=[...bowlModules(camera,presentation.venue,presentation.home,presentation.away),
    ...props(camera,presentation.venue,presentation.home,presentation.away)].sort((a,b)=>{
      const depth=(m:Module)=>camera.distance+(m.origin.x-camera.focus)*(camera.end==='home'?1:-1)*Math.cos(camera.elevation*Math.PI/180)-m.origin.z*Math.sin(camera.elevation*Math.PI/180);
      return Number(Boolean(b.tile))-Number(Boolean(a.tile)) || depth(b)-depth(a);
    });
  return <AtlasFailures.Provider value={{failed,mark}}><div className="pitch-stadium-world" aria-hidden="true"
    data-stadium-league={presentation.league} data-stadium-fallback={presentation.fallback} data-sideline-margin={SIDELINE_MARGIN}>
    <div className="pitch-stadium-turf-world" style={{clipPath:turfClip}}><GrassGround camera={camera} onError={onError}/>
      {offsets.map(offset=>{
        const end=camera.end==='home'?1:-1,xOrigin=camera.end==='home'?offset:26+offset,yOrigin=camera.end==='home'?0:15;
        const matrix=registration.map((row,i)=>i<2?row.map((value,j)=>end*value+(i===0?xOrigin:yOrigin)*registration[2][j]):[...row]);
        return <div key={offset} className="pitch-stadium-plate" data-world-offset={offset}
          style={{width:WIDTH,height:HEIGHT,transform:camera.planeImageTransform(matrix)}}>
          <img className="pitch-stadium-turf" src={url} alt="" onError={onError} style={{transform:end===-1?'scaleX(-1)':undefined}}/>
        </div>;
      })}
    </div>
    <div className="pitch-stadium-structure">

      {modules.map(module=><Surface key={module.id} camera={camera} module={module}/>)}
    </div>
  </div></AtlasFailures.Provider>;
}
