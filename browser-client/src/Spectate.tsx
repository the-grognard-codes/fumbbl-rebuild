import { useEffect, useRef, useState } from 'react';
import { V2Client } from './v2-client.ts';
import { emptyReplayFilters, filterLiveGames, gameLabel, searchReplayGames } from './browse-protocol.ts';
import type { BrowseGame, BrowseTeam, ReplayFilters } from './browse-protocol.ts';
import { MatchupTeam } from './MatchupTeam.tsx';
import './spectate.css';

type Options = { url: string; getToken: () => Promise<string> };

function Team({ team, side }: { team: BrowseTeam; side: 'home' | 'away' }) {
  return <MatchupTeam name={team.name} side={side}>
    <p>{team.type}<span className="spectate-divider">·</span>
      {team.teamValue === null ? 'TV unavailable' : `TV ${new Intl.NumberFormat('en').format(team.teamValue / 1000)}k`}</p>
    <p className="spectate-coach">{team.coach ? /^coach\b/i.test(team.coach) ? team.coach : `Coach ${team.coach}` : 'Coach details unavailable'}</p>
  </MatchupTeam>;
}

function LiveGame({ game }: { game: BrowseGame }) {
  const details = game.details;
  const hasScore = details && details.homeScore !== null && details.awayScore !== null;
  const phase = details?.phase === 'PLAY' && details.half !== null && details.turn !== null
    ? `Half ${details.half} · Turn ${details.turn}`
    : ['PRE_MATCH', 'SETUP', 'READY_FOR_KICKOFF'].includes(details?.phase ?? '') ? 'Awaiting kickoff'
      : 'Match in progress';
  return <li><article className="spectate-game" aria-label={gameLabel(game)}>
    <div className="spectate-game-top"><span className="spectate-live">Live</span>
      <span>{details?.competition || 'Open game'}{details && ` · ${details.ruleset}`}</span></div>
    {details ? <div className="spectate-matchup">
      <Team team={details.home} side="home" />
      <div className="spectate-score"><span className="spectate-versus">vs.</span>
        <strong aria-label={hasScore ? `Score ${details.homeScore} to ${details.awayScore}` : 'Score unavailable'}>
          {hasScore ? <>{details.homeScore}<span aria-hidden="true">:</span>{details.awayScore}</> : '—'}</strong>
        <span>{phase}</span></div>
      <Team team={details.away} side="away" />
    </div> : <div className="spectate-legacy"><h3>{game.label}</h3><p>Match details unavailable</p></div>}
    <div className="spectate-game-bottom"><div className="spectate-game-meta">
      <span>{details ? `${details.spectators} ${details.spectators === 1 ? 'spectator' : 'spectators'}` : 'Spectator count unavailable'}</span>
      <details><summary>Game ID</summary><code>{game.matchId}</code></details>
    </div><a className="button" href={`/play/match?matchId=${encodeURIComponent(game.matchId)}&watch=1`} aria-label={`Watch ${gameLabel(game)}`}>Watch game <span aria-hidden="true">↗</span></a></div>
  </article></li>;
}

export function Spectate({ options }: { options: Options }) {
  const client = useRef<V2Client | null>(null);
  const loading = useRef(false);
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const [games, setGames] = useState<BrowseGame[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ReplayFilters>({ ...emptyReplayFilters });
  const [replaySearch, setReplaySearch] = useState<ReturnType<typeof searchReplayGames> | null>(null);
  const connected = status === 'Connected';
  const visible = filterLiveGames(games ?? [], query);

  function refresh() {
    const connection = client.current;
    if (!connection?.accountId || loading.current) return;
    try {
      loading.current = true; setRefreshing(true); setError(''); connection.request('browse');
    } catch { loading.current = false; setRefreshing(false); setError('Live games could not be loaded. Try refreshing.'); }
  }

  useEffect(() => {
    // This directory never restores or submits a retained player mutation.
    const connection = new V2Client({ ...options, browseOnly: true, onChange: message => {
      if (message.type === 'status') {
        setStatus(message.code === 'CONNECTING' ? 'Connecting' : 'Disconnected');
        setGames(null); loading.current = false; setRefreshing(false);
      } else if (message.type === 'authentication') {
        setStatus('Connected'); setError(''); loading.current = true; setRefreshing(true);
      } else if (message.type === 'browse') {
        loading.current = false; setRefreshing(false); setGames(message.matches); setError('');
      } else if (message.type === 'error') {
        loading.current = false; setRefreshing(false);
        setError(message.code === 'AUTHORIZATION' ? 'Live games are unavailable for this account.' : 'Live games could not be loaded. Reconnect or try refreshing.');
      }
    } });
    client.current = connection; connection.connect();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); client.current = null; connection.disconnect(); };
  }, [options]);

  function updateFilter(key: keyof ReplayFilters, value: string) {
    setFilters(previous => ({ ...previous, [key]: value }));
    setReplaySearch(null);
  }

  return <main className="spectate-shell">
    <div className="spectate-intro"><div><p className="kicker">The spectator stands</p><h1>Find your next game.</h1>
      <p>Follow the action live, or find a match worth watching again.</p></div>
      <div className="spectate-jump"><a href="#live-games">Live games <span aria-hidden="true">↓</span></a><a href="#replays">Replays <span aria-hidden="true">↓</span></a></div></div>
    <section className="spectate-section" id="live-games" aria-labelledby="live-title">
      <div className="spectate-section-heading"><div><p className="kicker">On the pitch</p>
        <h2 id="live-title">Games in progress <span className="spectate-count">{games?.length ?? '—'}</span></h2></div>
        <div className="spectate-connection"><span role="status">{status}</span>
          {connected ? <button disabled={refreshing} onClick={refresh}>{refreshing ? 'Refreshing…' : 'Refresh games'}</button>
            : <button disabled={status === 'Connecting'} onClick={() => client.current?.connect()}>Reconnect</button>}</div></div>
      <label className="spectate-live-search">Find a live game<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Team, coach, team type or game ID" /></label>
      {error && <p className="spectate-error" role="alert">{error}</p>}
      {games === null && !error && <div className="spectate-empty" role="status"><strong>{connected ? 'Loading live games…' : status === 'Connecting' ? 'Connecting to the stands…' : 'Connection interrupted'}</strong><p>{connected || status === 'Connecting' ? 'Getting the latest games from the pitch.' : 'Reconnect to see the latest games.'}</p></div>}
      {games !== null && <><p className="spectate-list-status" role="status">{query.trim() ? `${visible.length} of ${games.length} live games match your search.` : 'Updates every 30 seconds.'}</p>
        <ul className="spectate-games" aria-label="Games currently in progress">{visible.map(game => <LiveGame key={game.matchId} game={game} />)}</ul>
        {visible.length === 0 && <div className="spectate-empty"><span className="spectate-empty-symbol" aria-hidden="true">◇</span><h3>{games.length ? 'No matching live games' : 'The pitch is quiet for now.'}</h3><p>{games.length ? 'Try another team, coach or game ID.' : 'Games appear here once they are underway. Check back soon, or start one of your own.'}</p>{games.length ? <button onClick={() => setQuery('')}>Clear live search</button> : <a href="/play">Set up a game <span aria-hidden="true">→</span></a>}</div>}</>}
    </section>
    <section className="spectate-section spectate-replays" id="replays" aria-labelledby="replays-title">
      <div className="spectate-section-heading"><div><p className="kicker">From the archive</p><h2 id="replays-title">Games to watch as a replay</h2></div><span className="spectate-soon">Coming soon</span></div>
      <p className="spectate-replay-description">Find a past game by ID, player or coach, team name, or team type.</p>
      <form aria-label="Replay search" onSubmit={event => { event.preventDefault(); setReplaySearch(searchReplayGames(filters)); }}>
        <div className="spectate-filters">
          <label>Game ID<input value={filters.gameId} onChange={event => updateFilter('gameId', event.target.value)} placeholder="Enter a game ID" maxLength={100} /></label>
          <label>Player / coach name<input value={filters.playerName} onChange={event => updateFilter('playerName', event.target.value)} placeholder="Who was playing?" maxLength={100} /></label>
          <label>Team name<input value={filters.teamName} onChange={event => updateFilter('teamName', event.target.value)} placeholder="Enter a team name" maxLength={100} /></label>
          <label>Team type<input value={filters.teamType} onChange={event => updateFilter('teamType', event.target.value)} placeholder="e.g. Human, Orc, Dark Elf" maxLength={100} /></label>
        </div><div className="spectate-search-actions"><button type="submit">Search replays</button><button className="spectate-secondary" type="button" onClick={() => { setFilters({ ...emptyReplayFilters }); setReplaySearch(null); }}>Clear filters</button><span>Replay search will be available when the archive opens.</span></div>
      </form>
      <ul className="spectate-games" aria-label="Games available as replays">{replaySearch?.games.map(game => <li key={game.matchId}>{gameLabel(game)}</li>)}</ul>
      <div className="spectate-empty spectate-archive-empty" role="status"><span className="spectate-empty-symbol" aria-hidden="true">↶</span><h3>The replay archive is on its way.</h3><p>{replaySearch ? 'Your search filters are ready. Replay search is not available yet.' : 'Completed games will have a home here. No replays are listed yet.'}</p></div>
    </section>
  </main>;
}
