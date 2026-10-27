import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SetupAction, SetupPlayer, SetupState } from './setup-protocol.ts';
import type { RoutePoint, RoutePreview, RouteStep } from './route-protocol.ts';
import { isJumpStep } from './route-protocol.ts';
import { movementRoutePath, projectJumpLanding } from './jump-presentation.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { MatchDecision } from './match-decision.ts';
import type { PotentialBlockDice } from './block-dice-presentation.ts';
import { currentBlockContext } from './block-context.ts';
import type { BlockContext } from './block-context.ts';
import { BlockVisibility } from './BlockVisibility.tsx';
import { BallMarker } from './BallMarker.tsx';
import { kickoffMarkerPosition } from './kickoff-ball-presentation.ts';
import { PitchDecisionOverlay } from './PitchDecisionOverlay.tsx';
import { CircularSkillPrompt } from './CircularSkillPrompt.tsx';
import './ui-round-four.css';
import { PitchScenery } from './PitchScenery.tsx';
import { PitchProjection, type Point, type PitchDirection, type PitchProjectionMode, type PerspectiveElevation } from './pitch-projection.ts';
import { resolvePlayerArt, resolvePlayerPortrait, playerArtPlacement, type PlayerFacing } from './player-art.ts';
import { updatePlayerFacings } from './player-facing.ts';
import { canPlaceReserve } from './setup-protocol.ts';
import { matchTeamName } from './match-team-name.ts';
import type { PushChoice } from './push-choice.ts';
import { passingLegend, passingSquare } from './passing-presentation.ts';
import type { MovementRange } from './movement-protocol.ts';
import { movementRangePresentation } from './movement-range-presentation.ts';
import { defaultThreatPreferences, type ThreatPreferences } from './threat-preferences.ts';
import { projectThreatSquare, threatOpacity, threatSquares } from './threat-presentation.ts';
import './live-pitch.css';
import { useSkillMarkerPreferences } from './use-skill-marker-preferences.ts';
import { markerStripLayout, playerSkillMarkers, skillMarkerUrl } from './skill-marker-presentation.ts';
import type { SkillMarkerPreferences } from './skill-marker-preferences.ts';
import './skill-markers.css';
import { ActionGlyph } from './ActionGlyph.tsx';
import { limitedActionLabels } from './limited-action-presentation.ts';
import { useLimitedActionTags } from './use-limited-action-tags.ts';
import { ConditionGlyph } from './ConditionGlyph.tsx';
import { negativeConditionLabels, playerNegativeConditions, playerTagPlacements } from './negative-condition-presentation.ts';
import { useNegativeConditionMarkers } from './use-negative-condition-markers.ts';
import './limited-action-tags.css';
import { CameraButtons } from './CameraButtons.tsx';
import { effectiveCameraEnd } from './camera-preferences.ts';
import { useCameraPreferences } from './use-camera-preferences.ts';
import { usePitchHover } from './use-pitch-hover.ts';

const points = (polygon: Point[]) => polygon.map(p => `${p.x},${p.y}`).join(' ');
const centerOf = (point: Point) => ({ x: point.x + .5, y: point.y + .5 });
/** Off-pitch consumers share the portrait catalog. */
export const spriteUrl = resolvePlayerPortrait;

function routePath(route: RoutePoint[], camera: PitchProjection): string {
  return movementRoutePath(route,camera);
}

function PlayerMarker({ player, teamName, camera, facing, setupPerspective, order, active, selected, target, onSelect, onGround,
  onFocus, onBlur, readOnly, canDrag, onStartDrag, onEndDrag, failedArt, onArtError, markers, markerPreferences, showLimitedActions, showConditions }: {
  player: SetupPlayer; teamName: string; camera: PitchProjection; facing?: PlayerFacing; setupPerspective: boolean; order: number;
  active: boolean; selected: boolean; target: boolean; onSelect: () => void; onGround: (x: number, y: number) => void;
  onFocus: (anchor: DOMRect) => void; onBlur: () => void; readOnly: boolean;
  failedArt: Set<string>; onArtError: (url: string) => void;
  canDrag: boolean; onStartDrag?: (id: string) => void; onEndDrag?: () => void;
  markers: ReturnType<typeof playerSkillMarkers>; markerPreferences: SkillMarkerPreferences; showLimitedActions: boolean; showConditions: boolean;
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
  const metrics = markerStripLayout(markers.map(marker => marker.label), markerPreferences.size, width, markerPreferences.style);
  const displayed = markers.slice(0, metrics.count);
  const stripTop = body && !failedArt.has(body.url) ? height / 2 + (body.bounds.y - anchor.y) * scale : 0;
  const conditions = showConditions ? playerNegativeConditions(player) : [];
  const limitedAction = showLimitedActions ? player.limitedAction : undefined;
  const placements = playerTagPlacements(conditions.length + (limitedAction ? 1 : 0), width, stripTop,
    body && !failedArt.has(body.url) ? width / 2 + (body.bounds.x + body.bounds.width / 2 - anchor.x) * scale : width / 2,
    displayed.length ? metrics.height : 0);
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
    onPointerEnter={event => { if (event.pointerType !== 'touch') onFocus(event.currentTarget.getBoundingClientRect()); }}
    onPointerLeave={event => { if (event.pointerType !== 'touch') onBlur(); }}
    onFocus={event => onFocus(event.currentTarget.getBoundingClientRect())} onBlur={onBlur}
    onClick={event => {
      event.stopPropagation();
      if (readOnly) { onFocus(event.currentTarget.getBoundingClientRect()); return; }
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
      // Selection clears stale inspection as part of cancelling the previous
      // proposal. Schedule this player's card afterwards, including touch taps.
      onFocus(event.currentTarget.getBoundingClientRect());
    }}>
    {body && !failedArt.has(body.url) ? <img src={body.url} alt="" draggable={false} onError={() => onArtError(body.url)}
      style={{ width: body.width * scale, height: body.height * scale, left: width / 2 - anchor.x * scale,
        top: height / 2 - anchor.y * scale, transform: body.mirror ? 'scaleX(-1)' : 'none' }}/>
      : <span className="live-token">{player.role === 'home' ? 'H' : 'A'}{number}</span>}
    <span className="live-number">{number}</span>
    {conditions.map((kind, index) => <span key={kind} className="live-condition-marker" role="img"
      aria-label={negativeConditionLabels[kind]} data-condition={kind}
      style={{ left: placements[index].left, top: placements[index].top, width: placements[index].size, height: placements[index].size }}>
      <ConditionGlyph kind={kind}/>
    </span>)}
    {limitedAction && <span className="live-limited-action" role="img"
      aria-label={`${limitedActionLabels[limitedAction]} consumed this turn`} data-limited-action={limitedAction}
      style={{ left: placements[conditions.length].left, top: placements[conditions.length].top,
        width: placements[conditions.length].size, height: placements[conditions.length].size }}>
      <ActionGlyph kind={limitedAction}/>
    </span>}
    {displayed.length > 0 && <span className="live-skill-markers" aria-label={`Skills: ${markers.map(marker => marker.name).join(', ')}`}
      style={{ top: stripTop - metrics.height - 3, height: metrics.height, gap: metrics.gap }}>
      {displayed.map((marker, index) => <img key={marker.id} data-skill-id={marker.id} className="live-skill-icon" alt={marker.name}
        src={skillMarkerUrl(marker.id, markerPreferences.style)} draggable={false}
        style={{ width: metrics.widths[index], height: metrics.height }}/>) }
      {metrics.remaining > 0 && <span className="live-skill-overflow" style={{ width: metrics.overflowWidth, fontSize: Math.max(10, metrics.height * .55) }}>+{metrics.remaining}</span>}
    </span>}
  </button>;
}

/** Presentation only: positions, state, ball and identity come from the server. */
export function LivePitch({ view, selectedId, actions, pinnedAction, routePreview = null, waypoints = [], movementRange = null, diceMoment = null, potentialDice = null, diceAwaiting = false,
  blockPreview = null, animateBlockMarkers = true, movementDuration = 0,
  jumpOptions = null, plannedTransfer = null,
  threatPreferences = defaultThreatPreferences, allowThreats = true,
  onRightClick,
  onSelectPlayer, onFocusPlayer, onBlurPlayer, onSquare, draggableIds, draggingPlayerId = '', onStartDrag, onEndDrag,
  onDropPlayer, pushChoices = [], onPushChoice, readOnly = false, playback = false, allowEndChoice = false, interactionBlocked = false,
  zoom: controlledZoom, onZoomChange, showToolbar = true, debugOpen = true, cameraControlsHost, cameraButtonsHost, decision = null, decisionDisabled = false, onDecisionAction, onSelectionPosition }: {
  view: SetupState; selectedId: string; actions: SetupAction[]; pinnedAction?: SetupAction;
  routePreview?: RoutePreview | null; waypoints?: RoutePoint[]; movementRange?: MovementRange | null; diceMoment?: DiceMoment | null;
  jumpOptions?: RouteStep[] | null;
  plannedTransfer?: { targetPlayerId: string; from: RoutePoint } | null;
  potentialDice?: PotentialBlockDice | null; diceAwaiting?: boolean;
  blockPreview?: BlockContext | null; animateBlockMarkers?: boolean; movementDuration?: number;
  threatPreferences?: ThreatPreferences; allowThreats?: boolean;
  onRightClick?: () => void;
  decision?: MatchDecision | null; decisionDisabled?: boolean; onDecisionAction?: (actionId: string) => void;
  onSelectPlayer: (id: string) => void; onFocusPlayer?: (id: string, anchor: DOMRect) => void; onBlurPlayer?: () => void; onSquare: (x: number, y: number) => void;
  draggableIds?: Set<string>; draggingPlayerId?: string; onStartDrag?: (id: string) => void; onEndDrag?: () => void;
  onDropPlayer?: (id: string, x: number, y: number) => void; readOnly?: boolean; playback?: boolean; allowEndChoice?: boolean; interactionBlocked?: boolean;
  pushChoices?: PushChoice[]; onPushChoice?: (actionId: string) => void;
  zoom?: number; onZoomChange?: (zoom: number) => void; showToolbar?: boolean; debugOpen?: boolean; cameraControlsHost?: HTMLElement | null;
  cameraButtonsHost?: HTMLElement | null;
  onSelectionPosition?: (position: { x: number; width: number } | null) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null), scene = useRef<HTMLDivElement>(null);
  const [destinationStage, setDestinationStage] = useState<string | null>(null);
  const selection = decision?.pitchSelection;
  const selectingDestination = !!selection && (selection.committed || destinationStage === decision?.key);
  const shownPushChoices = selection ? selectingDestination && !readOnly && !playback ? selection.choices : [] : pushChoices;
  const chooseSquare = (x: number, y: number) => {
    if (!selection) { onSquare(x, y); return; }
    const choice = selectingDestination && selection.choices.find(choice => choice.x === x && choice.y === y);
    if (choice && !decisionDisabled && !readOnly && !playback) onDecisionAction?.(choice.action.id);
  };
  useEffect(() => { setDestinationStage(null); }, [decision?.key]);
  const markerId = useId().replace(/:/g, '');
  const { preferences: markerPreferences } = useSkillMarkerPreferences();
  const { visible: showLimitedActions } = useLimitedActionTags();
  const { visible: showConditions } = useNegativeConditionMarkers();
  const [size, setSize] = useState({ width: 1280, height: 720 });
  const [internalZoom, setInternalZoom] = useState(1);
  const zoom = controlledZoom ?? internalZoom, setZoom = onZoomChange ?? setInternalZoom;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const { preferences: cameraPreferences, update: updateCameraPreferences } = useCameraPreferences(view.matchId, view.callerRole);
  const mode: PitchProjectionMode = cameraPreferences.angle === 90 ? 'top-down' : 'perspective';
  const perspectiveElevation: PerspectiveElevation = cameraPreferences.angle === 90 ? 50 : cameraPreferences.angle;
  const [travel, setTravel] = useState({ focus: 13, transverseFocus: 7.5 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const onBackgroundError = useCallback(() => setBackgroundFailed(true), []);
  const [failedArt, setFailedArt] = useState<Set<string>>(() => new Set());
  const onArtError = (url: string) => setFailedArt(current => current.has(url) ? current : new Set([...current, url]));
  const [facings, setFacings] = useState<Record<string, PlayerFacing>>({});
  const prior = useRef<SetupState | null>(null);
  const end = effectiveCameraEnd(cameraPreferences);
  const camera = useMemo(() => new PitchProjection({ ...size, ...travel, end, mode, zoom, perspectiveElevation }),
    [size, travel, end, mode, zoom, perspectiveElevation]);
  const cameraRef = useRef(camera); cameraRef.current = camera;
  const specialTargeting = !!decision || !!view.prompt || !!view.reaction || !!view.kickPreview
    || view.phase === 'PRE_MATCH' || view.phase === 'READY_FOR_KICKOFF' || !!pushChoices.length || jumpOptions !== null
    || actions.some(action => ['followUp', 'push', 'hitAndRun', 'kickoffMove', 'reactiveSquare'].includes(action.kind));
  const { square: hoverSquare, clear: clearHoverSquare } = usePitchHover(scene, camera,
    !interactionBlocked && !specialTargeting && !draggingPlayerId);
  const [inspectedBlock, setInspectedBlock] = useState<{ revision: number; target: string } | null>(null);
  const committedBlocks = currentBlockContext(view);
  const inspectedBlocks = committedBlocks && inspectedBlock?.revision === view.revision
    && committedBlocks.blocks.some(block => block.targetPlayerId === inspectedBlock.target)
    ? { ...committedBlocks, activeTargetPlayerId: inspectedBlock.target } : committedBlocks;
  const blocks = inspectedBlocks ?? currentBlockContext(view, !readOnly && !playback ? blockPreview : null);
  const activeBlock = blocks?.blocks.find(block => block.targetPlayerId === blocks.activeTargetPlayerId);
  const blockPlayerName = (id: string) => {
    const player = view.players.find(player => player.id === id);
    return player ? `${player.name} #${player.number ?? player.slot}` : id;
  };
  const changeCamera = (next: PitchProjection) => { setTravel({ focus: next.focus, transverseFocus: next.transverseFocus }); onBlurPlayer?.(); };
  const drag = useRef<{ x: number; y: number; pointerId: number; camera: PitchProjection; moved: boolean } | null>(null);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width), height = Math.max(1, entry.contentRect.height);
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault(); onBlurPlayer?.();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? cameraRef.current.height : 1);
      setZoom(Math.max(.75, Math.min(3, zoomRef.current * Math.exp(-delta * .0015))));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [onBlurPlayer, setZoom]);
  useEffect(() => {
    const previous = prior.current;
    setFacings(current => updatePlayerFacings(current, previous, view));
    prior.current = view;
  }, [view]);
  const activePlayer = view.players.find(player => player.id === view.activePlayerId), selected = view.players.find(player => player.id === selectedId);
  const followUpAction = !readOnly && !playback ? actions.find(action => action.kind === 'followUp'
    && action.actor === view.callerRole && action.target && 'x' in action.target) : undefined;
  const followUpTarget = followUpAction?.target && 'x' in followUpAction.target ? followUpAction.target : null;
  const followUpPlayer = view.players.find(player => player.id === (followUpAction?.sourcePlayerId ?? view.activePlayerId));
  const followUpTo = followUpTarget && camera.project(centerOf(followUpTarget));
  const followUpFrom = followUpPlayer?.x != null && followUpPlayer.y != null
    ? camera.project(centerOf({ x: followUpPlayer.x, y: followUpPlayer.y })) : null;
  const rangeMarkings = jumpOptions === null && movementRange && movementRange.full.length > 0 && movementRange.playerId === selectedId
    ? movementRangePresentation(movementRange.normal, movementRange.full, movementRange.from, camera,
      view.players.filter(player => player.x != null && player.y != null).map(player => ({ x: player.x!, y: player.y! }))) : null;
  const threatMarkings = (jumpOptions === null && allowThreats && !readOnly && !playback ? threatSquares(view, selectedId, threatPreferences) : []).map(square => {
    const sharesRush = !!rangeMarkings?.warnings.some(warning => warning.square.x === square.x && warning.square.y === square.y);
    return { square, projected: projectThreatSquare(square, camera, threatPreferences.zoneColors, sharesRush) };
  });
  const passing = view.passing;
  useEffect(() => {
    const p = selected?.x != null && selected.y != null ? camera.project(centerOf({ x: selected.x, y: selected.y })) : null;
    onSelectionPosition?.(p ? { x: p.x, width: camera.width } : null);
  }, [selected?.x, selected?.y, end, mode, perspectiveElevation, travel.focus, travel.transverseFocus, size.width, size.height, zoom, onSelectionPosition]);
  const reveal = (point: Point | null | undefined) => { if (point) changeCamera(cameraRef.current.reveal(point, 50)); };
  useEffect(() => {
    if (!decision || decision.pitchSelection) return;
    const subject = view.players.find(player => player.id === view.activePlayerId);
    if (subject?.x != null && subject.y != null) {
      const next = cameraRef.current.reveal(centerOf({ x: subject.x, y: subject.y }), 50);
      setTravel({ focus: next.focus, transverseFocus: next.transverseFocus }); onBlurPlayer?.();
    }
  }, [decision?.key]);
  const kickPreview = view.kickPreview && { deviation: kickoffMarkerPosition(view.kickPreview.deviation),
    withKick: kickoffMarkerPosition(view.kickPreview.withKick) };
  const beforeKickPreview = useRef<{ matchId: string; transverseFocus: number } | null>(null);
  useEffect(() => {
    const preview = kickPreview;
    if (!preview) {
      const previous = beforeKickPreview.current;
      beforeKickPreview.current = null;
      // Off-pitch landing markers temporarily need sideways travel. Restore
      // the prior framing afterwards, retaining any lengthwise camera travel.
      if (previous?.matchId === view.matchId)
        setTravel(current => ({ ...current, transverseFocus: previous.transverseFocus }));
      return;
    }
    const positions = [centerOf(preview.deviation), centerOf(preview.withKick)];
    const current = cameraRef.current;
    if (positions.every(position => current.isVisible(position, 48))) return;
    if (beforeKickPreview.current?.matchId !== view.matchId)
      beforeKickPreview.current = { matchId: view.matchId, transverseFocus: current.transverseFocus };
    // Deviation may move past the visible turf or off the pitch. Keep both
    // authoritative alternatives visible instead of silently clipping markers.
    const next = current.with({ focus: (positions[0].x + positions[1].x) / 2,
      transverseFocus: (positions[0].y + positions[1].y) / 2 });
    setTravel({ focus: next.focus, transverseFocus: next.transverseFocus });
  }, [view.matchId, view.revision, view.kickPreview?.deviation.x, view.kickPreview?.deviation.y,
    view.kickPreview?.withKick.x, view.kickPreview?.withKick.y, size.width, size.height, end, mode, perspectiveElevation, zoom]);
  const targetSquares = new Map<string, Point>(), targetPlayers = new Set<string>();
  for (const action of actions) {
    if (selection?.choices.some(choice => choice.action.id === action.id)) continue;
    if (action.kind === 'reactionMove' && action.sourcePlayerId) {
      targetPlayers.add(action.sourcePlayerId);
      if (action.sourcePlayerId !== selectedId) continue;
    }
    if (action.target && 'playerId' in action.target) targetPlayers.add(action.target.playerId);
    else if (action.target && 'x' in action.target && !['push', 'followUp', 'hitAndRun', 'move', 'jump', 'kickoff'].includes(action.kind)
      && !(passing && action.kind === (passing.version === 1 ? 'pass' : passing.action))) {
      const key = `${action.target.x},${action.target.y}`;
      targetSquares.set(key, action.target);
      if (action.kind === 'reactiveSquare') {
        const square = action.target;
        const recipient = view.players.find(player => player.x === square.x && player.y === square.y);
        if (recipient) targetPlayers.add(recipient.id);
      }
    }
  }
  const placementSquares = draggingPlayerId && (view.phase === 'SETUP' || view.turnMode === 'SOLID_DEFENCE')
    ? Array.from({ length: 390 }, (_, index) => ({ x: index % 26, y: Math.floor(index / 26) })).filter(square => canPlaceReserve({ ...view, phase: 'SETUP' }, draggingPlayerId, square.x, square.y)) : [];
  const target = pinnedAction?.target, pinnedTarget = plannedTransfer
    ? view.players.find(player => player.id === plannedTransfer.targetPlayerId)
    : target && ('playerId' in target ? view.players.find(player => player.id === target.playerId) : target);
  const targetSource = plannedTransfer?.from ?? view.players.find(player => player.id === pinnedAction?.sourcePlayerId);
  const showTargetLine = !!plannedTransfer || !!pinnedAction && ['block', 'blitzTarget', 'foul', 'pass', 'handOff', 'liftTeamMate',
    'throwTeamMate', 'kickMate', 'kickMateTo', 'gaze', 'bomb', 'punt'].includes(pinnedAction.kind);
  if (plannedTransfer) targetPlayers.add(plannedTransfer.targetPlayerId);
  const kickTarget = pinnedAction?.kind === 'kickoff' && pinnedTarget?.x != null && pinnedTarget.y != null
    ? { x: pinnedTarget.x, y: pinnedTarget.y }
    : view.phase === 'READY_FOR_KICKOFF' && (hover ?? cursor) && actions.some(action => action.kind === 'kickoff'
      && action.target && 'x' in action.target && action.target.x === (hover ?? cursor)!.x && action.target.y === (hover ?? cursor)!.y) ? (hover ?? cursor) : null;
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
  const chalk = (from: Point, to: Point) => routePath([{ x: from.x - .5, y: from.y - .5 }, { x: to.x - .5, y: to.y - .5 }], camera);
  const cameraButtons = <CameraButtons key={`${view.matchId}.${view.callerRole}`} preferences={cameraPreferences}
    onChange={next => { updateCameraPreferences(next); onBlurPlayer?.(); setHover(null); }}/>;
  const cameraControls = <div className={`live-camera-controls${showToolbar ? '' : ' compact'}`} aria-label="Pitch camera controls">
      <button type="button" onClick={() => changeCamera(camera.with({ focus: 13, transverseFocus: 7.5 }))}>Midfield</button>
      <button type="button" disabled={selected?.x == null} onClick={() => selected?.x != null && selected.y != null && reveal(centerOf({ x: selected.x, y: selected.y }))}>Reveal selected</button>
      <button type="button" disabled={!view.ball && activePlayer?.x == null} onClick={() => reveal(view.ball ? centerOf(view.ball) : activePlayer?.x != null && activePlayer.y != null ? centerOf({ x: activePlayer.x, y: activePlayer.y }) : null)}>Reveal ball / active</button>
      {showToolbar && <>{[1, 1.5, 2].map(value => <button key={value} type="button" aria-pressed={zoom === value} onClick={() => { setZoom(value); onBlurPlayer?.(); }}>{value === 1 ? 'Fit' : `${value}×`}</button>)}</>}
    </div>;
  return <section className="live-pitch projected-pitch"
    style={{ ['--pitch-move-duration' as string]: `${movementDuration}ms` }}
    aria-label={playback ? 'Live match pitch' : readOnly ? 'Read-only replay pitch' : 'Live match pitch'}>
    {cameraButtonsHost === undefined ? <div className="live-camera-buttons">{cameraButtons}</div> : cameraButtonsHost && createPortal(cameraButtons, cameraButtonsHost)}
    {debugOpen && (cameraControlsHost === undefined ? cameraControls : cameraControlsHost && createPortal(cameraControls, cameraControlsHost))}
    {passing && <div className="live-pass-legend" role="note" aria-label={passing.version === 2 ? passing.action === 'throwTeamMate' ? 'Throw Team Mate distances' : 'Kick Team Mate distances' : 'Passing distances'}>
      {passingLegend(passing).map(item => <span key={item.name}><i style={{ backgroundColor: item.color }}/>{item.text}</span>)}
      <span>Shaded: unavailable{passing.version === 2 ? '; teammate flights are limited to Quick or Short' : passing.rangeLimited ? '; weather limits passes to Quick or Short' : ''}</span>
      {passing.weatherPenalty > 0 && <span>weather +{passing.weatherPenalty} passing penalty; range names stay the same</span>}
      {(pinnedTarget?.x != null && pinnedTarget.y != null || cursor) && <output className="live-pass-target-detail" aria-live="polite">
        {passingSquare(passing, pinnedTarget?.x ?? cursor!.x, pinnedTarget?.y ?? cursor!.y).description}
      </output>}
    </div>}
    <div ref={viewport} className="live-pitch-viewport" tabIndex={0} aria-label={playback ? 'Pitch playback' : readOnly ? 'Replay pitch' : 'Pitch action preview'}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key] as PitchDirection | undefined;
        if (direction) { event.preventDefault(); setHover(null); clearHoverSquare();
          const origin = cursor ?? (selected?.x != null && selected.y != null ? { x: selected.x, y: selected.y } : { x: Math.min(25, Math.floor(camera.focus)), y: 7 });
          const next = camera.neighbor(origin, direction); setCursor(next); reveal(centerOf(next));
        } else if (event.key === 'Enter' && cursor && !readOnly && !event.repeat) { event.preventDefault(); chooseSquare(cursor.x, cursor.y); }
      }}
      onContextMenu={event => event.preventDefault()}
      onAuxClickCapture={event => { if (event.button === 2) { event.preventDefault(); event.stopPropagation(); } }}
      onPointerDown={event => { if (event.button !== 2 || draggingPlayerId) return; event.preventDefault();
        drag.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, camera, moved: false }; }}
      onPointerMove={event => { const start = drag.current; if (start && start.pointerId !== event.pointerId) return;
        if (!start) {
          if (view.phase === 'READY_FOR_KICKOFF') { const square = point(event.clientX, event.clientY);
            setHover(previous => previous?.x === square?.x && previous?.y === square?.y ? previous : square); }
          return;
        } const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) { start.moved = true; viewport.current!.setPointerCapture(event.pointerId); }
        if (start.moved) changeCamera(start.camera.panPixels({ x: dx, y: dy })); }}
      onPointerUp={event => { const start = drag.current;
        if (start?.pointerId !== event.pointerId) return;
        drag.current = null;
        if (!readOnly && event.button === 2 && !start.moved) onRightClick?.();
        if (viewport.current?.hasPointerCapture(event.pointerId)) viewport.current.releasePointerCapture(event.pointerId); }}
      onPointerLeave={() => setHover(null)}
      onLostPointerCapture={event => { if (drag.current?.pointerId === event.pointerId) drag.current = null; }}
      onPointerCancel={event => { if (drag.current?.pointerId === event.pointerId) drag.current = null; }}>
      <div ref={scene} className="live-pitch-scene" data-projection={mode} data-elevation={camera.elevation} data-end={end} data-focus={camera.focus}
        data-transverse-focus={camera.transverseFocus} data-zoom={zoom} style={{ width: size.width, height: size.height }}
        onDragOver={event => { if (onDropPlayer) event.preventDefault(); }}
        onDrop={event => { if (!onDropPlayer) return; event.preventDefault(); const id = event.dataTransfer.getData('application/x-fumbbl-setup-player'), square = point(event.clientX, event.clientY);
          if (id && square) onDropPlayer(id, square.x, square.y); onEndDrag?.(); }}
        onClick={event => { if (!readOnly) { const square = point(event.clientX, event.clientY); if (square) chooseSquare(square.x, square.y); } }}>
        {!backgroundFailed && <PitchScenery camera={camera} onError={onBackgroundError}/>}
        <svg data-pitch-ground="true" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          <defs><marker id={`${markerId}-route-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 9 5 1 9Z" className="live-route-arrowhead"/></marker></defs>
          {Array.from({ length: 390 }, (_, index) => ({ x: Math.floor(index / 15), y: index % 15 })).map(square => {
            const guidance = passing && passingSquare(passing, square.x, square.y);
            return <polygon key={`${square.x},${square.y}`}
            data-cell-x={square.x} data-cell-y={square.y} points={points(camera.square(square, 0, true))}
            data-pass-range={guidance?.code} fill={guidance?.color ?? (square.x === 0 ? '#37669166' : square.x === 25 ? '#874a2d66' : (square.x + square.y) % 2 ? '#18392222' : '#b1c46a0b')}
            stroke="#21371e" strokeOpacity=".5">{guidance && <title>{guidance.description}</title>}</polygon>;
          }) }
          {allowThreats && !readOnly && !playback && <g className="live-threats" data-threat-player={selectedId}>
            {threatMarkings.map(({ square, projected }) => {
              return <g key={`${square.x},${square.y}`} data-threat-square={`${square.x},${square.y}`} data-threat-count={square.count}
                data-threat-striped={square.striped}>
                {projected.fills.map((polygon, index) => <polygon key={index} className="live-threat-fill" points={points(polygon)}
                  fill={projected.color} fillOpacity={threatOpacity}/>)}
                {projected.hatches.map(edge => <path key={edge.key} className="live-threat-hatch"
                  d={`M${edge.screenFrom.x},${edge.screenFrom.y} L${edge.screenTo.x},${edge.screenTo.y}`}/>)}
                {projected.warning && <g data-tackle-warning={`${square.x},${square.y}`}>
                  <path className="live-range-warning-triangle live-threat-tackle-triangle" d={projected.warning.path}/>
                  <text className="live-range-warning-mark live-threat-tackle-mark" x={projected.warning.center.x} y={projected.warning.center.y}
                    fontSize={projected.warning.size}>T</text>
                </g>}
                {projected.separator && <text className="live-range-warning-mark live-threat-warning-separator"
                  data-warning-separator={`${square.x},${square.y}`} x={projected.separator.center.x} y={projected.separator.center.y}
                  fontSize={projected.separator.size}>/</text>}
              </g>;
            })}
          </g>}
          <BlockVisibility context={blocks} camera={camera} layer="assists" animated={animateBlockMarkers}/>
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
          {rangeMarkings && <g className="live-movement-range" data-range-player={movementRange!.playerId}
            data-range-from={`${movementRange!.from.x},${movementRange!.from.y}`} data-range-revision={movementRange!.revision} aria-hidden="true">
            {rangeMarkings.full.map(edge => <path key={`full-${edge.key}`} className="live-range-full"
              d={`M${edge.screenFrom.x},${edge.screenFrom.y} L${edge.screenTo.x},${edge.screenTo.y}`}/>)}
            {rangeMarkings.normal.map(edge => <path key={`normal-${edge.key}`} className="live-range-normal"
              d={`M${edge.screenFrom.x},${edge.screenFrom.y} L${edge.screenTo.x},${edge.screenTo.y}`}/>)}
            {rangeMarkings.warnings.map(warning => {
              const paired = threatMarkings.find(({ square, projected }) => projected.separator
                && square.x === warning.square.x && square.y === warning.square.y);
              const rush = paired ? paired.projected.rushWarning : warning;
              return rush && <g key={`${warning.square.x},${warning.square.y}`}
                data-rush-warning={`${warning.square.x},${warning.square.y}`}>
                <path className="live-range-warning-triangle" d={rush.path}/>
                <text className="live-range-warning-mark" x={rush.center.x} y={rush.center.y}
                  fontSize={rush.size}>!</text>
              </g>;
            })}
          </g>}
          {[...targetSquares.values()].map(square => <polygon key={`target-${square.x},${square.y}`}
            className="live-target-square"
            points={points(camera.square(square, .06, true))}/>)}
          {kickPreview && (() => {
            const from = camera.project(centerOf(kickPreview.deviation)), to = camera.project(centerOf(kickPreview.withKick));
            if (!from || !to || from.x === to.x && from.y === to.y) return null;
            const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
            return <g className="live-kick-arrow" data-kick-arrow="true">
              <path className="live-push-shaft" d={`M${from.x} ${from.y} L${to.x} ${to.y}`}/>
              <path className="live-push-head" d="m-7 -7 7 7-7 7" transform={`translate(${to.x} ${to.y}) rotate(${angle})`}/>
            </g>;
          })()}
          {placementSquares.map(square => <polygon key={`place-${square.x},${square.y}`} className="live-placement-square" points={points(camera.square(square, .08, true))}/>) }
          {selected?.x != null && selected.y != null && <polygon className="live-selection-square" data-selection={selected.id} points={points(camera.square({ x: selected.x, y: selected.y }, .06, true))}/>}
          {hoverSquare && (hoverSquare.x !== selected?.x || hoverSquare.y !== selected?.y) && <polygon
            className="live-selection-square live-hover-square" data-hover-square={`${hoverSquare.x},${hoverSquare.y}`}
            points={points(camera.square(hoverSquare, .06, true))}/>}
          {cursor && <polygon className="live-keyboard-square" points={points(camera.square(cursor, .1, true))}/>}
          {jumpOptions && !readOnly && !playback && <g className="live-jump-landings" aria-label="Jump landing guidance">
            {jumpOptions.map(step => {
              const landing = projectJumpLanding(step,camera,threatPreferences);
              return <g key={`${step.x},${step.y}`} data-jump-landing={`${step.x},${step.y}`} data-jump-penalty={landing.penalty}>
                {landing.fills.map((polygon,index) => <polygon key={index} points={points(polygon)} fill={landing.color} fillOpacity={threatOpacity}/>)}
                <polygon className="live-jump-outline" points={points(landing.outline)}/>
                {landing.hatches.map(edge => <path key={edge.key} className="live-threat-hatch" d={`M${edge.screenFrom.x},${edge.screenFrom.y} L${edge.screenTo.x},${edge.screenTo.y}`}/>)}
                {landing.center && <text className="live-jump-target" x={landing.center.x} y={landing.center.y-10}>J {landing.target}+</text>}
                {landing.rush && <g data-rush-warning={`${step.x},${step.y}`}><path className="live-range-warning-triangle" d={landing.rush.path}/><text className="live-range-warning-mark" x={landing.rush.center.x} y={landing.rush.center.y} fontSize={landing.rush.size}>!</text></g>}
                <title>{`Jump ${landing.target}+${step.rush ? `; Rush ${step.rush}+` : ''}${step.reactions.length ? `; ${step.reactions.join(', ')}` : ''}`}</title>
              </g>;
            })}
          </g>}
          {routePreview && (() => { const path = routePath([routePreview.from,...routePreview.steps.map(step => ({...step,...(isJumpStep(step) ? {jump:true as const} : {})}))],camera);
            return <><path className="live-route-guide" d={path}/><path className="live-route-line" d={path} markerEnd={`url(#${markerId}-route-arrow)`}/></>; })()}
          {showTargetLine && targetSource?.x != null && targetSource.y != null && pinnedTarget?.x != null && pinnedTarget.y != null && <path className="live-target-line" d={routePath([{ x: targetSource.x, y: targetSource.y }, { x: pinnedTarget.x, y: pinnedTarget.y }], camera)}/>}
        </svg>
        {kickTarget ? <BallMarker ball={kickTarget} state={{ version: 1, inPlay: true, moving: true, carrierPlayerId: null }} camera={camera}/>
          : (kickPreview?.deviation ?? view.ball) && <BallMarker ball={(kickPreview?.deviation ?? view.ball)!} allowOffPitch={!!view.kickPreview}
            state={view.kickPreview || view.driveTracker?.phase === 'KICKOFF' || view.actions.some(action => action.kind === 'kickSkill') ? { version: 1, inPlay: true, moving: true, carrierPlayerId: null } : view.ballState} camera={camera}/>}
        {kickPreview && <BallMarker ball={kickPreview.withKick} variant="kick" allowOffPitch
          state={{ version: 1, inPlay: true, moving: true, carrierPlayerId: null }} camera={camera}/>}
        <svg className="live-route-waypoint-layer" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          {waypoints.map((square, index) => { const p = camera.project(centerOf(square));
            return p && <g key={index} className="live-route-waypoint" aria-hidden="true"><circle cx={p.x} cy={p.y} r="4"/></g>; })}
        </svg>
        {occupants.map(player => <PlayerMarker failedArt={failedArt} onArtError={onArtError} key={player.id} player={player} teamName={matchTeamName(view, player.role)} camera={camera} facing={facings[player.id]}
          markers={playerSkillMarkers(player, view.callerRole, markerPreferences, readOnly && allowEndChoice)} markerPreferences={markerPreferences} showLimitedActions={showLimitedActions && view.phase === 'PLAY'}
          showConditions={showConditions}
          setupPerspective={setupPerspective} order={depthOrder.get(player.id)!}
          active={player.id === view.activePlayerId} selected={player.id === selectedId} target={targetPlayers.has(player.id)} readOnly={readOnly}
          canDrag={draggableIds?.has(player.id) ?? false} onStartDrag={onStartDrag} onEndDrag={onEndDrag}
          onSelect={() => onSelectPlayer(player.id)} onGround={onSquare} onFocus={anchor => onFocusPlayer?.(player.id, anchor)} onBlur={() => onBlurPlayer?.()}/>) }
        <svg className="live-block-marker-layer" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          <BlockVisibility context={blocks} camera={camera} layer="blocks" animated={animateBlockMarkers}/>
        </svg>
        {activeBlock && <p className="sr-only" data-block-description="true">{`${blockPlayerName(activeBlock.playerId)} blocks ${blockPlayerName(activeBlock.targetPlayerId)}. Offensive assists: ${activeBlock.offensiveAssists.map(assist=>blockPlayerName(assist.playerId)).join(', ')||'none'}. Defensive assists: ${activeBlock.defensiveAssists.map(assist=>blockPlayerName(assist.playerId)).join(', ')||'none'}.`}</p>}
        {followUpTarget && followUpTo && followUpFrom && <div className="live-push-choice live-follow-up-preview" role="img"
          aria-label={`Follow-up destination: ${followUpTarget.x}, ${followUpTarget.y}`}
          data-x={followUpTarget.x} data-y={followUpTarget.y}
          style={{ left: followUpTo.x - followUpTo.pixelsPerSquare / 2, top: followUpTo.y - followUpTo.pixelsPerSquare / 2,
            width: followUpTo.pixelsPerSquare, height: followUpTo.pixelsPerSquare }}>
          <svg viewBox="0 0 32 32" aria-hidden="true" style={{ transform: `rotate(${Math.atan2(followUpTo.y - followUpFrom.y, followUpTo.x - followUpFrom.x) * 180 / Math.PI}deg)` }}>
            <path className="live-push-shaft" d="M5 16h19"/><path className="live-push-head" d="m17 9 7 7-7 7"/>
          </svg>
        </div>}
        {shownPushChoices.map(choice => {
          const p = camera.project(centerOf({ x: choice.x, y: choice.y })), from = camera.project(centerOf({ x: choice.fromX, y: choice.fromY }));
          if (!p || !from) return null;
          return <button key={choice.action.id} type="button" className={`live-push-choice${selection ? ' live-sidestep-choice' : ''}${choice.action.kind === 'hitAndRun' ? ' live-hit-and-run-choice' : ''}`} aria-label={choice.action.label} title={choice.action.label}
            disabled={decisionDisabled || readOnly || playback}
            data-x={choice.x} data-y={choice.y}
            style={{ left: p.x - p.pixelsPerSquare / 2, top: p.y - p.pixelsPerSquare / 2, width: p.pixelsPerSquare, height: p.pixelsPerSquare }}
            onClick={event => { event.stopPropagation(); if (decisionDisabled || readOnly || playback) return;
              if (selection) onDecisionAction?.(choice.action.id); else onPushChoice?.(choice.action.id); }}>
            <svg viewBox="0 0 32 32" aria-hidden="true" style={{ transform: `rotate(${Math.atan2(p.y - from.y, p.x - from.x) * 180 / Math.PI}deg)` }}><path className="live-push-shaft" d="M5 16h19"/><path className="live-push-head" d="m17 9 7 7-7 7"/></svg>
          </button>;
        })}
        <PitchDecisionOverlay decision={decision?.circular ? null : decision} diceMoment={diceMoment}
          rollContext={decision?.circular ? decision : null}
          potentialDice={(!readOnly && !playback || diceAwaiting) ? potentialDice : null} awaiting={diceAwaiting}
          attackerRole={activePlayer?.role} chooserRole={view.callerRole === 'spectator' ? undefined : view.callerRole}
          disabled={decisionDisabled} viewport={viewport} onAction={onDecisionAction}
          onInspectTarget={target => setInspectedBlock(target ? {revision: view.revision, target} : null)}/>
        {decision?.circular && !readOnly && !playback && <CircularSkillPrompt key={decision.key} decision={decision}
          disabled={decisionDisabled} viewport={viewport} activePlayerId={view.activePlayerId}
          selectingDestination={selectingDestination} onDestinationStage={selecting => setDestinationStage(selecting ? decision.key : null)}
          layoutKey={`${camera.focus}:${camera.transverseFocus}:${camera.zoom}:${camera.end}:${camera.mode}`}
          onAction={onDecisionAction}/>}
        {backgroundFailed && <span className="live-pitch-error">Pitch texture unavailable; plain field shown.</span>}
      </div>
    </div>
    {routePreview && <ol className="sr-only" aria-label="Planned route">{routePreview.steps.map((step, index) => <li key={index}>Square {step.x}, {step.y}</li>)}</ol>}
    {rangeMarkings && movementRange && <p className="sr-only" aria-live="polite">Movement range: {movementRange.normalRemaining} normal movement points remaining,
      {' '}{movementRange.remaining} including rushes.</p>}
    <output className="sr-only" aria-live="polite">{cursor ? `Square ${cursor.x}, ${cursor.y}` : 'Pitch camera ready'}</output>
  </section>;
}
