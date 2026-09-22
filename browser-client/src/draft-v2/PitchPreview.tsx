import { useEffect, useRef, useState } from 'react';
import { MatchSidebar } from './MatchSidebar';
import { Dugout } from './DugoutPreview';
import { usePitchInteraction } from './usePitchInteraction';
import './pitch-preview.css';

function TeamResources({ team }: { team: string }) {
  const home = team === 'home';
  return <section className={`team-resources reroll-box ${team}`} aria-label={`${home ? 'Home' : 'Away'} team resources`}>
    <div className="reroll-main"><span>REROLLS</span><strong>{home ? 3 : 2}</strong></div>
    <div className="inducement-icons">{['Wizard', 'Kegs', 'Bribes', 'Apothecary'].map((label, index) => { const count = (home ? [1, 0, 1, 1] : [0, 2, 0, 0])[index]; return <span key={label} className={!count ? 'empty' : ''} tabIndex={0} title={`${label}: ${count} available`} aria-label={`${label}: ${count} available`}><span aria-hidden="true">{['✦', '▤', '◆', '✚'][index]}</span><b>{count}</b></span>; })}</div>
  </section>;
}

export function PitchPreview() {
  useEffect(() => { document.title = 'UI/UX Draft v2'; }, []);
  const interaction = usePitchInteraction();
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [zoom, setZoom] = useState(1);
  const [drawer, setDrawer] = useState(false);
  const [cursor, setCursor] = useState({ x: 5, y: 7 });
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { const el = viewport.current!; const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight })); observer.observe(el); return () => observer.disconnect(); }, []);
  const mode = size.width < 600 ? 'mobile' : size.width >= 1100 ? 'full' : 'compact';
  useEffect(() => { setZoom(1); setDrawer(false); viewport.current?.scrollTo(0, 0); }, [mode]);
  const scene = { width: 960, height: 564, x: 12, y: 12 };
  const availableSquare = Math.min(size.width / scene.width, size.height / scene.height) * 36;
  const squareSize = availableSquare >= 48 ? 48 : availableSquare >= 40 ? 40 : availableSquare;
  const scale = squareSize / 36 * zoom;
  const point = (el: SVGSVGElement, clientX: number, clientY: number) => { const rect = el.getBoundingClientRect(); const x = Math.floor(((clientX - rect.left) * scene.width / rect.width - scene.x) / 36), y = Math.floor(((clientY - rect.top) * scene.height / rect.height - scene.y) / 36); return x >= 0 && x < 26 && y >= 0 && y < 15 ? { x, y } : null; };
  const changeZoom = (value: number) => { setZoom(value); viewport.current?.scrollTo(0, 0); };
  return <main className="pitch-preview" data-mode={mode}>
    <header><div><span className="eyebrow">MOLES UNDER THE PITCH · INTERACTION STUDY</span><h1>UI/UX Draft v2</h1></div><a href="/pitch-preview">Open MVP preview</a></header>
    <div className="preview-score match-scoreboard reference-scoreboard">
      <TeamResources team="home"/>
      <div className="team-nameplate home"><span className="team-crest" aria-hidden="true">♜</span><strong>HUMANS</strong><b aria-label="Home score 0">0</b></div>
      <div className="match-clock"><strong>HALF 1</strong><span>TURN 4 / 8</span><small>HUMANS TO ACT</small></div>
      <div className="team-nameplate away"><span className="weather"><span aria-hidden="true">☀</span><small>NICE</small></span><strong>ORCS</strong><b aria-label="Away score 0">0</b><span className="team-crest" aria-hidden="true">♜</span></div>
      <TeamResources team="away"/>
    </div>
    <div className="preview-toolbar"><span><b>{mode === 'full' ? 'Match view' : mode === 'compact' ? 'Compact stadium' : 'Mobile overview'}</b> · {Math.round(36 * scale)} px / square</span><div><button aria-pressed={interaction.crowded} onClick={interaction.toggleFormation}>Crowded formation</button><button onClick={() => changeZoom(1)} aria-pressed={zoom === 1}>Fit</button><button onClick={() => changeZoom(1.5)} aria-pressed={zoom === 1.5}>1.5×</button><button onClick={() => changeZoom(2)} aria-pressed={zoom === 2}>2×</button><button onClick={() => changeZoom(Math.max(1, 48 / squareSize))}>Detail</button></div></div>
    <div className="preview-body"><div className="preview-board-column">
      <div ref={viewport} className="stadium-viewport" aria-label="Stadium viewport" style={{ touchAction: zoom > 1 ? 'none' : 'pan-y' }}
        onPointerDown={event => { suppressClick.current = false; if (zoom <= 1 || event.button !== 0) return; const el = viewport.current!; drag.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false }; }}
        onPointerMove={event => { const start = drag.current; if (!start) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.abs(dx) + Math.abs(dy) > 6) { start.moved = true; viewport.current!.setPointerCapture(event.pointerId); } if (start.moved) { viewport.current!.scrollLeft = start.left - dx; viewport.current!.scrollTop = start.top - dy; } }}
        onPointerUp={() => { if (drag.current?.moved) suppressClick.current = true; drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="stadium-center" style={{ width: Math.max(size.width, scene.width * scale), height: Math.max(size.height, scene.height * scale) }}><div className="stadium-scene" style={{ width: scene.width * scale, height: scene.height * scale }}>
          <svg viewBox={`0 0 ${scene.width} ${scene.height}`} aria-label="26 by 15 pitch" role="group" tabIndex={0}
            onClick={event => { if (suppressClick.current) { suppressClick.current = false; return; } const p = point(event.currentTarget, event.clientX, event.clientY); if (p) { setCursor(p); interaction.setTarget(p); } }}
            onPointerMove={event => { if (event.pointerType !== 'touch' && !drag.current?.moved) interaction.setHover(point(event.currentTarget, event.clientX, event.clientY)); }} onPointerLeave={() => interaction.setHover(null)}
            onKeyDown={event => { if (event.key === 'Enter') { interaction.setTarget(cursor); return; } const delta: Record<string, number[]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }; const d = delta[event.key]; if (d) { event.preventDefault(); const p = { x: Math.max(0, Math.min(25, cursor.x + d[0])), y: Math.max(0, Math.min(14, cursor.y + d[1])) }; setCursor(p); interaction.setHover(p); } }}>
            <defs>
              <pattern id="stone" width="48" height="32" patternUnits="userSpaceOnUse"><rect width="48" height="32" fill="#3c4140"/><path d="M0 0H48M0 16H48M24 0V16M8 16V32" stroke="#252e2c" strokeWidth="2"/><path d="M2 3H22M27 3H46M11 19H45" stroke="#62675a" opacity=".45"/></pattern>
              <pattern id="grass" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M6 8h3v-2M25 28h4M16 18v-3" stroke="#b0cd77" opacity=".16"/><path d="M28 7h3M7 29h2" stroke="#102b21" opacity=".22"/></pattern>
              <pattern id="endzone-stripe" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="18" fill="#fff" opacity=".06"/></pattern>
              <linearGradient id="turf-light" x2="0" y2="1"><stop stopColor="#a5c978" stopOpacity=".09"/><stop offset="1" stopColor="#061d16" stopOpacity=".23"/></linearGradient>
            </defs>
            <rect width={scene.width} height={scene.height} fill="url(#stone)"/><rect x={scene.x - 5} y={scene.y - 5} width="946" height="550" fill="#14291f" stroke="#adac85" strokeWidth="2"/>
            <g transform={`translate(${scene.x} ${scene.y})`}>
              <rect width="936" height="540" fill="#52672b"/>{Array.from({ length: 13 }, (_, x) => <rect key={x} x={x * 72} width="36" height="540" fill="#455e2b"/>)}
              <rect width="936" height="540" fill="url(#grass)"/><rect width="936" height="540" fill="url(#turf-light)"/><rect width="36" height="540" fill="#69532c"/><rect x="900" width="36" height="540" fill="#244e65"/><rect width="36" height="540" fill="url(#endzone-stripe)"/><rect x="900" width="36" height="540" fill="url(#endzone-stripe)"/>
              <g textAnchor="middle" fontSize="23" fontWeight="900" letterSpacing="8" pointerEvents="none"><text transform="translate(25 270) rotate(-90)" fill="#ffe7a0">HUMANS</text><text transform="translate(911 270) rotate(90)" fill="#b8e6ff">ORCS</text></g>
              <g stroke="#ecf2d7" opacity=".18">{Array.from({ length: 27 }, (_, x) => <path key={`x${x}`} d={`M${x * 36} 0V540`}/>)}{Array.from({ length: 16 }, (_, y) => <path key={`y${y}`} d={`M0 ${y * 36}H936`}/>)}</g>
              <g stroke="#edf5df" strokeWidth="2" fill="none"><rect x="1" y="1" width="934" height="538"/><path d="M36 0V540 M900 0V540 M468 0V540"/><path d="M36 144H900 M36 396H900" strokeDasharray="8 8"/></g>
              {interaction.overlay}
            </g>
          </svg>
          {interaction.markers(scene, scale)}
        </div></div>
      </div>
      {mode !== 'mobile' && <div className="compact-dugouts"><Dugout team="home"/><Dugout team="away"/></div>}
    </div></div>
    {interaction.panel}
    <MatchSidebar/>
    {mode === 'mobile' && <div className="mobile-tools"><button aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>Dugouts</button></div>}
    {mode === 'mobile' && drawer && <section className="preview-drawer" aria-label="Team dugouts"><button className="drawer-close" onClick={() => setDrawer(false)}>Close</button><Dugout team="home"/><Dugout team="away"/></section>}
    <footer>48px target · Human team v1 (scaled 36px exports) · Sample actions assume success; no live match connection.</footer>
  </main>;
}

