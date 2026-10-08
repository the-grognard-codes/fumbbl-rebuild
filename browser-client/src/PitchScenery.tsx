import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { PitchProjection, type PlaneMatrix, type WorldPoint } from './pitch-projection.ts';
import type { SetupState } from './setup-protocol.ts';
import { stadiumPresentation, stadiumMotion, stadiumGeometry as geometry,
  SIDELINE_MARGIN, type StadiumProfile, type StadiumRole } from './stadium-presentation.ts';
import {JigsawSurface} from './StadiumJigsaw.tsx';
import {CrowdGestureProvider} from './CrowdGestureProvider.tsx';
import {crowdHoles,jigsawModules,jigsawDepth,visibleGesturePieces,type JigsawModule} from './stadium-jigsaw.ts';
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
const AtlasFailures=createContext<{failed:ReadonlySet<string>;mark:(profile:StadiumProfile,source?:string)=>void}>({failed:new Set(),mark:()=>{}});
type Module={id:string;role:StadiumRole;profile:StadiumProfile;origin:WorldPoint;across:WorldPoint;down:WorldPoint;
  team?:'home'|'away';edge?:string};
/** Original pixels are clipped and projected once onto their world surface. */
function Surface({camera,module}:{camera:PitchProjection;module:Module}) {
  const {failed,mark}=useContext(AtlasFailures),region=module.profile.regions[module.role];
  const w=region.width,h=region.height;
  const surface=camera.surfaceImage(w,h,module.origin,
    {x:module.across.x/w,y:module.across.y/w,z:module.across.z/w},
    {x:module.down.x/h,y:module.down.y/h,z:module.down.z/h});
  const metadata={'data-stadium-role':module.role,'data-stadium-profile':module.profile.id,'data-team':module.team,
    'data-stand-edge':module.edge,
    'data-world-x':module.origin.x,'data-world-y':module.origin.y,'data-world-base':module.origin.z+module.down.z,'data-art-view':camera.mode};
  if(!surface)return <div className={"stadium-surface stadium-sprite"} {...metadata} style={{display:'none'}}/>;
  const motion=stadiumMotion(module.role,module.origin.x,module.origin.y);
  const style:CSSProperties & {'--stadium-sway':string}={width:surface.width,height:surface.height,
    transform:surface.transform,clipPath:surface.clipPath,'--stadium-sway':'1px',
    animationDuration:motion.duration+'s',animationDelay:motion.delay+'s'};
  const image=<image href={atlasUrl(module.profile)} width={module.profile.width} height={module.profile.height}
    onError={()=>mark(module.profile)}/>;
  return <div className={"stadium-surface stadium-sprite"} {...metadata} style={style}>
    <svg width={surface.width} height={surface.height} viewBox={(region.x+surface.left)+' '+(region.y+surface.top)+' '+surface.width+' '+surface.height}
      preserveAspectRatio="none">
      <g className="stadium-ambient" data-motion={failed.has(module.profile.id)?'static':motion.kind}
        style={{animationDuration:motion.duration+'s',animationDelay:motion.delay+'s','--stadium-sway':'1px'} as CSSProperties}>
        {failed.has(module.profile.id)?<rect data-art-fallback={module.role} x={region.x} y={region.y}
          width={w} height={h} fill={module.profile.palette.stone} stroke={module.profile.palette.rail}/>
          :camera.mode==='top-down'&&module.role==='pennant'?
            <g data-overhead-pennant="true" data-art-source="composed-overhead" transform={'translate('+region.x+' '+region.y+')'}>
              <path d={'M '+w*.15+' '+h*.8+' L '+w*.95+' '+h*.8+' L '+w*.75+' '+h*.55+' Z'} fill="#10141a" opacity=".35"/>
              <path d={'M '+w*.25+' '+h*.5+' L '+w*.95+' '+h*.1+' L '+w*.9+' '+h*.85+' Z'} fill={module.profile.palette.cloth} stroke={module.profile.palette.rail} strokeWidth={4}/>
              <circle cx={w*.25} cy={h*.5} r={w*.11} fill={module.profile.palette.riser} stroke="#151618" strokeWidth={3}/>
            </g>:image}
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
  for(const portal of geometry.lockerRooms)modules.push({...top?
    ground(portal.id,'gateTop',venue,portal.x-portal.span/2,portal.y-.4,portal.x+portal.span/2,portal.y+.4):
    vertical(portal.id,'gate',venue,portal.x-portal.span/2,portal.y,portal.span,0,geometry.wallHeight),
    edge:portal.side,team:portal.team});
  for(const p of geometry.partitions)modules.push(top?ground(p.id,'timber',venue,p.x-.1,p.y0,p.x+.1,p.y1,1.8):
    vertical(p.id,'timber',venue,p.x,p.y0,0,p.y1-p.y0,1,geometry.crowdRise));
  for(const [i,hole] of crowdHoles().entries()) {
    modules.push(ground('pocket-'+i,'stone',venue,hole.x0,hole.y0,hole.x1,hole.y1,0));
    const outerY=hole.y1<=-2?hole.y0:hole.y1;
    // Retaining returns connect the raised crowd to each field-level recessed floor.
    modules.push(vertical('pocket-back-'+i,'stone',venue,hole.x0,outerY,hole.x1-hole.x0,0,geometry.wallHeight));
    for(const x of [hole.x0,hole.x1])modules.push(vertical('pocket-return-'+i+'-'+x,'stone',venue,x,hole.y0,0,hole.y1-hole.y0,i<geometry.benches.length?.35:geometry.wallHeight));
  }
  // Recess furniture is authored in the same canonical footprint as the layout study.
  for(const b of geometry.benches)modules.push({...top?
    ground('bench-'+b.team,'benchTop',b.team==='home'?home:away,b.x-b.along/2,b.y-b.across/2,b.x+b.along/2,b.y+b.across/2,0):
    vertical('bench-'+b.team,'bench',b.team==='home'?home:away,b.x,b.y-(camera.end==='home'?1:-1)*.65,0,(camera.end==='home'?1:-1)*1.3,.65,0),team:b.team});
  const p=geometry.pavilion;
  modules.push(top?ground('pavilion','pavilionTop',venue,p.x-p.along/2,p.y-p.across/2,p.x+p.along/2,p.y+p.across/2,0):
    vertical('pavilion','pavilion',venue,p.x,p.y-p.across/2,0,p.across,2.2,0));
  return modules;
}
function props(camera:PitchProjection,venue:StadiumProfile,home:StadiumProfile,away:StadiumProfile):Module[] {
  const top=camera.mode==='top-down',modules:Module[]=[];
  const add=(id:string,role:StadiumRole,profile:StadiumProfile,x:number,y:number,width:number,height:number,team?:'home'|'away')=>{
    // Perspective props stand upright across the camera's horizontal world axis.
    modules.push({...top?ground(id,role,profile,x-width/2,y-height/2,x+width/2,y+height/2,role==='mugs'?.65:0):
      vertical(id,role,profile,x,y-width/2,0,width,height,role==='mugs'?.65:0),team});
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
  const mark=(profile:StadiumProfile,source?:string)=>{
    const key=source?'jigsaw/'+source:profile.id;
    if(reported.current.has(key))return;reported.current.add(key);
    console.warn('Stadium art unavailable: '+(source?import.meta.env.BASE_URL+'assets/game/pitch/stadiums/jigsaw/'+source:atlasUrl(profile))+'; inspect assets:check. Only this file uses a fallback.');
    setFailed(previous=>new Set([...previous,key]));
  };
  const diagnostic=presentation.diagnostics.join('; ');
  useEffect(()=>{if(diagnostic)console.warn(diagnostic+'. Add canonical stadium catalog mappings to supply this theme.');},[diagnostic]);
  const top=camera.unproject({x:camera.center.x,y:0}),bottom=camera.unproject({x:camera.center.x,y:camera.height});
  if(!top||!bottom)return null;
  const lo=Math.min(top.x,bottom.x),hi=Math.max(top.x,bottom.x),first=camera.end==='home'?a:26-a,last=camera.end==='home'?b:26-b;
  const offsets=Array.from({length:17},(_,i)=>(i-8)*period).filter(offset=>Math.max(first,last)+offset>=lo&&Math.min(first,last)+offset<=hi)
    .sort((first,second)=>camera.end==='home'?second-first:first-second);
  const footprint=camera.polygon([{x:-2,y:-2},{x:28,y:-2},{x:28,y:17},{x:-2,y:17}],true);
  const turfClip=footprint.length>=3?'polygon('+footprint.map(p=>p.x/camera.width*100+'% '+p.y/camera.height*100+'%').join(',')+')':'inset(100%)';
  const jigsaw=jigsawModules(camera,presentation.venue,presentation.home,presentation.away);
  const modules:(Module|JigsawModule)[]=[...bowlModules(camera,presentation.venue,presentation.home,presentation.away),
    ...props(camera,presentation.venue,presentation.home,presentation.away),
    ...jigsaw].sort((a,b)=>{
      const depth=(m:Module|JigsawModule)=>
        'jigsaw' in m?jigsawDepth(m,camera):camera.distance+(m.origin.x+(m.across.x+m.down.x)/2-camera.focus)*(camera.end==='home'?1:-1)*Math.cos(camera.elevation*Math.PI/180)-(m.origin.z+(m.across.z+m.down.z)/2)*Math.sin(camera.elevation*Math.PI/180);
      return depth(b)-depth(a);
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
    <CrowdGestureProvider eligible={visibleGesturePieces(jigsaw.filter(m=>!failed.has('jigsaw/'+m.art.file)&&!failed.has('jigsaw/'+m.gesture?.file)),camera)}><div className="pitch-stadium-structure">

      {modules.map(module=>'jigsaw' in module?<JigsawSurface key={module.id} camera={camera} module={module} onError={mark} failed={failed.has('jigsaw/'+module.art.file)} gestureFailed={failed.has('jigsaw/'+module.gesture?.file)}/>:<Surface key={module.id} camera={camera} module={module}/>)}
    </div></CrowdGestureProvider>
  </div></AtlasFailures.Provider>;
}
