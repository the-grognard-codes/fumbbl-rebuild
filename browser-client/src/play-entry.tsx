import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameView } from './SetupPanel.tsx';
import { TeamDraftEditor } from './TeamPanel.tsx';
import { decodeTeam, emptyDraft } from './team-protocol.ts';
import type { Catalog, TeamDraft, Validation } from './team-protocol.ts';
import { TeamValidationView } from './team-validation-view.ts';
import { V2Client } from './v2-client.ts';
import type { V2Message } from './v2-client.ts';
import './play-brand.css';

export function mountPlay(element: HTMLElement, options: { url: string; getToken: () => Promise<string> }) {
  const root = createRoot(element);
  root.render(<Play options={options} />);
  return () => root.unmount();
}

function Play({ options }: { options: { url: string; getToken: () => Promise<string> } }) {
  const [, redraw] = useState(0);
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const [games, setGames] = useState<{ matchId: string; label: string }[]>([]);
  const [teams, setTeams] = useState<{ teamId: string; documentVersion: number }[]>([]);
  const [teamId, setTeamId] = useState('');
  const [invite, setInvite] = useState(() => new URLSearchParams(location.search).get('invite') ?? sessionStorage.getItem('moles.play.invitation') ?? '');
  const [matchId, setMatchId] = useState(() => new URLSearchParams(location.search).get('matchId') ?? '');
  const [prepared, setPrepared] = useState<V2Message | null>(null);
  const [draft, setDraft] = useState('');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [teamDraft, setTeamDraft] = useState<TeamDraft | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const client = useRef<V2Client | null>(null);
  useEffect(() => {
    const connection = new V2Client({ ...options, storage: sessionStorage, onChange: message => {
      if (message.type === 'status') { setStatus(message.code === 'CONNECTING' ? 'Connecting' : 'Disconnected'); setGames([]); setTeams([]); setPrepared(null); }
      if (message.type === 'authentication') setStatus('Connected');
      if (message.type === 'catalog' || message.type === 'teamValidation') {
        const decoded = decodeTeam(JSON.stringify({ ...message, version: 1 }));
        if (decoded.type === 'catalog') { setCatalog(decoded); setTeamDraft(previous => previous ?? emptyDraft(decoded)); }
        else setValidation(decoded);
      }
      if (message.type === 'browse' && Array.isArray(message.matches)) setGames(message.matches);
      if (message.type === 'savedTeam' && message.code === 'OK') {
        if (message.document) connection.request('savedTeam', { operation: 'list' });
        else if (Array.isArray(message.teams)) { setTeams(message.teams); setTeamId(previous => previous || message.teams[0]?.teamId || ''); }
      }
      if (message.type === 'preparedMatch' && message.code === 'ACCEPTED') {
        sessionStorage.removeItem('moles.play.invitation');
        setPrepared(message); setMatchId(message.document.matchId);
        setInvite(message.invitationCode ?? '');
        if (message.document.lifecycle === 'ACTIVATED') connection.open(message.document.matchId, false);
      }
      if (message.code && !['ACCEPTED', 'OK', 'CONNECTING', 'DISCONNECTED'].includes(message.code)) setError(message.code.replaceAll('_', ' '));
      redraw(value => value + 1);
    } });
    client.current = connection; connection.connect();
    return () => { client.current = null; connection.disconnect(); };
  }, [options]);
  const connection = client.current;
  const connected = status === 'Connected';
  const busy = !connected || !!connection?.pending;
  const selected = teams.find(team => team.teamId === teamId);
  function run(action: () => void) { try { setError(''); action(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Request could not be sent.'); } }
  function loadBasicHumanStarter() {
    if (!catalog) return;
    const lineman = catalog.positions.find(position => position.id === 'lineman');
    if (!lineman) { setError('The current Human catalog has no lineman position.'); return; }
    setTeamDraft({ ...emptyDraft(catalog), captainId: 'starter-01', players: Array.from({ length: 11 }, (_, index) => ({
      id: `starter-${String(index + 1).padStart(2, '0')}`, slot: index + 1, positionId: lineman.id, skillIds: []
    })) });
    setValidation(null);
  }
  function prepare(operation: string) {
    const fields = operation === 'create' ? { teamId, expectedDocumentVersion: selected?.documentVersion }
      : operation === 'join' ? { invitationCode: invite, teamId, expectedDocumentVersion: selected?.documentVersion }
      : operation === 'activate' ? { matchId, expectedRevision: prepared?.document.documentVersion } : { matchId };
    run(() => connection?.request('preparedMatch', { operation, ...fields }, operation !== 'load'));
  }
  return <main className="play-runtime setup-panel">
    <h1>Play or watch</h1><p role="status">{status}</p>{error && <p role="alert">{error}</p>}
    {!connected && <button onClick={() => connection?.connect()}>Reconnect</button>}
    {connected && <button onClick={() => connection?.disconnect()}>Disconnect</button>}
    {connection?.pending && <section><p>A submitted change needs confirmation. Reconnect with the same account and repeat the exact request.</p><button disabled={!connected || connection.pending.accountId !== connection.accountId} onClick={() => run(() => connection.retry())}>Repeat retained request</button></section>}
    <section aria-label="Match preparation"><h2>Your game</h2>
      {connected && !catalog && <p role="status">Loading the frozen Human team catalog…</p>}
      {catalog && teamDraft && <section className="team-builder" aria-label="Build a Human team"><h3>Build a Human team</h3><p>Choose your roster here, validate it, then save it before creating a game.</p>
        <button disabled={busy} onClick={loadBasicHumanStarter}>Load basic 11-lineman starter</button>
        <TeamDraftEditor catalog={catalog} draft={teamDraft} update={value => { setTeamDraft(value); setValidation(null); }} editable={!busy}
          validate={() => run(() => connection?.request('validateTeam', { draft: teamDraft }))} />
        <TeamValidationView result={validation} />
        <button disabled={busy} onClick={() => run(() => connection?.request('savedTeam', { operation: 'create', draft: teamDraft }, true))}>Save new team</button>
      </section>}
      <label>Saved team <select value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">Choose a team</option>{teams.map(team => <option key={team.teamId} value={team.teamId}>{team.teamId} · version {team.documentVersion}</option>)}</select></label>
      <button disabled={busy || !selected} onClick={() => prepare('create')}>Create game</button>
      <label>Invitation code <input value={invite} onChange={event => setInvite(event.target.value)} autoComplete="off" /></label>
      <button disabled={busy || !selected || !invite} onClick={() => prepare('join')}>Join game</button>
      {prepared?.callerRole === 'home' && invite && <p><a href={`/play?invite=${encodeURIComponent(invite)}`}>Invitation link</a> — share with your opponent. Expires after one hour.</p>}
      <label>Match ID <input value={matchId} onChange={event => setMatchId(event.target.value)} /></label>
      <button disabled={!connected || !matchId} onClick={() => prepare('load')}>Reload game setup</button>
      <button disabled={!connected || !matchId} onClick={() => run(() => connection?.open(matchId, false))}>Resume play</button>
      {prepared?.document.lifecycle === 'AWAITING_SETUP' && <button disabled={busy} onClick={() => prepare('activate')}>Start game</button>}
      {prepared?.callerRole === 'home' && prepared.document.lifecycle !== 'ACTIVATED' && <><button disabled={busy} onClick={() => prepare('reissue')}>Refresh invitation</button><button disabled={busy} onClick={() => prepare('release')}>Release disconnected opponent</button></>}
      <details><summary>Import a saved team or team draft</summary><label>Team JSON <textarea rows={8} value={draft} onChange={event => setDraft(event.target.value)} /></label><button disabled={busy || !draft} onClick={() => run(() => { const value = JSON.parse(draft); connection?.request('savedTeam', value.draft ? { operation: 'import', document: value } : { operation: 'create', draft: value }, true); })}>Save team</button><p>The server checks the frozen Human catalog and budget before saving.</p></details>
      {catalog && teamDraft && <details><summary>Build a Human team</summary><p>{catalog.budget.toLocaleString()} gold · {catalog.skillPoints} skill points</p>
        <TeamDraftEditor catalog={catalog} draft={teamDraft} update={value => { setTeamDraft(value); setValidation(null); }} editable={!busy}
          validate={() => run(() => connection?.request('validateTeam', { draft: teamDraft }))} />
        <TeamValidationView result={validation} />
        <button disabled={busy} onClick={() => run(() => connection?.request('savedTeam', { operation: 'create', draft: teamDraft }, true))}>Save new team</button>
      </details>}
    </section>
    <section aria-label="Watch games"><h2>Games in progress</h2><button disabled={!connected} onClick={() => run(() => connection?.request('browse'))}>Refresh games</button>{connected && games.length === 0 && <p>No games in progress.</p>}
      {games.map(game => <button key={game.matchId} disabled={!connected} onClick={() => run(() => connection?.open(game.matchId, true))}>Watch Home vs Away · {game.matchId.slice(0, 8)}</button>)}
    </section>
    {connection?.state && <GameView key={connection.state.matchId} results={false} view={connection.state} connected={connected} pending={connection.pending?.request.requestId ?? null}
      mutate={(operation, fields = {}) => run(() => { const state = connection.state!; connection.request('setup', { operation, matchId: state.matchId, expectedRevision: state.revision, ...fields }, true); })} />}
  </main>;
}
