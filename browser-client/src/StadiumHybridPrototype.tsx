// Throwaway rendering study for #211. The existing /pitch-preview route selects it in DEV only.
import { useEffect, useId, useRef, useState } from 'react';
import { PitchProjection, type Point, type PerspectiveElevation } from './pitch-projection.ts';
import { hybridFaces, hybridGroups, hybridFaceCenter, hybridDepth, hybridViewRow, HYBRID_ATLAS,
  type HybridFace, type HybridGroup } from './stadium-hybrid-prototype.ts';
import { stadiumPresentation } from './stadium-presentation.ts';
import { jigsawModules, jigsawDepth } from './stadium-jigsaw.ts';
import { JigsawSurface } from './StadiumJigsaw.tsx';
import { initialPlayers, spriteUrl } from './pitch-demo.ts';
import './stadium-hybrid-prototype.css';
import './pitch-scenery.css';

const asset = (file: string) => import.meta.env.BASE_URL + 'assets/game/' + file;
const crowdUrl = asset('pitch/stadiums/prototype/human-groups-v1.png');
const presentation = stadiumPresentation({ homeTeamArt: { rosterId: 'human', league: 'Old World Classic' },
  awayTeamArt: { rosterId: 'orc', league: 'Badlands Brawl' } });
const faces = hybridFaces(), groups = hybridGroups();
const variantNames = ['hybrid', 'structure', 'current'] as const;
type Variant = typeof variantNames[number];
const points = (p: Point[]) => p.map(v => v.x + ',' + v.y).join(' ');

function Face({ face, camera }: { face: HybridFace; camera: PitchProjection }) {
  const id = useId().replace(/:/g, '');
  const w = Math.hypot(face.across.x, face.across.y, face.across.z) * 128;
  const h = Math.hypot(face.down.x, face.down.y, face.down.z) * 128;
  const surface = camera.surfaceImage(w, h, face.origin,
    { x: face.across.x / w, y: face.across.y / w, z: face.across.z / w },
    { x: face.down.x / h, y: face.down.y / h, z: face.down.z / h });
  if (!surface) return null;
  const wall = face.material === 'wall', cap = face.material === 'cap';
  return <div className="stadium-surface hybrid-face" data-hybrid-face={face.id} data-material={face.material}
    style={{ width: surface.width, height: surface.height, transform: surface.transform, clipPath: surface.clipPath }}>
    <svg width={surface.width} height={surface.height} viewBox={`${surface.left} ${surface.top} ${surface.width} ${surface.height}`}>
      <defs><pattern id={id} width={128} height={wall || cap ? 46 : 128} patternUnits="userSpaceOnUse">
        <rect width="128" height="128" fill={cap ? '#8c8270' : '#514a3e'}/>
        {wall || cap ? <svg width="128" height="46" viewBox="882 728 212 76" preserveAspectRatio="none">
          <image href={asset('pitch/stadiums/jigsaw/human-walls-v1.png')} width="1835" height="857"/>
        </svg> : <><path d="M0 0H128V128H0Z M64 0V64 M0 64H128 M32 64V128 M96 64V128" fill="#716958" stroke="#3a332b" strokeWidth="3"/>
          <path d="M2 3H62 M66 3H126 M2 67H30 M35 67H94" stroke="#9b9278" strokeWidth="2" opacity=".6"/></>}
      </pattern></defs>
      {face.material === 'doorway' ? <>
        <rect width={w} height={h} fill={'url(#' + id + ')'}/>
        <g transform={`scale(${w/512} ${h/512})`}><path d="M74 512V209Q74 45 256 45Q438 45 438 209V512Z" fill="#080b0d" stroke="#b3aa8d" strokeWidth="22"/>
        {[0,1,2,3,4].map(i => <path key={i} d={`M${98+i*23} ${490-i*54}H${414-i*23}v${22-i*3}H${98+i*23}Z`}
          fill={['#746e5a','#5b5649','#423f37','#2b2d2a','#1a201f'][i]}/>)}</g>
      </> : face.outline ? <polygon points={points(face.outline)} fill={'url(#' + id + ')'}/>
        : <rect width={w} height={h} fill={'url(#' + id + ')'}/ >}
      {cap && !face.outline && <rect width={w} height={h} fill="none" stroke="#a69b7d" strokeWidth="2"/>}
    </svg>
  </div>;
}

function CrowdGroup({ group, camera, frame, inspect }: { group: HybridGroup; camera: PitchProjection; frame: number; inspect: boolean }) {
  const row = hybridViewRow(group, camera), region = HYBRID_ATLAS.rows[row];
  const point = camera.projectRaised(group.anchor, group.anchor.z);
  if (!point) return null;
  // Screen-aligned intact cards use one scale in both dimensions: no arbitrary quad stretch.
  const width = point.pixelsPerSquare * 2.1, height = width * region.height / HYBRID_ATLAS.cellWidth;
  const top = camera.mode === 'top-down' ? point.y - height / 2 : point.y - height;
  const forward = camera.projectRaised({x:group.anchor.x+Math.cos(group.facing),y:group.anchor.y+Math.sin(group.facing)},group.anchor.z);
  const rotation = camera.mode==='top-down' && forward ? Math.atan2(forward.y-point.y,forward.x-point.x)-Math.PI/2 : 0;
  return <div className={'hybrid-group' + (inspect ? ' inspected' : '')} data-hybrid-group={group.id}
    data-section={group.section} data-rank={group.rank} data-view-row={row} data-frame={frame}
    data-world-x={group.anchor.x} data-world-y={group.anchor.y} data-world-z={group.anchor.z}
    style={{ left: point.x - width / 2, top, width, height, transform:rotation?`rotate(${rotation}rad)`:undefined }}>
    <svg width={width} height={height} viewBox={`${frame * HYBRID_ATLAS.cellWidth} ${region.y} ${HYBRID_ATLAS.cellWidth} ${region.height}`}>
      <image href={crowdUrl} width={HYBRID_ATLAS.width} height={HYBRID_ATLAS.height}/>
    </svg>
  </div>;
}

function Ground({ camera }: { camera: PitchProjection }) {
  const id = useId().replace(/:/g, '');
  const surface = camera.surfaceImage(1824, 1296, { x: -6, y: -6, z: 0 }, { x: 1/48, y: 0, z: 0 }, { x: 0, y: 1/48, z: 0 });
  if (!surface) return null;
  return <div className="stadium-surface" style={{ width: surface.width, height: surface.height, transform: surface.transform, clipPath: surface.clipPath }}>
    <svg width={surface.width} height={surface.height} viewBox={`${surface.left} ${surface.top} ${surface.width} ${surface.height}`}>
      <defs><pattern id={id} width="48" height="48" patternUnits="userSpaceOnUse"><svg width="48" height="48" viewBox="720 400 96 96"><image href={asset('pitch/stadium-v1.png')} width="1672" height="941"/></svg></pattern></defs>
      <rect width="1824" height="1296" fill={'url(#' + id + ')'}/>
    </svg>
  </div>;
}

function Pitch({ camera }: { camera: PitchProjection }) {
  const line = (a: Point, b: Point) => {
    const from = camera.project(a), to = camera.project(b);
    return from && to ? `M${from.x} ${from.y}L${to.x} ${to.y}` : '';
  };
  return <svg className="hybrid-pitch" width={camera.width} height={camera.height}>
    {Array.from({ length: 390 }, (_, i) => {
      const x = i % 26, y = Math.floor(i / 26);
      return <polygon key={i} data-cell-x={x} data-cell-y={y} points={points(camera.square({ x, y }, 0, true))}
        fill={x === 0 ? '#24467066' : x === 25 ? '#75352666' : (x+y)%2 ? '#4b762512' : '#a5b86409'} stroke="#12271955" strokeWidth=".7"/>;
    })}
    <path d={[... [0,1,13,25,26].map(x=>line({x,y:0},{x,y:15})), line({x:0,y:0},{x:26,y:0}),line({x:0,y:15},{x:26,y:15})].join(' ')} stroke="#f0eed2" strokeWidth="2" opacity=".84" fill="none"/>
    {[4,11].map(y=><path key={y} d={line({x:0,y},{x:26,y})} stroke="#f0eed2" strokeWidth="2" strokeDasharray="12 10" opacity=".84"/ >)}
  </svg>;
}

function Prop({ camera, role, x, y, z, width }: { camera: PitchProjection; role: 'bench'|'mugs'|'torch'; x: number; y: number; z: number; width: number }) {
  const profile = presentation.home, top = camera.mode === 'top-down';
  const key = top && role !== 'mugs' ? role === 'bench' ? 'benchTop' : 'torchTop' : role;
  const region = profile.regions[key], point = camera.projectRaised({ x, y }, z);
  if (!point) return null;
  const w = point.pixelsPerSquare * width, h = w * region.height / region.width;
  return <svg className={'hybrid-prop ' + role} data-hybrid-prop={role} style={{ left: point.x-w/2, top: point.y-(top?h/2:h), width:w, height:h,
    transform:top&&role==='bench'?`rotate(${camera.end==='home'?-90:90}deg)`:undefined }}
    viewBox={`${region.x} ${region.y} ${region.width} ${region.height}`}>
    <image href={asset('pitch/stadiums/'+profile.atlas)} width={profile.width} height={profile.height}/>
  </svg>;
}

export function StadiumHybridPrototype() {
  const params = new URLSearchParams(window.location.search);
  const [variant, setVariant] = useState<Variant>(variantNames.includes(params.get('study') as Variant) ? params.get('study') as Variant : 'hybrid');
  const [end, setEnd] = useState<'home'|'away'>(params.get('end')==='away'?'away':'home');
  const [elevation, setElevation] = useState<30|40|50|90>(40);
  const [focus, setFocus] = useState(0), [zoom, setZoom] = useState(.75);
  const [transverseFocus,setTransverseFocus]=useState(7.5);
  const [motion, setMotion] = useState(true), [inspect, setInspect] = useState(false);
  const [active, setActive] = useState<{id:string;frame:number}|null>(null);
  const [size, setSize] = useState({width:1280,height:720});
  const stage = useRef<HTMLDivElement>(null), drag = useRef<{x:number;y:number}|null>(null);
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>{reduced.current=media.matches;if(media.matches)setActive(null);};
    media.addEventListener('change',update);return()=>media.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setSize({width:Math.max(1,r.width),height:Math.max(1,r.height)});});
    observer.observe(stage.current!);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const url=new URL(window.location.href);url.searchParams.set('study',variant);url.searchParams.set('end',end);history.replaceState(null,'',url);
  },[variant,end]);
  const camera = new PitchProjection({...size,end,mode:elevation===90?'top-down':'perspective',focus,transverseFocus,zoom,
    perspectiveElevation:(elevation===90?40:elevation) as PerspectiveElevation});
  const cameraRef=useRef(camera);cameraRef.current=camera;
  useEffect(()=>{
    if(!motion||variant!=='hybrid'){setActive(null);return;}
    let wait:ReturnType<typeof setTimeout>,frames:ReturnType<typeof setInterval>|undefined;
    const schedule=()=>{wait=setTimeout(()=>{
      if(reduced.current){schedule();return;}
      const currentCamera=cameraRef.current;
      const visible=groups.filter(g=>{const p=currentCamera.projectRaised(g.anchor,g.anchor.z);return p&&p.x>0&&p.x<currentCamera.width&&p.y>0&&p.y<currentCamera.height;});
      if(!visible.length){schedule();return;}
      const id=visible[Math.floor(Math.random()*visible.length)].id;
      let step=0;const sequence=[1,2,2,1,0];setActive({id,frame:sequence[0]});
      frames=setInterval(()=>{step++;if(reduced.current||step>=sequence.length){clearInterval(frames);setActive(null);schedule();}else setActive({id,frame:sequence[step]});},240);
    },1800+Math.random()*3500);};schedule();
    return()=>{clearTimeout(wait);clearInterval(frames);};
  },[motion,variant]);
  const objects = [
    ...faces.map(face=>({id:face.id,depth:hybridDepth(hybridFaceCenter(face),camera),node:<Face face={face} camera={camera}/>})),
    ...variant==='structure'?[]:groups.map(group=>({id:group.id,depth:hybridDepth(group.anchor,camera),node:<CrowdGroup group={group} camera={camera} inspect={inspect} frame={active?.id===group.id?active.frame:0}/>})),
    ...([{id:'bench',role:'bench',x:6.4,y:-1.4,z:0,width:1.6},{id:'mugs',role:'mugs',x:6.7,y:-1.4,z:.5,width:.35},
      {id:'torch-left',role:'torch',x:4.5,y:-2.3,z:.6,width:.22},{id:'torch-right',role:'torch',x:7.3,y:-2.3,z:.6,width:.22}] as const)
      .map(prop=>({id:prop.id,depth:hybridDepth(prop,camera),node:<Prop camera={camera} {...prop}/>}))
  ].sort((a,b)=>b.depth-a.depth);
  const current = variant==='current' ? jigsawModules(camera,presentation.venue,presentation.home,presentation.away)
    .filter(m=>m.piece==='north-home'||m.piece==='home-north-corner'||m.edge==='north'&&m.role!=='crowd')
    .sort((a,b)=>jigsawDepth(b,camera)-jigsawDepth(a,camera)) : [];
  const frameGroup=()=>{setFocus(0);setTransverseFocus(7.5);setEnd('home');setZoom(.75);setElevation(40);};
  const inspectJoin=()=>{setFocus(0);setTransverseFocus(0);setEnd('home');setZoom(1.25);setElevation(40);};
  return <main className="hybrid-prototype">
    <header><div><span className="hybrid-eyebrow">STADIUM STUDY · HUMAN SIDE + CORNER</span><h1>One joined section</h1></div>
      <p>26 × 15 pitch · shared game camera · development prototype</p></header>
    <div className="hybrid-controls">
      <label>View<select aria-label="Camera angle" value={elevation} onChange={e=>setElevation(Number(e.target.value) as typeof elevation)}>
        <option value="40">40° perspective</option><option value="90">Overhead</option><option value="30">30° stress check</option><option value="50">50° stress check</option></select></label>
      <label>Viewing end<select aria-label="Viewing end" value={end} onChange={e=>setEnd(e.target.value as typeof end)}><option value="home">Home</option><option value="away">Away</option></select></label>
      <button onClick={()=>setFocus(0)}>Home end</button><button onClick={()=>setFocus(13)}>Midfield</button><button onClick={()=>setFocus(26)}>Away end</button><button onClick={inspectJoin}>Inspect join</button><button onClick={frameGroup}>Reset view</button>
      <label>Zoom<input aria-label="Zoom" type="range" min=".5" max="1.8" step=".05" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
      <label><input type="checkbox" checked={motion} onChange={e=>setMotion(e.target.checked)}/>Local gestures</label>
      <label><input type="checkbox" checked={inspect} onChange={e=>setInspect(e.target.checked)}/>Show group bounds</label>
    </div>
    <div ref={stage} className="hybrid-stage" data-testid="hybrid-stage" data-study={variant} data-camera-end={end} data-camera-angle={elevation}
      data-camera-focus={focus} data-camera-zoom={zoom} data-transverse-focus={transverseFocus} tabIndex={0} aria-label="Stadium test field: drag to scroll, use the wheel to zoom" role="group"
      onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
      onPointerMove={e=>{if(!drag.current)return;const next=camera.panPixels({x:e.clientX-drag.current.x,y:e.clientY-drag.current.y});setFocus(next.focus);setTransverseFocus(next.transverseFocus);drag.current={x:e.clientX,y:e.clientY};}}
      onWheel={e=>setZoom(v=>Math.max(.5,Math.min(1.8,v-e.deltaY*.001)))}
      onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setFocus(v=>Math.max(0,Math.min(26,v+(e.key==='ArrowUp'?1:-1)*(end==='home'?1:-1))));}}}>
      <Ground camera={camera}/><Pitch camera={camera}/>
      {variant==='current'?current.map(m=><JigsawSurface key={m.id} module={m} camera={camera} failed={false} gestureFailed={false} onError={()=>{}}/>):objects.map(o=><div className="hybrid-object" key={o.id}>{o.node}</div>)}
      {initialPlayers.map(player=>{const p=camera.project({x:player.x+.5,y:player.y+.5});return p?<img key={player.name} className="hybrid-player" src={spriteUrl(player.sprite,player.team)} alt={player.name}
        style={{left:p.x-p.pixelsPerSquare*.5,top:p.y-p.pixelsPerSquare*.85,width:p.pixelsPerSquare}}/>:null;})}
      <div className="hybrid-state" role="status">{elevation}° · {end} view · focus {focus.toFixed(1)} / 26 · zoom {zoom.toFixed(2)}<br/>
        {variant==='hybrid'?'42 intact groups on 3 raised ranks':variant==='structure'?'Geometry and pitch-side props':'Current bank and corner rendering'}<br/>
        {active ? active.id+' · gesture '+active.frame : 'Rest'} · drag / ↑ ↓ to scroll</div>
    </div>
    <nav className="hybrid-switcher" aria-label="Prototype comparison">
      {variantNames.map(v=><button key={v} aria-pressed={variant===v} onClick={()=>setVariant(v)}>{v==='hybrid'?'Hybrid crowd':v==='structure'?'Structure only':'Current rendering'}</button>)}
    </nav>
  </main>;
}
