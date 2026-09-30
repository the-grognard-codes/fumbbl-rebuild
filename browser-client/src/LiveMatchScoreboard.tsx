import { useLayoutEffect, useRef } from 'react';
import { MatchArt } from './MatchScoreboard.tsx';
import type { SetupState, TeamResources } from './setup-protocol.ts';

function Resources({ role, rerolls, resources }: { role: 'home' | 'away'; rerolls: number; resources?: TeamResources }) {
  return <section className={`live-resources ${role}`} aria-label={`${role} resources`}>
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
  const homeArt = view.players.find(player => player.role === 'home' && player.art)?.art?.rosterId;
  const awayArt = view.players.find(player => player.role === 'away' && player.art)?.art?.rosterId;
  return <div className="match-scoreboard live-match-scoreboard" aria-label="Match scoreboard">
    <Resources role="home" rerolls={view.homeRerolls} resources={view.homeResources}/>
    <div className="live-team-nameplate home">
      {(homeArt === 'human' || homeArt === 'orc') && <MatchArt name={homeArt}/>}
      <TeamName name={view.homeTeamName ?? 'Home'}/>
      <b aria-label={`Home score ${view.homeScore}`}>{view.homeScore}</b>
    </div>
    <div className="live-match-clock"><strong>Turn {view.turn}</strong><span>Half {view.half} · {view.phase.replaceAll('_', ' ')}</span><small>{view.weather === 'Nice' && <MatchArt name="weather"/>}{view.weather}</small></div>
    <div className="live-team-nameplate away">
      <TeamName name={view.awayTeamName ?? 'Away'}/>
      <b aria-label={`Away score ${view.awayScore}`}>{view.awayScore}</b>
      {(awayArt === 'human' || awayArt === 'orc') && <MatchArt name={awayArt}/>}
    </div>
    <Resources role="away" rerolls={view.awayRerolls} resources={view.awayResources}/>
  </div>;
}
