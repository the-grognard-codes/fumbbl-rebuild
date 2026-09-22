import { useEffect, useRef, useState } from 'react';
import { MatchSidebar } from './MatchSidebar';
import { MatchScoreboard } from './MatchScoreboard';
import { Dugout } from './DugoutPreview';
import { usePitchInteraction } from './usePitchInteraction';
import './pitch-preview.css';

export function PitchPreview() {
  const interaction = usePitchInteraction();
  const viewport = useRef<HTMLDivElement>(null);
  const reference = useRef<HTMLDialogElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 700, outerWidth: 1000 });
  const [zoom, setZoom] = useState(1);
  const [drawer, setDrawer] = useState(false);
  const [cursor, setCursor] = useState({ x: 5, y: 7 });
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { document.title = 'Match MVP · Moles Under the Pitch'; }, []);
  useEffect(() => {
    const el = viewport.current!;
    const observer = new ResizeObserver(([entry]) => {
      // Content-box measurements exclude borders and scrollbars. Round DOWN:
      // clientHeight rounds fractional pixels up and can create a scrollbar loop.
      const next = { width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height), outerWidth: Math.floor(el.getBoundingClientRect().width) };
      setSize(old => old.width === next.width && old.height === next.height && old.outerWidth === next.outerWidth ? old : next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const mode = size.outerWidth < 600 ? 'mobile' : size.outerWidth >= 1100 ? 'full' : 'compact';
  useEffect(() => { setZoom(1); setDrawer(false); viewport.current?.scrollTo(0, 0); }, [mode]);
  const scene = { width: 960, height: 564, x: 12, y: 12 };
  const availableSquare = Math.min(size.width / scene.width, size.height / scene.height) * 36;
  const squareSize = availableSquare >= 56 ? 56 : availableSquare >= 48 ? 48 : availableSquare >= 40 ? 40 : availableSquare;
  const scale = squareSize / 36 * zoom;
  const point = (el: SVGSVGElement, clientX: number, clientY: number) => { const rect = el.getBoundingClientRect(); const x = Math.floor(((clientX - rect.left) * scene.width / rect.width - scene.x) / 36), y = Math.floor(((clientY - rect.top) * scene.height / rect.height - scene.y) / 36); return x >= 0 && x < 26 && y >= 0 && y < 15 ? { x, y } : null; };
  const changeZoom = (value: number) => { setZoom(value); viewport.current?.scrollTo(0, 0); };
  return <main className="pitch-preview" data-mode={mode}>
    <header><h1>Match MVP <span>· Moles Under the Pitch</span></h1><nav aria-label="Design previews"><button onClick={() => reference.current?.showModal()}>Compare reference</button><a href="/ui-ux-draft-v2">UI/UX Draft v2</a><a href="/">Play lab</a></nav></header>
    <MatchScoreboard turn={interaction.turn} half={interaction.half}/>
    <div className="preview-toolbar"><span><b>{mode === 'full' ? 'Match view' : mode === 'compact' ? 'Compact stadium' : 'Mobile overview'}</b> · {Math.round(36 * scale)} px / square</span><div><button aria-pressed={interaction.crowded} onClick={interaction.toggleFormation}>Crowded formation</button><button onClick={() => changeZoom(1)} aria-pressed={zoom === 1}>Fit</button><button onClick={() => changeZoom(1.5)} aria-pressed={zoom === 1.5}>1.5×</button><button onClick={() => changeZoom(2)} aria-pressed={zoom === 2}>2×</button><button onClick={() => changeZoom(Math.max(1, 48 / squareSize))}>Detail</button></div></div>
    <div className="preview-body"><div className="preview-board-column">
      <div ref={viewport} className="stadium-viewport" aria-label="Stadium viewport" style={{ touchAction: zoom > 1 ? 'none' : 'pan-y', overflow: zoom === 1 ? 'hidden' : 'auto' }}
        onPointerDown={event => { suppressClick.current = false; if (zoom <= 1 || event.button !== 0) return; const el = viewport.current!; drag.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false }; }}
        onPointerMove={event => { const start = drag.current; if (!start) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.abs(dx) + Math.abs(dy) > 6) { start.moved = true; viewport.current!.setPointerCapture(event.pointerId); } if (start.moved) { viewport.current!.scrollLeft = start.left - dx; viewport.current!.scrollTop = start.top - dy; } }}
        onPointerUp={() => { if (drag.current?.moved) suppressClick.current = true; drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="stadium-center" style={{ width: '100%', height: '100%', minWidth: scene.width * scale, minHeight: scene.height * scale }}><div className="stadium-scene" style={{ width: scene.width * scale, height: scene.height * scale }}>
          <svg viewBox={`0 0 ${scene.width} ${scene.height}`} aria-label="26 by 15 pitch" role="group" tabIndex={0}
            onClick={event => { if (suppressClick.current) { suppressClick.current = false; return; } const p = point(event.currentTarget, event.clientX, event.clientY); if (p) { setCursor(p); interaction.setTarget(p); } }}
            onPointerMove={event => { if (event.pointerType !== 'touch' && !drag.current?.moved) interaction.setHover(point(event.currentTarget, event.clientX, event.clientY)); }} onPointerLeave={() => interaction.setHover(null)}
            onKeyDown={event => { if (event.key === 'Enter') { interaction.setTarget(cursor); return; } const delta: Record<string, number[]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }; const d = delta[event.key]; if (d) { event.preventDefault(); const p = { x: Math.max(0, Math.min(25, cursor.x + d[0])), y: Math.max(0, Math.min(14, cursor.y + d[1])) }; setCursor(p); interaction.setHover(p); } }}>
            <defs>
              <pattern id="stone" width="48" height="32" patternUnits="userSpaceOnUse"><rect width="48" height="32" fill="#242723"/><path d="M0 0H48M0 16H48M24 0V16M8 16V32" stroke="#121915" strokeWidth="2"/><path d="M2 3H22M27 3H46M11 19H45" stroke="#797460" opacity=".3"/></pattern>
              <pattern id="grass" width="72" height="72" patternUnits="userSpaceOnUse">{Array.from({length: 65}, (_, i) => <path key={i} d={`M${i * 31 % 72} ${i * 47 % 72}h${i % 3 + 1}v-1`} stroke={i % 2 ? '#c5c18a' : '#1b301b'} opacity=".19"/>)}</pattern>
              <pattern id="endzone-checker" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 0h9v9H0zM9 9h9v9H9z" fill="#ded0a0" opacity=".66"/></pattern>
              <radialGradient id="turf-light"><stop stopColor="#a2a366" stopOpacity=".07"/><stop offset="1" stopColor="#182211" stopOpacity=".26"/></radialGradient>
              <filter id="turf-grain"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" seed="8" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="soft-light"/></filter>
            </defs>
            <rect width={scene.width} height={scene.height} fill="url(#stone)"/><rect x={scene.x - 5} y={scene.y - 5} width="946" height="550" fill="#14291f" stroke="#adac85" strokeWidth="2"/>
            <g transform={`translate(${scene.x} ${scene.y})`}>
              <rect width="936" height="540" fill="#56632b"/>{Array.from({ length: 13 }, (_, x) => <rect key={x} x={x * 72} width="36" height="540" fill="#495d2a"/>)}
              <rect width="936" height="540" fill="url(#grass)"/><rect width="936" height="540" fill="url(#turf-light)"/>
              <g fill="#a59b68" opacity=".2">{Array.from({length: 24}, (_, i) => <path key={i} d={`M${60 + i * 179 % 800} ${20 + i * 73 % 495}l8 -3 5 4 -2 5 -9 2z`}/>)}</g>
              <path d="M423 231L468 210 513 231 506 284 468 314 430 284z" fill="#d9d1a0" opacity=".08"/>
              <rect width="36" height="540" fill="#223e54"/><rect x="900" width="36" height="540" fill="#805021"/>
              {[0, 900].map(x => <g key={x}><rect x={x} width="36" height="54" fill="url(#endzone-checker)"/><rect x={x} y="486" width="36" height="54" fill="url(#endzone-checker)"/></g>)}
              <rect width="936" height="540" filter="url(#turf-grain)" opacity=".13" pointerEvents="none"/>
              <g className="endzone-names" textAnchor="middle" fontSize="24" fontWeight="700" letterSpacing="8" pointerEvents="none"><text transform="translate(26 270) rotate(-90)" fill="#e0d4aa">HUMANS</text><text transform="translate(909 270) rotate(90)" fill="#e0d4aa">ORCS</text></g>
              <g stroke="#d4cd99" opacity=".24" strokeDasharray="3 2">{Array.from({ length: 27 }, (_, x) => <path key={`x${x}`} d={`M${x * 36} 0V540`}/>)}{Array.from({ length: 16 }, (_, y) => <path key={`y${y}`} d={`M0 ${y * 36}H936`}/>)}</g>
              <g stroke="#ddd7b2" strokeWidth="1.6" opacity=".72" fill="none"><rect x="1" y="1" width="934" height="538"/><path d="M36 0V540 M900 0V540 M468 0V540"/><path d="M36 144H900 M36 396H900" strokeDasharray="8 8"/></g>
              {interaction.overlay}
            </g>
          </svg>
          {interaction.markers(scene, scale)}
        </div></div>
      </div>
      {mode !== 'mobile' && <div className="compact-dugouts"><Dugout team="home"/><Dugout team="away"/></div>}
    </div></div>
    {mode === 'mobile' && <div className="mobile-tools"><button aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>Dugouts</button></div>}
    {interaction.panel}
    <MatchSidebar selected={interaction.selectedPlayer} events={interaction.events} turn={interaction.turn} onEndTurn={interaction.endTurn} onInspect={interaction.inspect}/>
    {mode === 'mobile' && drawer && <section className="preview-drawer" aria-label="Team dugouts"><button className="drawer-close" onClick={() => setDrawer(false)}>Close</button><Dugout team="home"/><Dugout team="away"/></section>}
    <footer>Interactive design preview · 64:56 player-to-square ratio · Human & Orc chibi sprites · Sample actions assume success</footer>
    <dialog ref={reference} className="reference-dialog" aria-label="Original match screen reference" onClick={event => { if (event.target === reference.current) reference.current.close(); }}>
      <div><span>Original art direction</span><button onClick={() => reference.current?.close()}>Close reference</button></div>
      <img src={`${import.meta.env.BASE_URL}preview/match-screen-reference.png`} alt="Original fantasy football match concept with steel-blue Humans, bronze Orcs, a dark engraved scoreboard and serif typography"/>
    </dialog>
  </main>;
}
