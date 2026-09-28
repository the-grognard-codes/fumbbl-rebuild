import { MatchArt } from './MatchScoreboard.tsx';
import type { SetupState, TeamResources } from './setup-protocol.ts';

function Resources({ role, rerolls, resources }: { role: 'home' | 'away'; rerolls: number; resources?: TeamResources }) {
  return <section className={`live-resources ${role}`} aria-label={`${role} resources`}>
    <div className="live-rerolls"><span>Rerolls</span><strong>{rerolls}</strong></div>
    {resources && <div className="live-resource-counts">
      <span title="Available apothecaries"><MatchArt name="apothecary"/><b>{resources.apothecaries}</b><span className="sr-only">Apothecaries</span></span>
      <span title="Assistant coaches">AC <b>{resources.assistantCoaches}</b></span>
      <span title="Cheerleaders">CH <b>{resources.cheerleaders}</b></span>
    </div>}
  </section>;
}

/** The preview's five-panel scoreboard, bound only to the server projection. */
export function LiveMatchScoreboard({ view }: { view: SetupState }) {
  const homeArt = view.players.find(player => player.role === 'home' && player.art)?.art?.rosterId;
  const awayArt = view.players.find(player => player.role === 'away' && player.art)?.art?.rosterId;
  return <div className="match-scoreboard live-match-scoreboard" aria-label="Match scoreboard">
    <Resources role="home" rerolls={view.homeRerolls} resources={view.homeResources}/>
    <div className="live-team-nameplate home">
      {(homeArt === 'human' || homeArt === 'orc') && <MatchArt name={homeArt}/>}
      <strong title={view.homeTeamName ?? 'Home'}>{view.homeTeamName ?? 'Home'}</strong>
      <b aria-label={`Home score ${view.homeScore}`}>{view.homeScore}</b>
    </div>
    <div className="live-match-clock"><strong>Half {view.half} · Drive {view.drive}</strong><span>Turn {view.turn} · {view.phase.replaceAll('_', ' ')}</span><small>{view.weather === 'Nice' && <MatchArt name="weather"/>}{view.weather}</small></div>
    <div className="live-team-nameplate away">
      <strong title={view.awayTeamName ?? 'Away'}>{view.awayTeamName ?? 'Away'}</strong>
      <b aria-label={`Away score ${view.awayScore}`}>{view.awayScore}</b>
      {(awayArt === 'human' || awayArt === 'orc') && <MatchArt name={awayArt}/>}
    </div>
    <Resources role="away" rerolls={view.awayRerolls} resources={view.awayResources}/>
  </div>;
}
