// THROWAWAY: Compare the approved gold artwork with alternate borders and placement.
// Illustrative snapshots only. This does not consume or simulate game allowances.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { ActionGlyph, type ActionGlyphKind } from '../../src/ActionGlyph.tsx';
import { PitchScenery } from '../../src/PitchScenery.tsx';
import { PitchProjection, type Point } from '../../src/pitch-projection.ts';
import { resolvePlayerArt, playerArtPlacement } from '../../src/player-art.ts';
import { skillMarkerUrl } from '../../src/skill-marker-presentation.ts';
import { projectThreatSquare, threatColors, threatOpacity } from '../../src/threat-presentation.ts';
import type { SetupPlayer } from '../../src/setup-protocol.ts';
import './mockups.css';

type Variant = 'gold' | 'gold-circle' | 'gold-fade' | 'ice';
type Scenario = 'busy' | 'statuses' | 'adjacent' | 'removed';
const variants: Variant[] = ['gold', 'gold-circle', 'gold-fade', 'ice'];
const names: Record<Variant, string> = { gold: 'MUTP gold · original', 'gold-circle': 'Gold · circular border', 'gold-fade': 'Gold · circular fade', ice: 'White / light blue' };
const shortNames: Record<Variant, string> = { gold: 'Original', 'gold-circle': 'Circle', 'gold-fade': 'Fade', ice: 'White / blue' };
const descriptions: Record<Variant, string> = {
  gold: 'The original gold badge beside the skill marker, retained for comparison.',
  'gold-circle': 'The approved gold icon inside a circular border, centered above the player’s head.',
  'gold-fade': 'The approved gold icon over a soft dark circular fade, centered above the player’s head. No border or tile.',
  ice: 'The original white / light-blue treatment, retained for comparison.',
};
const actions: { kind: ActionGlyphKind; name: string }[] = [
  { kind: 'blitz', name: 'Blitz' }, { kind: 'pass', name: 'Pass' },
  { kind: 'handOff', name: 'Hand-off' }, { kind: 'bomb', name: 'Throw Bomb' },
  { kind: 'foul', name: 'Foul' }, { kind: 'throwMate', name: 'Throw Team-mate' },
  { kind: 'kickMate', name: 'Kick Team-mate' }, { kind: 'punt', name: 'Punt' },
  { kind: 'secure', name: 'Secure the Ball' },
];
const consumed: Record<string, ActionGlyphKind> = { H2: 'blitz', H4: 'pass', H6: 'handOff', H8: 'foul' };
const skills: Record<string, [string, string]> = {
  H2: ['block', 'Block'], H4: ['dodge', 'Dodge'], H6: ['catch', 'Catch'], H8: ['sneaky-git', 'Sneaky Git'],
};
const home = [[12,6], [13,7], [11,8], [14,9], [15,5], [10,5], [13,4], [16,8], [10,9], [15,10], [9,7]];
const away = [[13,6], [12,7], [12,8], [14,8], [15,6], [11,5], [14,4], [16,9], [10,10], [15,11], [9,8]];
const markedNumbers = [2, 4, 6, 8, 1, 3, 5, 7, 9, 10, 11];
const basePlayers: SetupPlayer[] = (['home', 'away'] as const).flatMap(role => (role === 'home' ? home : away).map(([x,y], i) => {
  const number = role === 'home' ? markedNumbers[i] : i+1;
  return { id: `${role === 'home' ? 'H' : 'O'}${number}`, number, slot: number, role, x, y,
    name: `${role === 'home' ? 'Human' : 'Orc'} #${number}`, state: 'is standing', offPitch: 'pitch',
    art: { rosterId: role === 'home' ? 'human' : 'orc', positionId: role === 'home'
      ? i === 0 ? 'blitzer' : i === 1 ? 'thrower' : i === 2 ? 'catcher' : 'lineman'
      : i < 2 ? 'orc-blitzer' : 'orc-lineman' } };
}));
const points = (polygon: Point[]) => polygon.map(p => `${p.x},${p.y}`).join(' ');

function Badge({ kind, size = 24 }: { kind: ActionGlyphKind; size?: number }) {
  const name = actions.find(action => action.kind === kind)!.name;
  return <span className="action-badge" data-action-marker={kind} aria-label={`${name} consumed`}
    title={`${name} consumed`} style={{ width: size, height: size }}><ActionGlyph kind={kind}/></span>;
}

function Player({ value, camera, showMarkers, showSkills, variant }: {
  value: SetupPlayer; camera: PitchProjection; showMarkers: boolean; showSkills: boolean; variant: Variant;
}) {
  const art = resolvePlayerArt(value, { end: camera.end, topDown: camera.mode === 'top-down' });
  if (!art || value.x === null || value.y === null) return null;
  const pos = camera.project({ x: value.x+.5, y: value.y+.5 });
  if (!pos) return null;
  const { body } = art, { anchor } = playerArtPlacement(body, camera.mode === 'top-down');
  const scale = pos.pixelsPerSquare*1.08/64;
  const top = (body.bounds.y-anchor.y)*scale;
  const badgeSize = Math.max(18, Math.min(30, pos.pixelsPerSquare*.4));
  const skill = showSkills ? skills[value.id] : null;
  const action = showMarkers ? consumed[value.id] : null;
  const headPlacement = variant === 'gold-circle' || variant === 'gold-fade';
  const skillHeight = Math.max(14, badgeSize*.64);
  const headCenter = (body.bounds.x+body.bounds.width/2-anchor.x)*scale;
  return <div className={`review-player ${value.role}`} data-player={value.id} data-status={value.state}
    style={{ left: pos.x, top: pos.y, zIndex: 10+Math.round(pos.y) }}>
    <span className="player-shadow" style={{ width: pos.pixelsPerSquare*.55, height: pos.pixelsPerSquare*.12 }}/>
    <img className="player-art" alt={`${value.name}, ${value.state}`} draggable={false} src={body.url}
      style={{ width: body.width*scale, height: body.height*scale, left: -anchor.x*scale, top: -anchor.y*scale,
        transform: body.mirror ? 'scaleX(-1)' : undefined }}/>
    <span className="player-number" style={{ left: pos.pixelsPerSquare*.27, top: 2 }}>{value.number}</span>
    {((action && !headPlacement) || skill) && <span className="player-badges" style={{ bottom: -top+5 }}>
      {action && !headPlacement && <Badge kind={action} size={badgeSize}/>}
      {skill && <img className="skill-badge" src={skillMarkerUrl(skill[0], 'text')} alt={skill[1]}
        style={{ height: skillHeight }}/>} </span>}
    {action && headPlacement && <span className="head-action" style={{ left: headCenter, bottom: -top+(skill ? skillHeight+2 : 5) }}>
      <Badge kind={action} size={badgeSize}/>
    </span>}
    {value.state === 'is distracted' && <span className="distracted-indicator" aria-label="Distracted">!</span>}
  </div>;
}

function Mockups() {
  const params = new URLSearchParams(location.search);
  const initial = params.get('variant') as Variant;
  const [variant, setVariant] = useState<Variant>(variants.includes(initial) ? initial : 'gold-circle');
  const [scenario, setScenario] = useState<Scenario>('busy');
  const [mode, setMode] = useState<'perspective' | 'top-down'>('perspective');
  const [end, setEnd] = useState<'home' | 'away'>('home');
  const [zoom, setZoom] = useState(1.35);
  const [showMarkers, setShowMarkers] = useState(true), [showSkills, setShowSkills] = useState(true);
  const [threats, setThreats] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1100, height: 620 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(host.current!); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const window = host.current!.parentElement!;
    const observer = new ResizeObserver(() => { window.scrollLeft = (window.scrollWidth-window.clientWidth)/2; });
    observer.observe(window); return () => observer.disconnect();
  }, []);
  const choose = (value: Variant) => {
    setVariant(value); const url = new URL(location.href); url.searchParams.set('variant', value); history.replaceState(null, '', url);
  };
  const cycle = (delta: number) => choose(variants[(variants.indexOf(variant)+delta+variants.length)%variants.length]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [variant]);
  const camera = new PitchProjection({ ...size, focus: 12.5, transverseFocus: 7.5, mode, end, zoom });
  const players = basePlayers.map(player => {
    if (scenario === 'removed' && player.id === 'H2') return { ...player, x: null, y: null, offPitch: 'casualty' as const };
    if (scenario === 'statuses') return { ...player, state: player.id === 'H2' ? 'is prone' : player.id === 'H6' ? 'has been stunned' : player.id === 'H8' ? 'is distracted' : player.state };
    if (scenario === 'adjacent' && player.id === 'H6') return { ...player, x: 13, y: 8 };
    return player;
  });
  const marked = players.filter(player => consumed[player.id]);
  const count = marked.filter(player => player.x !== null).length;
  const ball = camera.project({ x: 13.5, y: 7.5 })!;
  return <main className="limited-review" data-variant={variant}>
    <header className="review-header"><a href="?variant=gold" className="wordmark">MUTP<span>LIMITED ACTION TAGS</span></a><span className="review-label">VISUAL MOCKUP</span></header>
    <section className="intro"><div><p className="eyebrow">ONE GLANCE. ACTION ACCOUNTED FOR.</p><h1>{names[variant]}</h1><p>{descriptions[variant]}</p></div><div className="palette"><span/><strong>{variant !== 'ice' ? '#FFE17B / #EDB644' : '#F1FAFF / #78ADDD'}</strong><small>Static · no animation</small></div></section>
    <div className="review-layout"><section className="match-frame" aria-label="Pitch mockup">
      <div className="scoreboard"><span>HUMANS <b>0</b></span><small>HALF 1 · TURN 4</small><span><b>0</b> ORCS</span></div>
      <div className="pitch-window" aria-label="Pitch preview; swipe horizontally on narrow screens"><div className="pitch-stage" ref={host} data-pitch-ready={size.width > 0}>
        <PitchScenery camera={camera} onError={() => console.error('Pitch artwork failed to load')}/>
        <svg className="pitch-lines" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          {Array.from({ length: 390 }, (_,i) => ({ x: Math.floor(i/15), y: i%15 })).map(square =>
            <polygon key={`${square.x},${square.y}`} points={points(camera.square(square,0,true))} fill="none" stroke="#d0d7a6" strokeOpacity=".18"/>)}
          {threats && Array.from({ length: 54 }, (_,i) => ({ x: 10+Math.floor(i/9), y: 3+i%9 })).map(square => {
            const n = (square.x+square.y*3)%4;
            const tile = projectThreatSquare({ ...square, count: n+1, tackle: false, striped: square.y%3 === 0 }, camera, true, false);
            return <g key={`threat-${square.x},${square.y}`}>{tile.fills.map((polygon,index) =>
              <polygon key={index} points={points(polygon)} fill={threatColors[n]} fillOpacity={threatOpacity}/>)}</g>;
          })}
          <polyline points={points([camera.project({x:13,y:0})!,camera.project({x:13,y:15})!])} fill="none" stroke="#f6eed5" strokeOpacity=".4" strokeWidth="2"/>
          <polygon points={points(camera.square({ x: 13, y: 7 }, .09))} fill="#45e7ff15" stroke="#bde9ff" strokeWidth="2"/>
          <ellipse cx={ball.x} cy={ball.y} rx={camera.scale*.35} ry={camera.scale*.12} fill="none" stroke="#ffe17b" strokeWidth="2" strokeDasharray="7 5"/>
        </svg>
        {players.map(player => <Player key={player.id} value={player} camera={camera} showMarkers={showMarkers} showSkills={showSkills} variant={variant}/>)}
        <div className="pitch-caption"><span>CONSUMED THIS TURN</span><strong>{showMarkers ? count : 0} visible action tags</strong><small>Ball carrier #4 · adjacent opponents · skill badges</small></div>
      </div></div>
      <div className="pitch-footer"><span>{end === 'home' ? 'Home' : 'Away'} end · {mode === 'top-down' ? 'Top-down' : 'Perspective'} · {zoom.toFixed(2)}×</span><span className="mobile-hint">Swipe the pitch sideways to inspect at playing size</span><span>Same artwork and pitch snapshot across all views</span></div>
    </section>
    <aside className="review-controls"><h2>Review conditions</h2>
      <label>Pitch snapshot<select value={scenario} onChange={event => setScenario(event.target.value as Scenario)}>
        <option value="busy">Busy pitch + ball carrier</option><option value="statuses">Prone, stunned, distracted</option><option value="adjacent">Adjacent marked players</option><option value="removed">Blitzer removed from pitch</option>
      </select></label>
      <div className="control-pair"><label>Camera<select value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="perspective">Perspective</option><option value="top-down">Top-down</option></select></label>
        <label>View from<select value={end} onChange={event => setEnd(event.target.value as typeof end)}><option value="home">Home end</option><option value="away">Away end</option></select></label></div>
      <label>Playing scale<select value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value="1">Overview · 1.00×</option><option value="1.35">Normal · 1.35×</option><option value="1.9">Close · 1.90×</option></select></label>
      <label className="check"><input type="checkbox" checked={threats} onChange={event => setThreats(event.target.checked)}/>Threat overlays</label>
      <label className="check"><input type="checkbox" checked={showSkills} onChange={event => setShowSkills(event.target.checked)}/>Existing skill badges</label>
      <label className="check"><input type="checkbox" checked={showMarkers} onChange={event => setShowMarkers(event.target.checked)}/>Limited action tags</label>
      <div className="state-readout"><h3>Snapshot ledger</h3>{marked.map(player => <div key={player.id}><span>#{player.number} {actions.find(action => action.kind === consumed[player.id])!.name}</span><small>{player.x === null ? 'Off pitch · hidden' : player.state.replace(/^is |^has been /, '')}</small></div>)}
        <p>Illustrative snapshots for appearance review. Positions and statuses are fixed examples, not a legal turn simulation.</p></div>
    </aside></div>
    <section className="catalog" aria-label="All nine limited action markers"><div className="catalog-heading"><h2>The complete marker set</h2><span>On-pitch size + enlarged detail</span></div><div className="catalog-grid">{actions.map(action =>
      <article key={action.kind}><div className="badge-pair"><Badge kind={action.kind} size={24}/><Badge kind={action.kind} size={44}/></div><h3>{action.name}</h3></article>)}</div></section>
    <footer className="review-footnote">Compare the same snapshot in each view using the buttons below or the ← / → keys.</footer>
    {import.meta.env.DEV && <nav className="variant-switcher" aria-label="Marker treatment"><button onClick={() => cycle(-1)} aria-label="Previous treatment">←</button>
      {variants.map((value,index) => <button key={value} data-variant-choice={value} aria-pressed={variant === value} onClick={() => choose(value)}>{String.fromCharCode(65+index)}<span>{shortNames[value]}</span></button>)}
      <button onClick={() => cycle(1)} aria-label="Next treatment">→</button></nav>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Mockups/>);
