import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { decode } from './protocol.ts';
import { LivePitch } from './LivePitch.tsx';
import { LiveDugouts } from './LiveDugouts.tsx';
import { PlayerHoverCard } from './PlayerHoverCard.tsx';
import { GameMenu } from './GameMenu.tsx';
import { LiveMatchScoreboard } from './LiveMatchScoreboard.tsx';
import { MatchDecisionDialog } from './MatchDecisionDialog.tsx';
import { MatchHistory } from './MatchHistory.tsx';
import type { TranscriptRecord } from './transcript-protocol.ts';
import type { ChatMessage } from './chat-protocol.ts';
import { usePitchPlayback } from './use-pitch-playback.ts';
import { ActionGlyph } from './ActionGlyph.tsx';
import './coach-match.css';
import './match-adjustments.css';
import './ui-round-four.css';
import { useHudOpacity } from './hud-opacity.ts';
import type { RoutePoint, RoutePreview } from './route-protocol.ts';
import { actionForPlayer, assistedTarget, attackApproaches, hasUnactivatedPlayers, moreActions, passTargetForPlayer, recentActionLabel, smartAttack } from './action-ribbon.ts';
import { matchDecision } from './match-decision.ts';
import { withProTest } from './reroll-presentation.ts';
import { pitchPushChoices } from './push-choice.ts';
import { kickoffChoice } from './kickoff-choice.ts';
import { currentGameStep } from './match-status.ts';
import { matchTeamName } from './match-team-name.ts';
import { canPlaceReserve, decodeSetupState } from './setup-protocol.ts';
import type { SetupAction, SetupCode, SetupState } from './setup-protocol.ts';
import { canDragSetupPlayer, canDropSetupPlayer, solidDefenceDrop } from './setup-drag.ts';
import { decodeRetainedSetup, setupOutcomeUncertain, setupRetryKey } from './setup-recovery.ts';
import type { RetainedSetup } from './setup-recovery.ts';
import './SetupPanel.css';

type Request = Record<string, unknown>;
function shortActionLabel(action: SetupAction, state: SetupState, selectedPlayerId: string): string {
  const source = state.players.find(player => player.id === (action.sourcePlayerId ?? selectedPlayerId))?.name;
  if (!source || !action.label.endsWith(source)) return action.label;
  return action.label.slice(0, -source.length).trimEnd().replace(/\s+(?:of|with|for|by)$/i, '').trimEnd();
}
type SmartIntent = { kind: 'move' | 'block' | 'blitz' | 'foul'; playerId: string; targetId?: string;
  destination?: RoutePoint; approachIndex?: number; stage: 'planned' | 'declaring' | 'targeting' | 'routing' | 'moving'; revision: number };
const endpoint = 'ws://127.0.0.1:22227/browser/v1';
const explanation = (code: SetupCode) => ({
  PERSISTENCE_FAILED: 'Storage is unavailable. The engine may already have resolved the turn. Reload or retry the exact retained request to reconcile.',
  MATCH_OUTCOME_UNKNOWN: 'The final save may have committed. Reload or retry the exact retained request; do not create a new action.',
  REPLAY_UNSUPPORTED: 'This saved result uses an unsupported replay version. Its stored data has not been changed.',
  REPLAY_LIMIT: 'This match has reached its recorded-history budget. No further action was executed.',
  MATCH_COMPLETED: 'This match has already finished. Reload the final state or open its result.',
  ILLEGAL_SETUP: 'Field 11 available players, at least three on the line of scrimmage, at most two in each wide zone, and your selected captain if any.',
  ILLEGAL_PLACEMENT: 'Select an empty square in your half.',
  WRONG_ACTOR: 'The other participant owns this decision.',
  STALE_REVISION: 'The match changed. Reload its current state before submitting another action.',
  NOT_FOUND: 'This match is not available to this local credential. Check the match ID and reconnect with a participant credential.',
  COMPLETION_PENDING: 'The engine reached full time but the result still needs saving. Retry the exact retained request.',
  COMPLETION_CONFLICT: 'Storage contains a different completed result. Stop play and retain the match ID for operator investigation.',
  REQUEST_ID_REUSED: 'This request identifier has different recorded input. Reload the authoritative match.',
  REQUEST_HISTORY_LIMIT: 'This match reached its action-history limit. Further play is unavailable; retained requests can still be reconciled.',
  SAVE_HISTORY_LIMIT: 'This match reached its retained save/resume request limit. Repeat an existing request or contact the local operator.',
  SAVE_RESUME_UNAVAILABLE: 'This match uses an earlier recovery runtime and cannot be changed into a saved match while active.',
  SAVE_PROPOSAL_PENDING: 'A save or resume request is already awaiting the other participant.',
  SAVE_PROPOSAL_MISSING: 'That save or resume proposal has expired or was resolved. Reload the match.',
  SAVE_PROPOSAL_MISMATCH: 'That response belongs to a different save or resume proposal. Reload the match.',
  SAVE_PROPOSAL_OWNER: 'Only the other participant can accept or reject; only the requester can cancel.',
  MATCH_SUSPENDED: 'Both participants saved this match. Request and accept resume before playing.',
  MATCH_NOT_SUSPENDED: 'This match is already active. Reload before requesting resume.',
  MATCH_ABANDONED: 'This saved match passed its 30-day inactivity period and is retained as abandoned; it cannot resume.',
  PROMPT_MISMATCH: 'This choice is no longer current. Reload the match to see the current decision.',
  WRONG_PHASE: 'This action is unavailable in the current phase. Reload the match.',
  AUTHENTICATION_REQUIRED: 'Re-enter a local credential and reconnect.',
  SESSION_UNAVAILABLE: 'This activated session is unavailable. Setup cannot recover after a server restart or engine failure. Prepare a new match to play again.',
  NOT_ACTIVATED: 'Activate this match from match preparation first.',
  RECOVERY_UNSUPPORTED: 'This retained match cannot be recovered by this server. Stored data is retained; use a compatible runtime.',
  RECOVERY_CORRUPT: 'The retained match data is corrupt and could not be recovered. Stored data is retained for investigation.',
  RECOVERY_CONFLICT: 'Recovery found a conflicting match state. Stored data is retained; reload to reconcile the match.',
  RECOVERY_LIMIT: 'The server recovery limit was reached. Stored data is retained; retry after reconciling the match.',
  ACTIVATION_LIMIT: 'The local server has reached its activation capacity. Stored match data is retained.',
} as Partial<Record<SetupCode, string>>)[code] ?? 'The server rejected this request.';

export function SetupPanel() {
  const [matchId, setMatchId] = useState(() => new URLSearchParams(location.search).get('matchId') ?? '');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState('');
  const [view, setView] = useState<SetupState | null>(null);
  const [last, setLast] = useState<RetainedSetup | null>(() => { try { return decodeRetainedSetup(sessionStorage.getItem(setupRetryKey)); } catch { return null; } });
  const [pending, setPending] = useState<string | null>(() => last ? String(last.request.requestId) : null);
  const [subject, setSubject] = useState('');
  const [acceptedActionId, setAcceptedActionId] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const currentView = useRef<SetupState | null>(null);
  const pendingId = useRef<string | null>(pending);
  const loadId = useRef(''); const selectedMatch = useRef(matchId);
  useEffect(() => () => socket.current?.close(), []);
  const connected = status === 'Connected';
  function load(ws = socket.current) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !selectedMatch.current) return;
    loadId.current = crypto.randomUUID();
    ws.send(JSON.stringify({ version: 1, type: 'setup', operation: 'load', requestId: loadId.current, matchId: selectedMatch.current }));
  }
  function connect() {
    if (socket.current) return;
    selectedMatch.current = matchId;
    const ws = new WebSocket(endpoint); socket.current = ws;
    setStatus('Connecting'); setSubject(''); currentView.current = null; setView(null);
    const current = () => socket.current === ws;
    ws.onopen = () => { if (current()) ws.send(JSON.stringify({ version: 1, type: 'join', requestId: crypto.randomUUID(), token })); };
    ws.onmessage = event => {
      if (!current()) return;
      try {
        const type = JSON.parse(event.data).type;
        if (type !== 'setupState') {
          const message = decode(event.data);
          if (message.type === 'snapshot') { setSubject(message.actor); setStatus('Connected'); setToken(''); load(ws); }
          else if (message.status === 'rejected') { setError(message.code); ws.close(); }
          return;
        }
        const message = decodeSetupState(event.data);
        const isLoad = message.requestId === loadId.current;
        const isAction = message.requestId !== null && message.requestId === pendingId.current;
        if (message.requestId !== null && !isLoad && !isAction) return;
        if (message.state && message.state.matchId !== selectedMatch.current) throw Error('Response belongs to another match');
        if (message.state && message.state.matchId === selectedMatch.current) {
          if (!currentView.current || message.state.revision >= currentView.current.revision) {
            currentView.current = message.state; setView(message.state);
          }
        }
        if (isAction && !setupOutcomeUncertain(message.code)) {
          try {
            const retained = decodeRetainedSetup(sessionStorage.getItem(setupRetryKey));
            if (message.code === 'ACCEPTED' && retained?.request.operation === 'action' && typeof retained.request.actionId === 'string') setAcceptedActionId(retained.request.actionId);
          } catch { /* A storage fault cannot invalidate a confirmed server response. */ }
          pendingId.current = null; setPending(null);
          try { sessionStorage.removeItem(setupRetryKey); } catch { /* The response is authoritative. */ }
        }
        if (message.code === 'NOT_FOUND') { currentView.current = null; setView(null); }
        if (message.code === 'SESSION_UNAVAILABLE') {
          currentView.current = null; setView(null); pendingId.current = null; setPending(null); setLast(null);
          try { sessionStorage.removeItem(setupRetryKey); } catch { /* No resident session can be replayed. */ }
        }
        setError(message.code === 'ACCEPTED' ? '' : `${message.code}: ${explanation(message.code)}`);
      } catch {
        setError('Invalid server response. Reconnect to reload authoritative setup.'); ws.close();
      }
    };
    ws.onclose = () => { if (current()) { socket.current = null; setStatus('Disconnected'); } };
    ws.onerror = () => { if (current()) setError('Connection failed. Check the local server.'); };
  }
  function mutate(operation: string, fields: Request = {}) {
    if (!view || !connected || pendingId.current || socket.current?.readyState !== WebSocket.OPEN) return;
    const request = { version: 1, type: 'setup', operation, requestId: crypto.randomUUID(), matchId: view.matchId, expectedRevision: view.revision, ...fields };
    const retained = { request, subject, matchId: view.matchId };
    try { sessionStorage.setItem(setupRetryKey, JSON.stringify(retained)); }
    catch { setError('The action was not sent because retry storage is unavailable. Enable session storage and try again.'); return; }
    pendingId.current = request.requestId; setPending(request.requestId); setLast(retained);
    socket.current.send(JSON.stringify(request));
  }
  function retry() {
    if (!last || !view || !connected || socket.current?.readyState !== WebSocket.OPEN || last.subject !== subject || last.matchId !== view.matchId) return;
    try { sessionStorage.setItem(setupRetryKey, JSON.stringify(last)); }
    catch { setError('The retry was not sent because retry storage is unavailable.'); return; }
    pendingId.current = String(last.request.requestId); setPending(pendingId.current);
    socket.current?.send(JSON.stringify(last.request));
  }
  return <main className="team-builder setup-panel">
    <nav><a href="/matches">Match preparation</a> · <a href={`/results?matchId=${encodeURIComponent(matchId)}`}>Match results</a> · <a href="/teams">Team builder</a> · <a href="/">Board scenarios</a></nav>
    <h1>Match setup and play</h1>
    <p>Play with the frozen teams. The server restores compatible checkpoints after restart. A deliberate save needs agreement from both participants; disconnecting alone does not save a match.</p>
    <form onSubmit={event => { event.preventDefault(); connect(); }}>
      <label>Local credential <input aria-label="Local credential" type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" required /></label>
      <label>Match ID <input aria-label="Match ID" value={matchId} disabled={!!socket.current} onChange={event => setMatchId(event.target.value)} required /></label>
      <button disabled={!!socket.current || !token || !matchId}>Join setup</button>
      <button type="button" className="secondary" onClick={() => socket.current?.close()} disabled={!socket.current}>Disconnect</button>
    </form>
    <p role="status">{status}</p>{error && <p role="alert">{error}</p>}
    {!connected && <p>The displayed match is read-only. Re-enter your local credential and join to load the current state. No action is automatically replayed.</p>}
    {pending && <p role="status">Action outcome awaiting confirmation. Reconnect with the original credential for match {last?.matchId}, then repeat the retained request. New actions remain locked.</p>}
    {pending && connected && last?.subject !== subject && <p role="alert">The retained action belongs to the other local credential. Disconnect and reconnect with the original credential to reconcile it.</p>}
    <button type="button" className="secondary" onClick={() => load()} disabled={!connected}>Reload setup snapshot</button>
    {view && <GameView view={view} connected={connected} pending={pending} mutate={mutate} acceptedActionId={acceptedActionId} />}
    {last && view && <button type="button" onClick={retry} disabled={!connected || last.subject !== subject || last.matchId !== view.matchId}>Repeat last setup request</button>}
  </main>;
}

/** The same board and decisions for players and read-only spectators. */
export function GameView({ view, connected, pending: requestPending, mutate, acceptedActionId = null, results = true, resultUrl, hosted = false,
  logRecords = [], logLoading = false, logUnavailable = false, chatMessages = [], chatLoading = false,
  chatUnavailable = false, chatSendError = '', chatSent = null, chatSending = false, sendChat = () => {},
  routePreview = null, routeError = '', requestRoutePreview, matchControls, setupErrors = [] }: {
  view: SetupState; connected: boolean; pending: string | null; results?: boolean; resultUrl?: string; hosted?: boolean;
  acceptedActionId?: string | null;
  logRecords?: TranscriptRecord[]; logLoading?: boolean; logUnavailable?: boolean;
  chatMessages?: ChatMessage[]; chatLoading?: boolean; chatUnavailable?: boolean; chatSendError?: string;
  chatSent?: { text: string; id: string } | null; chatSending?: boolean; sendChat?: (text: string) => void;
  routePreview?: RoutePreview | null; routeError?: string;
  requestRoutePreview?: (points: RoutePoint[]) => void;
  setupErrors?: string[];
  matchControls?: { fullscreen: boolean; toggleFullscreen: () => void; exitMatch: () => void; reconnect: () => void; error: string };
  mutate: (operation: string, fields?: Request) => void;
}) {
  const [playerId, setPlayerId] = useState('');
  const [pitchZoom, setPitchZoom] = useState(1);
  const { opacity, changeOpacity } = useHudOpacity();
  const [debugOpen, setDebugOpen] = useState(false);
  const [selectedScreen, setSelectedScreen] = useState<{ x: number; width: number } | null>(null);
  const [actionId, setActionId] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [debugCameraHost, setDebugCameraHost] = useState<HTMLDivElement | null>(null);
  const [moreActionId, setMoreActionId] = useState('');
  const [targetAssist, setTargetAssist] = useState(true);
  const [smartIntent, setSmartIntent] = useState<SmartIntent | null>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState('');
  const [solidDrop, setSolidDrop] = useState<{ playerId: string; to: RoutePoint; revision: number } | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const autoActionRef = useRef('');
  const [explicitBlitz, setExplicitBlitz] = useState(false);
  const [confirmEndTurn, setConfirmEndTurn] = useState(false);
  const [routeMode, setRouteMode] = useState(false);
  const [waypoints, setWaypoints] = useState<RoutePoint[]>([]);
  const recentKey = `ffb.match.more.${view.matchId}.${view.callerRole}`;
  const candidateKey = `${recentKey}.candidate`;
  const [lastUsed, setLastUsed] = useState<{ kind: string; label: string } | null>(() => {
    try { const value = JSON.parse(sessionStorage.getItem(recentKey) ?? 'null'); return typeof value?.kind === 'string' && typeof value?.label === 'string' ? value : null; }
    catch { return null; }
  });
  const [targetFocus, setTargetFocus] = useState<'player' | 'square' | null>(null);
  const [hoverPlayer, setHoverPlayer] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusPlayer = (id: string, anchor: DOMRect) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoverPlayer(null);
    hoverTimer.current = setTimeout(() => setHoverPlayer({ id, anchor }), 350);
  };
  const blurPlayer = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHoverPlayer(null); };
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  const [x, setX] = useState(0); const [y, setY] = useState(0);
  const { pitchView, playbackActive, diceMoment } = usePitchPlayback(view, logRecords, hosted && connected && !logUnavailable);
  const pending = requestPending || (playbackActive ? 'playback' : null);
  const displayedRevision = useRef(view.revision);
  useLayoutEffect(() => {
    if (displayedRevision.current === view.revision) return;
    displayedRevision.current = view.revision;
    setActionId(''); setActionFilter(''); setMoreOpen(false); setMoreActionId(''); setExplicitBlitz(false); setConfirmEndTurn(false);
    setRouteMode(false); setWaypoints([]);
  }, [view.revision]);
  useEffect(() => {
    if (!acceptedActionId) return;
    try {
      const candidate = JSON.parse(sessionStorage.getItem(candidateKey) ?? 'null');
      if (candidate?.id !== acceptedActionId || candidate.revision >= view.revision) return;
      const recent = { kind: candidate.kind, label: candidate.label };
      sessionStorage.setItem(recentKey, JSON.stringify(recent));
      sessionStorage.removeItem(candidateKey);
      setLastUsed(recent);
    } catch { /* Last used is a convenience; match state is authoritative. */ }
  }, [acceptedActionId, candidateKey, recentKey, view.revision]);
  useEffect(() => {
    try { const value = JSON.parse(sessionStorage.getItem(recentKey) ?? 'null'); setLastUsed(typeof value?.kind === 'string' && typeof value?.label === 'string' ? value : null); }
    catch { setLastUsed(null); }
  }, [recentKey]);
  const own = view.players.filter(player => player.role === view.callerRole) ?? [];
  const selectedPlayer = view.players.find(player => player.id === playerId);
  const saved = view.saveResume;
  const suspended = saved?.status === 'SUSPENDED' || saved?.status === 'RESUME_PENDING';
  const maySetup = connected && !pending && !suspended && view.phase === 'SETUP' && view.actor === view.callerRole;
  const availableActions = view.actions.filter(action => action.actor === view.callerRole) ?? [];
  const draggableIds = new Set(connected && !pending && !suspended && !playbackActive && hosted
    ? view.players.filter(player => canDragSetupPlayer(view, player, availableActions)).map(player => player.id) : []);
  const reserveDropIds = new Set([...draggableIds].filter(id => canDropSetupPlayer(view, id, null)));
  const pushChoices = hosted ? pitchPushChoices(view, availableActions) : [];
  const decision = hosted ? withProTest(matchDecision(view, availableActions), logRecords, view.revision) : null;
  const kickoff = hosted ? kickoffChoice(availableActions, view.callerRole) : null;
  const kickoffMovement = view.turnMode === 'QUICK_SNAP' || view.turnMode === 'HIGH_KICK';
  const showConfirmation = view.phase === 'SETUP' ? view.actor === view.callerRole
    : !kickoff && !kickoffMovement && availableActions.length > 0;
  const gameStep = currentGameStep(pitchView);
  const pitchActions = kickoffMovement ? view.actions.filter(action => action.actor === view.callerRole
    && (action.kind !== 'kickoffMove' || action.sourcePlayerId === playerId)) : view.actions;
  const selectedActions = moreActions(availableActions, view.activePlayerId ?? playerId);
  const endTurnAction = availableActions.find(action => action.kind === 'endTurn');
  const canChoose = connected && !pending && !suspended;
  const canRoute = hosted && !!requestRoutePreview && canChoose && view.phase === 'PLAY'
    && !kickoffMovement
    && view.actor === view.callerRole && !!view.activePlayerId
    && availableActions.some(action => action.kind === 'move' && action.sourcePlayerId === view.activePlayerId);
  const routeReady = routeMode && waypoints.length > 0 && routePreview?.revision === view.revision
    && routePreview.actor === view.callerRole && routePreview.playerId === view.activePlayerId
    && routePreview.steps.length > 0
    && routePreview.steps.at(-1)?.x === waypoints.at(-1)?.x && routePreview.steps.at(-1)?.y === waypoints.at(-1)?.y;
  const updateWaypoints = (points: RoutePoint[]) => {
    if (smartIntent?.stage === 'routing') setSmartIntent({ ...smartIntent, approachIndex: -1 });
    setWaypoints(points); requestRoutePreview?.(points);
  };
  const mayAct = connected && !pending && !suspended && availableActions.some(action => action.id === actionId);
  const pinnedAction = availableActions.find(action => action.id === actionId);
  const teammateProposal = pinnedAction?.kind === 'liftTeamMate' || pinnedAction?.kind === 'kickMate';
  const targetChoices = availableActions.filter(action => action.target && (targetFocus === 'player' && 'playerId' in action.target
    ? action.target.playerId === targetPlayerId : targetFocus === 'square' && 'x' in action.target && action.target.x === x && action.target.y === y));
  const additionalActions = [...selectedActions, ...targetChoices.filter(action =>
    !['select', 'stand', 'selectBlock', 'blitz'].includes(action.kind) && !selectedActions.some(item => item.id === action.id))];
  const cancelProposal = () => {
    setPlayerId(teammateProposal ? view.activePlayerId ?? playerId : ''); setTargetPlayerId(''); setSmartIntent(null); setActionId('');
    setMoreActionId(''); setMoreOpen(false); setConfirmEndTurn(false); setExplicitBlitz(false);
    setTargetFocus(null); setRouteMode(false); setWaypoints([]); requestRoutePreview?.([]); blurPlayer();
  };
  const selectPlayer = (id: string) => {
    if (routeMode) { setRouteMode(false); updateWaypoints([]); }
    if (canChoose && kickoff) {
      const choice = kickoff.players.find(({ action }) => action.target && 'playerId' in action.target && action.target.playerId === id);
      if (choice) { mutate('action', { actionId: choice.action.id }); return; }
    }
    if (kickoffMovement) {
      if (!canChoose || !availableActions.some(action => action.kind === 'kickoffMove' && action.sourcePlayerId === id)) return;
      setPlayerId(id); setActionId(''); setSmartIntent(null); setTargetFocus('player'); return;
    }
    const touchback = availableActions.find(action => action.kind === 'touchback' && action.target && 'playerId' in action.target && action.target.playerId === id);
    if (touchback) { setPlayerId(id); setActionId(touchback.id); setSmartIntent(null); return; }
    const player = view.players.find(item => item.id === id);
    const teammate = availableActions.find(action => (action.kind === 'liftTeamMate' || action.kind === 'kickMate')
      && action.target && 'playerId' in action.target && action.target.playerId === id);
    if (canChoose && hosted && view.phase === 'PLAY' && teammate) {
      setPlayerId(view.activePlayerId ?? teammate.sourcePlayerId ?? ''); setTargetPlayerId(id);
      setTargetFocus('player'); setSmartIntent(null); setActionId(teammate.id);
      return;
    }
    if (hosted && view.phase === 'PLAY' && player?.role === view.callerRole && id !== playerId && pinnedAction) {
      cancelProposal(); setPlayerId(id); setTargetFocus('player'); return;
    }
    const pass = passTargetForPlayer(view, availableActions, playerId, id);
    if (pass && player?.x != null && player.y != null) {
      setSmartIntent(null); setTargetPlayerId(id); setTargetFocus('square'); setX(player.x); setY(player.y); setActionId(pass.id);
      return;
    }
    if (player?.role === view.callerRole) {
      cancelProposal(); setPlayerId(id); setTargetFocus('player');
      return;
    }
    setTargetPlayerId(id); setTargetFocus('player'); setSmartIntent(null);
    if (targetAssist && hosted && view.phase === 'PLAY' && playerId) {
      const attack = smartAttack(view, availableActions, playerId, id, explicitBlitz);
      if (attack) {
        setActionId(attack.action.id);
        if (['selectBlock', 'blitz', 'declareFoul'].includes(attack.action.kind))
          setSmartIntent({ kind: attack.kind, playerId, targetId: id, stage: 'planned', revision: view.revision });
        return;
      }
    }
    const candidates = availableActions.filter(action => action.target && 'playerId' in action.target && action.target.playerId === id
      && (!playerId || action.sourcePlayerId === playerId || view.projectionVersion !== 4 && view.activePlayerId === playerId));
    setActionId(targetAssist ? assistedTarget(candidates, explicitBlitz || view.turnMode === 'SELECT_BLITZ_TARGET')?.id ?? '' : '');
  };
  const selectSquare = (column: number, row: number) => {
    if (kickoffMovement) {
      const move = availableActions.find(action => action.kind === 'kickoffMove' && action.sourcePlayerId === playerId
        && action.target && 'x' in action.target && action.target.x === column && action.target.y === row);
      if (canChoose && move) mutate('action', { actionId: move.id });
      return;
    }
    const kick = availableActions.find(action => ['kickoff', 'touchback'].includes(action.kind)
      && action.target && 'x' in action.target && action.target.x === column && action.target.y === row);
    if (kick) { setX(column); setY(row); setTargetFocus('square'); setActionId(kick.id); setSmartIntent(null); return; }
    if (routeMode && canRoute) {
      const existing = waypoints.findIndex(point => point.x === column && point.y === row);
      updateWaypoints(existing >= 0 ? waypoints.slice(0, existing + 1) : [...waypoints, { x: column, y: row }].slice(0, 20));
      return;
    }
    if (hosted && view.phase === 'PLAY' && (pinnedAction || smartIntent?.stage === 'planned')
      && !view.players.some(player => player.x === column && player.y === row)) {
      cancelProposal(); return;
    }
    setX(column); setY(row); setTargetFocus('square');
    setSmartIntent(null);
    if (targetAssist && hosted && view.phase === 'PLAY' && playerId
      && !view.players.some(player => player.x === column && player.y === row)) {
      const singleStep = availableActions.find(action => action.kind === 'move' && (action.sourcePlayerId === playerId || view.projectionVersion !== 4 && view.activePlayerId === playerId)
        && action.target && 'x' in action.target && action.target.x === column && action.target.y === row);
      if (singleStep && !canRoute) { setActionId(singleStep.id); return; }
      if (canRoute && view.activePlayerId === playerId) {
        setRouteMode(true); updateWaypoints([{ x: column, y: row }]); setActionId('');
        return;
      }
      const declaration = availableActions.find(action => action.sourcePlayerId === playerId && ['select', 'stand'].includes(action.kind));
      if (declaration) {
        setActionId(declaration.id);
        setSmartIntent({ kind: 'move', playerId, destination: { x: column, y: row }, stage: 'planned', revision: view.revision });
        return;
      }
    }
    const candidates = availableActions.filter(action => action.target && 'x' in action.target && action.target.x === column && action.target.y === row
      && (!playerId || action.sourcePlayerId === playerId || view.projectionVersion !== 4 && view.activePlayerId === playerId));
    setActionId(targetAssist ? assistedTarget(candidates, explicitBlitz || view.turnMode === 'SELECT_BLITZ_TARGET')?.id ?? '' : '');
  };
  const dropPlayer = (id: string, column: number, row: number) => {
    setDraggingPlayerId('');
    if (!draggableIds.has(id)) return;
    const to = { x: column, y: row };
    if (view.phase === 'SETUP') {
      if (canDropSetupPlayer(view, id, to)) mutate('place', { playerId: id, to });
      return;
    }
    const choice = solidDefenceDrop(view, availableActions, id, to);
    if (!choice) return;
    if (choice.selecting) setSolidDrop({ playerId: id, to, revision: view.revision });
    mutate('action', { actionId: choice.action.id });
  };
  const dropReserve = (id: string, role: 'home' | 'away') => {
    setDraggingPlayerId('');
    if (role === view.callerRole && draggableIds.has(id) && canDropSetupPlayer(view, id, null))
      mutate('place', { playerId: id, to: null });
  };
  useEffect(() => {
    if (!solidDrop || view.revision <= solidDrop.revision || !connected || pending || suspended || playbackActive) return;
    const choice = solidDefenceDrop(view, availableActions, solidDrop.playerId, solidDrop.to);
    setSolidDrop(null);
    if (choice && !choice.selecting) mutate('action', { actionId: choice.action.id });
  });
  const commit = () => {
    if (view.phase === 'SETUP') { if (maySetup) mutate('confirm'); return; }
    if (routeMode) {
      if (canRoute && routeReady && routePreview) {
        if (smartIntent?.stage === 'routing') setSmartIntent(smartIntent.kind === 'move'
          ? null : { ...smartIntent, stage: 'moving', revision: view.revision });
        mutate('route', { playerId: routePreview.playerId, waypoints });
      }
      return;
    }
    if (!mayAct || !pinnedAction) return;
    if (pinnedAction.kind === 'endTurn' && hasUnactivatedPlayers(availableActions) && !confirmEndTurn) {
      setConfirmEndTurn(true); return;
    }
    setConfirmEndTurn(false);
    if (smartIntent?.stage === 'planned') setSmartIntent({ ...smartIntent,
      stage: pinnedAction.kind === 'blitzTarget' ? 'targeting' : 'declaring', revision: view.revision });
    if (pinnedAction.id === moreActionId) {
      try { sessionStorage.setItem(candidateKey, JSON.stringify({ id: pinnedAction.id, kind: pinnedAction.kind, label: recentActionLabel(pinnedAction), revision: view.revision })); }
      catch { /* A failed local shortcut never blocks a legal game action. */ }
    }
    mutate('action', { actionId: pinnedAction.id });
  };
  useEffect(() => {
    if (smartIntent?.stage === 'routing' && routeError === 'NO ROUTE' && connected && !pending && canRoute
      && smartIntent.targetId && smartIntent.approachIndex !== undefined
      && smartIntent.approachIndex >= 0) {
      const index = smartIntent.approachIndex + 1;
      const next = attackApproaches(view, smartIntent.playerId, smartIntent.targetId)[index];
      if (next) {
        setWaypoints([next]); requestRoutePreview?.([next]);
        setSmartIntent({ ...smartIntent, approachIndex: index });
      } else setSmartIntent({ ...smartIntent, approachIndex: -1 });
      return;
    }
    if (!smartIntent || ['planned', 'routing'].includes(smartIntent.stage) || view.revision <= smartIntent.revision
      || !connected || pending || suspended || playbackActive || view.actor !== view.callerRole || decision) return;
    if (view.activePlayerId !== smartIntent.playerId) { setSmartIntent(null); return; }
    const sendOffered = (action: typeof availableActions[number], stage: SmartIntent['stage'] | null) => {
      const key = `${view.revision}:${action.id}`;
      if (autoActionRef.current === key) return;
      autoActionRef.current = key;
      setSmartIntent(stage ? { ...smartIntent, stage, revision: view.revision } : null);
      mutate('action', { actionId: action.id });
    };
    if (smartIntent.kind === 'blitz' && smartIntent.stage === 'declaring') {
      const target = availableActions.find(action => action.kind === 'blitzTarget' && action.sourcePlayerId === smartIntent.playerId
        && action.target && 'playerId' in action.target && action.target.playerId === smartIntent.targetId);
      if (target) { sendOffered(target, 'targeting'); return; }
    }
    if (smartIntent.targetId) {
      const attack = smartAttack(view, availableActions, smartIntent.playerId, smartIntent.targetId);
      if (attack && ['block', 'foul'].includes(attack.action.kind)) { sendOffered(attack.action, null); return; }
    }
    if (canRoute) {
      const destination = smartIntent.destination ?? (smartIntent.targetId
        ? attackApproaches(view, smartIntent.playerId, smartIntent.targetId)[0] : null);
      if (destination) {
        setRouteMode(true); setActionId(''); setWaypoints([destination]); requestRoutePreview?.([destination]);
        setSmartIntent({ ...smartIntent, stage: 'routing', revision: view.revision,
          approachIndex: smartIntent.targetId ? 0 : undefined });
        return;
      }
    }
    setSmartIntent(null);
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      if (event.key === 'Escape' && event.target.closest('.hosted-match .live-pitch-viewport')) {
        cancelProposal();
        return;
      }
      if (event.code === 'Space' && !event.repeat && (routeMode ? routeReady : mayAct) && event.target.classList.contains('live-pitch-viewport')) {
        event.preventDefault(); commit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
  const matchingActions = availableActions.filter(action => `${action.label} ${action.kind}`.toLowerCase().includes(actionFilter.trim().toLowerCase()));
  const actionsByKind = matchingActions.reduce<Record<string, typeof availableActions>>((groups, action) => {
    (groups[action.kind] ??= []).push(action);
    return groups;
  }, {});
  const selectCommon = (kind: string) => {
    const action = actionForPlayer(availableActions, playerId, kind);
    if (!action || !canChoose) return;
    if (routeMode) { setRouteMode(false); updateWaypoints([]); }
    setSmartIntent(null); setActionId(action.id); setMoreActionId(''); setExplicitBlitz(kind === 'blitz'); setConfirmEndTurn(false);
  };
  const selectMore = (action: typeof availableActions[number]) => {
    if (!canChoose) return;
    if (routeMode) { setRouteMode(false); updateWaypoints([]); }
    if (action.kind === 'endAction') {
      setSmartIntent(null); setMoreOpen(false); setActionId(''); setMoreActionId(''); setConfirmEndTurn(false);
      try { sessionStorage.setItem(candidateKey, JSON.stringify({ id: action.id, kind: action.kind, label: recentActionLabel(action), revision: view.revision })); }
      catch { /* A failed local shortcut never blocks a legal game action. */ }
      mutate('action', { actionId: action.id });
      return;
    }
    setSmartIntent(null); setActionId(action.id); setMoreActionId(action.id); setMoreOpen(false); setConfirmEndTurn(false);
  };
  const useEndTurn = () => {
    if (!endTurnAction || !canChoose) return;
    setSmartIntent(null); setRouteMode(false); updateWaypoints([]); setMoreOpen(false);
    setActionId(endTurnAction.id); setConfirmEndTurn(hasUnactivatedPlayers(availableActions));
  };
  const serverActionPanel = availableActions.length > 0 && <section aria-label="Server actions" className="server-actions">
    <h3>Server actions</h3>
    <p>{availableActions.length ? 'Choose an action issued for your team. Its actor and kind are shown in the list.' : 'The server has not issued an action for your team.'}</p>
    {targetChoices.length > 0 && <div aria-label="Actions at selected target"><strong>At selected target</strong>{targetChoices.map(action =>
      <button key={action.id} type="button" className="secondary" aria-pressed={actionId === action.id}
        onPointerDown={() => setActionId(action.id)} onClick={() => setActionId(action.id)}
        disabled={!connected || !!pending || suspended}>{action.label}</button>)}</div>}
    <p>{pinnedAction ? `Pinned: ${pinnedAction.label}. Commit will send this server action.` : 'Select a server action, then Commit. Hover never sends an action.'}</p>
    {availableActions.length > 12 && <label>Find an action or target <input aria-label="Find an action or target" value={actionFilter} onChange={event => { setActionFilter(event.target.value); setActionId(''); }} placeholder="Player name, pass, or 8, 7" disabled={!connected || !!pending} /></label>}
    {actionFilter && <p>{matchingActions.length} matching actions</p>}
    <label>Action <select aria-label="Server action" value={actionId} onChange={event => setActionId(event.target.value)} disabled={!connected || !!pending || availableActions.length === 0}>
      <option value="">Select</option>{Object.entries(actionsByKind).map(([kind, actions]) => <optgroup key={kind} label={kind}>{actions.map(action => <option key={action.id} value={action.id}>{action.label} · {action.actor} · {action.kind}</option>)}</optgroup>)}
    </select></label>
    {!hosted && <button type="button" onClick={commit} disabled={!mayAct}>Commit action</button>}
  </section>;
  const rosterTable = <table><caption>Frozen team players</caption><thead><tr><th>Player</th><th>Role</th><th>State</th><th>Square</th></tr></thead><tbody>{view.players.map(player => <tr key={player.id}><td>{player.name} #{player.number ?? player.slot}</td><td>{player.position ?? player.role}</td><td>{player.state}</td><td>{player.x === null ? (player.offPitch ?? 'reserve') : `${player.x}, ${player.y}`}</td></tr>)}</tbody></table>;
  const savePanel = saved && <section aria-label="Save and resume"><h3>Save and resume</h3>
    {view.callerRole === 'spectator' ? <p>Match status: {saved.status.replaceAll('_', ' ').toLowerCase()}. Save and resume decisions belong to the two players.</p> : <>
    {saved.status === 'ACTIVE' && <><p>This match is active. A save proposal does not pause play until the other participant accepts.</p><button type="button" onClick={() => mutate('saveRequest') } disabled={!connected || !!pending}>Request mutual save</button></>}
    {saved.status === 'SAVE_PENDING' && <><p>Save requested by {saved.proposer}; it expires at {new Date(saved.expiresAt!).toLocaleString()}.</p>{saved.proposer === view.callerRole
      ? <button type="button" className="secondary" onClick={() => mutate('saveCancel', { proposalId: saved.proposalId })} disabled={!connected || !!pending}>Cancel save request</button>
      : <><button type="button" onClick={() => mutate('saveAccept', { proposalId: saved.proposalId })} disabled={!connected || !!pending}>Accept and save match</button><button type="button" className="secondary" onClick={() => mutate('saveReject', { proposalId: saved.proposalId })} disabled={!connected || !!pending}>Reject save request</button></>}</>}
    {saved.status === 'SUSPENDED' && <><p>This match is saved. Its turn clock is paused. Both original participants must agree to resume.</p><button type="button" onClick={() => mutate('resumeRequest')} disabled={!connected || !!pending}>Request resume</button></>}
    {saved.status === 'RESUME_PENDING' && <><p>Resume requested by {saved.proposer}; it expires at {new Date(saved.expiresAt!).toLocaleString()}.</p>{saved.proposer === view.callerRole
      ? <button type="button" className="secondary" onClick={() => mutate('resumeCancel', { proposalId: saved.proposalId })} disabled={!connected || !!pending}>Cancel resume request</button>
      : <><button type="button" onClick={() => mutate('resumeAccept', { proposalId: saved.proposalId })} disabled={!connected || !!pending}>Accept and resume match</button><button type="button" className="secondary" onClick={() => mutate('resumeReject', { proposalId: saved.proposalId })} disabled={!connected || !!pending}>Reject resume request</button></>}</>}
    {saved.status === 'ABANDONED' && <p role="alert">This match is retained as abandoned after 30 days without a completed save/resume or play action.</p>}
    </>}
  </section>;
  return (<section aria-label="Authoritative setup" className={hosted ? 'hosted-match coach-match' : undefined} style={{ ['--support-panel-opacity' as string]: `${opacity}%` }} onKeyDown={event => {
    if (!routeMode || !canRoute || !(event.target instanceof HTMLElement) || !event.target.closest('.live-pitch') || event.target.closest('input,textarea,select,[contenteditable]')) return;
    if (event.key === 'Backspace') { event.preventDefault(); updateWaypoints(waypoints.slice(0,-1)); }
    if (event.key === 'Escape') { event.preventDefault(); setRouteMode(false); updateWaypoints([]); setSmartIntent(null); }
  }}>
      <h2>{view.phase.replaceAll('_', ' ').toLowerCase()}</h2>
      <p aria-label="Coach labels">{view.callerRole === 'spectator' ? `${matchTeamName(view, 'home')} / ${matchTeamName(view, 'away')}` : view.callerRole === 'home' ? `${matchTeamName(view, 'home')}: You / ${matchTeamName(view, 'away')}: Opponent` : `${matchTeamName(view, 'home')}: Opponent / ${matchTeamName(view, 'away')}: You`}</p>
      {hosted && <LiveMatchScoreboard view={view}/>}
      {hosted && gameStep && <div className="match-game-step" role="status" aria-label="Current game step" aria-live="polite">
        <strong>{gameStep.title}</strong><span>{gameStep.instruction}</span>{gameStep.progress && <small>{gameStep.progress}</small>}
      </div>}
      {hosted && setupErrors.length > 0 && <p className="setup-feedback" role="alert">{setupErrors.join(' · ')}</p>}
      {!playbackActive && decision && !['blockDie', 'rerollDie', 'proTestReroll', 'reroll', 'skill'].includes(decision.kind) && <MatchDecisionDialog key={decision.key} decision={decision} disabled={!connected || !!pending || suspended}
        activeX={view.players.find(player => player.id === view.activePlayerId)?.x ?? null}
        onChoice={optionId => { const prompt = view.prompt; if (canChoose && prompt?.actor === view.callerRole && prompt.options.some(option => option === optionId)) mutate('choice', { promptId: prompt.id, optionId }); }}
        onAction={id => { if (canChoose && availableActions.some(action => action.id === id)) mutate('action', { actionId: id }); }}/>}
      {hosted && showConfirmation && <div className="confirmation-row">
        <button type="button" className="commit-action" onClick={commit} disabled={view.phase === 'SETUP' ? !maySetup : routeMode ? !canRoute || !routeReady : !mayAct}><ActionGlyph kind="confirm"/>Confirmed!</button>
        {teammateProposal && <button type="button" className="secondary" disabled={!canChoose} onClick={cancelProposal}>Cancel teammate selection</button>}
      </div>}
      {hosted && <div className="match-command-bar" aria-label="Current decision">
        {view.phase === 'SETUP' ? null : kickoff ? <div className="kickoff-command" aria-label="Kickoff player choice">
          <div className="kickoff-command-heading"><strong>Kickoff player choice</strong><span>{kickoff.selectedCount} selected · select or deselect a player, then confirm</span></div>
          <div className="kickoff-command-players">{kickoff.players.map(({ action, selected }) => <button key={action.id} type="button"
            aria-pressed={selected} disabled={!canChoose} onClick={() => mutate('action', { actionId: action.id })}>{action.label}</button>)}</div>
          <div className="kickoff-command-confirm">{kickoff.decline && <button type="button" disabled={!canChoose}
            onClick={() => mutate('action', { actionId: kickoff.decline!.id })}>{kickoff.decline.label}</button>}
            <button type="button" disabled={!canChoose || !kickoff.confirm}
              onClick={() => { if (kickoff.confirm) mutate('action', { actionId: kickoff.confirm.id }); }}>Confirm selection</button></div>
        </div> : kickoffMovement ? <div className="kickoff-movement-command">
          <span>Select an open player, then its highlighted destination.</span>
          {availableActions.filter(action => action.kind === 'kickoffChoice').map(action => <button key={action.id} type="button"
            disabled={!canChoose} onClick={() => mutate('action', { actionId: action.id })}>{action.label}</button>)}
        </div> : availableActions.length > 0 ? <>
        <div className="command-heading"><strong>{selectedPlayer ? `#${selectedPlayer.number ?? selectedPlayer.slot} ${selectedPlayer.name} · ${selectedPlayer.position ?? selectedPlayer.role}` : 'No player selected'}</strong>
          {(smartIntent?.stage === 'planned' || pinnedAction) && <span>{smartIntent?.stage === 'planned' ? `Plan ${smartIntent.kind}${smartIntent.targetId ? ` against ${view.players.find(player => player.id === smartIntent.targetId)?.name ?? 'target'}` : smartIntent.destination ? ` to ${smartIntent.destination.x}, ${smartIntent.destination.y}` : ''}`
            : pinnedAction?.label}</span>}</div>
        <div className="command-buttons" role="group" aria-label="Player actions">
          <button type="button" aria-pressed={!!pinnedAction && ['select', 'stand'].includes(pinnedAction.kind)} disabled={!canChoose || !playerId || !availableActions.some(action => action.sourcePlayerId === playerId && ['select', 'stand'].includes(action.kind))} onClick={() => selectCommon(actionForPlayer(availableActions, playerId, 'select') ? 'select' : 'stand')}><ActionGlyph kind="move"/>Move</button>
          <button type="button" aria-pressed={pinnedAction?.kind === 'selectBlock'} disabled={!canChoose || !actionForPlayer(availableActions, playerId, 'selectBlock')} onClick={() => selectCommon('selectBlock')}><ActionGlyph kind="block"/>Block</button>
          <button type="button" aria-pressed={pinnedAction?.kind === 'blitz'} disabled={!canChoose || !actionForPlayer(availableActions, playerId, 'blitz')} onClick={() => selectCommon('blitz')}><ActionGlyph kind="blitz"/>Blitz</button>
          <button type="button" aria-expanded={moreOpen} disabled={!canChoose} onClick={() => setMoreOpen(!moreOpen)}><ActionGlyph kind="other"/>Other action</button>
          <button type="button" className="end-turn-action" onClick={useEndTurn} disabled={!canChoose || !endTurnAction}><ActionGlyph kind="end"/>End Turn</button>
        </div>
        {moreOpen && <div className="command-menu" aria-label="Additional actions">
          {additionalActions.map(action => <button key={action.id} type="button" disabled={!canChoose} onClick={() => selectMore(action)}>{shortActionLabel(action, view, playerId)}</button>)}
          {canRoute && <button type="button" aria-pressed={routeMode} onClick={() => { setSmartIntent(null); setRouteMode(!routeMode); updateWaypoints([]); setActionId(''); setMoreOpen(false); }}>Plan path</button>}
          <button type="button" className="last-used-action" title={lastUsed?.label} disabled={!canChoose || !lastUsed || !additionalActions.some(action => action.kind === lastUsed.kind)} onClick={() => { const action = additionalActions.find(item => item.kind === lastUsed?.kind); if (action) selectMore(action); }}>Last used{lastUsed ? `: ${lastUsed.label}` : ''}</button>
          <button type="button" onClick={() => setDebugOpen(true)}>Show server options</button>
        </div>}
        {routeMode && <p className="sr-only" aria-live="polite">Click squares to add waypoints. Backspace undoes; Escape clears; Confirm commits.</p>}
        <div className="command-preview">{(routeMode || confirmEndTurn || pinnedAction) && <span>{routeMode ? routeReady ? 'Server path ready. Commit moves until the next required decision.' : 'Choose a waypoint to preview the path.' : confirmEndTurn ? 'Unactivated players remain. Confirm to end this turn.' : `Ready: ${pinnedAction!.label}`}</span>}
          </div></> :
        <p>{view.phase === 'FULL_TIME' ? <>Match finished. {results && <a href={resultUrl ?? `/results?matchId=${encodeURIComponent(view.matchId)}`}>Open final result and replay</a>}</> : view.phase === 'PLAY' && view.actions.length === 0 ? 'Waiting for an engine decision. Reconnect if the match appears stuck.' : view.callerRole === 'spectator' ? 'Watching match · coach decisions appear here when resolved.' : view.actor === view.callerRole ? 'Waiting for the next server decision.' : 'Waiting for the other participant.'}</p>}
      </div>}
      {!hosted && view.phase === 'FULL_TIME' && <p>Match finished. {results && <a href={resultUrl ?? `/results?matchId=${encodeURIComponent(view.matchId)}`}>Open final result and replay</a>}</p>}
      {!hosted && connected && view.actor !== view.callerRole && view.phase !== 'FULL_TIME' && <p>Waiting for the other participant. Their decision will appear here when resolved.</p>}
      <p data-testid="setup-status" className={hosted ? 'match-technical-status' : undefined}>Revision {view.revision} · you are {view.callerRole === 'spectator' ? 'spectator' : matchTeamName(view, view.callerRole)} · decision owner {matchTeamName(view, view.actor)} · half {view.half}, drive {view.drive} · turns {matchTeamName(view, 'home')} {view.homeTurn}, {matchTeamName(view, 'away')} {view.awayTurn} · score {matchTeamName(view, 'home')} {view.homeScore}, {matchTeamName(view, 'away')} {view.awayScore} · turn {view.turn} ({view.turnMode}) · weather {view.weather} · rerolls {matchTeamName(view, 'home')} {view.homeRerolls}, {matchTeamName(view, 'away')} {view.awayRerolls}</p>
      {!hosted && <p>Ball {view.ball ? `${view.ball.x}, ${view.ball.y}` : 'off pitch'} · active player {view.activePlayerId ?? 'none'}</p>}
      {hosted && <><div className="match-layout"><div className="match-board">
      <LivePitch view={pitchView} selectedId={playerId} actions={playbackActive ? [] : pitchActions} pinnedAction={playbackActive ? undefined : pinnedAction}
        zoom={pitchZoom} onZoomChange={setPitchZoom} showToolbar={debugOpen} onSelectionPosition={setSelectedScreen}
        debugOpen={debugOpen} cameraControlsHost={debugCameraHost}
        routePreview={!playbackActive && routeReady ? routePreview : null} waypoints={!playbackActive && routeMode ? waypoints : []} diceMoment={diceMoment}
        decision={!playbackActive && decision && ['blockDie', 'rerollDie', 'proTestReroll', 'reroll', 'skill'].includes(decision.kind) ? decision : null}
        decisionDisabled={!connected || !!pending || suspended}
        onDecisionAction={id => { if (canChoose && availableActions.some(action => action.id === id)) mutate('action', { actionId: id }); }}
        pushChoices={canChoose && !playbackActive ? pushChoices : []}
        onPushChoice={id => { if (canChoose && pushChoices.some(choice => choice.action.id === id)) mutate('action', { actionId: id }); }}
        draggableIds={draggableIds} draggingPlayerId={draggingPlayerId} onStartDrag={setDraggingPlayerId} onEndDrag={() => setDraggingPlayerId('')}
        onDropPlayer={dropPlayer} onSelectPlayer={selectPlayer} onFocusPlayer={focusPlayer} onBlurPlayer={blurPlayer} onSquare={selectSquare} readOnly={playbackActive} playback={playbackActive}/>
      </div><LiveDugouts players={view.players} homeName={view.homeTeamName} awayName={view.awayTeamName} onSelect={selectPlayer} onFocusPlayer={focusPlayer} onBlurPlayer={blurPlayer}
        draggableIds={draggableIds} draggingPlayerId={draggingPlayerId} onStartDrag={setDraggingPlayerId} onEndDrag={() => setDraggingPlayerId('')} reserveDropIds={reserveDropIds} onDropReserve={dropReserve}/><aside className="match-side" aria-label="Match decisions and players">
        {matchControls?.error && <p role="alert">{matchControls.error}</p>}
        {view.phase === 'SETUP' && view.callerRole !== 'spectator' && <section aria-label="Placement controls">
          <details><summary>Place players with keyboard or touch</summary>
            <label>Player <select aria-label="Setup player" value={playerId} onChange={event => setPlayerId(event.target.value)} disabled={!maySetup}>
                <option value="">Select</option>{own.map(player => <option key={player.id} value={player.id}
                  disabled={!canDragSetupPlayer(view, player, availableActions)}>{player.name} #{player.slot}{player.x === null
                    ? player.offPitch === 'reserve' ? ' reserve' : ` · ${player.status ?? player.state}` : ''}</option>)}</select></label>
            <label>X <input aria-label="Setup X" type="number" min="0" max="25" value={x} onChange={event => setX(Number(event.target.value))} disabled={!maySetup}/></label>
            <label>Y <input aria-label="Setup Y" type="number" min="0" max="14" value={y} onChange={event => setY(Number(event.target.value))} disabled={!maySetup}/></label>
            <button type="button" onClick={() => dropPlayer(playerId, x, y)} disabled={!maySetup || !canDropSetupPlayer(view, playerId, { x, y })}>Place on empty own-half square</button>
            <button type="button" onClick={() => { if (view.callerRole !== 'spectator') dropReserve(playerId, view.callerRole); }}
              disabled={!maySetup || !canDropSetupPlayer(view, playerId, null)}>Return selected player to reserve</button>
          </details>
        </section>}
        <MatchHistory overlay stacked matchId={view.matchId} records={logRecords.filter(record => record.revision <= pitchView.revision)} logLoading={logLoading} logUnavailable={logUnavailable}
          homeTeamName={view.homeTeamName} awayTeamName={view.awayTeamName}
          messages={chatMessages} chatLoading={chatLoading} chatUnavailable={chatUnavailable}
          connected={connected} sending={chatSending} canSend={view.phase !== 'FULL_TIME'} onSend={sendChat}
          sendError={chatSendError} sent={chatSent}/>
        <div className="match-menu-triggers"><button type="button" className="match-debug-toggle" aria-expanded={debugOpen} aria-controls="match-debug" onClick={() => setDebugOpen(!debugOpen)}>Debug</button><GameMenu view={view} connected={connected} pending={!!pending} mutate={mutate} records={logRecords} logLoading={logLoading} logUnavailable={logUnavailable}
          interfaceControls={<>{matchControls && <div className="interface-window-controls">
            <button type="button" onClick={matchControls.toggleFullscreen}>{matchControls.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
            <button type="button" onClick={matchControls.exitMatch}>Exit match</button></div>}<button type="button" aria-pressed={targetAssist} onClick={() => { setTargetAssist(!targetAssist); setSmartIntent(null); setActionId(''); }}>Target assist: {targetAssist ? 'on' : 'off'}</button>
            <div className="interface-pitch-zoom" role="group" aria-label="Pitch size">
              <button type="button" aria-pressed={pitchZoom === 1} onClick={() => setPitchZoom(1)}>Fit</button>
              <button type="button" aria-pressed={pitchZoom === 1.5} onClick={() => setPitchZoom(1.5)}>1.5×</button>
              <button type="button" aria-pressed={pitchZoom === 2} onClick={() => setPitchZoom(2)}>2×</button>
            </div>
            <label className="hud-opacity-control">Panel background opacity <input type="range" min="0" max="100" step="1" value={opacity} onChange={event => changeOpacity(Number(event.target.value))}/><output>{opacity}%</output></label>
            <p>Right-button drag travels along the field; the wheel zooms. Click pitch squares to add movement waypoints; Confirm commits. Backspace undoes a waypoint; Escape clears the route. Top-down preserves the camera position.</p></>}/></div>
      </aside></div></>}
      {hosted && hoverPlayer && (() => { const player = view.players.find(item => item.id === hoverPlayer.id);
        return player ? <PlayerHoverCard player={player} anchor={hoverPlayer.anchor} dock={selectedScreen && selectedScreen.x < selectedScreen.width / 2 - 1 ? 'right' : 'left'} teamName={matchTeamName(view, player.role)}/> : null; })()}
      {hosted && debugOpen && <section id="match-debug" className="match-debug-panel match-debug-drawer" role="region" aria-label="Match debug">
          <header><strong>Debug</strong><button type="button" aria-label="Close debug panel" onClick={() => setDebugOpen(false)}>×</button></header>
          <div ref={setDebugCameraHost}/>
          {serverActionPanel || <p>No server options are currently offered to this viewer.</p>}
          <section aria-label="Movement plan details"><h3>Movement plan</h3>
            {routePreview ? <><p>{routePreview.steps.length} squares · {routePreview.remaining} remaining · revision {routePreview.revision}</p>
              <ol aria-label="Route square checks">{routePreview.steps.map((step, index) => <li key={`${index}-${step.x}-${step.y}`}>
                {step.x}, {step.y}: {step.dodge ? `dodge ${step.dodge}+` : 'no dodge'} · {step.rush ? `rush ${step.rush}+` : 'no rush'}{step.reactions.length ? ` · possible ${step.reactions.join(', ')}` : ''}
              </li>)}</ol></> : <p>No movement plan is prepared.</p>}
            {routeError && <p role="alert">{routeError}</p>}
          </section>
        </section>}
      {!hosted && <LivePitch view={view} selectedId={playerId} actions={view.actions} pinnedAction={pinnedAction}
        onSelectPlayer={selectPlayer} onSquare={selectSquare}/>}
      {!hosted && savePanel}
      {!hosted && view.prompt && <section aria-label="Pre-match choice"><h3>{view.prompt.kind === 'coin' ? 'Call the coin toss' : 'Choose to receive or kick'}</h3>
        {view.prompt.options.map(option => <button key={option} type="button" onClick={() => mutate('choice', { promptId: view.prompt!.id, optionId: option })} disabled={!connected || !!pending || suspended || view.prompt!.actor !== view.callerRole}>{option}</button>)}
      </section>}
      {!hosted && view.phase === 'READY_FOR_KICKOFF' && <p>Both teams have confirmed legal setups. The kicking participant can choose a server-issued kick target.</p>}
      {!hosted && view.phase === 'PLAY' && view.actions.length === 0 && <p role="alert">This engine decision does not yet have browser controls. The match remains in memory; reconnecting will preserve this decision.</p>}
      {!hosted && serverActionPanel}
      {!hosted && <>
      <p>{matchTeamName(view, 'home')} (H): x 0–12 · {matchTeamName(view, 'away')} (A): x 13–25. Line of scrimmage: x 12/13, y 4–10. Wide zones: y 0–3 and 11–14.</p>
      <p>Pitch keyboard controls: arrow keys move between squares; Enter selects a square or your player. Tab leaves the pitch. Selected square: {x}, {y}.</p>
      <div className="setup-grid" role="group" aria-label="Pitch grid">
        {Array.from({ length: 15 }, (_, row) => Array.from({ length: 26 }, (_, column) => {
          const player = view.players.find(item => item.x === column && item.y === row);
          const legal = !!playerId && canPlaceReserve(view, playerId, column, row);
          return <button key={`${column},${row}`} type="button" className={`${player?.role ?? ''} ${column === 12 || column === 13 ? 'los' : ''} ${row < 4 || row > 10 ? 'wide' : ''} ${legal && maySetup ? 'legal' : ''}`}
            tabIndex={column === Math.max(0, Math.min(25, x)) && row === Math.max(0, Math.min(14, y)) ? 0 : -1}
            onKeyDown={event => {
              const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
              if (!direction) return;
              event.preventDefault();
              const nextX = Math.max(0, Math.min(25, column + direction[0]));
              const nextY = Math.max(0, Math.min(14, row + direction[1]));
              setX(nextX); setY(nextY);
              (event.currentTarget.parentElement?.children[nextY * 26 + nextX] as HTMLButtonElement)?.focus();
            }}
            aria-label={`Square ${column}, ${row}${player ? ` ${player.role} ${player.name}` : ''}`} onClick={() => { setX(column); setY(row); if (player?.role === view.callerRole) setPlayerId(player.id); }} disabled={!connected}>
            {player ? `${player.role === 'home' ? 'H' : 'A'}${player.slot}` : '·'}{view.ball?.x === column && view.ball.y === row ? ' ●' : ''}
          </button>;
        }))}
      </div>
      </>}
      {!hosted && view.phase === 'SETUP' && <section aria-label="Placement controls"><h3>Set up {view.actor}</h3>
        <label>Player <select aria-label="Setup player" value={playerId} onChange={event => setPlayerId(event.target.value)} disabled={!maySetup}><option value="">Select</option>{own.map(player => <option key={player.id} value={player.id}>{player.name} #{player.slot}{player.x === null ? ' reserve' : ''}</option>)}</select></label>
        <label>X <input aria-label="Setup X" type="number" min="0" max="25" value={x} onChange={event => setX(Number(event.target.value))} disabled={!maySetup} /></label>
        <label>Y <input aria-label="Setup Y" type="number" min="0" max="14" value={y} onChange={event => setY(Number(event.target.value))} disabled={!maySetup} /></label>
        <button type="button" onClick={() => mutate('place', { playerId, to: { x, y } })} disabled={!maySetup || !canPlaceReserve(view, playerId, x, y)}>Place on empty own-half square</button>
        <button type="button" className="secondary" onClick={() => mutate('place', { playerId, to: null })} disabled={!maySetup || !own.some(player => player.id === playerId && player.x !== null)}>Return selected player to reserve</button>
        <button type="button" onClick={() => mutate('confirm')} disabled={!maySetup}>Confirm Setup</button>
      </section>}
      {!hosted && rosterTable}
    </section>);
}
