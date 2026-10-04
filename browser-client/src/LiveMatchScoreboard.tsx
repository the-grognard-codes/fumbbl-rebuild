import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { MatchArt } from './MatchScoreboard.tsx';
import { hudResources, turnSlots } from './hud-model.ts';
import type { HudResource } from './hud-model.ts';
import { clockValues, formatClock } from './match-clock.ts';
import { matchTeamName } from './match-team-name.ts';
import type { SetupState } from './setup-protocol.ts';

function Resources({ role, teamName, items }: { role: 'home' | 'away'; teamName: string; items: HudResource[] }) {
  const id = useId();
  if (!items.length) return null;
  return <section className={`live-resources ${role}`} aria-label={`${teamName} resources`}>
    <div className="live-resource-counts">{items.map(item => <div key={item.kind} className="live-resource-item">
      <button type="button" className={`live-resource ${item.kind}`} title={`${item.label}: ${item.count} available`}
        aria-label={`${item.label}: ${item.count} available`} aria-describedby={`${id}-${item.kind}`} style={{ cursor: 'help' }}>
        {item.kind === 'reroll' ? <img src={`${import.meta.env.BASE_URL}assets/game/ui/reroll-v1.png`} alt=""/>
          : item.kind === 'apothecary' ? <MatchArt name="apothecary"/>
            : <span aria-hidden="true" className="live-resource-glyph">{item.kind === 'assistantCoach' ? 'AC' : 'CL'}</span>}
        <b>{item.count}</b>
      </button>
      <span className="live-resource-tooltip" role="tooltip" id={`${id}-${item.kind}`}>{item.label} · {item.count} available</span>
    </div>)}</div>
  </section>;
}

function ClockPanel({ role, teamName, clock }: { role: 'home' | 'away'; teamName: string; clock: ReturnType<typeof clockValues> }) {
  const active = clock.activeRole === role;
  const turn = active ? clock.turnMs : 120_000;
  const bank = role === 'home' ? clock.homeReserveMs : clock.awayReserveMs;
  return <div className={`live-chess-clock ${role}${active ? ' active' : ''}${active && turn <= 15_000 ? ' urgent' : ''}`}
    aria-label={`${teamName}: time bank ${formatClock(bank)}, turn ${formatClock(turn)}`}>
    <span>BANK <b>{formatClock(bank)}</b></span>
    <span data-clock-line="turn">TURN <b>{formatClock(turn)}</b></span>
  </div>;
}

function TurnTrack({ role, teamName, half, teamTurn, phase }: { role: 'home' | 'away'; teamName: string; half: number; teamTurn: number; phase: SetupState['phase'] }) {
  return <ol className={`live-turn-track ${role}`} aria-label={`${teamName} turns`}>
    {turnSlots(half, teamTurn, phase).map(slot => <li key={slot.number} className={slot.past ? 'past' : undefined}
      aria-current={slot.current ? 'step' : undefined}>{slot.number}</li>)}
  </ol>;
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

/** The approved coach HUD, bound only to the server projection. */
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
  const clock = view.clock ? clockValues(view.clock, elapsedSinceProjection, paused) : null;
  const homeName = matchTeamName(view, 'home');
  const awayName = matchTeamName(view, 'away');
  const homeArt = view.players.find(player => player.role === 'home' && player.art)?.art?.rosterId;
  const awayArt = view.players.find(player => player.role === 'away' && player.art)?.art?.rosterId;
  return <div className="match-scoreboard live-match-scoreboard" aria-label="Match scoreboard">
    <Resources role="home" teamName={homeName} items={hudResources(view, 'home')}/>
    {clock && <ClockPanel role="home" teamName={homeName} clock={clock}/>}
    <div className="coach-score-center">
      <div className="live-team-nameplate home">
        {(homeArt === 'human' || homeArt === 'orc') && <MatchArt name={homeArt}/>}
        <TeamName name={homeName}/>
      </div>
      <div className="coach-score">
        <b aria-label={`${homeName} score ${view.homeScore}`}>{view.homeScore}</b><span aria-hidden="true">–</span>
        <b aria-label={`${awayName} score ${view.awayScore}`}>{view.awayScore}</b>
      </div>
      <div className="live-team-nameplate away">
        <TeamName name={awayName}/>
        {(awayArt === 'human' || awayArt === 'orc') && <MatchArt name={awayArt}/>}
      </div>
    </div>
    {clock && <ClockPanel role="away" teamName={awayName} clock={clock}/>}
    <Resources role="away" teamName={awayName} items={hudResources(view, 'away')}/>
    <TurnTrack role="home" teamName={homeName} half={view.half} teamTurn={view.homeTurn} phase={view.phase}/>
    <div className="coach-weather-slot" aria-hidden="true"/>
    <TurnTrack role="away" teamName={awayName} half={view.half} teamTurn={view.awayTurn} phase={view.phase}/>
  </div>;
}
