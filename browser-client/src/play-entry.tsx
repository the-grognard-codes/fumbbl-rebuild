import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameView } from './SetupPanel.tsx';
import { BuilderPanel } from './BuilderPanel.tsx';
import { V2Client } from './v2-client.ts';
import type { V2Message } from './v2-client.ts';
import type { SavedTeamSummary } from './saved-team-protocol.ts';
import type { MatchResultMetadata, ReplayEvent } from './result-protocol.ts';
import { HostedResult } from './HostedResult.tsx';
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

function Play({ options }: { options: { url: string; getToken: () => Promise<string> } }) {
  const matchRoute = location.pathname === '/play/match';
  const resultRoute = location.pathname === '/play/result';
  const watchRoute = matchRoute && new URLSearchParams(location.search).get('watch') === '1';
  const [, redraw] = useState(0);
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const [games, setGames] = useState<{ matchId: string; label: string }[]>([]);
  const [teams, setTeams] = useState<SavedTeamSummary[]>([]);
  const [teamId, setTeamId] = useState('');
  const [invite, setInvite] = useState(() => new URLSearchParams(location.search).get('invite') ?? sessionStorage.getItem('moles.play.invitation') ?? '');
  const [matchId, setMatchId] = useState(() => new URLSearchParams(location.search).get('matchId') ?? '');
  const [prepared, setPrepared] = useState<V2Message | null>(null);
  const [result, setResult] = useState<MatchResultMetadata | null>(null);
  const [replayEvent, setReplayEvent] = useState<ReplayEvent | null>(null);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [resultPending, setResultPending] = useState(false);
  const [transferredMatchId, setTransferredMatchId] = useState(() => {
    if (location.pathname !== '/play') { sessionStorage.removeItem(transferredMatchKey); return ''; }
    const saved = sessionStorage.getItem(transferredMatchKey);
    return saved && matchIdPattern.test(saved) ? saved : '';
  });
  const client = useRef<V2Client | null>(null);
  const activationWindow = useRef<{ requestId: string; matchId: string; popup: Window | null } | null>(null);
  useEffect(() => {
    const connection = new V2Client({ ...options, storage: sessionStorage,
      initialMatch: matchRoute && matchIdPattern.test(matchId) ? { matchId, watch: watchRoute } : undefined,
      onChange: message => {
      if (message.type === 'status') {
        if (message.code === 'DISCONNECTED') { activationWindow.current?.popup?.close(); activationWindow.current = null; }
        setStatus(message.code === 'CONNECTING' ? 'Connecting' : 'Disconnected'); setGames([]); setTeams([]); setPrepared(null); setResult(null); setReplayEvent(null); setReplayIndex(null); setResultPending(false);
      }
      if (message.type === 'authentication') { setStatus('Connected'); setError(''); if (resultRoute && matchIdPattern.test(matchId)) { connection.request('matchResult', { operation: 'load', matchId }); setResultPending(true); } }
      const failedLaunch = message.type === 'error' && activationWindow.current?.requestId === message.requestId ? activationWindow.current : null;
      if (failedLaunch) { failedLaunch.popup?.close(); activationWindow.current = null; }
      if (resultRoute && message.type === 'error') setResultPending(false);
      if (message.type === 'matchResult') {
        setResultPending(false);
        if (message.code === 'ACCEPTED') {
          setResult(message.result);
          if (message.event) { setReplayEvent(message.event); setReplayIndex(message.event.revision); }
          else { setReplayEvent(null); setReplayIndex(null); }
          setError('');
        }
      }
      if (message.code === 'VIEW_UNAVAILABLE' || message.code === 'NOT_FOUND') { setPrepared(null); setInvite(''); }
      if (message.type === 'browse' && Array.isArray(message.matches)) setGames(message.matches);
      if (message.type === 'savedTeam' && message.code === 'OK') {
        if (message.document) connection.request('savedTeam', { operation: 'list' });
        else if (Array.isArray(message.teams)) { setTeams(message.teams); setTeamId(previous => message.teams.some((team: SavedTeamSummary) => team.teamId === previous && team.eligibility === 'CURRENT') ? previous : message.teams.find((team: SavedTeamSummary) => team.eligibility === 'CURRENT')?.teamId || ''); }
      }
      if (message.type === 'preparedMatch' && ['STALE_TEAM_REVISION', 'NOT_FOUND', 'MIGRATION_REQUIRED', 'VERSION_UNAVAILABLE', 'VALIDATION_FAILED'].includes(message.code))
        connection.request('savedTeam', { operation: 'list' });
      if (message.type === 'preparedMatch') {
        const launch = activationWindow.current?.requestId === message.requestId ? activationWindow.current : null;
        if (launch) activationWindow.current = null;
        if (message.code === 'ACCEPTED') {
          sessionStorage.removeItem('moles.play.invitation');
          setPrepared(message); setMatchId(message.document.matchId);
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
      if (message.code && !['ACCEPTED', 'OK', 'CONNECTING', 'DISCONNECTED'].includes(message.code)) setError(message.code.replaceAll('_', ' '));
      redraw(value => value + 1);
    } });
    const refresh = () => { if (connection.accountId) connection.request('savedTeam', { operation: 'list' }); };
    window.addEventListener('focus', refresh);
    client.current = connection;
    if (!matchRoute && !resultRoute && connection.pending?.request.type === 'setup')
      location.replace(matchUrl(connection.pending.request.matchId, false));
    else if ((matchRoute || resultRoute) && !matchIdPattern.test(matchId)) setError('Enter a valid match ID.');
    else if (matchRoute && connection.pending?.request.type === 'setup' && (connection.pending.request.matchId !== matchId || watchRoute))
      location.replace(matchUrl(connection.pending.request.matchId, false));
    else if (!matchRoute && !resultRoute && transferredMatchId) setStatus('Match opened in another tab or window');
    else connection.connect();
    return () => { window.removeEventListener('focus', refresh); activationWindow.current?.popup?.close(); activationWindow.current = null; client.current = null; connection.disconnect(); };
  }, [options]);
  const connection = client.current;
  const connected = status === 'Connected';
  const preparationTransferred = !!transferredMatchId && !matchRoute && !resultRoute;
  const busy = !connected || !!connection?.pending;
  const selected = teams.find(team => team.teamId === teamId && team.eligibility === 'CURRENT');
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
  function startGame() {
    // Reserve the browsing context in the click handler; the server response arrives too late for popup permission.
    let popup: Window | null = null;
    try {
      popup = window.open('', '_blank', 'popup,width=1440,height=900');
      if (popup) {
        popup.opener = null;
        popup.document.title = 'Starting game';
        popup.document.body.textContent = 'Waiting for the game server to confirm activation…';
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
  return <main className={`play-runtime setup-panel${matchRoute || resultRoute ? ' live-match-page' : ''}`}>
    <div className={matchRoute || resultRoute ? 'match-page-top' : undefined}>
      <h1>{resultRoute ? 'Match result' : matchRoute ? 'Match' : 'Play or watch'}</h1><p role="status">{preparationTransferred ? 'Match opened in another tab or window' : status}</p>{error && <p role="alert">{error}</p>}
      {!connected && !preparationTransferred && <button onClick={() => connection?.connect()}>Reconnect</button>}
      {connected && <button onClick={() => connection?.disconnect()}>Disconnect</button>}
      {preparationTransferred && <button onClick={reconnectPreparation}>Reconnect preparation here</button>}
      {(matchRoute || resultRoute) && <a href="/play">Match preparation and games</a>}
    </div>
    {connection?.pending && <section><p>A submitted change needs confirmation. Reconnect with the same account and repeat the exact request.</p><button disabled={!connected || connection.pending.accountId !== connection.accountId} onClick={() => run(() => connection.retry())}>Repeat retained request</button></section>}
    {preparationTransferred && <section aria-label="Match opened elsewhere"><p>The match is open in another tab or window. Reconnecting preparation here will disconnect that match window.</p><a href={matchUrl(transferredMatchId, false)}>Continue the match in this tab</a></section>}
    {!matchRoute && !resultRoute && <>
    <section aria-label="Match preparation"><h2>Your game</h2>
      <p>Need a new roster? <a href="/teambuilder">Open Team Builder</a>, validate it, and save the resulting team definition before creating a game.</p>
      <label>Saved team <select value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">Choose a team</option>{teams.map(team => <option key={team.teamId} value={team.teamId} disabled={team.eligibility !== 'CURRENT'}>{team.teamName || 'Unnamed older team'} · {team.rosterId || 'Unknown roster'} · version {team.documentVersion}{team.eligibility !== 'CURRENT' ? ` · unavailable: ${team.eligibility}` : ''}</option>)}</select></label>
      <button disabled={!connected} onClick={() => run(() => connection?.request('savedTeam', { operation: 'list' }))}>Refresh teams</button>
      <button disabled={busy || !selected} onClick={() => prepare('create')}>Create game</button>
      <label>Invitation code <input value={invite} onChange={event => setInvite(event.target.value)} autoComplete="off" /></label>
      <button disabled={busy || !selected || !invite} onClick={() => prepare('join')}>Join game</button>
      {prepared?.callerRole === 'home' && invite && <p><a href={`/play?invite=${encodeURIComponent(invite)}`}>Invitation link</a> — share with your opponent. Expires after one hour.</p>}
      <label>Match ID <input value={matchId} onChange={event => setMatchId(event.target.value)} /></label>
      <button disabled={!connected || !matchId} onClick={() => prepare('load')}>Reload game setup</button>
      <button disabled={busy || !matchId} onClick={() => run(() => location.assign(matchUrl(matchId, false)))}>Resume play</button>
      {prepared?.document.lifecycle === 'AWAITING_SETUP' && <button disabled={busy} onClick={startGame}>Start game</button>}
      {prepared?.document.lifecycle === 'ACTIVATED' && <p role="status">Game ready. <a href={matchUrl(prepared.document.matchId, false)} target="_blank" rel="noopener" onClick={() => transferToMatch(prepared.document.matchId, connection!)}>Open match in a new tab or window</a> · <a href={matchUrl(prepared.document.matchId, false)}>Continue in this tab</a></p>}
      {prepared?.callerRole === 'home' && prepared.document.lifecycle !== 'ACTIVATED' && <><button disabled={busy} onClick={() => prepare('reissue')}>Refresh invitation</button><button disabled={busy} onClick={() => prepare('release')}>Release disconnected opponent</button></>}
    </section>
    <section aria-label="Watch games"><h2>Games in progress</h2><button disabled={!connected} onClick={() => run(() => connection?.request('browse'))}>Refresh games</button>{connected && games.length === 0 && <p>No games in progress.</p>}
      {games.map(game => <button key={game.matchId} disabled={busy} onClick={() => run(() => location.assign(matchUrl(game.matchId, true)))}>Watch Home vs Away · {game.matchId.slice(0, 8)}</button>)}
    </section>
    </>}
    {matchRoute && connection?.state && <GameView key={connection.state.matchId} hosted results={connection.state.callerRole !== 'spectator'} resultUrl={`/play/result?matchId=${encodeURIComponent(connection.state.matchId)}`} view={connection.state} connected={connected} pending={connection.pending?.request.requestId ?? null}
      mutate={(operation, fields = {}) => run(() => { const state = connection.state!; connection.request('setup', { operation, matchId: state.matchId, expectedRevision: state.revision, ...fields }, true); })} />}
    {resultRoute && <HostedResult matchId={matchId} result={result} event={replayEvent} index={replayIndex} pending={resultPending} connected={connected}
      onLoad={() => run(() => { connection!.request('matchResult', { operation: 'load', matchId }); setResultPending(true); })}
      onReplay={index => run(() => { connection!.request('matchResult', { operation: 'replay', matchId, index }); setResultPending(true); })}/>}
  </main>;
}

const matchIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function matchUrl(matchId: string, watch: boolean) {
  if (!matchIdPattern.test(matchId)) throw Error('Enter a valid match ID.');
  return `/play/match?matchId=${encodeURIComponent(matchId)}${watch ? '&watch=1' : ''}`;
}
