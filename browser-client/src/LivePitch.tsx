import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SetupAction, SetupPlayer, SetupState } from './setup-protocol.ts';
import type { RoutePoint, RoutePreview, RouteStep } from './route-protocol.ts';
import { routeSquarePresentation } from './route-presentation.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { MatchDecision } from './match-decision.ts';
import { DiceFace } from './DiceFace.tsx';
import { PitchDecisionOverlay } from './PitchDecisionOverlay.tsx';
import './ui-round-four.css';
import { PitchScenery } from './PitchScenery.tsx';
import { PitchProjection, type Point, type PitchDirection, type PitchProjectionMode, type PerspectiveElevation } from './pitch-projection.ts';
import { resolvePlayerArt, resolvePlayerPortrait, playerArtPlacement, type PlayerFacing } from './player-art.ts';
import { canPlaceReserve } from './setup-protocol.ts';
import { matchTeamName } from './match-team-name.ts';
import type { PushChoice } from './push-choice.ts';
import { passingLegend, passingSquare } from './passing-presentation.ts';
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

function MovementSquare({ step, camera, planned, index, labelsOnly = false }: { step: RouteStep; camera: PitchProjection; planned: boolean; index: number; labelsOnly?: boolean }) {
  const p = camera.project(centerOf(step));
  if (!p) return null;
  const presentation = routeSquarePresentation(step);
  const polygon = camera.square(step, .025, true);
  if (polygon.length < 3) return null;
  const width = Math.max(...polygon.map(point => point.x)) - Math.min(...polygon.map(point => point.x));
  const height = Math.max(...polygon.map(point => point.y)) - Math.min(...polygon.map(point => point.y));
  const compact = presentation.labels.length === 2 && height < 34;
  const fontSize = Math.max(7, Math.min(compact ? 11 : 15, p.pixelsPerSquare * .25,
    height / (compact ? 1 : Math.max(1, presentation.labels.length)) * .5));
  const top = p.y - (compact ? 1 : presentation.labels.length) * fontSize / 2;
  const badgeRadius = Math.min(4, height * (compact ? .12 : .22), width * .06);
  return <g className={`live-route-step${!labelsOnly && !planned ? ' live-available-step' : ''}`} data-route-square={!labelsOnly && planned ? `${step.x},${step.y}` : undefined}
    data-movement-square={!labelsOnly && !planned ? `${step.x},${step.y}` : undefined} data-label-square={labelsOnly ? `${step.x},${step.y}` : undefined}
    data-route-band={presentation.band} data-step-index={index} data-center-x={p.x} data-center-y={p.y}>
    {!labelsOnly && <polygon fill={presentation.color} points={points(polygon)}><title>{presentation.description}</title></polygon>}
    {labelsOnly && <text x={p.x} y={top + fontSize * .8} textAnchor="middle" style={{ fontSize, strokeWidth: compact ? 1 : 2 }}>
      {presentation.labels.map((label, row) => <tspan key={label} x={compact ? p.x + (row ? 1 : -1) * width * .25 : p.x}
        dy={row && !compact ? fontSize : 0} textLength={compact ? width * .35 : undefined} lengthAdjust={compact ? 'spacingAndGlyphs' : undefined}>{label}</tspan>)}
    </text>}
    {labelsOnly && presentation.badges.length > 0 && <g className="live-additional-check" data-check-names={presentation.badges.map(badge => badge.name).join(',')}>
      <title>{presentation.badges.map(badge => badge.description).join(' · ')}</title>
      <g transform={`translate(${compact ? p.x : p.x + width * .4},${compact ? p.y - height * .3 : p.y}) scale(${badgeRadius / 5})`}>
        <circle r="5" fill="#ffe17b" stroke="#102337" strokeWidth="1"/>
        <path d="M0 -3V1 M0 2.5V3" stroke="#102337" strokeWidth="1.5" strokeLinecap="round"/>
      </g>
    </g>}
  </g>;
}

function PlayerMarker({ player, teamName, camera, facing, setupPerspective, order, active, selected, target, onSelect, onGround,
  onFocus, onBlur, readOnly, canDrag, onStartDrag, onEndDrag, failedArt, onArtError }: {
  player: SetupPlayer; teamName: string; camera: PitchProjection; facing?: PlayerFacing; setupPerspective: boolean; order: number;
  active: boolean; selected: boolean; target: boolean; onSelect: () => void; onGround: (x: number, y: number) => void;
  onFocus: (anchor: DOMRect) => void; onBlur: () => void; readOnly: boolean;
  failedArt: Set<string>; onArtError: (url: string) => void;
  canDrag: boolean; onStartDrag?: (id: string) => void; onEndDrag?: () => void;
}) {
  const art = resolvePlayerArt(player, { end: camera.end, facing, setupPerspective, topDown: camera.mode === 'top-down' });
  const position = camera.project(centerOf({ x: player.x!, y: player.y! }));
  const visible = !!position && camera.square({ x: player.x!, y: player.y! }, 0, true).length >= 3;
  const body = art?.body;
  const scale = (position?.pixelsPerSquare ?? camera.scale) * 1.08 / 64;
  const placement = body ? playerArtPlacement(body, camera.mode === 'top-down') : null;
  const anchor = placement?.anchor ?? { x: 0, y: 0 };
  const corners = camera.square({ x: player.x!, y: player.y! });
  const width = position?.pixelsPerSquare ?? camera.scale;
  const height = corners.length ? Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y)) : width;
  const left = (position?.x ?? 0) - width / 2, top = (position?.y ?? 0) - height / 2;
  const number = player.number ?? player.slot;
  return <button type="button" data-player-id={player.id} data-x={player.x} data-y={player.y}
    data-center-x={position?.x} data-center-y={position?.y} data-pose={body?.pose ?? 'token'}
    data-anchor-mode={body && !failedArt.has(body.url) ? placement?.mode : 'token'}
    className={`live-marker ${player.role}${active ? ' active' : ''}${selected ? ' selected' : ''}${target ? ' target' : ''}`}
    aria-label={`${teamName} ${player.name}, number ${number}, ${player.state}, square ${player.x}, ${player.y}`}
    tabIndex={visible ? 0 : -1} title={`${player.name} #${number} · ${player.state}`} draggable={canDrag && visible}
    style={{ left, top, width, height, zIndex: 10 + order, visibility: visible ? 'visible' : 'hidden' }}
    onPointerDown={event => { if (canDrag && event.button === 0) event.stopPropagation(); }}
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
    {body && !failedArt.has(body.url) ? <img src={body.url} alt="" draggable={false} onError={() => onArtError(body.url)}
      style={{ width: body.width * scale, height: body.height * scale, left: width / 2 - anchor.x * scale,
        top: height / 2 - anchor.y * scale, transform: body.mirror ? 'scaleX(-1)' : 'none' }}/>
      : <span className="live-token">{player.role === 'home' ? 'H' : 'A'}{number}</span>}
    <span className="live-number">{number}</span>
  </button>;
}

/** Presentation only: positions, state, ball and identity come from the server. */
export function LivePitch({ view, selectedId, actions, pinnedAction, routePreview = null, waypoints = [], diceMoment = null,
  onSelectPlayer, onFocusPlayer, onBlurPlayer, onSquare, draggableIds, draggingPlayerId = '', onStartDrag, onEndDrag,
  onDropPlayer, pushChoices = [], onPushChoice, readOnly = false, playback = false, allowEndChoice = false,
  zoom: controlledZoom, onZoomChange, showToolbar = true, debugOpen = true, cameraControlsHost, decision = null, decisionDisabled = false, onDecisionAction, onSelectionPosition }: {
  view: SetupState; selectedId: string; actions: SetupAction[]; pinnedAction?: SetupAction;
  routePreview?: RoutePreview | null; waypoints?: RoutePoint[]; diceMoment?: DiceMoment | null;
  decision?: MatchDecision | null; decisionDisabled?: boolean; onDecisionAction?: (actionId: string) => void;
  onSelectPlayer: (id: string) => void; onFocusPlayer?: (id: string, anchor: DOMRect) => void; onBlurPlayer?: () => void; onSquare: (x: number, y: number) => void;
  draggableIds?: Set<string>; draggingPlayerId?: string; onStartDrag?: (id: string) => void; onEndDrag?: () => void;
  onDropPlayer?: (id: string, x: number, y: number) => void; readOnly?: boolean; playback?: boolean; allowEndChoice?: boolean;
  pushChoices?: PushChoice[]; onPushChoice?: (actionId: string) => void;
  zoom?: number; onZoomChange?: (zoom: number) => void; showToolbar?: boolean; debugOpen?: boolean; cameraControlsHost?: HTMLElement | null;
  onSelectionPosition?: (position: { x: number; width: number } | null) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null), scene = useRef<HTMLDivElement>(null);
  const markerId = useId().replace(/:/g, '');
  const [size, setSize] = useState({ width: 1280, height: 720 });
  const [internalZoom, setInternalZoom] = useState(1);
  const zoom = controlledZoom ?? internalZoom, setZoom = onZoomChange ?? setInternalZoom;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const [mode, setMode] = useState<PitchProjectionMode>('perspective');
  const [perspectiveElevation, setPerspectiveElevation] = useState<PerspectiveElevation>(40);
  const [viewerEnd, setViewerEnd] = useState<'home' | 'away'>(view.callerRole === 'away' ? 'away' : 'home');
  const [travel, setTravel] = useState({ focus: 13, transverseFocus: 7.5 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [failedArt, setFailedArt] = useState<Set<string>>(() => new Set());
  const onArtError = (url: string) => setFailedArt(current => current.has(url) ? current : new Set([...current, url]));
  const [facings, setFacings] = useState<Record<string, PlayerFacing>>({});
  const prior = useRef<{ matchId: string; revision: number; players: SetupPlayer[] } | null>(null);
  const canChooseEnd = view.callerRole === 'spectator' || (readOnly && allowEndChoice);
  const end = canChooseEnd ? viewerEnd : view.callerRole === 'away' ? 'away' : 'home';
  const camera = new PitchProjection({ ...size, ...travel, end, mode, zoom, perspectiveElevation });
  const cameraRef = useRef(camera); cameraRef.current = camera;
  const changeCamera = (next: PitchProjection) => { setTravel({ focus: next.focus, transverseFocus: next.transverseFocus }); onBlurPlayer?.(); };
  const drag = useRef<{ x: number; y: number; camera: PitchProjection; moved: boolean } | null>(null);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }));
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault(); onBlurPlayer?.();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? cameraRef.current.height : 1);
      setZoom(Math.max(.75, Math.min(3, zoomRef.current * Math.exp(-delta * .0015))));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); };
  }, [onBlurPlayer, setZoom]);
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
  const passing = view.passing;
  useEffect(() => {
    const p = selected?.x != null && selected.y != null ? camera.project(centerOf({ x: selected.x, y: selected.y })) : null;
    onSelectionPosition?.(p ? { x: p.x, width: camera.width } : null);
  }, [selected?.x, selected?.y, end, mode, perspectiveElevation, travel.focus, travel.transverseFocus, size.width, size.height, zoom, onSelectionPosition]);
  const reveal = (point: Point | null | undefined) => { if (point) changeCamera(cameraRef.current.reveal(point, 50)); };
  useEffect(() => {
    if (!decision) return;
    const subject = view.players.find(player => player.id === view.activePlayerId);
    if (subject?.x != null && subject.y != null) {
      const next = cameraRef.current.reveal(centerOf({ x: subject.x, y: subject.y }), 50);
      setTravel({ focus: next.focus, transverseFocus: next.transverseFocus }); onBlurPlayer?.();
    }
  }, [decision?.key]);
  const targetSquares = new Map<string, Point>(), targetPlayers = new Set<string>(), moveSquares = new Set<string>();
  for (const action of actions) {
    if (action.target && 'playerId' in action.target) targetPlayers.add(action.target.playerId);
    else if (action.target && 'x' in action.target && action.kind !== 'push' && !(routePreview && action.kind === 'move')
      && !(passing && action.kind === 'pass')) {
      const key = `${action.target.x},${action.target.y}`;
      targetSquares.set(key, action.target);
      if (action.kind === 'move' || action.kind === 'jump') moveSquares.add(key);
    }
  }
  const availableChecks = view.movementForecast?.steps.filter(step => moveSquares.has(`${step.x},${step.y}`)) ?? [];
  const checkSteps = routePreview?.steps ?? availableChecks;
  const checkKey = [...new Map(checkSteps.flatMap(step => routeSquarePresentation(step).badges).map(badge => [badge.name, badge])).values()];
  const inspectedSquare = hover ?? cursor;
  const inspectedStep = inspectedSquare ? checkSteps.find(step => step.x === inspectedSquare.x && step.y === inspectedSquare.y)
    : checkSteps.find(step => routeSquarePresentation(step).badges.length > 0);
  const forecastSquares = new Set(availableChecks.map(step => `${step.x},${step.y}`));
  const placementSquares = draggingPlayerId && (view.phase === 'SETUP' || view.turnMode === 'SOLID_DEFENCE')
    ? Array.from({ length: 390 }, (_, index) => ({ x: index % 26, y: Math.floor(index / 26) })).filter(square => canPlaceReserve({ ...view, phase: 'SETUP' }, draggingPlayerId, square.x, square.y)) : [];
  const target = pinnedAction?.target, pinnedTarget = target && ('playerId' in target ? view.players.find(player => player.id === target.playerId) : target);
  const kickTarget = pinnedAction?.kind === 'kickoff' && pinnedTarget?.x != null && pinnedTarget.y != null
    ? { x: pinnedTarget.x, y: pinnedTarget.y }
    : view.phase === 'READY_FOR_KICKOFF' && hover && actions.some(action => action.kind === 'kickoff'
      && action.target && 'x' in action.target && action.target.x === hover.x && action.target.y === hover.y) ? hover : null;
  if (pinnedAction?.kind === 'pass' && pinnedTarget?.x != null && pinnedTarget.y != null) {
    const recipient = view.players.find(player => player.x === pinnedTarget.x && player.y === pinnedTarget.y);
    if (recipient) targetPlayers.add(recipient.id);
  }
  const point = (clientX: number, clientY: number) => {
    const local = camera.fromClient({ x: clientX, y: clientY }, scene.current!.getBoundingClientRect()); return local && camera.cellAt(local);
  };
  const setupPerspective = mode === 'perspective' && (view.phase === 'SETUP' || view.phase === 'READY_FOR_KICKOFF');
  const occupants = view.players.filter(player => player.x !== null && player.y !== null);
  const depthOrder = new Map([...occupants].sort((a, b) =>
    (camera.project(centerOf({ x: b.x!, y: b.y! }))?.depth ?? 0) - (camera.project(centerOf({ x: a.x!, y: a.y! }))?.depth ?? 0) || a.id.localeCompare(b.id))
    .map((player, index) => [player.id, index]));
  const diceX = camera.width * .25;
  const diceY = Math.min(camera.height - 130, Math.max(20, camera.height * .38));
  const chalk = (from: Point, to: Point) => routePath([{ x: from.x - .5, y: from.y - .5 }, { x: to.x - .5, y: to.y - .5 }], camera);
  const cameraControls = <div className={`live-camera-controls${showToolbar ? '' : ' compact'}`} aria-label="Pitch camera controls">
      <button type="button" aria-pressed={mode === 'top-down'} onClick={() => { setMode(mode === 'perspective' ? 'top-down' : 'perspective'); onBlurPlayer?.(); }}>{mode === 'perspective' ? 'Top-down view' : 'Perspective view'}</button>
      <label><span>Perspective angle</span> <select aria-label="Perspective angle" title="Perspective angle" value={perspectiveElevation}
        onChange={event => { setPerspectiveElevation(Number(event.target.value) as PerspectiveElevation); setMode('perspective'); onBlurPlayer?.(); }}>
        {[30, 40, 50].map(angle => <option key={angle} value={angle}>{angle}°</option>)}
      </select></label>
      {canChooseEnd && <button type="button" onClick={() => { setViewerEnd(end === 'home' ? 'away' : 'home'); onBlurPlayer?.(); }}>{end === 'home' ? 'Away coach view' : 'Home coach view'}</button>}
      <button type="button" onClick={() => changeCamera(camera.with({ focus: 13, transverseFocus: 7.5 }))}>Midfield</button>
      <button type="button" disabled={selected?.x == null} onClick={() => selected?.x != null && selected.y != null && reveal(centerOf({ x: selected.x, y: selected.y }))}>Reveal selected</button>
      <button type="button" disabled={!view.ball && activePlayer?.x == null} onClick={() => reveal(view.ball ? centerOf(view.ball) : activePlayer?.x != null && activePlayer.y != null ? centerOf({ x: activePlayer.x, y: activePlayer.y }) : null)}>Reveal ball / active</button>
      {showToolbar && <>{[1, 1.5, 2].map(value => <button key={value} type="button" aria-pressed={zoom === value} onClick={() => { setZoom(value); onBlurPlayer?.(); }}>{value === 1 ? 'Fit' : `${value}×`}</button>)}</>}
    </div>;
  return <section className="live-pitch projected-pitch" aria-label={playback ? 'Live match pitch' : readOnly ? 'Read-only replay pitch' : 'Live match pitch'}>
    {debugOpen && (cameraControlsHost === undefined ? cameraControls : cameraControlsHost && createPortal(cameraControls, cameraControlsHost))}
    {passing && <div className="live-pass-legend" role="note" aria-label="Passing distances">
      {passingLegend(passing).map(item => <span key={item.name}><i style={{ backgroundColor: item.color }}/>{item.text}</span>)}
      <span>Shaded: unavailable{passing.rangeLimited ? '; weather limits passes to Quick or Short' : ''}</span>
      <span>Filled squares: legal moves; D: Dodge · R: Rush</span>
      {passing.weatherPenalty > 0 && <span>weather +{passing.weatherPenalty} passing penalty; range names stay the same</span>}
      {(pinnedTarget?.x != null && pinnedTarget.y != null || cursor) && <output className="live-pass-target-detail" aria-live="polite">
        {passingSquare(passing, pinnedTarget?.x ?? cursor!.x, pinnedTarget?.y ?? cursor!.y).description}
      </output>}
    </div>}
    <div ref={viewport} className="live-pitch-viewport" tabIndex={0} aria-label={playback ? 'Pitch playback' : readOnly ? 'Replay pitch' : 'Pitch action preview'}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key] as PitchDirection | undefined;
        if (direction) { event.preventDefault(); setHover(null);
          const origin = cursor ?? (selected?.x != null && selected.y != null ? { x: selected.x, y: selected.y } : { x: Math.min(25, Math.floor(camera.focus)), y: 7 });
          const next = camera.neighbor(origin, direction); setCursor(next); reveal(centerOf(next));
        } else if (event.key === 'Enter' && cursor && !readOnly && !event.repeat) { event.preventDefault(); onSquare(cursor.x, cursor.y); }
      }}
      onContextMenu={event => event.preventDefault()}
      onAuxClickCapture={event => { if (event.button === 2) { event.preventDefault(); event.stopPropagation(); } }}
      onPointerDown={event => { if (event.button !== 2 || draggingPlayerId) return; event.preventDefault(); drag.current = { x: event.clientX, y: event.clientY, camera, moved: false }; }}
      onPointerMove={event => { const start = drag.current; if (!start) { const square = point(event.clientX, event.clientY);
        setHover(previous => previous?.x === square?.x && previous?.y === square?.y ? previous : square); return; } const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) { start.moved = true; viewport.current!.setPointerCapture(event.pointerId); }
        if (start.moved) changeCamera(start.camera.panPixels({ x: dx, y: dy })); }}
      onPointerUp={event => { drag.current = null;
        if (viewport.current?.hasPointerCapture(event.pointerId)) viewport.current.releasePointerCapture(event.pointerId); }}
      onPointerLeave={() => setHover(null)}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}>
      <div ref={scene} className="live-pitch-scene" data-projection={mode} data-elevation={camera.elevation} data-end={end} data-focus={camera.focus}
        data-transverse-focus={camera.transverseFocus} data-zoom={zoom} style={{ width: size.width, height: size.height }}
        onDragOver={event => { if (onDropPlayer) event.preventDefault(); }}
        onDrop={event => { if (!onDropPlayer) return; event.preventDefault(); const id = event.dataTransfer.getData('application/x-fumbbl-setup-player'), square = point(event.clientX, event.clientY);
          if (id && square) onDropPlayer(id, square.x, square.y); onEndDrag?.(); }}
        onClick={event => { if (!readOnly) { const square = point(event.clientX, event.clientY); if (square) onSquare(square.x, square.y); } }}>
        {(routePreview || availableChecks.length > 0) && <span className="live-route-legend" role="note">D: Dodge · R: Rush
          {checkKey.length > 0 && <span className="live-check-key" aria-label="Additional movement check key">{checkKey.map(badge => <span key={badge.name}>{badge.code}: {badge.name}</span>)}<span>!: additional checks — point to a square or use the arrow keys for details</span></span>}
          {inspectedStep && routeSquarePresentation(inspectedStep).badges.length > 0 && <output className="live-check-description" aria-live="polite">Square {inspectedStep.x}, {inspectedStep.y}: {routeSquarePresentation(inspectedStep).description}</output>}
        </span>}
        {!backgroundFailed && <PitchScenery camera={camera} view={view} onError={() => setBackgroundFailed(true)}/>}
        <svg viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          <defs><marker id={`${markerId}-route-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 9 5 1 9Z" className="live-route-arrowhead"/></marker></defs>
          {Array.from({ length: 390 }, (_, index) => ({ x: Math.floor(index / 15), y: index % 15 })).map(square => {
            const guidance = passing && passingSquare(passing, square.x, square.y);
            return <polygon key={`${square.x},${square.y}`}
            data-cell-x={square.x} data-cell-y={square.y} points={points(camera.square(square, 0, true))}
            data-pass-range={guidance?.code} fill={guidance?.color ?? (square.x === 0 ? '#37669166' : square.x === 25 ? '#874a2d66' : (square.x + square.y) % 2 ? '#18392222' : '#b1c46a0b')}
            stroke="#21371e" strokeOpacity=".5">{guidance && <title>{guidance.description}</title>}</polygon>;
          }) }
          {occupants.map(player => {
            const center = centerOf({ x: player.x!, y: player.y! });
            const body = resolvePlayerArt(player, { end, facing: facings[player.id], setupPerspective, topDown: mode === 'top-down' })?.body;
            const placement = body && !failedArt.has(body.url) ? playerArtPlacement(body, mode === 'top-down') : null;
            const scale = (camera.project(center)?.pixelsPerSquare ?? camera.scale) * 1.08 / 64;
            const offset = placement ? { x: (placement.shadowAnchor.x - placement.anchor.x) * scale,
              y: (placement.shadowAnchor.y - placement.anchor.y) * scale } : { x: 0, y: 0 };
            const shadow = Array.from({ length: 16 }, (_, index) => ({ x: center.x + .28 * Math.cos(index * Math.PI / 8),
              y: center.y + .28 * Math.sin(index * Math.PI / 8) }));
            return <polygon key={`shadow-${player.id}`} className="live-player-shadow" data-shadow-player={player.id}
              points={points(camera.polygon(shadow, true).map(p => ({ x: p.x + offset.x, y: p.y + offset.y })))}/>;
          })}
          <path className="pitch-chalk" d={[chalk({ x: 0, y: 0 }, { x: 26, y: 0 }), chalk({ x: 0, y: 15 }, { x: 26, y: 15 }), ...[0, 1, 13, 25, 26].map(x => chalk({ x, y: 0 }, { x, y: 15 }))].join(' ')}/>
          {[4, 11].map(y => <path key={y} className="pitch-chalk wide" d={chalk({ x: 0, y }, { x: 26, y })}/>) }
          {[...targetSquares.values()].filter(square => !forecastSquares.has(`${square.x},${square.y}`)).map(square => <polygon key={`target-${square.x},${square.y}`}
            className={`live-target-square${moveSquares.has(`${square.x},${square.y}`) ? ' live-unforecast-move-square' : ''}`}
            points={points(camera.square(square, .06, true))}/>)}
          {availableChecks.map((step, index) => <MovementSquare key={`available-${step.x},${step.y}`} step={step} camera={camera} planned={false} index={index}/>)}
          {kickTarget && <polygon className="live-kick-target" data-kick-target={`${kickTarget.x},${kickTarget.y}`}
            points={points(camera.square(kickTarget, .08, true))}/>}
          {placementSquares.map(square => <polygon key={`place-${square.x},${square.y}`} className="live-placement-square" points={points(camera.square(square, .08, true))}/>) }
          {selected?.x != null && selected.y != null && <polygon className="live-selection-square" data-selection={selected.id} points={points(camera.square({ x: selected.x, y: selected.y }, .06, true))}/>}
          {cursor && <polygon className="live-keyboard-square" points={points(camera.square(cursor, .1, true))}/>}
          {routePreview && <><path className="live-route-guide" d={routePath([routePreview.from, ...routePreview.steps], camera)}/><path className="live-route-line" d={routePath([routePreview.from, ...routePreview.steps], camera)} markerEnd={`url(#${markerId}-route-arrow)`}/></>}
          {routePreview?.steps.map((step, index) => <MovementSquare key={`route-step-${index}`} step={step} camera={camera} planned index={index}/>)}
          {activePlayer?.x != null && activePlayer.y != null && pinnedTarget?.x != null && pinnedTarget.y != null && <path className="live-target-line" d={routePath([{ x: activePlayer.x, y: activePlayer.y }, { x: pinnedTarget.x, y: pinnedTarget.y }], camera)}/>}
          {view.ball && view.ballState?.inPlay !== false && (() => {
            const p = camera.project(centerOf(view.ball!));
            if (!p) return null;
            const radius = Math.max(12, p.pixelsPerSquare * .38);
            const ballScale = Math.max(.65, Math.min(1.1, p.pixelsPerSquare / 50));
            return <g className="live-ball-marker" data-ball-x={view.ball.x} data-ball-y={view.ball.y}
              transform={`translate(${p.x} ${p.y})`}>
              <g className="live-ball-highlight">
              <circle className="live-ball-pulse" r={radius}/>
              <circle className="live-ball-ring" r={radius * .62}/>
              {[0, 90, 180, 270].map(degrees => <path key={degrees} className="live-ball-arrow"
                d={`M0 ${-radius * .86} L${-radius * .17} ${-radius * 1.16} L${radius * .17} ${-radius * 1.16}Z`}
                transform={`rotate(${degrees})`}/>)}
              </g>
              {view.ballState?.carrierPlayerId === null && <image className="live-ball-football" href={`${import.meta.env.BASE_URL}assets/game/ui/ball-v1.svg`}
                x={-8 * ballScale} y={-10 * ballScale} width={16 * ballScale} height={20 * ballScale}/>}
            </g>;
          })()}
        </svg>
        <svg className="live-movement-label-layer" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          {availableChecks.map((step, index) => <MovementSquare key={`available-label-${step.x},${step.y}`} step={step} camera={camera} planned={false} index={index} labelsOnly/>)}
          {routePreview?.steps.map((step, index) => <MovementSquare key={`route-label-${index}`} step={step} camera={camera} planned index={index} labelsOnly/>)}
          {waypoints.map((square, index) => { const p = camera.project(centerOf(square));
            const offset = p && Math.max(24, p.pixelsPerSquare * .55);
            return p && <g key={index} className="live-route-waypoint"><circle cx={p.x + offset!} cy={p.y - offset!} r="6"/>
              <text x={p.x + offset!} y={p.y - offset! + 3} textAnchor="middle">{index + 1}</text></g>; })}
        </svg>
        {occupants.map(player => <PlayerMarker failedArt={failedArt} onArtError={onArtError} key={player.id} player={player} teamName={matchTeamName(view, player.role)} camera={camera} facing={facings[player.id]}
          setupPerspective={setupPerspective} order={depthOrder.get(player.id)!}
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
        {decision && <PitchDecisionOverlay key={decision.key} decision={decision}
          diceMoment={decision.kind === 'reroll' || decision.kind === 'skill' ? diceMoment : null}
          disabled={decisionDisabled} viewport={viewport} scene={scene} x={diceX} y={diceY} onAction={onDecisionAction}/>}
        {!decision && diceMoment && <div className="live-dice-overlay" role="status" aria-label={`${diceMoment.label}: ${diceMoment.faces.join(', ')}`} style={{ left: diceX, top: diceY }}><strong className="sr-only">{diceMoment.label}</strong><div>{diceMoment.faces.map((face, index) =>
          <span key={index} title={diceMoment.rolls?.[index]?.label ?? diceMoment.label}><DiceFace face={face} selected={diceMoment.selected === index}
            rollKey={diceMoment.rolls?.[index]?.rollKey ?? diceMoment.rollKey}/></span>)}</div></div>}
        {backgroundFailed && <span className="live-pitch-error">Stadium image unavailable; plain field shown.</span>}
      </div>
    </div>
    {availableChecks.length > 0 && <ol className="sr-only" aria-label="Available square checks">{availableChecks.map((step, index) => <li key={index}>Square {step.x}, {step.y}: {routeSquarePresentation(step).description}</li>)}</ol>}
    {routePreview && <ol className="sr-only" aria-label="Planned square checks">{routePreview.steps.map((step, index) => <li key={index}>Square {step.x}, {step.y}: {routeSquarePresentation(step).description}</li>)}</ol>}
    <output className="sr-only" aria-live="polite">{cursor ? `Square ${cursor.x}, ${cursor.y}` : 'Pitch camera ready'}</output>
  </section>;
}
