import { useEffect, useRef, useState } from 'react';
import type { SetupAction, SetupPlayer, SetupState } from './setup-protocol.ts';
import type { RoutePoint, RoutePreview } from './route-protocol.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { MatchDecision } from './match-decision.ts';
import { DiceFace } from './DiceFace.tsx';
import { PitchDecisionOverlay } from './PitchDecisionOverlay.tsx';
import { canPlaceReserve } from './setup-protocol.ts';
import { matchTeamName } from './match-team-name.ts';
import type { PushChoice } from './push-choice.ts';
import './live-pitch.css';

const WIDTH = 960;
const HEIGHT = 564;
const CELL = 36;
const OFFSET = 12;

function curvedRoute(points: RoutePoint[]): string {
  if (points.length < 2) return '';
  const centers = points.map(point => ({ x: OFFSET + point.x * CELL + CELL / 2, y: OFFSET + point.y * CELL + CELL / 2 }));
  const end = centers[centers.length - 1];
  const previous = centers[centers.length - 2];
  const length = Math.hypot(end.x - previous.x, end.y - previous.y);
  end.x -= 12 * (end.x - previous.x) / length;
  end.y -= 12 * (end.y - previous.y) / length;
  const segments = centers.slice(0, -1).map((from, index) => {
    const to = centers[index + 1];
    const before = centers[Math.max(0, index - 1)];
    const after = centers[Math.min(centers.length - 1, index + 2)];
    return `C ${from.x + (to.x - before.x) / 6} ${from.y + (to.y - before.y) / 6}`
      + ` ${to.x - (after.x - from.x) / 6} ${to.y - (after.y - from.y) / 6} ${to.x} ${to.y}`;
  });
  return `M ${centers[0].x} ${centers[0].y} ${segments.join(' ')}`;
}
const humanSprites: Record<string, string> = {
  lineman: '10-lineman-man.png', blitzer: '02-blitzer-man.png', catcher: '05-catcher-man.png',
  thrower: '06-thrower-man.png', ogre: '01-ogre-man.png', halfling: '14-halfling-man.png'
};
const orcSprites: Record<string, string[]> = {
  'orc-lineman': ['08-line-orc-man.png', '09-line-orc-woman.png', '10-line-orc-man.png', '11-line-orc-woman.png', '12-line-orc-man.png', '13-line-orc-woman.png'],
  'goblin-lineman': ['14-goblin-man.png', '15-goblin-woman.png', '16-goblin-woman.png'],
  'orc-thrower': ['06-thrower-man.png', '07-thrower-woman.png'],
  'orc-blitzer': ['02-blitzer-man.png', '03-blitzer-woman.png'],
  'big-un-blocker': ['04-big-un-man.png', '05-big-un-woman.png'],
  troll: ['01-troll-man.png']
};
const pitchUrl = `${import.meta.env.BASE_URL}assets/game/pitch/live-pitch.svg`;

export function spriteUrl(player: SetupPlayer) {
  if (!player.art) return null;
  const roster = player.art.rosterId;
  const variants = roster === 'orc' ? orcSprites[player.art.positionId] : null;
  const file = variants?.[(player.slot - 1) % variants.length] ?? (roster === 'human' ? humanSprites[player.art.positionId] : null);
  if (!file) return null;
  return `${import.meta.env.BASE_URL}assets/game/teams/${roster}/${file}`;
}

function PlayerMarker({ player, teamName, scale, active, selected, target, onSelect, onFocus, onBlur, readOnly, canDrag, onStartDrag, onEndDrag }: {
  player: SetupPlayer; teamName: string; scale: number; active: boolean; selected: boolean; target: boolean; onSelect: () => void; onFocus: (anchor: DOMRect) => void; onBlur: () => void; readOnly: boolean;
  canDrag: boolean; onStartDrag?: (id: string) => void; onEndDrag?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const sprite = spriteUrl(player);
  const prone = player.state.toLowerCase().includes('prone');
  const stunned = player.state.toLowerCase().includes('stunned');
  return <button type="button" className={`live-marker ${player.role}${active ? ' active' : ''}${selected ? ' selected' : ''}${target ? ' target' : ''}${prone ? ' prone' : ''}${stunned ? ' stunned' : ''}`}
    aria-label={`${teamName} ${player.name}, number ${player.slot}, ${player.state}, square ${player.x}, ${player.y}`}
    title={`${player.name} #${player.slot} · ${player.state}`}
    draggable={canDrag}
    onPointerDown={event => { if (canDrag) event.stopPropagation(); }}
    onDragStart={event => { if (!canDrag) return; event.dataTransfer.setData('application/x-fumbbl-setup-player', player.id);
      event.dataTransfer.effectAllowed = 'move'; onStartDrag?.(player.id); }} onDragEnd={() => onEndDrag?.()}
    style={{ left: (OFFSET + player.x! * CELL) * scale, top: (OFFSET + player.y! * CELL) * scale,
      width: CELL * scale, height: CELL * scale, zIndex: 10 + player.y! * 26 + player.x! }}
    onPointerEnter={event => { if (event.pointerType !== 'touch') onFocus(event.currentTarget.getBoundingClientRect()); }} onPointerLeave={onBlur}
    onFocus={event => onFocus(event.currentTarget.getBoundingClientRect())} onBlur={onBlur}
    onClick={event => { event.stopPropagation(); if (!readOnly) onSelect(); }}>
    {sprite && !failed ? <img src={sprite} alt="" onError={() => setFailed(true)} className={player.art?.positionId === 'ogre' || player.art?.positionId === 'troll' ? 'large' : ''}/> :
      <span className="live-token">{player.role === 'home' ? 'H' : 'A'}{player.slot}</span>}
    <span className="live-number">{player.slot}</span>
  </button>;
}

/** Presentation only: positions, state, ball and identity come from the server projection. */
export function LivePitch({ view, selectedId, actions, pinnedAction, routePreview = null, waypoints = [], diceMoment = null, onSelectPlayer, onFocusPlayer, onBlurPlayer, onSquare,
  draggableIds, draggingPlayerId = '', onStartDrag, onEndDrag, onDropPlayer, pushChoices = [], onPushChoice, readOnly = false, playback = false,
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
  const viewport = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [size, setSize] = useState({ width: WIDTH, height: HEIGHT });
  const [internalZoom, setInternalZoom] = useState(1);
  const zoom = controlledZoom ?? internalZoom;
  const setZoom = onZoomChange ?? setInternalZoom;
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const availableSquare = Math.min(size.width / WIDTH, size.height / HEIGHT) * CELL;
  const fitSquare = availableSquare >= 56 ? 56 : availableSquare >= 48 ? 48 : availableSquare >= 40 ? 40 : availableSquare;
  const scale = Math.max(.18, fitSquare / CELL * zoom);
  const targetSquares = new Map<string, { x: number; y: number }>();
  const targetPlayers = new Set<string>();
  for (const action of actions) {
    if (action.target && 'playerId' in action.target) targetPlayers.add(action.target.playerId);
    else if (action.target && 'x' in action.target && action.kind !== 'push' && !(routePreview && action.kind === 'move'))
      targetSquares.set(`${action.target.x},${action.target.y}`, action.target);
  }
  const activePlayer = view.players.find(player => player.id === view.activePlayerId);
  const diceSubject = view.players.find(player => player.id === diceMoment?.subjectId) ?? activePlayer;
  const diceX = diceSubject?.x !== null && diceSubject?.x !== undefined && diceSubject.x < 13 ? 16 : 3;
  const diceY = diceSubject?.y !== null && diceSubject?.y !== undefined && diceSubject.y < 8 ? 10 : 2;
  const target = pinnedAction?.target;
  const placementSquares = draggingPlayerId && (view.phase === 'SETUP' || view.turnMode === 'SOLID_DEFENCE')
    ? Array.from({ length: 15 * 26 }, (_, index) => ({ x: index % 26, y: Math.floor(index / 26) }))
      .filter(square => canPlaceReserve({ ...view, phase: 'SETUP' }, draggingPlayerId, square.x, square.y)) : [];
  const routePath = routePreview ? curvedRoute([routePreview.from, ...routePreview.steps]) : '';
  const pinnedTarget = target && ('playerId' in target
    ? view.players.find(player => player.id === target.playerId) : target);
  const point = (clientX: number, clientY: number) => {
    const rect = scene.current!.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) * WIDTH / rect.width - OFFSET) / CELL);
    const y = Math.floor(((clientY - rect.top) * HEIGHT / rect.height - OFFSET) / CELL);
    return x >= 0 && x < 26 && y >= 0 && y < 15 ? { x, y } : null;
  };
  return <section className="live-pitch" aria-label={playback ? 'Live match pitch' : readOnly ? 'Read-only replay pitch' : 'Live match pitch'}>
    {showToolbar && <div className="live-pitch-toolbar"><strong>Authoritative pitch</strong><span>{Math.round(CELL * scale)} px / square</span>
      <div><button type="button" aria-pressed={zoom === 1} onClick={() => setZoom(1)}>Fit</button>
        <button type="button" aria-pressed={zoom === 1.5} onClick={() => setZoom(1.5)}>1.5×</button>
        <button type="button" aria-pressed={zoom === 2} onClick={() => setZoom(2)}>2×</button></div>
    </div>}
    <div ref={viewport} className="live-pitch-viewport" tabIndex={readOnly ? -1 : 0} aria-label={playback ? 'Pitch playback' : readOnly ? 'Replay pitch' : 'Pitch action preview'}
      style={{ overflow: zoom === 1 ? 'hidden' : 'auto', touchAction: zoom === 1 ? 'pan-y' : 'none' }}
      onKeyDown={event => { if (zoom === 1 || event.target !== event.currentTarget) return;
        const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!direction) return;
        event.preventDefault(); event.currentTarget.scrollBy({ left: direction[0] * CELL * scale, top: direction[1] * CELL * scale });
      }}
      onPointerDown={event => { if (zoom === 1 || event.button !== 0) return; const element = viewport.current!; drag.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, moved: false }; }}
      onPointerMove={event => { const start = drag.current; if (!start) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.abs(dx) + Math.abs(dy) > 6) { start.moved = true; viewport.current!.setPointerCapture(event.pointerId); } if (start.moved) { viewport.current!.scrollLeft = start.left - dx; viewport.current!.scrollTop = start.top - dy; } }}
      onPointerUp={() => { if (drag.current?.moved) suppressClick.current = true; drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}>
      <div className="live-pitch-center" style={{ minWidth: WIDTH * scale, minHeight: HEIGHT * scale }}>
        <div ref={scene} className="live-pitch-scene" style={{ width: WIDTH * scale, height: HEIGHT * scale }}
          onDragOver={event => { if (onDropPlayer) event.preventDefault(); }}
          onDrop={event => { if (!onDropPlayer) return; event.preventDefault(); const id = event.dataTransfer.getData('application/x-fumbbl-setup-player');
            const square = point(event.clientX, event.clientY); if (id && square) onDropPlayer(id, square.x, square.y); onEndDrag?.(); }}
          onClick={event => { if (readOnly) return; if (suppressClick.current) { suppressClick.current = false; return; } const square = point(event.clientX, event.clientY); if (square) onSquare(square.x, square.y); }}>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
            <defs><marker id="live-route-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M1 1 9 5 1 9Z" className="live-route-arrowhead"/>
            </marker></defs>
            {backgroundFailed ? <><rect width={WIDTH} height={HEIGHT} fill="#263422"/><rect x={OFFSET} y={OFFSET} width="936" height="540" fill="#56632b"/></> :
              <image href={pitchUrl} width={WIDTH} height={HEIGHT} onError={() => setBackgroundFailed(true)}/>}
            {[...targetSquares.values()].map(square => <rect key={`${square.x},${square.y}`} className="live-target-square"
              x={OFFSET + square.x * CELL + 2} y={OFFSET + square.y * CELL + 2} width={CELL - 4} height={CELL - 4}/>)}
            {placementSquares.map(square => <rect key={`place-${square.x}-${square.y}`} className="live-placement-square"
              x={OFFSET + square.x * CELL + 3} y={OFFSET + square.y * CELL + 3} width={CELL - 6} height={CELL - 6}/>)}
            {routePath && <><path className="live-route-guide" d={routePath}/><path className="live-route-line" d={routePath} markerEnd="url(#live-route-arrowhead)"/></>}
            {waypoints.map((square, index) => <g key={`waypoint-${index}`} className="live-route-waypoint">
              <circle cx={OFFSET + square.x * CELL + CELL / 2} cy={OFFSET + square.y * CELL + CELL / 2} r="8"/>
              <text x={OFFSET + square.x * CELL + CELL / 2} y={OFFSET + square.y * CELL + CELL / 2 + 3} textAnchor="middle">{index + 1}</text>
            </g>)}
            {activePlayer?.x != null && activePlayer.y != null && pinnedTarget?.x != null && pinnedTarget.y != null &&
              <path className="live-target-line" d={`M ${OFFSET + activePlayer.x * CELL + CELL / 2} ${OFFSET + activePlayer.y * CELL + CELL / 2} L ${OFFSET + pinnedTarget.x * CELL + CELL / 2} ${OFFSET + pinnedTarget.y * CELL + CELL / 2}`}/>}
            {view.ball && <circle className="live-ball" cx={OFFSET + view.ball.x * CELL + CELL / 2} cy={OFFSET + view.ball.y * CELL + CELL / 2} r="6"/>}
          </svg>
          {view.players.filter(player => player.x !== null && player.y !== null).map(player =>
            <PlayerMarker key={player.id} player={player} teamName={matchTeamName(view, player.role)} scale={scale} active={player.id === view.activePlayerId}
              selected={player.id === selectedId} target={targetPlayers.has(player.id)} readOnly={readOnly}
              canDrag={draggableIds?.has(player.id) ?? false} onStartDrag={onStartDrag} onEndDrag={onEndDrag}
              onSelect={() => onSelectPlayer(player.id)} onFocus={anchor => onFocusPlayer?.(player.id, anchor)} onBlur={() => onBlurPlayer?.()}/>)}
          {pushChoices.map(choice => <button key={choice.action.id} type="button" className="live-push-choice"
            aria-label={choice.action.label} title={choice.action.label}
            style={{ left: (OFFSET + choice.x * CELL) * scale, top: (OFFSET + choice.y * CELL) * scale,
              width: CELL * scale, height: CELL * scale }}
            onClick={event => { event.stopPropagation(); onPushChoice?.(choice.action.id); }}>
            <svg viewBox="0 0 32 32" aria-hidden="true" style={{ transform: `rotate(${Math.atan2(choice.y - choice.fromY, choice.x - choice.fromX) * 180 / Math.PI}deg)` }}>
              <path className="live-push-shaft" d="M5 16h19"/><path className="live-push-head" d="m17 9 7 7-7 7"/>
            </svg>
          </button>)}
          {decision && <PitchDecisionOverlay key={decision.key} decision={decision} disabled={decisionDisabled}
            viewport={viewport} scene={scene} x={(OFFSET + diceX * CELL) * scale} y={(OFFSET + diceY * CELL) * scale}
            onAction={onDecisionAction}/>}
          {!decision && diceMoment && <div className="live-dice-overlay" role="status" aria-label={`${diceMoment.label}: ${diceMoment.faces.join(', ')}`}
            style={{ left: (OFFSET + diceX * CELL) * scale, top: (OFFSET + diceY * CELL) * scale }}>
            <strong>{diceMoment.label}</strong><div>{diceMoment.faces.map((face, index) => <DiceFace key={index} face={face} selected={diceMoment.selected === index}/>)}</div>
          </div>}
          {backgroundFailed && <span className="live-pitch-error">Pitch image unavailable; plain field shown.</span>}
        </div>
      </div>
    </div>
  </section>;
}
