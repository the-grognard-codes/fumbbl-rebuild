import { useEffect, useRef, useState } from 'react';
import type { SetupAction, SetupPlayer, SetupState } from './setup-protocol.ts';
import type { RoutePoint, RoutePreview } from './route-protocol.ts';
import type { DiceMoment } from './dice-presentation.ts';
import { DiceFace } from './DiceFace.tsx';
import { canPlaceReserve } from './setup-protocol.ts';
import type { PushChoice } from './push-choice.ts';
import './live-pitch.css';

const WIDTH = 960;
const HEIGHT = 564;
const CELL = 36;
const OFFSET = 12;
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

function PlayerMarker({ player, scale, active, selected, target, onSelect, onFocus, onBlur, readOnly, canDrag, onStartDrag, onEndDrag }: {
  player: SetupPlayer; scale: number; active: boolean; selected: boolean; target: boolean; onSelect: () => void; onFocus: (anchor: DOMRect) => void; onBlur: () => void; readOnly: boolean;
  canDrag: boolean; onStartDrag?: (id: string) => void; onEndDrag?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const sprite = spriteUrl(player);
  const prone = player.state.toLowerCase().includes('prone');
  const stunned = player.state.toLowerCase().includes('stunned');
  return <button type="button" className={`live-marker ${player.role}${active ? ' active' : ''}${selected ? ' selected' : ''}${target ? ' target' : ''}${prone ? ' prone' : ''}${stunned ? ' stunned' : ''}`}
    aria-label={`${player.role} ${player.name}, number ${player.slot}, ${player.state}, square ${player.x}, ${player.y}`}
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
  draggableIds, draggingPlayerId = '', onStartDrag, onEndDrag, onDropPlayer, pushChoices = [], onPushChoice, readOnly = false, playback = false }: {
  view: SetupState; selectedId: string; actions: SetupAction[]; pinnedAction?: SetupAction;
  routePreview?: RoutePreview | null; waypoints?: RoutePoint[]; diceMoment?: DiceMoment | null;
  onSelectPlayer: (id: string) => void; onFocusPlayer?: (id: string, anchor: DOMRect) => void; onBlurPlayer?: () => void; onSquare: (x: number, y: number) => void;
  draggableIds?: Set<string>; draggingPlayerId?: string; onStartDrag?: (id: string) => void; onEndDrag?: () => void;
  onDropPlayer?: (id: string, x: number, y: number) => void; readOnly?: boolean; playback?: boolean;
  pushChoices?: PushChoice[]; onPushChoice?: (actionId: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [size, setSize] = useState({ width: WIDTH, height: HEIGHT });
  const [zoom, setZoom] = useState(1);
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
    else if (action.target && 'x' in action.target) targetSquares.set(`${action.target.x},${action.target.y}`, action.target);
  }
  const activePlayer = view.players.find(player => player.id === view.activePlayerId);
  const diceSubject = view.players.find(player => player.id === diceMoment?.subjectId) ?? activePlayer;
  const diceX = diceSubject?.x !== null && diceSubject?.x !== undefined && diceSubject.x < 13 ? 16 : 3;
  const diceY = diceSubject?.y !== null && diceSubject?.y !== undefined && diceSubject.y < 8 ? 10 : 2;
  const target = pinnedAction?.target;
  const placementSquares = draggingPlayerId && (view.phase === 'SETUP' || view.turnMode === 'SOLID_DEFENCE')
    ? Array.from({ length: 15 * 26 }, (_, index) => ({ x: index % 26, y: Math.floor(index / 26) }))
      .filter(square => canPlaceReserve({ ...view, phase: 'SETUP' }, draggingPlayerId, square.x, square.y)) : [];
  const pinnedTarget = target && ('playerId' in target
    ? view.players.find(player => player.id === target.playerId) : target);
  const point = (clientX: number, clientY: number) => {
    const rect = scene.current!.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) * WIDTH / rect.width - OFFSET) / CELL);
    const y = Math.floor(((clientY - rect.top) * HEIGHT / rect.height - OFFSET) / CELL);
    return x >= 0 && x < 26 && y >= 0 && y < 15 ? { x, y } : null;
  };
  return <section className="live-pitch" aria-label={playback ? 'Live match pitch' : readOnly ? 'Read-only replay pitch' : 'Live match pitch'}>
    <div className="live-pitch-toolbar"><strong>Authoritative pitch</strong><span>{Math.round(CELL * scale)} px / square</span>
      <div><button type="button" aria-pressed={zoom === 1} onClick={() => setZoom(1)}>Fit</button>
        <button type="button" aria-pressed={zoom === 1.5} onClick={() => setZoom(1.5)}>1.5×</button>
        <button type="button" aria-pressed={zoom === 2} onClick={() => setZoom(2)}>2×</button></div>
    </div>
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
            {backgroundFailed ? <><rect width={WIDTH} height={HEIGHT} fill="#263422"/><rect x={OFFSET} y={OFFSET} width="936" height="540" fill="#56632b"/></> :
              <image href={pitchUrl} width={WIDTH} height={HEIGHT} onError={() => setBackgroundFailed(true)}/>}
            {[...targetSquares.values()].map(square => <rect key={`${square.x},${square.y}`} className="live-target-square"
              x={OFFSET + square.x * CELL + 2} y={OFFSET + square.y * CELL + 2} width={CELL - 4} height={CELL - 4}/>)}
            {placementSquares.map(square => <rect key={`place-${square.x}-${square.y}`} className="live-placement-square"
              x={OFFSET + square.x * CELL + 3} y={OFFSET + square.y * CELL + 3} width={CELL - 6} height={CELL - 6}/>)}
            {routePreview?.steps.map((step, index) => <rect key={`route-${index}`} className={`live-route-square${step.dodge && step.rush ? ' both' : step.dodge ? ' dodge' : step.rush ? ' rush' : ' clear'}${step.reactions.length ? ' reaction' : ''}`}
              x={OFFSET + step.x * CELL + 2} y={OFFSET + step.y * CELL + 2} width={CELL - 4} height={CELL - 4}/>)}
            {routePreview && <polyline className="live-route-line" points={[routePreview.from, ...routePreview.steps].map(square => `${OFFSET + square.x * CELL + CELL / 2},${OFFSET + square.y * CELL + CELL / 2}`).join(' ')}/>}
            {waypoints.map((square, index) => <g key={`waypoint-${index}`} className="live-route-waypoint">
              <circle cx={OFFSET + square.x * CELL + CELL / 2} cy={OFFSET + square.y * CELL + CELL / 2} r="8"/>
              <text x={OFFSET + square.x * CELL + CELL / 2} y={OFFSET + square.y * CELL + CELL / 2 + 3} textAnchor="middle">{index + 1}</text>
            </g>)}
            {activePlayer?.x != null && activePlayer.y != null && pinnedTarget?.x != null && pinnedTarget.y != null &&
              <path className="live-target-line" d={`M ${OFFSET + activePlayer.x * CELL + CELL / 2} ${OFFSET + activePlayer.y * CELL + CELL / 2} L ${OFFSET + pinnedTarget.x * CELL + CELL / 2} ${OFFSET + pinnedTarget.y * CELL + CELL / 2}`}/>}
            {view.ball && <circle className="live-ball" cx={OFFSET + view.ball.x * CELL + CELL / 2} cy={OFFSET + view.ball.y * CELL + CELL / 2} r="6"/>}
          </svg>
          {view.players.filter(player => player.x !== null && player.y !== null).map(player =>
            <PlayerMarker key={player.id} player={player} scale={scale} active={player.id === view.activePlayerId}
              selected={player.id === selectedId} target={targetPlayers.has(player.id)} readOnly={readOnly}
              canDrag={draggableIds?.has(player.id) ?? false} onStartDrag={onStartDrag} onEndDrag={onEndDrag}
              onSelect={() => onSelectPlayer(player.id)} onFocus={anchor => onFocusPlayer?.(player.id, anchor)} onBlur={() => onBlurPlayer?.()}/>)}
          {pushChoices.map(choice => <button key={choice.action.id} type="button" className="live-push-choice"
            aria-label={choice.action.label} title={choice.action.label}
            style={{ left: (OFFSET + choice.x * CELL) * scale, top: (OFFSET + choice.y * CELL) * scale,
              width: CELL * scale, height: CELL * scale }}
            onClick={event => { event.stopPropagation(); onPushChoice?.(choice.action.id); }}>
            <svg viewBox="0 0 32 32" aria-hidden="true" style={{ transform: `rotate(${Math.atan2(choice.y - choice.fromY, choice.x - choice.fromX) * 180 / Math.PI}deg)` }}>
              <path d="M4 16h20m-8-8 8 8-8 8"/>
            </svg>
          </button>)}
          {diceMoment && <div className="live-dice-overlay" role="status" aria-label={`${diceMoment.label}: ${diceMoment.faces.join(', ')}`}
            style={{ left: (OFFSET + diceX * CELL) * scale, top: (OFFSET + diceY * CELL) * scale }}>
            <strong>{diceMoment.label}</strong><div>{diceMoment.faces.map((face, index) => <DiceFace key={index} face={face} selected={diceMoment.selected === index}/>)}</div>
          </div>}
          {backgroundFailed && <span className="live-pitch-error">Pitch image unavailable; plain field shown.</span>}
        </div>
      </div>
    </div>
  </section>;
}
