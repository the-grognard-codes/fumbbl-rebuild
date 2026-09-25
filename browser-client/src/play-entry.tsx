import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameView } from './SetupPanel.tsx';
import { BuilderPanel } from './BuilderPanel.tsx';
import { V2Client } from './v2-client.ts';
import type { V2Message } from './v2-client.ts';
import type { SavedTeamSummary } from './saved-team-protocol.ts';
import './play-brand.css';

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
  const client = useRef<V2Client | null>(null);
  useEffect(() => {
    const connection = new V2Client({ ...options, storage: sessionStorage,
      initialMatch: matchRoute && matchIdPattern.test(matchId) ? { matchId, watch: watchRoute } : undefined,
      onChange: message => {
      if (message.type === 'status') { setStatus(message.code === 'CONNECTING' ? 'Connecting' : 'Disconnected'); setGames([]); setTeams([]); setPrepared(null); }
      if (message.type === 'authentication') setStatus('Connected');
      if (message.code === 'VIEW_UNAVAILABLE' || message.code === 'NOT_FOUND') { setPrepared(null); setInvite(''); }
      if (message.type === 'browse' && Array.isArray(message.matches)) setGames(message.matches);
      if (message.type === 'savedTeam' && message.code === 'OK') {
        if (message.document) connection.request('savedTeam', { operation: 'list' });
        else if (Array.isArray(message.teams)) { setTeams(message.teams); setTeamId(previous => message.teams.some((team: SavedTeamSummary) => team.teamId === previous && team.eligibility === 'CURRENT') ? previous : message.teams.find((team: SavedTeamSummary) => team.eligibility === 'CURRENT')?.teamId || ''); }
      }
      if (message.type === 'preparedMatch' && ['STALE_TEAM_REVISION', 'NOT_FOUND', 'MIGRATION_REQUIRED', 'VERSION_UNAVAILABLE', 'VALIDATION_FAILED'].includes(message.code))
        connection.request('savedTeam', { operation: 'list' });
      if (message.type === 'preparedMatch' && message.code === 'ACCEPTED') {
        sessionStorage.removeItem('moles.play.invitation');
        setPrepared(message); setMatchId(message.document.matchId);
        setInvite(message.invitationCode ?? '');
        if (message.document.lifecycle === 'ACTIVATED') location.assign(matchUrl(message.document.matchId, false));
      }
      if (message.code && !['ACCEPTED', 'OK', 'CONNECTING', 'DISCONNECTED'].includes(message.code)) setError(message.code.replaceAll('_', ' '));
      redraw(value => value + 1);
    } });
    const refresh = () => { if (connection.accountId) connection.request('savedTeam', { operation: 'list' }); };
    window.addEventListener('focus', refresh);
    client.current = connection;
    if (!matchRoute && connection.pending?.request.type === 'setup')
      location.replace(matchUrl(connection.pending.request.matchId, false));
    else if (matchRoute && !matchIdPattern.test(matchId)) setError('Enter a valid match ID.');
    else if (matchRoute && connection.pending?.request.type === 'setup' && (connection.pending.request.matchId !== matchId || watchRoute))
      location.replace(matchUrl(connection.pending.request.matchId, false));
    else connection.connect();
    return () => { window.removeEventListener('focus', refresh); client.current = null; connection.disconnect(); };
  }, [options]);
  const connection = client.current;
  const connected = status === 'Connected';
  const busy = !connected || !!connection?.pending;
  const selected = teams.find(team => team.teamId === teamId && team.eligibility === 'CURRENT');
  function run(action: () => void) { try { setError(''); action(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Request could not be sent.'); } }
  function prepare(operation: string) {
    const fields = operation === 'create' ? { teamId, expectedDocumentVersion: selected?.documentVersion }
      : operation === 'join' ? { invitationCode: invite, teamId, expectedDocumentVersion: selected?.documentVersion }
      : operation === 'activate' ? { matchId, expectedRevision: prepared?.document.documentVersion } : { matchId };
    run(() => connection?.request('preparedMatch', { operation, ...fields }, operation !== 'load'));
  }
  return <main className={`play-runtime setup-panel${matchRoute ? ' live-match-page' : ''}`}>
    <h1>{matchRoute ? 'Match' : 'Play or watch'}</h1><p role="status">{status}</p>{error && <p role="alert">{error}</p>}
    {!connected && <button onClick={() => connection?.connect()}>Reconnect</button>}
    {connected && <button onClick={() => connection?.disconnect()}>Disconnect</button>}
    {connection?.pending && <section><p>A submitted change needs confirmation. Reconnect with the same account and repeat the exact request.</p><button disabled={!connected || connection.pending.accountId !== connection.accountId} onClick={() => run(() => connection.retry())}>Repeat retained request</button></section>}
    {matchRoute && <p><a href="/play">Match preparation and games</a></p>}
    {!matchRoute && <>
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
      {prepared?.document.lifecycle === 'AWAITING_SETUP' && <button disabled={busy} onClick={() => prepare('activate')}>Start game</button>}
      {prepared?.callerRole === 'home' && prepared.document.lifecycle !== 'ACTIVATED' && <><button disabled={busy} onClick={() => prepare('reissue')}>Refresh invitation</button><button disabled={busy} onClick={() => prepare('release')}>Release disconnected opponent</button></>}
    </section>
    <section aria-label="Watch games"><h2>Games in progress</h2><button disabled={!connected} onClick={() => run(() => connection?.request('browse'))}>Refresh games</button>{connected && games.length === 0 && <p>No games in progress.</p>}
      {games.map(game => <button key={game.matchId} disabled={busy} onClick={() => run(() => location.assign(matchUrl(game.matchId, true)))}>Watch Home vs Away · {game.matchId.slice(0, 8)}</button>)}
    </section>
    </>}
    {matchRoute && connection?.state && <GameView key={connection.state.matchId} results={false} view={connection.state} connected={connected} pending={connection.pending?.request.requestId ?? null}
      mutate={(operation, fields = {}) => run(() => { const state = connection.state!; connection.request('setup', { operation, matchId: state.matchId, expectedRevision: state.revision, ...fields }, true); })} />}
  </main>;
}

const matchIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function matchUrl(matchId: string, watch: boolean) {
  if (!matchIdPattern.test(matchId)) throw Error('Enter a valid match ID.');
  return `/play/match?matchId=${encodeURIComponent(matchId)}${watch ? '&watch=1' : ''}`;
}
