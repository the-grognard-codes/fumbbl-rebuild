import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MatchArt } from './MatchScoreboard.tsx';
import { clockValues, formatClock } from './match-clock.ts';
import { matchTeamName } from './match-team-name.ts';
import type { SetupState, TeamResources } from './setup-protocol.ts';

function Resources({ role, teamName, rerolls, resources }: { role: 'home' | 'away'; teamName: string; rerolls: number; resources?: TeamResources }) {
  return <section className={`live-resources ${role}`} aria-label={`${teamName} resources`}>
    <div className="live-rerolls"><span>Rerolls</span><strong>{rerolls}</strong></div>
    {resources && <div className="live-resource-counts">
      <span title="Available apothecaries"><MatchArt name="apothecary"/><b>{resources.apothecaries}</b><span className="sr-only">Apothecaries</span></span>
    </div>}
  </section>;
}

function TeamName({ name }: { name: string }) {
  const nameElement = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = nameElement.current;
    const nameplate = element?.parentElement;
    if (!element || !nameplate) return;

    let disposed = false;
    const fitName = () => {
      if (disposed) return;
      element.style.removeProperty('font-size');
      const maximumSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
      if (!Number.isFinite(maximumSize)) return;

      const plateStyle = window.getComputedStyle(nameplate);
      const availableHeight = nameplate.clientHeight - Number.parseFloat(plateStyle.paddingTop) - Number.parseFloat(plateStyle.paddingBottom);
      const fits = () => element.scrollWidth <= element.clientWidth && element.scrollHeight <= availableHeight;
      if (fits()) return;

      let low = 1;
      let high = maximumSize;
      element.style.fontSize = `${low}px`;
      if (!fits()) return;

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = (low + high) / 2;
        element.style.fontSize = `${candidate}px`;
        if (fits()) low = candidate;
        else high = candidate;
      }
      element.style.fontSize = `${low}px`;
    };

    const observer = new ResizeObserver(fitName);
    observer.observe(nameplate);
    fitName();
    void document.fonts.ready.then(fitName);

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [name]);

  return <strong ref={nameElement} title={name}>{name}</strong>;
}

/** The preview's five-panel scoreboard, bound only to the server projection. */
export function LiveMatchScoreboard({ view }: { view: SetupState }) {
  const [elapsedSinceProjection, setElapsedSinceProjection] = useState(0);
  const paused = view.saveResume?.status === 'SUSPENDED' || view.saveResume?.status === 'RESUME_PENDING';
  useEffect(() => {
    const receivedAt = performance.now();
    setElapsedSinceProjection(0);
    if (!view.clock?.activeRole || paused) return;
    const timer = window.setInterval(() => setElapsedSinceProjection(performance.now() - receivedAt), 250);
    return () => window.clearInterval(timer);
  }, [view.clock, paused]);
  const clock = clockValues(view.clock, elapsedSinceProjection, paused);
  const homeName = matchTeamName(view, 'home');
  const awayName = matchTeamName(view, 'away');
  const homeArt = view.players.find(player => player.role === 'home' && player.art)?.art?.rosterId;
  const awayArt = view.players.find(player => player.role === 'away' && player.art)?.art?.rosterId;
  return <div className="match-scoreboard live-match-scoreboard" aria-label="Match scoreboard">
    <Resources role="home" teamName={matchTeamName(view, 'home')} rerolls={view.homeRerolls} resources={view.homeResources}/>
    <div className="live-team-nameplate home">
      {(homeArt === 'human' || homeArt === 'orc') && <MatchArt name={homeArt}/>}
      <TeamName name={matchTeamName(view, 'home')}/>
      <b aria-label={`${matchTeamName(view, 'home')} score ${view.homeScore}`}>{view.homeScore}</b>
    </div>
    <div className="live-match-clock"><strong>Turn {view.turn}</strong><span>Half {view.half}</span>
      <div className="live-chess-clocks" aria-label="Turn clocks">
        <div className={`live-chess-clock home${clock.activeRole === 'home' ? ' active' : ''}${clock.activeRole === 'home' && clock.turnMs <= 15_000 ? ' urgent' : ''}`}
          aria-label={`${homeName}: turn ${formatClock(clock.activeRole === 'home' ? clock.turnMs : 120_000)}, reserve ${formatClock(clock.homeReserveMs)}`}>
          <span title={homeName}>{homeName.slice(0, 3)}</span><b>{formatClock(clock.activeRole === 'home' ? clock.turnMs : 120_000)}</b><small>{formatClock(clock.homeReserveMs)}</small>
        </div>
        <div className={`live-chess-clock away${clock.activeRole === 'away' ? ' active' : ''}${clock.activeRole === 'away' && clock.turnMs <= 15_000 ? ' urgent' : ''}`}
          aria-label={`${awayName}: turn ${formatClock(clock.activeRole === 'away' ? clock.turnMs : 120_000)}, reserve ${formatClock(clock.awayReserveMs)}`}>
          <span title={awayName}>{awayName.slice(0, 3)}</span><b>{formatClock(clock.activeRole === 'away' ? clock.turnMs : 120_000)}</b><small>{formatClock(clock.awayReserveMs)}</small>
        </div>
      </div></div>
    <div className="live-team-nameplate away">
      <TeamName name={matchTeamName(view, 'away')}/>
      <b aria-label={`${matchTeamName(view, 'away')} score ${view.awayScore}`}>{view.awayScore}</b>
      {(awayArt === 'human' || awayArt === 'orc') && <MatchArt name={awayArt}/>}
    </div>
    <Resources role="away" teamName={matchTeamName(view, 'away')} rerolls={view.awayRerolls} resources={view.awayResources}/>
  </div>;
}
