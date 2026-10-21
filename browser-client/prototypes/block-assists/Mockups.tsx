// THROWAWAY: Which of three coordinated block/assist graphics reads best on MUTP's pitch?
// Fixed illustrative positions and contributors, never gameplay calculations or mutations.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { PitchProjection, type Point } from '../../src/pitch-projection.ts';
import { PitchScenery } from '../../src/PitchScenery.tsx';
import { BlockDie } from '../../src/BlockDie.tsx';
import { resolvePlayerArt, playerArtPlacement } from '../../src/player-art.ts';
import { projectThreatSquare, threatColors, threatOpacity } from '../../src/threat-presentation.ts';
import type { SetupPlayer, SetupState } from '../../src/setup-protocol.ts';
import './mockups.css';

type Variant = 'A' | 'B' | 'C' | 'C2';
type Kind = 'block' | 'offense' | 'defense';
type Scenario = 'Block' | 'Blitz' | 'Uphill' | 'Multiple Block';
type Stage = 'Proposed' | 'Committed' | 'Target moved' | 'Cancelled';
const variants: Variant[] = ['A', 'B', 'C', 'C2'];
const names = { A: 'Impact chevrons', B: 'Converging corners', C: 'Linked signals', C2: 'Linked signals revised' };
const descriptions = {
  A: 'Bold double chevrons identify the hit. Narrow spears advance; shield arrows defend. A short highlight chases toward each destination.',
  B: 'Graphics stay inside the contributing squares. Broken borders converge on a pointed corner; shields keep defensive assists distinct.',
  C: 'Visible connections make each contribution traceable. An impact burst marks the block, with spear and shield signals for assists.',
  C2: 'Smaller circle and diamond origins join cleanly to the assist shafts beneath the players. Paired glowing chasers converge at each connection; the compact block arrow leads into the original impact burst.',
};
const colors = { block: '#f6eed5', offense: '#ffe17b', defense: '#45e7ff' };
const label = { block: 'Block direction', offense: 'Offensive assist', defense: 'Defensive assist' };
const points = (p: Point[]) => p.map(v => `${v.x},${v.y}`).join(' ');
const center = (p: Point) => ({ x: p.x + .5, y: p.y + .5 });
const player = (id: string, role: 'home' | 'away', x: number, y: number, number: number): SetupPlayer => ({
  id, role, x, y, number, name: `${role === 'home' ? 'Human' : 'Orc'} #${number}`, slot: number,
  state: 'is standing', offPitch: 'pitch', art: { rosterId: role === 'home' ? 'human' : 'orc', positionId: role === 'home' ? 'lineman' : 'orc-lineman' },
});
const basePlayers = [player('H4', 'home', 12, 7, 4), player('O7', 'away', 13, 7, 7),
  player('H8', 'home', 14, 6, 8), player('H9', 'home', 14, 8, 9),
  player('O2', 'away', 11, 6, 2), player('O3', 'away', 11, 8, 3),
  player('H6', 'home', 15, 10, 6), player('O5', 'away', 10, 4, 5)];
const view: SetupState = { matchId: 'block-assist-visual-study', revision: 1, callerRole: 'home', phase: 'PLAY', actor: 'home', prompt: null,
  players: basePlayers, weather: 'NICE', homeRerolls: 2, awayRerolls: 2, actions: [], turn: 4, turnMode: 'REGULAR', ball: null,
  activePlayerId: 'H4', half: 1, homeTurn: 4, awayTurn: 3, homeScore: 0, awayScore: 0, drive: 1,
  homeTeamName: 'Human', awayTeamName: 'Orc', homeTeamArt: { rosterId: 'human', league: 'Old World Classic' },
  awayTeamArt: { rosterId: 'orc', league: 'Badlands Brawl' } };

/** Unit glyphs point right; their local coordinates are mapped onto the pitch plane. */
function Glyph({ variant, kind, from, to, project }: { variant: Variant; kind: Kind; from: Point; to: Point; project: (p: Point) => Point }) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x), cos = Math.cos(angle), sin = Math.sin(angle);
  const local = (x: number, y: number) => project({ x: from.x + x * cos - y * sin, y: from.y + x * sin + y * cos });
  const path = (coords: number[][], close = false) => coords.map(([x, y], i) => {
    const p = local(x, y); return `${i ? 'L' : 'M'}${p.x},${p.y}`;
  }).join(' ') + (close ? ' Z' : '');
  const outline = (coords: number[][], className = '', close = false) => <path d={path(coords, close)} className={`signal-line ${className}`}/>;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (variant === 'C2') {
    const trace = (coords: number[][], phase: string, side?: string) => <path d={path(coords)} pathLength={100}
      className={`signal-line glow-trace ${phase}`} data-trace-phase={phase} data-trace-side={side}/>;
    const pulse = (coords: number[][], phase: string) => <path d={path(coords)} className={`signal-line glow-pulse ${phase}`}/>;
    const tip = distance - (kind === 'defense' ? .31 : .29);
    const arrow = [[tip-.17,-.13],[tip,0],[tip-.17,.13]];
    const bar = [[tip,-.13],[tip,.13]];
    const radius = (kind === 'offense' ? .23 : .28) * .75;
    const originX = .03;
    const diamond = [[originX-radius,0],[originX,-radius],[originX+radius,0],[originX,radius]];
    const front = originX + radius;
    const back = 2*originX-front;
    const circleSide = (sign: number) => Array.from({ length: 25 }, (_,i) => {
      const theta = Math.PI*(1-i/24); return [originX+radius*Math.cos(theta),sign*radius*Math.sin(theta)];
    });
    const diamondSide = (sign: number) => [[back,0],...diamond.filter(([,y])=>y*sign>1e-8).sort((a,b)=>a[0]-b[0]),[front,0]];
    const upper = kind === 'offense' ? circleSide(-1) : diamondSide(-1);
    const lower = kind === 'offense' ? circleSide(1) : diamondSide(1);
    const origin = kind === 'offense' ? [...upper,...lower.slice().reverse().slice(1)] : diamond;
    const shaft = [[kind === 'block' ? .4 : front,0],[tip,0]];
    const impact = [[distance-.17,-.19],[distance-.07,-.09],[distance+.05,-.18],[distance+.03,-.03],[distance+.18,.02],
      [distance+.03,.08],[distance+.09,.23],[distance-.06,.14]];
    const impactMeet = local(impact[4][0],impact[4][1]);
    return <g className={`signal signal-${kind} variant-C2 clean-signal`} style={{ '--signal': colors[kind] } as CSSProperties}
      data-marker-kind={kind} data-origin-radius={kind === 'block' ? undefined : radius}
      data-shaft-from={shaft[0].join(',')} data-shaft-to={shaft[1].join(',')}>
      <title>{label[kind]}</title>
      {kind !== 'block' && outline(origin,`source origin-${kind === 'offense' ? 'circle' : 'diamond'}`,true)}
      {outline(shaft,kind === 'block' ? 'block-arrow shaft' : 'connector shaft')}
      {outline(arrow,kind === 'block' ? 'block-arrow arrowhead' : 'spear arrowhead')}
      {kind === 'defense' && outline(bar,'stop')}
      {kind === 'block' ? <>
        {outline(impact,'impact')}
        {trace(shaft,'block-shaft-trace')}
        {pulse(arrow,'block-head-pulse')}
        {trace(impact.slice(0,5),'impact-trace','upper')}
        {trace(impact.slice(4).reverse(),'impact-trace','lower')}
        {pulse(impact,'impact-brighten')}
        <circle cx={impactMeet.x} cy={impactMeet.y} r={2.5} className="impact-flare"/>
      </> : <>
        {trace(upper,'origin-trace','upper')}{trace(lower,'origin-trace','lower')}
        {trace(shaft,'assist-shaft-trace')}
        {pulse(arrow,'assist-head-pulse')}
        {kind === 'defense' && pulse(bar,'assist-head-pulse')}
      </>}
    </g>;
  }
  const shield = (x: number, scale = 1) => outline([[x-.14*scale,-.18*scale],[x+.12*scale,-.18*scale],[x+.18*scale,0],
    [x+.12*scale,.18*scale],[x-.14*scale,.18*scale],[x-.14*scale,-.18*scale]], 'shield');
  return <g className={`signal signal-${kind} variant-${variant}`} style={{ '--signal': colors[kind] } as CSSProperties}
    data-marker-kind={kind}><title>{label[kind]}</title>
    {variant === 'A' && <>
      {kind === 'block' ? <>
        {outline([[.03,-.26],[.31,0],[.03,.26]], 'strong')}
        {outline([[.31,-.26],[.59,0],[.31,.26]], 'strong')}
        {outline([[.03,-.26],[.31,0],[.03,.26]], 'chase')}
      </> : <>
        {outline([[.05,0],[distance-.42,0]], 'stem')}
        {kind === 'offense' ? outline([[distance-.63,-.13],[distance-.4,0],[distance-.63,.13]], 'spear') : <>
          {shield(.1)}{outline([[distance-.58,-.12],[distance-.4,0],[distance-.58,.12]])}
        </>}
        {outline([[.05,0],[distance-.42,0]], 'chase')}
      </>}
    </>}
    {variant === 'B' && <>
      {kind === 'block' ? <>
        {outline([[-.39,-.33],[.16,-.33],[.54,0],[.16,.33],[-.39,.33]], 'strong')}
        {outline([[-.23,-.2],[.13,-.2],[.35,0],[.13,.2],[-.23,.2]], 'converge')}
      </> : kind === 'offense' ? <>
        {outline([[-.34,-.29],[.06,-.29],[.46,0],[.06,.29],[-.34,.29]], 'spear')}
        {outline([[-.34,-.29],[.06,-.29],[.46,0]], 'chase')}
      </> : <>
        {outline([[-.34,-.29],[.14,-.29],[.38,0],[.14,.29],[-.34,.29],[-.34,-.29]], 'shield')}
        {outline([[-.1,-.17],[-.1,.17]])}
        {outline([[.14,-.29],[.38,0],[.14,.29]], 'converge')}
      </>}
    </>}
    {variant === 'C' && <>
      {outline([[.22,0],[distance-.3,0]], kind === 'block' ? 'strong' : 'connector')}
      {outline([[.22,0],[distance-.3,0]], 'chase')}
      {kind === 'block' ? <>
        {outline([[distance-.5,-.2],[distance-.29,0],[distance-.5,.2]], 'strong')}
        {outline([[distance-.17,-.19],[distance-.07,-.09],[distance+.05,-.18],[distance+.03,-.03],[distance+.18,.02],
          [distance+.03,.08],[distance+.09,.23],[distance-.06,.14]], 'impact')}
      </> : kind === 'offense' ? <>
        {outline([[-.12,0],[.05,-.16],[.22,0],[.05,.16],[-.12,0]], 'source')}
        {outline([[distance-.49,-.13],[distance-.29,0],[distance-.49,.13]], 'spear')}
      </> : <>
        {shield(.03, 1.15)}
        {outline([[distance-.31,-.16],[distance-.31,.16]], 'stop')}
        {outline([[distance-.5,-.11],[distance-.31,0],[distance-.5,.11]])}
      </>}
    </>}
  </g>;
}

function Sprite({ value, camera, ghost = false }: { value: SetupPlayer; camera: PitchProjection; ghost?: boolean }) {
  const art = resolvePlayerArt(value, { end: camera.end, topDown: camera.mode === 'top-down' });
  if (!art || value.x === null || value.y === null) return null;
  const pos = camera.project(center({ x: value.x, y: value.y }));
  if (!pos) return null;
  const body = art.body, { anchor } = playerArtPlacement(body, camera.mode === 'top-down');
  const scale = pos.pixelsPerSquare * 1.08 / 64;
  return <g opacity={ghost ? .4 : 1} data-sprite={value.id}>
    <ellipse cx={pos.x} cy={pos.y} rx={pos.pixelsPerSquare*.27} ry={pos.pixelsPerSquare*.09} fill="#07141b80"/>
    <image href={body.url} x={pos.x-anchor.x*scale} y={pos.y-anchor.y*scale} width={body.width*scale} height={body.height*scale} className="player-sprite"/>
    <text className={`shirt-number ${value.role}`} x={pos.x+pos.pixelsPerSquare*.28} y={pos.y+12}>{value.number}</text>
  </g>;
}

function Mockups() {
  const initial = new URLSearchParams(location.search).get('variant');
  const [variant, setVariant] = useState<Variant>(variants.includes(initial as Variant) ? initial as Variant : 'A');
  const [scenario, setScenario] = useState<Scenario>('Block');
  const [stage, setStage] = useState<Stage>('Proposed');
  const [end, setEnd] = useState<'home' | 'away'>('home');
  const [mode, setMode] = useState<'perspective' | 'top-down'>('perspective');
  const [threats, setThreats] = useState(true), [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [animationPhase, setAnimationPhase] = useState('live');
  const [second, setSecond] = useState(false);
  const pitchHost = useRef<HTMLDivElement>(null);
  const [pitchWidth, setPitchWidth] = useState(1100);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setPitchWidth(entry.contentRect.width));
    observer.observe(pitchHost.current!); return () => observer.disconnect();
  }, []);
  const choose = (key: Variant) => {
    setVariant(key); const url = new URL(location.href); url.searchParams.set('variant', key); history.replaceState(null, '', url);
  };
  const cycle = (delta: number) => choose(variants[(variants.indexOf(variant)+delta+variants.length)%variants.length]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [variant]);
  const camera = new PitchProjection({ width: 1100, height: 620, focus: scenario === 'Blitz' ? 11.8 : 12.8,
    transverseFocus: 7.5, zoom: scenario === 'Blitz' ? 1.9 : 2.4, mode, end });
  const project = (p: Point) => camera.project(p)!;
  const blocker = { x: 12, y: 7 }, target = scenario === 'Multiple Block' && second ? { x: 12, y: 8 } : { x: 13, y: 7 };
  const offensive = scenario === 'Multiple Block' ? [second ? 'H9' : 'H8'] : ['H8', 'H9'];
  const defensive = scenario === 'Multiple Block' ? ['O2'] : ['O2', 'O3'];
  let players = basePlayers.map(p => ({ ...p }));
  if (scenario === 'Multiple Block') players = players.map(p => p.id === 'O3' ? { ...p, x: 12, y: 8 } : p.id === 'H9' ? { ...p, x: 13, y: 9 } : p);
  if (scenario === 'Blitz' && stage === 'Proposed') players = players.map(p => p.id === 'H4' ? { ...p, x: 9, y: 7 } : p);
  if (stage === 'Target moved') players = players.map(p => p.id === (second && scenario === 'Multiple Block' ? 'O3' : 'O7') ? { ...p, x: p.x!+1 } : p);
  const active = stage === 'Proposed' || stage === 'Committed';
  const glyph = (kind: Kind, from: Point, to: Point, key?: string) => <Glyph key={key} variant={variant} kind={kind} from={center(from)} to={center(to)} project={project}/>;
  const planned = scenario === 'Blitz' && stage === 'Proposed';
  const roleText = stage === 'Proposed' ? 'PRIVATE PLANNING PREVIEW' : scenario === 'Uphill' ? 'OPPONENT CHOOSES THE DIE' : 'COMMITTED BLOCK';
  return <main className={`mockup-page ${motion ? 'motion-preview' : 'motion-off'} ${new URLSearchParams(location.search).has('capture') ? 'capture-view' : ''}`}
    data-animation-phase={animationPhase} style={{ '--trace-delay': `${-4.8*Number(animationPhase === 'live' ? 0 : animationPhase)}s` } as CSSProperties}>
    <header className="review-header"><a href="?variant=A" className="brand">MUTP<span>BLOCK / BLITZ VISIBILITY</span></a><span className="prototype-tag">VISUAL MOCKUPS · NOT LIVE PLAY</span></header>
    <section className="intro"><div><span className="eyebrow">BLOCK / ASSIST DESIGN STUDY</span><h1>{variant}<span> / </span>{names[variant]}</h1><p>{descriptions[variant]}</p></div><div className="review-note">Compare the block marker and both assist types together.<br/>Same palette. Same pitch. Different visual language.</div></section>
    <div className="review-layout">
      <section className="match-frame" aria-label="Pitch mockup">
        <div className="match-top"><span>HUMANS <b>0</b></span><span className="match-turn">HALF 1 · TURN 4</span><span><b>0</b> ORCS</span></div>
        <div className="pitch-stage" ref={pitchHost}>
          <div className="pitch-art" style={{ transform: `scale(${pitchWidth/1100})` }}><PitchScenery camera={camera} view={view} onError={() => {}}/></div>
          <svg viewBox="0 0 1100 620" role="img" aria-label={`${names[variant]}: ${scenario}, ${stage}. White block marker, ${variant === 'C2' ? 'gold offensive circles, cyan defensive diamonds. Assist arrows are beneath player sprites.' : 'gold offensive spears, cyan defensive shields.'}`}>
            {Array.from({length:390}, (_,i) => ({ x:Math.floor(i/15), y:i%15 })).map(square => <polygon key={`${square.x},${square.y}`} points={points(camera.square(square,0,true))} fill={(square.x+square.y)%2 ? '#18392222' : '#b1c46a0b'} stroke="#d0d7a6" strokeOpacity=".14"/>)}
            {threats && Array.from({length:48},(_,i)=>({ x:10+Math.floor(i/8),y:4+i%8 })).map(square => {
              // Illustrative density swatches; reuse actual threat projection, palette, and opacity.
              const n = ((square.x*3+square.y)%4)+1;
              const marker = projectThreatSquare({...square,count:n,tackle:false,striped:square.y%3===0},camera,true,false);
              return <g key={`threat-${square.x},${square.y}`} data-threat-swatch="true">{marker.fills.map((polygon,index)=><polygon key={index} points={points(polygon)} fill={threatColors[n-1]} fillOpacity={threatOpacity}/>)}</g>;
            })}
            {planned && <path className="blitz-route" d={[9,10,11,12].map((x,i)=>{const p=project(center({x,y:7}));return `${i?'L':'M'}${p.x},${p.y}`;}).join(' ')}/>}
            {variant === 'C2' && active && <g className="assist-underlays" data-active-target={scenario === 'Multiple Block' && second ? 'O3' : 'O7'}>
              {offensive.map(id=>{const p=players.find(p=>p.id===id)!;return glyph('offense',{x:p.x!,y:p.y!},target,id);})}
              {defensive.map(id=>{const p=players.find(p=>p.id===id)!;return glyph('defense',{x:p.x!,y:p.y!},blocker,id);})}
            </g>}
            {players.sort((a,b)=>project(center({x:a.x!,y:a.y!})).y-project(center({x:b.x!,y:b.y!})).y).map(p=><Sprite key={p.id} value={p} camera={camera}/>)}
            {planned && <Sprite value={basePlayers[0]} camera={camera} ghost/>}
            {scenario === 'Multiple Block' && stage !== 'Cancelled' && <g className="inactive-target" opacity=".35">{glyph('block',blocker,second ? {x:13,y:7}:{x:12,y:8})}</g>}
            {active && <g className="block-overlays" data-active-target={scenario === 'Multiple Block' && second ? 'O3' : 'O7'}>
              {glyph('block',blocker,target)}
              {variant !== 'C2' && offensive.map(id=>{const p=players.find(p=>p.id===id)!;return glyph('offense',{x:p.x!,y:p.y!},target,id);})}
              {variant !== 'C2' && defensive.map(id=>{const p=players.find(p=>p.id===id)!;return glyph('defense',{x:p.x!,y:p.y!},blocker,id);})}
            </g>}
          </svg>
          <div className="pitch-caption"><span>{active ? roleText : 'HIGHLIGHTS CLEARED'}</span><strong>{active ? `#4 → #${scenario === 'Multiple Block' && second ? '3' : '7'}` : stage}</strong><small>{planned ? 'Ghost = proposed blocking square' : 'White = block · Gold = offense · Cyan = defense'}</small></div>
          {scenario === 'Uphill' && stage === 'Committed' && <div className="uphill-prompt"><span>ORC COACH · SELECT A BLOCK DIE</span><div><BlockDie face="PUSHBACK" uphill chosenBy="away"/><BlockDie face="SKULL" uphill chosenBy="away"/></div><small>Human #4 is blocking Orc #7</small></div>}
        </div>
        <footer className="pitch-footer"><span>Threat colors + striping shown beneath the new markers</span><span>{end === 'home' ? 'HOME' : 'AWAY'} VIEW · {mode === 'perspective' ? '40° PERSPECTIVE' : 'TACTICAL'}</span></footer>
      </section>
      <aside className="review-controls"><h2>Review the design</h2><label>Situation<select value={scenario} onChange={e=>{setScenario(e.target.value as Scenario);setSecond(false);setStage(e.target.value==='Uphill'?'Committed':'Proposed');}}>{['Block','Blitz','Uphill','Multiple Block'].map(s=><option key={s}>{s}</option>)}</select></label>
        {scenario === 'Multiple Block' && <div className="target-switch"><button aria-pressed={!second} onClick={()=>setSecond(false)}>Block 1 · #7</button><button aria-pressed={second} onClick={()=>setSecond(true)}>Block 2 · #3</button></div>}
        <label>Display moment<select value={stage} onChange={e=>setStage(e.target.value as Stage)}>{['Proposed','Committed','Target moved','Cancelled'].map(s=><option key={s}>{s}</option>)}</select></label>
        <div className="control-pair"><label>Camera<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="perspective">Perspective</option><option value="top-down">Tactical</option></select></label><label>View<select value={end} onChange={e=>setEnd(e.target.value as typeof end)}><option value="home">Home</option><option value="away">Away</option></select></label></div>
        <label className="check"><input type="checkbox" checked={threats} onChange={e=>setThreats(e.target.checked)}/>Threat contrast backdrop</label><label className="check"><input type="checkbox" checked={motion} onChange={e=>setMotion(e.target.checked)}/>Animate markers</label>
        {variant === 'C2' && window.matchMedia('(prefers-reduced-motion: reduce)').matches && <small className="motion-note">Reduced motion is on. Enable animation to preview this design.</small>}
        {variant === 'C2' && <label>Animation phase<select value={animationPhase} onChange={e=>setAnimationPhase(e.target.value)}><option value="live">Live</option><option value="0.2">Early · origin / block base</option><option value="0.55">Middle · shaft / impact sides</option><option value="0.86">Convergence · brighter impact</option></select></label>}
        <div className="state-readout"><span className="eyebrow">ILLUSTRATIVE DISPLAY STATE</span><dl><dt>Attacker</dt><dd>Human #4</dd><dt>Target</dt><dd>Orc #{scenario==='Multiple Block'&&second?'3':'7'}</dd><dt>Offense</dt><dd>{active ? offensive.join(', ') : 'Cleared'}</dd><dt>Defense</dt><dd>{active ? defensive.join(', ') : 'Cleared'}</dd><dt>Visibility</dt><dd>{stage==='Proposed'?'Acting coach only':stage==='Committed'?'Both coaches + spectators':'No overlays'}</dd></dl><p>Fixed visual examples; contributors, threat swatches, and dice are illustrative. No game rules run here.</p></div>
      </aside>
    </div>
    <section className="element-strip" aria-label="Three graphical elements">{(['block','offense','defense'] as Kind[]).map(kind=><article key={kind}><svg viewBox="0 0 180 82" aria-label={label[kind]}><path d="M18 14H162V68H18Z M90 14V68" stroke="#35516a" fill="#142e4b"/><Glyph variant={variant} kind={kind} from={{x:0,y:0}} to={{x:1,y:0}} project={p=>({x:48+p.x*82,y:41+p.y*82})}/></svg><div><h3>{label[kind]}</h3><p>{kind==='block'?'Ivory · attacker toward target':kind==='offense'?(variant==='C2'?'Gold circle · helper toward target':'Gold spear · helper toward target'):(variant==='C2'?'Cyan diamond + bar · toward attacker':'Cyan shield · helper toward attacker')}</p></div></article>)}</section>
    {import.meta.env.DEV && <nav className="variant-switcher" aria-label="Mockup variants"><button onClick={()=>cycle(-1)} aria-label="Previous variant">←</button>{variants.map(v=><button key={v} aria-pressed={variant===v} onClick={()=>choose(v)}>{v}<span>{names[v]}</span></button>)}<button onClick={()=>cycle(1)} aria-label="Next variant">→</button></nav>}
    <p className="review-footnote">Visual study only · Use ← / → to compare · Animation also respects your system’s reduced-motion setting.</p>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Mockups/>);
