import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { Dugout } from './DugoutPreview';
import { MatchScoreboard } from './MatchScoreboard';
import { MatchSidebar } from './MatchSidebar';
import { initialPlayers } from './pitch-demo';
import { ParityPixiBoard } from './pitch-parity-pixi';
import { PARITY_GEOMETRY, initialParityState, interpolatedSquare, parityPlayers, parityPreview, paritySpriteUrl, reduceParityState, squareAt } from './pitch-parity-model';
import type { ParityIntent, ParityPlayer, ParitySquare, ParityState } from './pitch-parity-model';
import './pitch-preview.css';
import './pitch-parity.css';

type Renderer = 'dom' | 'pixi';
type Display = 'both' | Renderer;
const PITCH_URL = `${import.meta.env.BASE_URL}preview/parity-pitch.svg`;
const fault = new URLSearchParams(window.location.search).get('parityFault');

function Marker({ player, state, scale, onSelect }: { player: ParityPlayer; state: ParityState; scale: number; onSelect: () => void }) {
  const [missing, setMissing] = useState(false);
  const visual = interpolatedSquare(state, player);
  const useMissing = fault === 'sprite' && player.id === 'home-1';
  return <button type="button" className={`parity-marker ${player.team} ${state.selectedId === player.id ? 'selected' : ''} ${state.proneId === player.id ? 'prone' : ''}`}
    data-player={player.id} title={`${player.name}, ${player.position}, ${player.team}`} aria-label={`${player.name}, ${player.position}, square ${player.x + 1}, ${player.y + 1}`}
    style={{ left: (12 + visual.x * 36) * scale, top: (12 + visual.y * 36) * scale, width: 36 * scale, height: 36 * scale,
      zIndex: 10 + Math.floor(visual.y) * 26 + Math.floor(visual.x) }}
    onClick={event => { event.stopPropagation(); onSelect(); }}>
    {missing || useMissing ? <span className="parity-token">{player.team === 'home' ? 'H' : 'A'}{player.number}</span> :
      <img src={paritySpriteUrl(player)} alt="" onError={() => setMissing(true)} style={{ width: `${(player.large ? 80 : 64) / 56 * 100}%` }}/ >}
    <span className="parity-number">{player.number}</span>
  </button>;
}

function DomPitch({ state, scale, dispatch, suppressClick }: { state: ParityState; scale: number; dispatch: React.Dispatch<ParityIntent>; suppressClick: React.RefObject<boolean> }) {
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [cursor, setCursor] = useState<ParitySquare>({ x: 5, y: 7 });
  const scene = useRef<HTMLDivElement>(null);
  const preview = parityPreview(state);
  const path = state.phase === 'moving' ? state.motionPath : preview.route?.path ?? [];
  const pointerSquare = (clientX: number, clientY: number) => {
    const rect = scene.current!.getBoundingClientRect();
    const x = (clientX - rect.left) * 960 / rect.width;
    const y = (clientY - rect.top) * 564 / rect.height;
    return squareAt(Math.floor((x - 12) / 36), Math.floor((y - 12) / 36));
  };
  return <div ref={scene} className="parity-scene parity-dom-scene" data-renderer="dom" tabIndex={0} role="group" aria-label="DOM and SVG parity pitch"
    style={{ width: 960 * scale, height: 564 * scale }}
    onClick={event => { if (suppressClick.current) { suppressClick.current = false; return; } const square = pointerSquare(event.clientX, event.clientY); if (square) dispatch({ type: 'square', square }); }}
    onPointerMove={event => { if (event.pointerType !== 'touch') dispatch({ type: 'hover', square: pointerSquare(event.clientX, event.clientY) }); }}
    onPointerLeave={() => dispatch({ type: 'hover', square: null })}
    onKeyDown={event => {
      if (event.key === 'Enter') dispatch({ type: 'square', square: cursor });
      const deltas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const delta = deltas[event.key];
      if (delta) { event.preventDefault(); const next = { x: Math.max(0, Math.min(25, cursor.x + delta[0])), y: Math.max(0, Math.min(14, cursor.y + delta[1])) }; setCursor(next); dispatch({ type: 'hover', square: next }); }
    }}>
    <svg viewBox="0 0 960 564" aria-hidden="true">
      {backgroundFailed ? <><rect width="960" height="564" fill="#202b20"/><rect x="12" y="12" width="936" height="540" fill="#56632b"/></> :
        <image href={PITCH_URL} width="960" height="564" onError={() => setBackgroundFailed(true)}/>}
      <g pointerEvents="none">
        {[...preview.routes.values()].map(route => { const square = route.path[route.path.length - 1]; const color = { clear: '#5eead4', dodge: '#f59e0b', rush: '#b699ff', both: '#fb7185' }[route.risk]; return <rect key={`${square.x},${square.y}`} x={13 + square.x * 36} y={13 + square.y * 36} width="34" height="34" fill={color} fillOpacity={route.risk === 'clear' ? '.17' : '.38'} stroke={color} strokeOpacity=".35"/>; })}
        {path.length > 1 && <g data-testid="parity-path"><polyline points={path.map(square => `${30 + square.x * 36},${30 + square.y * 36}`).join(' ')} fill="none" stroke="#102532" strokeWidth="7"/><polyline points={path.map(square => `${30 + square.x * 36},${30 + square.y * 36}`).join(' ')} fill="none" stroke="#fff3b0" strokeWidth="3"/>{path.slice(1).map((square, index) => <g key={index}><circle cx={30 + square.x * 36} cy={30 + square.y * 36} r="6" fill="#102532" stroke="#fff3b0"/><text x={30 + square.x * 36} y={34 + square.y * 36} textAnchor="middle" fontSize="10" fill="#fff3b0">{index + 1}</text></g>)}</g>}
        {preview.pointed && <rect x={14 + preview.pointed.x * 36} y={14 + preview.pointed.y * 36} width="32" height="32" fill="none" stroke="#fff3b0" strokeWidth="3"/>}
        {preview.selected && <rect x={12 + preview.selected.x * 36} y={12 + preview.selected.y * 36} width="36" height="36" fill="none" stroke="#f4e9bb" strokeWidth="3"/>}
        {preview.players.find(player => player.id === 'home-1') && (() => { const carrier = preview.players.find(player => player.id === 'home-1')!; const point = interpolatedSquare(state, carrier); return <circle cx={38 + point.x * 36} cy={36 + point.y * 36} r="5" fill="#db9362" stroke="#fff"/>; })()}
      </g>
    </svg>
    {preview.players.map(player => <Marker key={player.id} player={player} state={state} scale={scale} onSelect={() => dispatch({ type: 'select', playerId: player.id })}/>)}
    {backgroundFailed && <span className="parity-background-error">Pitch texture unavailable; plain field shown.</span>}
  </div>;
}

function FailureGrid({ state, dispatch }: { state: ParityState; dispatch: React.Dispatch<ParityIntent> }) {
  const players = parityPlayers(state);
  return <div className="parity-failure" role="alert"><p>The Pixi pitch stopped. The labeled grid and action controls remain available. Reload to retry graphics.</p>
    <div className="parity-failure-grid" role="grid" aria-label="Pitch fallback grid">
      {Array.from({ length: 15 }, (_, y) => Array.from({ length: 26 }, (_, x) => {
        const player = players.find(candidate => candidate.x === x && candidate.y === y);
        return <button key={`${x},${y}`} role="gridcell" type="button" aria-label={`Column ${x + 1}, row ${y + 1}${player ? `, ${player.name}, ${player.team}` : ', empty'}`}
          onClick={() => dispatch({ type: 'square', square: { x, y } })}>{player ? `${player.team === 'home' ? 'H' : 'A'}${player.number}` : '·'}</button>;
      }))}
    </div>
  </div>;
}

function BoardPanel({ renderer, state, dispatch, zoom }: { renderer: Renderer; state: ParityState; dispatch: React.Dispatch<ParityIntent>; zoom: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<ParityPixiBoard | null>(null);
  const latest = useRef(state); latest.current = state;
  const suppressClick = useRef(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 900, height: 540 });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [assetMessage, setAssetMessage] = useState('');
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (renderer !== 'pixi') return;
    let disposed = false;
    const candidate = new ParityPixiBoard();
    board.current = candidate;
    const fail = () => { if (disposed) return; candidate.destroy(); board.current = null; setReady(false); setError('Renderer lost'); };
    candidate.mount(host.current!, square => { if (suppressClick.current) { suppressClick.current = false; return; } dispatch({ type: 'square', square }); },
      square => dispatch({ type: 'hover', square }), fail, fault).then(() => {
      if (disposed) return;
      setAssetMessage(candidate.assetMessage);
      candidate.draw(latest.current);
      setReady(true);
    }).catch(() => { if (!disposed) fail(); });
    return () => { disposed = true; candidate.destroy(); if (board.current === candidate) board.current = null; };
  }, [renderer, dispatch]);
  useEffect(() => { try { board.current?.draw(state); } catch { board.current?.destroy(); board.current = null; setReady(false); setError('Renderer draw failed'); } }, [state]);
  const availableSquare = Math.min(size.width / PARITY_GEOMETRY.width, size.height / PARITY_GEOMETRY.height) * 36;
  const fitSquare = availableSquare >= 56 ? 56 : availableSquare >= 48 ? 48 : availableSquare >= 40 ? 40 : availableSquare;
  const scale = Math.max(.15, fitSquare / 36 * zoom);
  return <section className="parity-board-panel" aria-label={`${renderer} pitch`}>
    <h2>{renderer === 'dom' ? 'DOM / SVG' : 'Pixi / WebGL'} <small>{Math.round(36 * scale)} px per square</small></h2>
    <div ref={viewport} className="parity-viewport" style={{ overflow: zoom > 1 ? 'auto' : 'hidden', touchAction: zoom > 1 ? 'none' : 'pan-y' }}
      onPointerDown={event => { suppressClick.current = false; if (zoom <= 1 || event.button !== 0) return; const element = viewport.current!; drag.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, moved: false }; }}
      onPointerMove={event => { const start = drag.current; if (!start) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.abs(dx) + Math.abs(dy) > 6) { start.moved = true; viewport.current!.setPointerCapture(event.pointerId); } if (start.moved) { viewport.current!.scrollLeft = start.left - dx; viewport.current!.scrollTop = start.top - dy; } }}
      onPointerUp={() => { if (drag.current?.moved) suppressClick.current = true; drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="parity-center" style={{ minWidth: 960 * scale, minHeight: 564 * scale }}>
        {renderer === 'dom' ? <DomPitch state={state} scale={scale} dispatch={dispatch} suppressClick={suppressClick}/> :
          error ? <FailureGrid state={state} dispatch={dispatch}/> : <div ref={host} className="parity-scene parity-pixi-scene" data-renderer="pixi" data-ready={ready} aria-busy={!ready} style={{ width: 960 * scale, height: 564 * scale }}>{!ready && <span className="parity-loading">Loading Pixi textures…</span>}</div>}
      </div>
    </div>
    {renderer === 'pixi' && !error && <button type="button" className="parity-fault-button" onClick={() => board.current?.simulateContextLoss()}>Simulate context loss</button>}
    {assetMessage && <p role="status" className="parity-asset-message">{assetMessage}</p>}
  </section>;
}

export function PitchParityPreview() {
  const [state, dispatch] = useReducer(reduceParityState, undefined, initialParityState);
  const [display, setDisplay] = useState<Display>('both');
  const [zoom, setZoom] = useState(1);
  const preview = useMemo(() => parityPreview(state), [state]);
  useEffect(() => { document.title = 'M5 renderer parity · Moles Under the Pitch'; }, []);
  useEffect(() => {
    if (state.phase !== 'moving') return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => { const progress = Math.min(1, Math.max(0, (now - start) / 900)); dispatch({ type: 'tick', progress }); if (progress < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.phase]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { dispatch({ type: 'cancel' }); return; }
      if (event.code !== 'Space' || event.repeat || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !preview.canCommit) return;
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest('input, textarea, select, button, a, [contenteditable], [role="textbox"]')) return;
      event.preventDefault();
      dispatch({ type: 'commit' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preview.canCommit]);
  const selectedForSidebar = preview.selected ? { ...initialPlayers[0], ...preview.selected, zone: state.proneId === preview.selected.id ? 'Prone' : 'Standing' } : null;
  return <main className="pitch-preview pitch-parity">
    <header><h1>M5 renderer parity <span>· local experiment</span></h1><nav><a href="/pitch-preview">Existing MVP</a><a href="/">Play lab</a></nav></header>
    <MatchScoreboard turn={4} half={1}/>
    <div className="parity-toolbar" aria-label="Parity controls">
      <div><button aria-pressed={display === 'both'} onClick={() => setDisplay('both')}>Side by side</button><button aria-pressed={display === 'dom'} onClick={() => setDisplay('dom')}>DOM only</button><button aria-pressed={display === 'pixi'} onClick={() => setDisplay('pixi')}>Pixi only</button></div>
      <div><button aria-pressed={state.crowded} onClick={() => dispatch({ type: 'crowded', value: !state.crowded })}>Crowded 11 v 11</button><button aria-pressed={zoom === 1} onClick={() => setZoom(1)}>Fit</button><button aria-pressed={zoom === 1.5} onClick={() => setZoom(1.5)}>1.5×</button><button aria-pressed={zoom === 2} onClick={() => setZoom(2)}>2×</button></div>
    </div>
    <div className={`parity-layout ${display === 'both' ? 'split' : 'single'}`}>
      <div className="parity-main">
        <div className="parity-boards">{(display === 'both' || display === 'dom') && <BoardPanel renderer="dom" state={state} dispatch={dispatch} zoom={zoom}/>}{(display === 'both' || display === 'pixi') && <BoardPanel renderer="pixi" state={state} dispatch={dispatch} zoom={zoom}/>}</div>
        <div className="compact-dugouts"><Dugout team="home"/><Dugout team="away"/></div>
        <section className="parity-command" aria-label="Mock action strip">
          <strong>{preview.selected ? `#${preview.selected.number} ${preview.selected.name} · ${preview.selected.position}` : 'No player selected'}</strong>
          <span>{state.message}</span>
          <div><button onClick={() => dispatch({ type: 'cancel' })}>Cancel preview</button><button onClick={() => dispatch({ type: 'reset' })}>Reset fixture</button>
            <button className="commit-action" disabled={!preview.canCommit} onClick={() => dispatch({ type: 'commit' })}>Commit {preview.action.toLowerCase()}</button></div>
          {state.phase === 'block-choice' && <div className="parity-dice"><span>Mock block choice · no engine roll</span><button onClick={() => dispatch({ type: 'block-die', value: 'push' })}>Choose push</button><button onClick={() => dispatch({ type: 'block-die', value: 'pow' })}>Choose defender down</button></div>}
          <small>{preview.route ? `${preview.action} path: ${preview.route.path.length - 1} squares · ${preview.route.risk} risk (illustrative)` : 'Select Alden, then Rhea for the Blitz path. Space confirms a pinned preview.'}</small>
        </section>
      </div>
      <MatchSidebar selected={selectedForSidebar} events={[state.message, 'Parity scene uses scripted mock interactions.']} turn={4} onEndTurn={() => dispatch({ type: 'reset' })} onInspect={() => {}}/>
    </div>
    <footer>Local parity experiment · shared immutable fixture · scripted Blitz · no `/browser/v2` commands or rules.</footer>
  </main>;
}
