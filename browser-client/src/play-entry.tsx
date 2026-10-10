import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameView } from './SetupPanel.tsx';
import { BuilderPanel } from './BuilderPanel.tsx';
import { V2Client } from './v2-client.ts';
import type { V2Message } from './v2-client.ts';
import type { SavedTeamSummary } from './saved-team-protocol.ts';
import type { MatchResultMetadata, ReplayEvent } from './result-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import type { ChatMessage } from './chat-protocol.ts';
import type { RoutePoint, RoutePreview } from './route-protocol.ts';
import type { MovementPlan, MovementRange } from './movement-protocol.ts';
import { MovementRangeRead } from './movement-range-read.ts';
import { HostedResult } from './HostedResult.tsx';
import { Spectate } from './Spectate.tsx';
import { MatchupTeam } from './MatchupTeam.tsx';
import { currentMatchStatus } from './current-matches-protocol.ts';
import type { CurrentMatch } from './current-matches-protocol.ts';
import { LobbyConcession } from './lobby-concession.ts';
import type { ConcessionStatus } from './lobby-concession.ts';
import './play-brand.css';

const transferredMatchKey = 'moles.play.open-match';

export function mountPlay(element: HTMLElement, options: { url: string; getToken: () => Promise<string> }) {
  const root = createRoot(element);
  root.render(<Play options={options} />);
  return () => root.unmount();
}

export function mountBuilder(element: HTMLElement, options: { url: string; getToken: () => Promise<string> }) {
  const root = createRoot(element);
  root.render(<BuilderPanel options={options} />);
  return () => root.unmount();
}

export function mountSpectate(element: HTMLElement, options: { url: string; getToken: () => Promise<string> }) {
  const root = createRoot(element);
  root.render(<Spectate options={options} />);
  return () => root.unmount();
}

function Play({ options }: { options: { url: string; getToken: () => Promise<string> } }) {
  const matchRoute = location.pathname === '/play/match';
  const resultRoute = location.pathname === '/play/result';
  const watchRoute = matchRoute && new URLSearchParams(location.search).get('watch') === '1';
  const [, redraw] = useState(0);
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const [setupErrors, setSetupErrors] = useState<string[]>([]);
  const [teams, setTeams] = useState<SavedTeamSummary[]>([]);
  const [playMode, setPlayMode] = useState<'human' | 'computer'>('human');
  const [computerAvailable, setComputerAvailable] = useState(false);
  const [computerId, setComputerId] = useState('coach-bugman-random');
  const [teamId, setTeamId] = useState('');
  const [computerTeamId, setComputerTeamId] = useState('');
  const [invite, setInvite] = useState(() => new URLSearchParams(location.search).get('invite') ?? sessionStorage.getItem('moles.play.invitation') ?? '');
  const [matchId, setMatchId] = useState(() => new URLSearchParams(location.search).get('matchId') ?? '');
  const [prepared, setPrepared] = useState<V2Message | null>(null);
  const [currentMatches, setCurrentMatches] = useState<CurrentMatch[]>([]);
  const [currentMatchesLoading, setCurrentMatchesLoading] = useState(false);
  const [currentMatchesError, setCurrentMatchesError] = useState('');
  const currentMatchesRequestRef = useRef<string | null>(null);
  const currentMatchesBufferRef = useRef<CurrentMatch[]>([]);
  const currentMatchesRefreshRef = useRef(false);
  const [confirmConcession, setConfirmConcession] = useState<string | null>(null);
  const [concessionStatus, setConcessionStatus] = useState<ConcessionStatus>({ matchId: null, busy: false, text: '' });
  const concessionRef = useRef<LobbyConcession | null>(null);
  const [result, setResult] = useState<MatchResultMetadata | null>(null);
  const [replayEvent, setReplayEvent] = useState<ReplayEvent | null>(null);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [resultPending, setResultPending] = useState(false);
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [logRecords, setLogRecords] = useState<TranscriptRecord[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logUnavailable, setLogUnavailable] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(matchRoute || resultRoute);
  const [chatUnavailable, setChatUnavailable] = useState(false);
  const [chatSendError, setChatSendError] = useState('');
  const [chatSent, setChatSent] = useState<{ text: string; id: string } | null>(null);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const chatRequestRef = useRef<string | null>(null);
  const chatSendRef = useRef<string | null>(null);
  const chatLoadedRef = useRef(0);
  const chatTotalRef = useRef(0);
  const chatInitializedRef = useRef(false);
  const chatUnavailableRef = useRef(false);
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routeError, setRouteError] = useState('');
  const routeRequestRef = useRef<string | null>(null);
  const [movementPlan, setMovementPlan] = useState<MovementPlan | null>(null);
  const [movementError, setMovementError] = useState('');
  const movementRequestRef = useRef<{ id: string; revision: number } | null>(null);
  const [rangeResult, setRangeResult] = useState<{ matchId: string; range: MovementRange } | null>(null);
  const rangeRead = useRef(new MovementRangeRead());
  const logRecordsRef = useRef<TranscriptRecord[]>([]);
  const logRequestRef = useRef<string | null>(null);
  const logUnavailableRef = useRef(false);
  const [transferredMatchId, setTransferredMatchId] = useState(() => {
    if (location.pathname !== '/play') { sessionStorage.removeItem(transferredMatchKey); return ''; }
    const saved = sessionStorage.getItem(transferredMatchKey);
    return saved && matchIdPattern.test(saved) ? saved : '';
  });
  const client = useRef<V2Client | null>(null);
  const activationWindow = useRef<{ requestId: string; matchId: string; popup: Window | null } | null>(null);
  useEffect(() => {
    const updateFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);
  useEffect(() => {
    const requestCurrentMatches = (after: string | null = null) => {
      if (matchRoute || resultRoute || !connection.accountId) return;
      if (currentMatchesRequestRef.current) { currentMatchesRefreshRef.current = true; return; }
      try {
        if (after === null) currentMatchesBufferRef.current = [];
        currentMatchesRequestRef.current = connection.request('currentMatches', { after });
        setCurrentMatchesLoading(true); setCurrentMatchesError('');
      } catch { setCurrentMatchesLoading(false); setCurrentMatchesError('Reconnect to refresh your current games.'); }
    };
    const requestChat = (from = chatLoadedRef.current) => {
      if (!(matchRoute || resultRoute) || !matchIdPattern.test(matchId) || chatRequestRef.current || chatUnavailableRef.current) return;
      try { chatRequestRef.current = connection.request('matchChat', { operation: 'load', matchId, from, limit: 32 }); setChatLoading(true); }
      catch { setChatLoading(false); }
    };
    const addChat = (messages: ChatMessage[]) => {
      const indexed = new Map(chatMessagesRef.current.map(message => [message.index, message]));
      messages.forEach(message => indexed.set(message.index, message));
      chatMessagesRef.current = [...indexed.values()].sort((left, right) => left.index - right.index);
      setChatMessages(chatMessagesRef.current);
    };
    const requestLog = (from: number) => {
      if (!(matchRoute || resultRoute) || !matchIdPattern.test(matchId) || logRequestRef.current || logUnavailableRef.current) return;
      try {
        logRequestRef.current = connection.request('matchTranscript', { matchId, from, limit: 8 });
        setLogLoading(true);
      } catch { setLogLoading(false); }
    };
    const connection = new V2Client({ ...options, storage: sessionStorage,
      initialMatch: matchRoute && matchIdPattern.test(matchId) ? { matchId, watch: watchRoute } : undefined,
      onChange: message => {
      if (concessionRef.current?.receive(message)) requestCurrentMatches();
      if (message.type === 'status') {
        currentMatchesRequestRef.current = null; currentMatchesRefreshRef.current = false;
        setCurrentMatches([]); setCurrentMatchesLoading(false);
        logRequestRef.current = null; setLogLoading(false);
        chatRequestRef.current = null; chatSendRef.current = null; chatInitializedRef.current = false; setChatLoading(false);
        routeRequestRef.current = null; setRoutePreview(null); setRouteError('');
        if (message.code === 'DISCONNECTED') { activationWindow.current?.popup?.close(); activationWindow.current = null; }
        setComputerAvailable(false);
        setStatus(message.code === 'CONNECTING' ? 'Connecting' : 'Disconnected'); setTeams([]); setPrepared(null); setResult(null); setReplayEvent(null); setReplayIndex(null); setResultPending(false);
      }
      if (message.type === 'authentication') { setStatus('Connected'); setError(''); logUnavailableRef.current = false; setLogUnavailable(false);
        requestCurrentMatches();
        if (resultRoute && matchIdPattern.test(matchId)) { connection.request('matchResult', { operation: 'load', matchId }); setResultPending(true); }
        if (!matchRoute && !resultRoute) connection.request('computer', { operation: 'status' }); }
      if (message.type === 'currentMatches' && message.requestId === currentMatchesRequestRef.current) {
        currentMatchesRequestRef.current = null;
        currentMatchesBufferRef.current.push(...message.matches);
        if (message.next !== null) requestCurrentMatches(message.next);
        else {
          setCurrentMatches(currentMatchesBufferRef.current); setCurrentMatchesLoading(false);
          if (currentMatchesRefreshRef.current) { currentMatchesRefreshRef.current = false; requestCurrentMatches(); }
        }
      }
      const currentMatchesFailure = message.type === 'error' && currentMatchesRequestRef.current !== null
        && message.requestId === currentMatchesRequestRef.current;
      if (currentMatchesFailure) {
        currentMatchesRequestRef.current = null; setCurrentMatchesLoading(false);
        setCurrentMatchesError('Your current games could not be refreshed. Try again after reconnecting.');
        if (currentMatchesRefreshRef.current) { currentMatchesRefreshRef.current = false; requestCurrentMatches(); }
      }
      if (message.type === 'computer' && ['READY', 'UNAVAILABLE'].includes(message.code)) {
        setComputerAvailable(message.code === 'READY');
      }
      if (message.type === 'setupState' && message.state?.matchId === matchId && !logRequestRef.current
        && logRecordsRef.current.length <= message.state.revision) requestLog(logRecordsRef.current.length);
      if (message.type === 'setupState' && message.state?.matchId === matchId && !chatInitializedRef.current) requestChat();
      if (message.type === 'setupState') setSetupErrors(message.code === 'ILLEGAL_SETUP'
        ? message.setupErrors?.length ? message.setupErrors : ['This setup is not legal. Adjust the formation and confirm again.'] : []);
      const chatFailure = message.type === 'error' && (chatRequestRef.current !== null && message.requestId === chatRequestRef.current
        || chatSendRef.current !== null && message.requestId === chatSendRef.current);
      if (message.type === 'matchChat' && message.matchId === matchId) {
        addChat(message.page.messages);
        chatTotalRef.current = message.page.total;
        if (message.requestId === chatRequestRef.current) {
          chatRequestRef.current = null; chatLoadedRef.current = message.page.next; chatInitializedRef.current = true;
          if (chatLoadedRef.current < chatTotalRef.current) requestChat();
          else setChatLoading(false);
        } else if (message.requestId !== null && message.page.messages.length === 1
          && message.page.messages[0].authorId === connection.accountId) {
          chatSendRef.current = null; setChatSendError('');
          setChatSent({ text: message.page.messages[0].text, id: message.requestId });
        }
        if (!chatRequestRef.current && chatLoadedRef.current < chatTotalRef.current) requestChat();
      }
      if (message.type === 'error' && chatRequestRef.current !== null && message.requestId === chatRequestRef.current) {
        chatRequestRef.current = null; setChatLoading(false);
        if (['CHAT_UNAVAILABLE', 'REPLAY_UNSUPPORTED'].includes(message.code)) {
          chatUnavailableRef.current = true; setChatUnavailable(true);
        }
      }
      if (message.type === 'error' && chatSendRef.current !== null && message.requestId === chatSendRef.current) {
        chatSendRef.current = null; setChatSendError(message.code.replaceAll('_', ' '));
      }
      const routeFailure = routeRequestRef.current !== null && message.type === 'error' && message.requestId === routeRequestRef.current;
      const movementFailure = message.type === 'error' && message.requestId === movementRequestRef.current?.id;
      const rangeFailure = message.type === 'error' && rangeRead.current.isRead(message.requestId);
      if (message.type === 'movementRange') {
        const current = rangeRead.current.expects(message.requestId);
        const range = rangeRead.current.accept({ requestId: message.requestId,
          matchId: message.matchId, range: message.range }, connection.state);
        if (current) setRangeResult(range ? { matchId: message.matchId, range } : null);
      }
      if (rangeFailure) {
        const current = rangeRead.current.expects(message.requestId);
        rangeRead.current.finish(message.requestId);
        if (current) setRangeResult(null);
      }
      if (message.type === 'movementPreview' && message.requestId === movementRequestRef.current?.id) {
        movementRequestRef.current = null; setMovementPlan(message.plan); setMovementError('');
      }
      if (message.type === 'error' && message.requestId === movementRequestRef.current?.id) {
        movementRequestRef.current = null; setMovementPlan(null); setMovementError(message.code.replaceAll('_', ' '));
      }
      if (message.type === 'setupState' && message.state) {
        const revision = message.state.revision;
        setMovementPlan(plan => plan?.route.revision === revision ? plan : null);
        if (movementRequestRef.current?.revision !== revision) movementRequestRef.current = null;
        rangeRead.current.invalidate(message.state);
        setRangeResult(result => result && result.matchId === message.state.matchId && result.range.revision === revision ? result : null);
      }
      if (message.type === 'status' && message.code === 'DISCONNECTED') {
        movementRequestRef.current = null;
        setMovementPlan(null); setMovementError('');
        rangeRead.current.reset(); setRangeResult(null);
      }
      if (message.type === 'routePreview' && message.requestId === routeRequestRef.current) {
        routeRequestRef.current = null; setRoutePreview(message.route); setRouteError('');
      }
      if (message.type === 'error' && message.requestId === routeRequestRef.current) {
        routeRequestRef.current = null; setRoutePreview(null); setRouteError(message.code.replaceAll('_', ' '));
      }
      if (message.type === 'matchTranscript' && message.requestId === logRequestRef.current) {
        logRequestRef.current = null;
        const page = message.page;
        if (page.from !== logRecordsRef.current.length || page.next <= page.from && page.next < page.total) throw Error('Transcript page gap');
        logRecordsRef.current = [...logRecordsRef.current, ...page.records];
        setLogRecords(logRecordsRef.current);
        setLogLoading(false);
        if (page.next < Math.max(page.total, (connection.state?.revision ?? -1) + 1)) requestLog(page.next);
      }
      if (message.type === 'error' && message.requestId === logRequestRef.current) {
        logRequestRef.current = null; logUnavailableRef.current = true; setLogUnavailable(true); setLogLoading(false);
      }
      const failedLaunch = message.type === 'error' && activationWindow.current?.requestId === message.requestId ? activationWindow.current : null;
      if (failedLaunch) { failedLaunch.popup?.close(); activationWindow.current = null; }
      if (resultRoute && message.type === 'error') setResultPending(false);
      if (message.type === 'matchResult') {
        setResultPending(false);
        if (message.code === 'ACCEPTED') {
          if (message.result?.formatVersion >= 2 && !logRequestRef.current
            && logRecordsRef.current.length < message.result.eventCount) requestLog(logRecordsRef.current.length);
          if (message.result?.formatVersion === 3 && !chatInitializedRef.current) requestChat();
          else if (message.result?.formatVersion < 3) { chatUnavailableRef.current = true; setChatUnavailable(true); setChatLoading(false); }
          setResult(message.result);
          if (message.event) { setReplayEvent(message.event); setReplayIndex(message.event.revision); }
          else { setReplayEvent(null); setReplayIndex(null); }
          setError('');
        }
      }
      if (message.code === 'VIEW_UNAVAILABLE' || message.code === 'NOT_FOUND') { setPrepared(null); setInvite(''); }
      if (message.type === 'savedTeam' && message.code === 'OK') {
        if (message.document) connection.request('savedTeam', { operation: 'list' });
        else if (Array.isArray(message.teams)) {
          setTeams(message.teams);
          const current = (previous: string) => message.teams.some((team: SavedTeamSummary) => team.teamId === previous && team.eligibility === 'CURRENT')
            ? previous : message.teams.find((team: SavedTeamSummary) => team.eligibility === 'CURRENT')?.teamId || '';
          setTeamId(current); setComputerTeamId(current);
        }
      }
      if (message.type === 'preparedMatch' && ['STALE_TEAM_REVISION', 'NOT_FOUND', 'MIGRATION_REQUIRED', 'VERSION_UNAVAILABLE', 'VALIDATION_FAILED'].includes(message.code))
        connection.request('savedTeam', { operation: 'list' });
      if (message.type === 'preparedMatch') {
        const launch = activationWindow.current?.requestId === message.requestId ? activationWindow.current : null;
        if (launch) activationWindow.current = null;
        if (message.code === 'ACCEPTED') {
          sessionStorage.removeItem('moles.play.invitation');
          setPrepared(message); setMatchId(message.document.matchId);
          requestCurrentMatches();
          setInvite(message.invitationCode ?? '');
          if (launch) {
            if (message.document.lifecycle === 'ACTIVATED' && message.document.matchId === launch.matchId) {
              const url = matchUrl(launch.matchId, false);
              let opened = false;
              if (launch.popup && !launch.popup.closed) {
                transferToMatch(launch.matchId, connection);
                try { launch.popup.location.replace(url); opened = true; } catch { /* Fall back to the current tab. */ }
              }
              if (!opened) location.assign(url);
            } else launch.popup?.close();
          }
        } else launch?.popup?.close();
      }
      if (message.code && !['ACCEPTED', 'OK', 'CONNECTING', 'DISCONNECTED'].includes(message.code)
        && !routeFailure
        && !movementFailure
        && !rangeFailure
        && !currentMatchesFailure
        && !chatFailure
        && !(message.type === 'error' && message.code === 'REPLAY_UNSUPPORTED')
        && !['READY', 'INVITED', 'UNAVAILABLE', 'ILLEGAL_SETUP'].includes(message.code)) setError(message.code === 'NOT_FOUND' && matchRoute
          ? 'This match is unavailable for this account. Return to game setup and choose one of your current games.'
          : message.code.replaceAll('_', ' '));
      redraw(value => value + 1);
    } });
    const refresh = () => { if (connection.accountId) { connection.request('savedTeam', { operation: 'list' }); requestCurrentMatches(); } };
    window.addEventListener('focus', refresh);
    const currentMatchesTimer = window.setInterval(requestCurrentMatches, 30_000);
    client.current = connection;
    concessionRef.current = new LobbyConcession(connection, setConcessionStatus);
    if (!matchRoute && !resultRoute && connection.pending?.request.type === 'setup' && connection.pending.request.operation !== 'concede')
      location.replace(matchUrl(connection.pending.request.matchId, false));
    else if ((matchRoute || resultRoute) && !matchIdPattern.test(matchId)) setError('Enter a valid match ID.');
    else if (matchRoute && connection.pending?.request.type === 'setup' && (connection.pending.request.matchId !== matchId || watchRoute))
      location.replace(matchUrl(connection.pending.request.matchId, false));
    else if (!matchRoute && !resultRoute && transferredMatchId) setStatus('Match opened in another tab or window');
    else connection.connect();
    return () => { window.clearInterval(currentMatchesTimer); window.removeEventListener('focus', refresh); activationWindow.current?.popup?.close(); activationWindow.current = null; client.current = null; connection.disconnect(); concessionRef.current = null; };
  }, [options]);
  const connection = client.current;
  const connected = status === 'Connected';
  const preparationTransferred = !!transferredMatchId && !matchRoute && !resultRoute;
  const busy = !connected || !!connection?.pending || concessionStatus.busy;
  const selected = teams.find(team => team.teamId === teamId && team.eligibility === 'CURRENT');
  const selectedComputer = teams.find(team => team.teamId === computerTeamId && team.eligibility === 'CURRENT');
  function transferToMatch(id: string, connection: V2Client) {
    try { sessionStorage.setItem(transferredMatchKey, id); } catch { /* The current page still disconnects. */ }
    setTransferredMatchId(id);
    connection.disconnect();
  }
  function reconnectPreparation() {
    sessionStorage.removeItem(transferredMatchKey);
    setTransferredMatchId('');
    client.current?.connect();
  }
  function run(action: () => void) { try { setError(''); action(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Request could not be sent.'); } }
  function prepare(operation: string) {
    const fields = operation === 'create' ? { teamId, expectedDocumentVersion: selected?.documentVersion }
      : operation === 'join' ? { invitationCode: invite, teamId, expectedDocumentVersion: selected?.documentVersion }
      : { matchId };
    run(() => connection?.request('preparedMatch', { operation, ...fields }, operation !== 'load'));
  }
  function startComputer() {
    run(() => {
      if (!selected || !selectedComputer) throw Error('Choose both saved teams first.');
      if (!connection?.request('preparedMatch', { operation: 'createComputer', teamId: selected.teamId,
        expectedDocumentVersion: selected.documentVersion, computerId,
        computerTeamId: selectedComputer.teamId,
        expectedComputerDocumentVersion: selectedComputer.documentVersion }, true))
        throw Error('Reconnect before creating a game.');
    });
  }
  function startGame(newWindow = false) {
    // Explicit new windows must reserve their context before the activation reply.
    let popup: Window | null = null;
    try {
      if (newWindow) {
        popup = window.open('', '_blank', 'popup=yes,width=1440,height=900,menubar=no,toolbar=no,location=no,status=no');
        if (popup) {
          popup.opener = null;
          popup.name = 'moles.play.launched-window';
          popup.document.title = 'Starting game';
          popup.document.body.textContent = 'Waiting for the game server to confirm activation…';
        }
      }
    } catch { popup?.close(); popup = null; }
    try {
      setError('');
      const requestId = connection?.request('preparedMatch', { operation: 'activate', matchId, expectedRevision: prepared?.document.documentVersion }, true);
      if (!requestId) throw Error('Reconnect before starting the game.');
      activationWindow.current = { requestId, matchId, popup };
    } catch (failure) {
      popup?.close();
      setError(failure instanceof Error ? failure.message : 'Game activation could not be sent.');
    }
  }
  function exitMatch() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    if (window.name === 'moles.play.launched-window') {
      window.close();
      if (window.closed) return;
    }
    location.assign(watchRoute ? '/spectate' : '/play');
  }
  function toggleFullscreen() {
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    void request.catch(() => setError('Fullscreen is unavailable in this browser window.'));
  }
  return <main className={`play-runtime setup-panel${matchRoute || resultRoute ? ' live-match-page' : ''}`}>
    {!matchRoute && <div className={resultRoute ? 'match-page-top' : undefined}>
      <h1>{resultRoute ? 'Match result' : 'Create a game'}</h1>{(resultRoute || !connected || preparationTransferred) && <p role="status">{preparationTransferred ? 'Match opened in another tab or window' : status}</p>}{error && <p role="alert">{error}</p>}
      {!connected && !preparationTransferred && <button onClick={() => connection?.connect()}>Reconnect</button>}
      {resultRoute && connected && <button onClick={() => connection?.disconnect()}>Disconnect</button>}
      {preparationTransferred && <button onClick={reconnectPreparation}>Reconnect preparation here</button>}
      {resultRoute && <a href="/play">Match preparation and games</a>}
    </div>}
    {matchRoute && !connection?.state && <section className="match-connect-panel" aria-label="Match connection"><h1>Match</h1><p role="status">{status}</p>{error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => connection?.connect()} disabled={connected}>Reconnect</button><button type="button" onClick={exitMatch}>Exit match</button></section>}
    {connection?.recoveryPending && <section><p>A submitted change needs confirmation. Reconnect with the same account and repeat the exact request.</p><button disabled={!connected || connection.pending?.accountId !== connection.accountId} onClick={() => run(() => connection.retry())}>Repeat retained request</button></section>}
    {preparationTransferred && <section aria-label="Match opened elsewhere"><p>The match is open in another tab or window. Reconnecting preparation here will disconnect that match window.</p><a href={matchUrl(transferredMatchId, false)}>Continue the match in this tab</a></section>}
    {!matchRoute && !resultRoute && <>

    <label>Play mode <select value={playMode} onChange={event => setPlayMode(event.target.value as 'human' | 'computer')}>
      <option value="human">Play against a human opponent</option>
      <option value="computer">Play against a computer opponent</option>
    </select></label>
    {playMode === 'human' && <section aria-label="Match preparation"><h2>Your game</h2>
      <p>Need a new roster? <a href="/teambuilder">Open Team Builder</a>, validate it, and save the resulting team definition before creating a game.</p>
      <label>Saved team <select value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">Choose a team</option>{teams.map(team => <option key={team.teamId} value={team.teamId} disabled={team.eligibility !== 'CURRENT'}>{team.teamName || 'Unnamed older team'} · {team.rosterId || 'Unknown roster'} · version {team.documentVersion}{team.eligibility !== 'CURRENT' ? ` · unavailable: ${team.eligibility}` : ''}</option>)}</select></label>
      <button disabled={!connected} onClick={() => run(() => connection?.request('savedTeam', { operation: 'list' }))}>Refresh teams</button>
      <button disabled={busy || !selected} onClick={() => prepare('create')}>Create game</button>
      <label>Invitation code <input value={invite} onChange={event => setInvite(event.target.value)} autoComplete="off" /></label>
      <button disabled={busy || !selected || !invite} onClick={() => prepare('join')}>Join game</button>
      {prepared?.callerRole === 'home' && invite && <p><a href={`/play?invite=${encodeURIComponent(invite)}`}>Invitation link</a> — share with your opponent. Expires after one hour.</p>}
      {prepared?.callerRole === 'home' && prepared.document.lifecycle !== 'ACTIVATED' && <><button disabled={busy} onClick={() => prepare('reissue')}>Refresh invitation</button><button disabled={busy} onClick={() => prepare('release')}>Release disconnected opponent</button></>}
    </section>}
    {playMode === 'computer' && <section aria-label="Computer opponent"><h2>Computer opponent</h2>
      <label>Opponent <select value={computerId} onChange={event => setComputerId(event.target.value)}><option value="coach-bugman-random">Coach Bugman - Random</option></select></label>
      <label>Your saved team <select value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">Choose your team</option>{teams.map(team => <option key={team.teamId} value={team.teamId} disabled={team.eligibility !== 'CURRENT'}>{team.teamName || 'Unnamed older team'} · {team.rosterId || 'Unknown roster'}</option>)}</select></label>
      <label>Roster for Bugman's Best <select value={computerTeamId} onChange={event => setComputerTeamId(event.target.value)}><option value="">Choose a roster to clone</option>{teams.map(team => <option key={team.teamId} value={team.teamId} disabled={team.eligibility !== 'CURRENT'}>{team.teamName || 'Unnamed older team'} · {team.rosterId || 'Unknown roster'}</option>)}</select></label>
      <p>Bugman receives an independent copy of the selected roster named Bugman's Best.</p>
      <button disabled={!connected} onClick={() => run(() => connection?.request('savedTeam', { operation: 'list' }))}>Refresh teams</button>
      <button disabled={!connected} onClick={() => run(() => connection?.request('computer', { operation: 'status' }))}>Refresh computer availability</button>
      {!computerAvailable && connected && <p>The computer opponent process is currently unavailable.</p>}
      <button disabled={busy || !selected || !selectedComputer || !computerAvailable} onClick={startComputer}>Create computer game</button>
    </section>}
    <section aria-label="Current game"><h2>Current game</h2>
      <label>Match ID <input value={matchId} onChange={event => setMatchId(event.target.value)} /></label>
      <button disabled={!connected || !matchId} onClick={() => prepare('load')}>Reload game setup</button>
      <button disabled={busy || !matchId} onClick={() => run(() => location.assign(matchUrl(matchId, false)))}>Resume play</button>
      {prepared?.document.lifecycle === 'AWAITING_SETUP' && <>
        <button disabled={busy} onClick={() => startGame()}>Start game</button>
        <button disabled={busy} onClick={() => startGame(true)}>Start game in a new window</button>
      </>}
      {prepared?.document.lifecycle === 'ACTIVATED' && <p role="status">Game ready. <a href={matchUrl(prepared.document.matchId, false)}>Continue in this tab</a> · <a href={matchUrl(prepared.document.matchId, false)} target="_blank" rel="noopener" onClick={() => transferToMatch(prepared.document.matchId, connection!)}>Open match in a new tab or window</a></p>}
    </section>
    <section className="current-games spectate-section" aria-label="Your current games"><div className="spectate-section-heading"><h2>Your current games</h2>
      <button disabled={!connected || currentMatchesLoading} onClick={() => run(() => {
        currentMatchesBufferRef.current = [];
        currentMatchesRequestRef.current = connection!.request('currentMatches', { after: null });
        setCurrentMatchesLoading(true); setCurrentMatchesError('');
      })}>Refresh games</button></div>
      {currentMatchesLoading && <p role="status">Loading your games…</p>}
      {currentMatchesError && <p role="alert">{currentMatchesError}</p>}
      {concessionStatus.text && <p role="status">{concessionStatus.text}</p>}
      {connected && !currentMatchesLoading && !currentMatchesError && currentMatches.length === 0 && <p>You have no unfinished games.</p>}
      <ul className="spectate-games">{currentMatches.map(game => <li key={game.matchId}>
        <article className="spectate-game" aria-label={`${game.homeTeamName ?? 'Unavailable game'}${game.awayTeamName ? ` vs. ${game.awayTeamName}` : ''}`}>
          <div className="spectate-game-top"><strong className="current-game-status">{currentMatchStatus(game)}</strong></div>
          <div className="spectate-matchup">
            <MatchupTeam name={game.homeTeamName ?? 'Unavailable game'} side="home">
              {game.homeTeamName && <p>{game.callerRole === 'home' ? 'Your team' : 'Opponent'}</p>}
            </MatchupTeam>
            <div className="spectate-score"><span className="spectate-versus">vs.</span></div>
            <MatchupTeam name={game.awayTeamName ?? (game.lifecycle === 'UNAVAILABLE' ? 'Unavailable team' : 'Waiting for opponent')} side="away">
              {game.awayTeamName && <p>{game.callerRole === 'away' ? 'Your team' : 'Opponent'}</p>}
            </MatchupTeam>
          </div>
          <div className="spectate-game-bottom"><div className="spectate-game-meta">
            {game.homeTeamName && <span>Your team: {game.callerRole === 'home' ? game.homeTeamName : game.awayTeamName}<br/>
              Opponent: {(game.callerRole === 'home' ? game.awayTeamName : game.homeTeamName) ?? 'Waiting for opponent'}</span>}
            <details><summary>Game ID</summary><code>{game.matchId}</code></details>
          </div><div className="current-game-actions">
            {game.lifecycle === 'ACTIVATED' ? <a className="button" href={matchUrl(game.matchId, false)}>Resume</a>
              : game.lifecycle === 'UNAVAILABLE' ? <span>Refresh to try again</span>
              : <button disabled={busy} onClick={() => run(() => connection!.request('preparedMatch', { operation: 'load', matchId: game.matchId }))}>Continue setup</button>}
            {game.lifecycle === 'ACTIVATED' && <button className="secondary" disabled={busy} onClick={() => setConfirmConcession(game.matchId)}>Concede</button>}
          </div></div>
          {game.lifecycle === 'ACTIVATED' && confirmConcession === game.matchId && <div className="current-game-concession" role="group" aria-label="Confirm concession">
            <p>Concede this match? This cannot be undone.</p>
            <button disabled={busy} onClick={() => run(() => { concessionRef.current!.begin(game.matchId, prepared?.document.matchId ?? null); setConfirmConcession(null); })}>Confirm concession</button>
            <button className="secondary" onClick={() => setConfirmConcession(null)}>Keep playing</button>
          </div>}
        </article>
      </li>)}</ul>
    </section>
    </>}
    {matchRoute && connection?.state && <GameView key={connection.state.matchId} hosted results={connection.state.callerRole !== 'spectator'} resultUrl={`/play/result?matchId=${encodeURIComponent(connection.state.matchId)}`} view={connection.state} connected={connected} pending={connection.pending?.request.requestId ?? null}
      matchControls={{ fullscreen, toggleFullscreen, exitMatch, reconnect: () => connection.connect(), error }}
      acceptedActionId={connection.lastAcceptedActionId}
      logRecords={logRecords} logLoading={logLoading} logUnavailable={logUnavailable}
      chatMessages={chatMessages} chatLoading={chatLoading} chatUnavailable={chatUnavailable} chatSendError={chatSendError} chatSent={chatSent}
      chatSending={connection.pending?.request.type === 'matchChat'} sendChat={text => run(() => {
        setChatSendError(''); chatSendRef.current = connection.request('matchChat', { operation: 'send', matchId, text }, true);
      })}
      routePreview={routePreview} routeError={routeError} setupErrors={setupErrors}
      movementPlan={movementPlan} movementError={movementError}
      movementRange={rangeResult && rangeResult.matchId === connection.state?.matchId ? rangeResult.range : null}
      requestMovementRange={playerId => {
        rangeRead.current.clear(); setRangeResult(null);
        const state = connection.state;
        if (playerId && state) {
          try {
            const id = connection.request('movementRange', { matchId: state.matchId,
              expectedRevision: state.revision, playerId });
            rangeRead.current.begin(id, state, playerId);
          } catch { /* Guidance can be unavailable without interrupting an action. */ }
        }
      }}
      requestMovementPreview={intent => run(() => {
        movementRequestRef.current = null; setMovementPlan(null); setMovementError('');
        if (intent) {
          const state = connection.state!;
          const id = connection.request('movementPreview', { matchId: state.matchId, expectedRevision: state.revision, ...intent });
          movementRequestRef.current = { id, revision: state.revision };
        }
      })}
      requestRoutePreview={points => run(() => {
        setRoutePreview(null); setRouteError(''); routeRequestRef.current = null;
        if (points.length) routeRequestRef.current = connection.request('routePreview', {
          matchId: connection.state!.matchId, expectedRevision: connection.state!.revision, waypoints: points });
      })}
      mutate={(operation, fields = {}) => run(() => { const state = connection.state!; connection.request('setup', { operation, matchId: state.matchId, expectedRevision: state.revision, ...fields }, true); })} />}
    {resultRoute && <HostedResult matchId={matchId} result={result} event={replayEvent} index={replayIndex} pending={resultPending} connected={connected}
      logRecords={logRecords} logLoading={logLoading} logUnavailable={logUnavailable}
      chatMessages={chatMessages} chatLoading={chatLoading} chatUnavailable={chatUnavailable}
      onLoad={() => run(() => { connection!.request('matchResult', { operation: 'load', matchId }); setResultPending(true); })}
      onReplay={index => run(() => { connection!.request('matchResult', { operation: 'replay', matchId, index }); setResultPending(true); })}/>}
  </main>;
}

const matchIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function matchUrl(matchId: string, watch: boolean) {
  if (!matchIdPattern.test(matchId)) throw Error('Enter a valid match ID.');
  return `/play/match?matchId=${encodeURIComponent(matchId)}${watch ? '&watch=1' : ''}`;
}
