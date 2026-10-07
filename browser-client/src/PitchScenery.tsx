import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { PitchProjection, type PlaneMatrix } from './pitch-projection.ts';
import type { SetupState } from './setup-protocol.ts';
import { stadiumPresentation, stadiumSeats, STADIUM_RECESSES, SIDELINE_MARGIN, STADIUM_ROWS, type StadiumProfile, type StadiumRole } from './stadium-presentation.ts';
import './pitch-scenery.css';

const WIDTH = 1672, HEIGHT = 941;
const url = `${import.meta.env.BASE_URL}assets/game/pitch/stadium-v1.png`;
// Source-pixel -> canonical ground registration of the approved 55-degree
// painting. Production camera projection remains exclusively in PitchProjection.
const registration: PlaneMatrix = [[0, -13.350726120762829, 22824.563196736133],
  [17.044276629673718, 4.301823272632846, -6422.851576615379],
  [0, 0.5735764363510462, 1043.4884914389131]];
const sourceWorld = (x: number, y: number) => {
  const divisor = registration[2][1] * y + registration[2][2];
  return { x: (registration[0][1] * y + registration[0][2]) / divisor,
    y: (registration[1][0] * x + registration[1][1] * y + registration[1][2]) / divisor };
};
const a = sourceWorld(0, 0).x, b = sourceWorld(0, HEIGHT).x, period = Math.abs(a - b) / 2;
const raisedProjection = (camera: PitchProjection, x: number, y: number, rise = 0) => camera.projectRaised({ x, y }, rise);
const raisedPoint = (camera: PitchProjection, x: number, y: number, rise = 0) => {
  const point = raisedProjection(camera, x, y, rise);
  return point && `${point.x},${point.y}`;
};
const polygon = (camera: PitchProjection, x0: number, y0: number, x1: number, y1: number, rise = 0) =>
  [raisedPoint(camera, x0, y0, rise), raisedPoint(camera, x1, y0, rise),
    raisedPoint(camera, x1, y1, rise), raisedPoint(camera, x0, y1, rise)].filter(Boolean).join(' ');
const riser = (camera: PitchProjection, x0: number, y0: number, x1: number, y1: number, low: number, high: number) =>
  [raisedPoint(camera, x0, y0, low), raisedPoint(camera, x1, y1, low),
    raisedPoint(camera, x1, y1, high), raisedPoint(camera, x0, y0, high)].filter(Boolean).join(' ');


const atlasUrl = (profile: StadiumProfile) => import.meta.env.BASE_URL + 'assets/game/pitch/stadiums/' + profile.atlas;
const AtlasFailures = createContext<{ failed: ReadonlySet<string>; mark: (profile: StadiumProfile) => void }>({ failed: new Set(), mark: () => {} });
const cutaway = (camera: PitchProjection, edge: string) => camera.mode !== 'top-down' && edge === camera.end;

/** Original atlas pixels are clipped at recorded bounds, never resampled into new exports. */
function AtlasImage({ profile, role, width, height, onError }: {
  profile: StadiumProfile; role: StadiumRole; width: number; height: number; onError: () => void;
}) {
  const { failed, mark } = useContext(AtlasFailures);
  const region = profile.regions[role];
  return <svg x={-width/2} y={-height} width={width} height={height}
    viewBox={region.x+' '+region.y+' '+region.width+' '+region.height} preserveAspectRatio="xMidYMax meet">
    {failed.has(profile.id) ? <rect data-art-fallback={role} x={region.x} y={region.y} width={region.width} height={region.height} fill={profile.palette.cloth} stroke={profile.palette.rail}/>
      : <image href={atlasUrl(profile)} width={profile.width} height={profile.height} onError={() => mark(profile)}/>}
  </svg>;
}

function StadiumSprite({ camera, profile, role, x, y, size, rise=0, onError, team }: {
  camera: PitchProjection; profile: StadiumProfile; role: StadiumRole; x: number; y: number; size: number;
  rise?: number; onError: () => void; team?: 'home' | 'away';
}) {
  const point=raisedProjection(camera,x,y,rise); if(!point)return null;
  const region=profile.regions[role], width=point.pixelsPerSquare*size, height=width*region.height/region.width;
  const overhead=camera.mode==='top-down';
  return <g className="stadium-sprite" data-stadium-role={role} data-stadium-profile={profile.id}
    data-team={team} data-world-x={x} data-world-y={y} data-art-view={camera.mode}
    transform={'translate('+point.x+' '+point.y+')'+(overhead?' rotate('+(camera.end==='home'?90:-90)+') translate(0 '+height/2+')':'')}>
    <AtlasImage profile={profile} role={role} width={width} height={height} onError={onError}/>
  </g>;
}

function TerracePlate({ camera, profile, edge, row, x0,y0,x1,y1,onError }: {
  camera: PitchProjection; profile: StadiumProfile; edge: string; row:number; x0:number;y0:number;x1:number;y1:number;onError:()=>void;
}) {
  const prefix=useId().replace(/:/g,''), pixels=64, w=(y1-y0)*pixels,h=(x1-x0)*pixels;
  const rise=(row+1)*.3;
  const matrix:PlaneMatrix=[[0,1/pixels,x0],[1/pixels,0,y0],[0,0,1]];
  return <div className="stadium-terrace-plate" data-terrace-edge={edge} data-cutaway={cutaway(camera,edge)}
    style={{width:w,height:h,visibility:cutaway(camera,edge)?'hidden':'visible',transform:camera.planeImageTransform(matrix,rise)}}>
    <svg width={w} height={h}><defs><pattern id={prefix} width={pixels} height={pixels} patternUnits="userSpaceOnUse">
      <g transform={'translate('+pixels/2+' '+pixels+')'}><AtlasImage profile={profile} role="stone" width={pixels} height={pixels} onError={onError}/></g>
      </pattern></defs><rect width={w} height={h} fill={'url(#'+prefix+')'}/></svg>
  </div>;
}

function StadiumStructure({camera,profile,onError}:{camera:PitchProjection;profile:StadiumProfile;onError:()=>void}) {
  const edges=Array.from({length:STADIUM_ROWS},(_,row)=>{
    const low=-SIDELINE_MARGIN-row, right=26+SIDELINE_MARGIN+row, bottom=15+SIDELINE_MARGIN+row;
    const segments = [
      {edge:'north',x0:low-1,y0:low-1,x1:right+1,y1:low},
      {edge:'south',x0:low-1,y0:bottom,x1:right+1,y1:bottom+1},
      {edge:'home',x0:low-1,y0:low,x1:low,y1:bottom},
      {edge:'away',x0:right,y0:low,x1:right+1,y1:bottom},
    ];
    return { row, segments: segments.flatMap(segment => {
      let pieces = [segment];
      for (const recess of STADIUM_RECESSES) if (segment.edge === recess.side && row < recess.depth) {
        pieces = pieces.flatMap(piece => piece.x1 <= recess.start || piece.x0 >= recess.end ? [piece] :
          [{...piece,x1:recess.start},{...piece,x0:recess.end}].filter(piece => piece.x1 > piece.x0));
      }
      return pieces;
    }) };
  });
  return <>
    <div className="pitch-stadium-terraces">{edges.flatMap(({row,segments})=>segments.map((segment,i)=>
      <TerracePlate key={row+'-'+segment.edge+'-'+i} camera={camera} profile={profile} row={row} {...segment} onError={onError}/>))}</div>
    <svg className="pitch-stadium-structure" viewBox={'0 0 '+camera.width+' '+camera.height}>
      {edges.map(({row,segments})=><g key={row} data-stand-row={row+1}>
        {segments.map(({edge,x0,y0,x1,y1},i)=><g key={edge+'-'+i} visibility={cutaway(camera,edge)?'hidden':'visible'} data-cutaway={cutaway(camera,edge)}>
          <polygon data-stand-edge={edge} points={polygon(camera,x0,y0,x1,y1,(row+1)*.3)} fill="transparent"/>
          <polygon className="pitch-stadium-riser" fill={profile.palette.riser}
            points={edge==='north'||edge==='south'?riser(camera,x0,edge==='north'?y1:y0,x1,edge==='north'?y1:y0,row*.3,(row+1)*.3)
              :riser(camera,edge==='home'?x1:x0,y0,edge==='home'?x1:x0,y1,row*.3,(row+1)*.3)}/>
        </g>)}
      </g>)}
      {[-SIDELINE_MARGIN,26+SIDELINE_MARGIN].map(x=><polyline key={x} className="stadium-low-boundary"
        stroke={profile.palette.rail} points={[raisedPoint(camera,x,-1.5,.1),raisedPoint(camera,x,16.5,.1)].join(' ')}/>)}
      {[-SIDELINE_MARGIN,15+SIDELINE_MARGIN].map(y=><polyline key={y} className="stadium-low-boundary"
        stroke={profile.palette.rail} points={[raisedPoint(camera,-1.5,y,.1),raisedPoint(camera,27.5,y,.1)].join(' ')}/>)}
    </svg>
  </>;
}

function StadiumCrowd({camera,home,away,onError}:{camera:PitchProjection;home:StadiumProfile;away:StadiumProfile;onError:()=>void}) {
  return <svg className="pitch-stadium-crowd" viewBox={'0 0 '+camera.width+' '+camera.height}>
    {stadiumSeats().map(seat=><g key={seat.id} className="pitch-stadium-fan" data-crowd-team={seat.team} data-seat={seat.id}
      visibility={cutaway(camera,seat.side)?'hidden':'visible'}>
      <StadiumSprite camera={camera} profile={seat.team==='home'?home:away} role={camera.mode==='top-down'?'crowdTop':seat.side==='north'||seat.side==='south'?'crowdSide':'crowd'}
        x={seat.x} y={seat.y} rise={(seat.row+1)*.3} size={1.35} onError={onError} team={seat.team}/>
    </g>)}
  </svg>;
}

function StadiumFurnishings({camera,venue,home,away,onError}:{camera:PitchProjection;venue:StadiumProfile;home:StadiumProfile;away:StadiumProfile;onError:()=>void}) {
  const top=camera.mode==='top-down';
  const props:{role:StadiumRole;x:number;y:number;size:number;profile:StadiumProfile;team?:'home'|'away'}[]=[
    {role:top?'benchTop':'bench',x:6,y:-2.5,size:1.65,profile:home,team:'home'},
    {role:top?'benchTop':'bench',x:20,y:17.5,size:1.65,profile:away,team:'away'},
    {role:top?'pavilionTop':'pavilion',x:13,y:-2.6,size:2.65,profile:venue},
    {role:'mugs',x:6.9,y:-1.25,size:.45,profile:home,team:'home'},
    {role:'mugs',x:19.1,y:16.25,size:.45,profile:away,team:'away'},
    {role:'banner',x:8,y:-1.6,size:.55,profile:home,team:'home'},
    {role:'banner',x:18,y:16.6,size:.55,profile:away,team:'away'},
    {role:top?'gateTop':'gate',x:-2.2,y:7.5,size:2.4,profile:venue},
    {role:top?'gateTop':'gate',x:28.2,y:7.5,size:2.4,profile:venue},
  ];
  for(const x of [3,10,16,23])for(const y of [-1.65,16.65])props.push({role:top?'torchTop':'torch',x,y,size:.42,profile:venue});
  return <svg className="pitch-stadium-furnishings" viewBox={'0 0 '+camera.width+' '+camera.height}>
    {props.sort((a,b)=>camera.end==='home'?b.x-a.x:a.x-b.x).map((prop,i)=><g key={i} visibility={prop.role.startsWith('gate')&&cutaway(camera,prop.x<0?'home':'away')?'hidden':'visible'}>
      <StadiumSprite camera={camera} {...prop} onError={onError}/>
    </g>)}
  </svg>;
}

/** Interchangeable League venue and participating-team art share the pitch camera. */
export function PitchScenery({camera,view,onError}:{camera:PitchProjection;view:SetupState;onError:()=>void}) {
  const presentation=stadiumPresentation(view);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const reported = useRef(new Set<string>());
  const mark = (profile: StadiumProfile) => {
    if (reported.current.has(profile.id)) return;
    reported.current.add(profile.id);
    console.warn('Stadium atlas unavailable: ' + atlasUrl(profile) + '; inspect assets:check. Using simple scenery for this profile.');
    setFailed(previous => new Set([...previous, profile.id]));
  };
  const diagnostic = presentation.diagnostics.join('; ');
  useEffect(() => { if (diagnostic) console.warn(diagnostic + '. Add canonical stadium catalog mappings to supply this theme.'); }, [diagnostic]);
  const top = camera.unproject({ x: camera.center.x, y: 0 }), bottom = camera.unproject({ x: camera.center.x, y: camera.height });
  if (!top || !bottom) return null;
  const lo = Math.min(top.x, bottom.x), hi = Math.max(top.x, bottom.x);
  const first = camera.end === 'home' ? a : 26 - a, last = camera.end === 'home' ? b : 26 - b;
  const offsets = Array.from({ length: 17 }, (_, index) => (index - 8) * period)
    .filter(offset => Math.max(first, last) + offset >= lo && Math.min(first, last) + offset <= hi)
    .sort((first, second) => camera.end === 'home' ? second - first : first - second);
  const footprint = camera.polygon([{ x: -1.5, y: -1.5 }, { x: 27.5, y: -1.5 }, { x: 27.5, y: 16.5 }, { x: -1.5, y: 16.5 }], true);
  const turfClip = footprint.length >= 3 ? `polygon(${footprint.map(point => `${point.x / camera.width * 100}% ${point.y / camera.height * 100}%`).join(', ')})` : 'inset(100%)';
  return <AtlasFailures.Provider value={{ failed, mark }}><div className="pitch-stadium-world" aria-hidden="true" data-stadium-league={presentation.league} data-stadium-fallback={presentation.fallback} data-sideline-margin={SIDELINE_MARGIN}><div className="pitch-stadium-turf-world" style={{ clipPath: turfClip }}>
    {offsets.map(offset => {
    // Only the turf of the approved painting is used. Its baked spectators and
    // side-tile copies must never appear beneath replaceable team crowd art.
    const end = camera.end === 'home' ? 1 : -1;
    const xOrigin = camera.end === 'home' ? offset : 26 + offset;
    const yOrigin = camera.end === 'home' ? 0 : 15;
    const matrix = registration.map((row, i) => i < 2 ? row.map((value, j) => end * value + (i === 0 ? xOrigin : yOrigin) * registration[2][j]) : [...row]);
    return <div key={offset} className="pitch-stadium-plate" data-world-offset={offset}
      style={{ width: WIDTH, height: HEIGHT, transform: camera.planeImageTransform(matrix) }}>
      <img className="pitch-stadium-turf" src={url} alt="" onError={onError}
        style={{ transform: end === -1 ? 'scaleX(-1)' : undefined }}/>
    </div>;
  })}</div>

    <svg className="pitch-stadium-recesses" viewBox={'0 0 '+camera.width+' '+camera.height}>
      {STADIUM_RECESSES.map(recess => <polygon key={recess.side+'-'+recess.start} data-recess={recess.role} fill="#486326"
        points={polygon(camera,recess.start,recess.side==='north'?-3.5:16.5,recess.end,recess.side==='north'?-1.5:18.5)}/>)}
    </svg>
    <StadiumStructure camera={camera} profile={presentation.venue} onError={onError}/>
    <StadiumCrowd camera={camera} home={presentation.home} away={presentation.away} onError={onError}/>
    <StadiumFurnishings camera={camera} {...presentation} onError={onError}/>
  </div></AtlasFailures.Provider>;
}
