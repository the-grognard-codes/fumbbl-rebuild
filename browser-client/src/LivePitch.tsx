import { useEffect, useId, useRef, useState } from 'react';
import type { SetupAction, SetupPlayer, SetupState } from './setup-protocol.ts';
import type { RoutePoint, RoutePreview } from './route-protocol.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { MatchDecision } from './match-decision.ts';
import { DiceFace } from './DiceFace.tsx';
import { PitchDecisionOverlay } from './PitchDecisionOverlay.tsx';
import { PitchScenery } from './PitchScenery.tsx';
import { PitchProjection, type Point, type PitchDirection, type PitchProjectionMode } from './pitch-projection.ts';
import { resolvePlayerArt, resolvePlayerPortrait, type PlayerFacing } from './player-art.ts';
import { canPlaceReserve } from './setup-protocol.ts';
import { matchTeamName } from './match-team-name.ts';
import type { PushChoice } from './push-choice.ts';
import './live-pitch.css';

const points = (polygon: Point[]) => polygon.map(p => `${p.x},${p.y}`).join(' ');
const centerOf = (point: Point) => ({ x: point.x + .5, y: point.y + .5 });
const directions: PlayerFacing[] = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Off-pitch consumers share the portrait catalog. */
export const spriteUrl = resolvePlayerPortrait;

function routePath(route: RoutePoint[], camera: PitchProjection): string {
  let previous = false;
  return route.map(cell => {
    const point = camera.project(centerOf(cell));
    if (!point) { previous = false; return ''; }
    const command = previous ? 'L' : 'M'; previous = true;
    return `${command}${point.x},${point.y}`;
  }).join(' ');
}

function PlayerMarker({ player, teamName, camera, facing, order, active, selected, target, onSelect, onGround,
  onFocus, onBlur, readOnly, canDrag, onStartDrag, onEndDrag }: {
  player: SetupPlayer; teamName: string; camera: PitchProjection; facing?: PlayerFacing; order: number;
  active: boolean; selected: boolean; target: boolean; onSelect: () => void; onGround: (x: number, y: number) => void;
  onFocus: (anchor: DOMRect) => void; onBlur: () => void; readOnly: boolean;
  canDrag: boolean; onStartDrag?: (id: string) => void; onEndDrag?: () => void;
}) {
  const art = resolvePlayerArt(player, { end: camera.end, facing });
  const [failedUrl, setFailedUrl] = useState('');
  const position = camera.project(centerOf({ x: player.x!, y: player.y! }));
  const visible = !!position && camera.square({ x: player.x!, y: player.y! }, 0, true).length >= 3;
  const body = art?.body;
  const scale = (position?.pixelsPerSquare ?? camera.scale) * 1.08 / 64;
  const groundPose = body?.pose === 'prone' || body?.pose === 'stunned';
  const anchor = body ? groundPose ? body.groundAnchor : camera.mode === 'top-down'
    ? { x: body.bounds.x + body.bounds.width / 2, y: body.bounds.y + body.bounds.height / 2 } : body.footAnchor : { x: 0, y: 0 };
  const corners = camera.square({ x: player.x!, y: player.y! });
  const width = position?.pixelsPerSquare ?? camera.scale;
  const height = corners.length ? Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y)) : width;
  const left = (position?.x ?? 0) - width / 2, top = (position?.y ?? 0) - height / 2;
  const number = player.number ?? player.slot;
  return <button type="button" data-player-id={player.id} data-x={player.x} data-y={player.y}
    data-center-x={position?.x} data-center-y={position?.y} data-pose={body?.pose ?? 'token'}
    data-anchor-mode={groundPose ? 'ground' : camera.mode === 'top-down' ? 'visual-center' : 'feet'}
    className={`live-marker ${player.role}${active ? ' active' : ''}${selected ? ' selected' : ''}${target ? ' target' : ''}`}
    aria-label={`${teamName} ${player.name}, number ${number}, ${player.state}, square ${player.x}, ${player.y}`}
    tabIndex={visible ? 0 : -1} title={`${player.name} #${number} · ${player.state}`} draggable={canDrag && visible}
    style={{ left, top, width, height, zIndex: 10 + order, visibility: visible ? 'visible' : 'hidden' }}
    onPointerDown={event => { if (canDrag) event.stopPropagation(); }}
    onDragStart={event => { if (!canDrag) return; event.dataTransfer.setData('application/x-fumbbl-setup-player', player.id);
      event.dataTransfer.effectAllowed = 'move'; onStartDrag?.(player.id); }} onDragEnd={() => onEndDrag?.()}
    onPointerEnter={event => { if (event.pointerType !== 'touch') onFocus(event.currentTarget.getBoundingClientRect()); }} onPointerLeave={onBlur}
    onFocus={event => onFocus(event.currentTarget.getBoundingClientRect())} onBlur={onBlur}
    onClick={event => {
      event.stopPropagation(); if (readOnly) return;
      if (event.detail > 0) {
        const surface = event.currentTarget.closest('.live-pitch-scene')!.getBoundingClientRect();
        const local = camera.fromClient({ x: event.clientX, y: event.clientY }, surface), cell = local && camera.cellAt(local);
        if (!cell) return;
        // Artwork may overhang a neighbor; its painted pixels never change
        // which canonical ground intent was clicked. Keyboard selects this ID.
        if (cell && (cell.x !== player.x || cell.y !== player.y)) {
          onGround(cell.x, cell.y); return;
        }
      }
      onSelect();
    }}>
    {body && failedUrl !== body.url ? <img src={body.url} alt="" draggable={false} onError={() => setFailedUrl(body.url)}
      style={{ width: body.width * scale, height: body.height * scale, left: width / 2 - anchor.x * scale,
        top: height / 2 - anchor.y * scale, transform: body.mirror ? 'scaleX(-1)' : undefined }}/>
      : <span className="live-token">{player.role === 'home' ? 'H' : 'A'}{number}</span>}
    <span className="live-number">{number}</span>
  </button>;
}

/** Presentation only: positions, state, ball and identity come from the server. */
export function LivePitch({ view, selectedId, actions, pinnedAction, routePreview = null, waypoints = [], diceMoment = null,
  onSelectPlayer, onFocusPlayer, onBlurPlayer, onSquare, draggableIds, draggingPlayerId = '', onStartDrag, onEndDrag,
  onDropPlayer, pushChoices = [], onPushChoice, readOnly = false, playback = false,
  zoom: controlledZoom, onZoomChange, showToolbar = true, decision = null, decisionDisabled = false, onDecisionAction }: {
  view: SetupState; selectedId: string; actions: SetupAction[]; pinnedAction?: SetupAction;
  routePreview?: RoutePreview | null; waypoints?: RoutePoint[]; diceMoment?: DiceMoment | null;
  decision?: MatchDecision | null; decisionDisabled?: boolean; onDecisionAction?: (actionId: string) => void;
  onSelectPlayer: (id: string) => void; onFocusPlayer?: (id: string, anchor: DOMRect) => void; onBlurPlayer?: () => void; onSquare: (x: number, y: number) => void;
  draggableIds?: Set<string>; draggingPlayerId?: string; onStartDrag?: (id: string) => void; onEndDrag?: () => void;
  onDropPlayer?: (id: string, x: number, y: number) => void; readOnly?: boolean; playback?: boolean;
  pushChoices?: PushChoice[]; onPushChoice?: (actionId: string) => void;
  zoom?: number; onZoomChange?: (zoom: number) => void; showToolbar?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null), scene = useRef<HTMLDivElement>(null);
  const markerId = useId().replace(/:/g, '');
  const [size, setSize] = useState({ width: 1280, height: 720 });
  const [internalZoom, setInternalZoom] = useState(1);
  const zoom = controlledZoom ?? internalZoom, setZoom = onZoomChange ?? setInternalZoom;
  const [mode, setMode] = useState<PitchProjectionMode>('perspective');
  const [spectatorEnd, setSpectatorEnd] = useState<'home' | 'away'>('home');
  const [travel, setTravel] = useState({ focus: 13, transverseFocus: 7.5 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [facings, setFacings] = useState<Record<string, PlayerFacing>>({});
  const prior = useRef<{ matchId: string; revision: number; players: SetupPlayer[] } | null>(null);
  const end = view.callerRole === 'spectator' ? spectatorEnd : view.callerRole;
  const camera = new PitchProjection({ ...size, ...travel, end, mode, zoom });
  const cameraRef = useRef(camera); cameraRef.current = camera;
  const changeCamera = (next: PitchProjection) => { setTravel({ focus: next.focus, transverseFocus: next.transverseFocus }); onBlurPlayer?.(); };
  const drag = useRef<{ x: number; y: number; camera: PitchProjection; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }));
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault(); onBlurPlayer?.();
      const next = cameraRef.current.travel(event.deltaY * -.012 * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? cameraRef.current.height : 1));
      setTravel({ focus: next.focus, transverseFocus: next.transverseFocus });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); };
  }, [onBlurPlayer]);
  useEffect(() => {
    if (!prior.current || prior.current.matchId !== view.matchId || view.revision < prior.current.revision) setFacings({});
    else {
      const old = new Map(prior.current.players.map(player => [player.id, player]));
      const changes: Record<string, PlayerFacing> = {};
      for (const player of view.players) {
        const before = old.get(player.id);
        if (before?.x == null || before.y == null || player.x == null || player.y == null) continue;
        const dx = player.x - before.x, dy = player.y - before.y;
        if (dx || dy) changes[player.id] = directions[(Math.round(Math.atan2(dy, dx) * 4 / Math.PI) + 8) % 8];
      }
      if (Object.keys(changes).length) setFacings(current => ({ ...current, ...changes }));
    }
    prior.current = { matchId: view.matchId, revision: view.revision, players: view.players };
  }, [view.matchId, view.revision, view.players]);
  const activePlayer = view.players.find(player => player.id === view.activePlayerId), selected = view.players.find(player => player.id === selectedId);
  const reveal = (point: Point | null | undefined) => { if (point) changeCamera(cameraRef.current.reveal(point, 50)); };
  useEffect(() => {
    if (!decision) return;
    const subject = view.players.find(player => player.id === view.activePlayerId);
    if (subject?.x != null && subject.y != null) {
      const next = cameraRef.current.reveal(centerOf({ x: subject.x, y: subject.y }), 50);
      setTravel({ focus: next.focus, transverseFocus: next.transverseFocus }); onBlurPlayer?.();
    }
  }, [decision?.key]);
  const targetSquares = new Map<string, Point>(), targetPlayers = new Set<string>();
  for (const action of actions) {
    if (action.target && 'playerId' in action.target) targetPlayers.add(action.target.playerId);
    else if (action.target && 'x' in action.target && action.kind !== 'push' && !(routePreview && action.kind === 'move')) targetSquares.set(`${action.target.x},${action.target.y}`, action.target);
  }
  const placementSquares = draggingPlayerId && (view.phase === 'SETUP' || view.turnMode === 'SOLID_DEFENCE')
    ? Array.from({ length: 390 }, (_, index) => ({ x: index % 26, y: Math.floor(index / 26) })).filter(square => canPlaceReserve({ ...view, phase: 'SETUP' }, draggingPlayerId, square.x, square.y)) : [];
  const target = pinnedAction?.target, pinnedTarget = target && ('playerId' in target ? view.players.find(player => player.id === target.playerId) : target);
  const point = (clientX: number, clientY: number) => {
    const local = camera.fromClient({ x: clientX, y: clientY }, scene.current!.getBoundingClientRect()); return local && camera.cellAt(local);
  };
  const occupants = view.players.filter(player => player.x !== null && player.y !== null);
  const depthOrder = new Map([...occupants].sort((a, b) =>
    (camera.project(centerOf({ x: b.x!, y: b.y! }))?.depth ?? 0) - (camera.project(centerOf({ x: a.x!, y: a.y! }))?.depth ?? 0) || a.id.localeCompare(b.id))
    .map((player, index) => [player.id, index]));
  const diceSubject = view.players.find(player => player.id === diceMoment?.subjectId) ?? activePlayer;
  const dicePosition = diceSubject?.x != null && diceSubject.y != null ? camera.project(centerOf({ x: diceSubject.x, y: diceSubject.y })) : null;
  const diceX = dicePosition && dicePosition.x > camera.width / 2 ? camera.width * .08 : camera.width * .68;
  const diceY = Math.min(camera.height - 130, Math.max(20, camera.height * .38));
  const chalk = (from: Point, to: Point) => routePath([{ x: from.x - .5, y: from.y - .5 }, { x: to.x - .5, y: to.y - .5 }], camera);
  return <section className="live-pitch projected-pitch" aria-label={playback ? 'Live match pitch' : readOnly ? 'Read-only replay pitch' : 'Live match pitch'}>
    <div className={`live-camera-controls${showToolbar ? '' : ' compact'}`} aria-label="Pitch camera controls">
      <button type="button" aria-pressed={mode === 'top-down'} onClick={() => { setMode(mode === 'perspective' ? 'top-down' : 'perspective'); onBlurPlayer?.(); }}>{mode === 'perspective' ? 'Top-down view' : 'Perspective view'}</button>
      {view.callerRole === 'spectator' && <button type="button" onClick={() => { setSpectatorEnd(end === 'home' ? 'away' : 'home'); onBlurPlayer?.(); }}>{end === 'home' ? 'Away coach view' : 'Home coach view'}</button>}
      <button type="button" onClick={() => changeCamera(camera.with({ focus: 13, transverseFocus: 7.5 }))}>Midfield</button>
      <button type="button" disabled={selected?.x == null} onClick={() => selected?.x != null && selected.y != null && reveal(centerOf({ x: selected.x, y: selected.y }))}>Reveal selected</button>
      <button type="button" disabled={!view.ball && activePlayer?.x == null} onClick={() => reveal(view.ball ? centerOf(view.ball) : activePlayer?.x != null && activePlayer.y != null ? centerOf({ x: activePlayer.x, y: activePlayer.y }) : null)}>Reveal ball / active</button>
      {showToolbar && <>{[1, 1.5, 2].map(value => <button key={value} type="button" aria-pressed={zoom === value} onClick={() => { setZoom(value); onBlurPlayer?.(); }}>{value === 1 ? 'Fit' : `${value}×`}</button>)}</>}
    </div>
    <div ref={viewport} className="live-pitch-viewport" tabIndex={0} aria-label={playback ? 'Pitch playback' : readOnly ? 'Replay pitch' : 'Pitch action preview'}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key] as PitchDirection | undefined;
        if (direction) { event.preventDefault();
          const origin = cursor ?? (selected?.x != null && selected.y != null ? { x: selected.x, y: selected.y } : { x: Math.min(25, Math.floor(camera.focus)), y: 7 });
          const next = camera.neighbor(origin, direction); setCursor(next); reveal(centerOf(next));
        } else if (event.key === 'Enter' && cursor && !readOnly && !event.repeat) { event.preventDefault(); onSquare(cursor.x, cursor.y); }
      }}
      onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }}
      onPointerDown={event => { if (event.button !== 0 || draggingPlayerId) return; drag.current = { x: event.clientX, y: event.clientY, camera, moved: false }; }}
      onPointerMove={event => { const start = drag.current; if (!start) return; const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) { start.moved = true; viewport.current!.setPointerCapture(event.pointerId); }
        if (start.moved) changeCamera(start.camera.panPixels({ x: dx, y: dy })); }}
      onPointerUp={event => { if (drag.current?.moved) suppressClick.current = true; drag.current = null;
        if (viewport.current?.hasPointerCapture(event.pointerId)) viewport.current.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; }}>
      <div ref={scene} className="live-pitch-scene" data-projection={mode} data-end={end} data-focus={camera.focus}
        data-transverse-focus={camera.transverseFocus} data-zoom={zoom} style={{ width: size.width, height: size.height }}
        onDragOver={event => { if (onDropPlayer) event.preventDefault(); }}
        onDrop={event => { if (!onDropPlayer) return; event.preventDefault(); const id = event.dataTransfer.getData('application/x-fumbbl-setup-player'), square = point(event.clientX, event.clientY);
          if (id && square) onDropPlayer(id, square.x, square.y); onEndDrag?.(); }}
        onClick={event => { if (!readOnly) { const square = point(event.clientX, event.clientY); if (square) onSquare(square.x, square.y); } }}>
        {!backgroundFailed && <PitchScenery camera={camera} onError={() => setBackgroundFailed(true)}/>}
        <svg viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          <defs><marker id={`${markerId}-route-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 9 5 1 9Z" className="live-route-arrowhead"/></marker></defs>
          {Array.from({ length: 390 }, (_, index) => ({ x: Math.floor(index / 15), y: index % 15 })).map(square => <polygon key={`${square.x},${square.y}`}
            data-cell-x={square.x} data-cell-y={square.y} points={points(camera.square(square, 0, true))}
            fill={square.x === 0 ? '#37669166' : square.x === 25 ? '#874a2d66' : (square.x + square.y) % 2 ? '#18392222' : '#b1c46a0b'} stroke="#21371e" strokeOpacity=".5"/>) }
          <path className="pitch-chalk" d={[chalk({ x: 0, y: 0 }, { x: 26, y: 0 }), chalk({ x: 0, y: 15 }, { x: 26, y: 15 }), ...[0, 1, 13, 25, 26].map(x => chalk({ x, y: 0 }, { x, y: 15 }))].join(' ')}/>
          {[4, 11].map(y => <path key={y} className="pitch-chalk wide" d={chalk({ x: 0, y }, { x: 26, y })}/>) }
          {[...targetSquares.values()].map(square => <polygon key={`target-${square.x},${square.y}`} className="live-target-square" points={points(camera.square(square, .06, true))}/>) }
          {placementSquares.map(square => <polygon key={`place-${square.x},${square.y}`} className="live-placement-square" points={points(camera.square(square, .08, true))}/>) }
          {selected?.x != null && selected.y != null && <polygon className="live-selection-square" data-selection={selected.id} points={points(camera.square({ x: selected.x, y: selected.y }, .06, true))}/>}
          {cursor && <polygon className="live-keyboard-square" points={points(camera.square(cursor, .1, true))}/>}
          {routePreview && <><path className="live-route-guide" d={routePath([routePreview.from, ...routePreview.steps], camera)}/><path className="live-route-line" d={routePath([routePreview.from, ...routePreview.steps], camera)} markerEnd={`url(#${markerId}-route-arrow)`}/></>}
          {waypoints.map((square, index) => { const p = camera.project(centerOf(square)); return p && <g key={index} className="live-route-waypoint"><circle cx={p.x} cy={p.y} r="8"/><text x={p.x} y={p.y + 3} textAnchor="middle">{index + 1}</text></g>; })}
          {activePlayer?.x != null && activePlayer.y != null && pinnedTarget?.x != null && pinnedTarget.y != null && <path className="live-target-line" d={routePath([{ x: activePlayer.x, y: activePlayer.y }, { x: pinnedTarget.x, y: pinnedTarget.y }], camera)}/>}
          {view.ball && (() => { const p = camera.project(centerOf(view.ball!)); return p && <ellipse className="live-ball" cx={p.x} cy={p.y - p.pixelsPerSquare * .07} rx={p.pixelsPerSquare * .08} ry={p.pixelsPerSquare * .12}/>; })()}
        </svg>
        {occupants.map(player => <PlayerMarker key={player.id} player={player} teamName={matchTeamName(view, player.role)} camera={camera} facing={facings[player.id]} order={depthOrder.get(player.id)!}
          active={player.id === view.activePlayerId} selected={player.id === selectedId} target={targetPlayers.has(player.id)} readOnly={readOnly}
          canDrag={draggableIds?.has(player.id) ?? false} onStartDrag={onStartDrag} onEndDrag={onEndDrag}
          onSelect={() => onSelectPlayer(player.id)} onGround={onSquare} onFocus={anchor => onFocusPlayer?.(player.id, anchor)} onBlur={() => onBlurPlayer?.()}/>) }
        {pushChoices.map(choice => {
          const p = camera.project(centerOf({ x: choice.x, y: choice.y })), from = camera.project(centerOf({ x: choice.fromX, y: choice.fromY }));
          if (!p || !from) return null;
          return <button key={choice.action.id} type="button" className="live-push-choice" aria-label={choice.action.label} title={choice.action.label}
            style={{ left: p.x - p.pixelsPerSquare / 2, top: p.y - p.pixelsPerSquare / 2, width: p.pixelsPerSquare, height: p.pixelsPerSquare }}
            onClick={event => { event.stopPropagation(); onPushChoice?.(choice.action.id); }}>
            <svg viewBox="0 0 32 32" aria-hidden="true" style={{ transform: `rotate(${Math.atan2(p.y - from.y, p.x - from.x) * 180 / Math.PI}deg)` }}><path className="live-push-shaft" d="M5 16h19"/><path className="live-push-head" d="m17 9 7 7-7 7"/></svg>
          </button>;
        })}
        {decision && <PitchDecisionOverlay key={decision.key} decision={decision} disabled={decisionDisabled} viewport={viewport} scene={scene} x={diceX} y={diceY} onAction={onDecisionAction}/>}
        {!decision && diceMoment && <div className="live-dice-overlay" role="status" aria-label={`${diceMoment.label}: ${diceMoment.faces.join(', ')}`} style={{ left: diceX, top: diceY }}><strong>{diceMoment.label}</strong><div>{diceMoment.faces.map((face, index) => <DiceFace key={index} face={face} selected={diceMoment.selected === index}/>)}</div></div>}
        {backgroundFailed && <span className="live-pitch-error">Stadium image unavailable; plain field shown.</span>}
      </div>
    </div>
    <output className="sr-only" aria-live="polite">{cursor ? `Square ${cursor.x}, ${cursor.y}` : 'Pitch camera ready'}</output>
  </section>;
}
