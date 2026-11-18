import { useTeamColorContext } from './TeamColorArtProvider.tsx';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { MatchArt } from './MatchScoreboard.tsx';
import { announcementHeadline, announcementOutcome, announcementScorer, announcementText } from './match-announcements.ts';
import type { MatchAnnouncement } from './match-announcements.ts';
import './match-splash.css';
import { teamColorRamps } from './team-color-art.ts';
import { weatherPresentation } from './weather-presentation.ts';
import { splashOutline } from './splash-colors.ts';

const kickoffEmblems: Record<string, string> = {
  GET_THE_REF: 'decision-prompts-v1/mole-referee.png',
  TIME_OUT: 'match-events/kickoff-stopwatch.png',
  SOLID_DEFENCE: 'match-events/kickoff-solid-defence.png',
  HIGH_KICK: 'match-events/kickoff-high-kick.png',
  CHEERING_FANS: 'match-events/kickoff-cheering-fans.png',
  WEATHER_CHANGE: 'dice-events-v1/weather.svg',
  BRILLIANT_COACHING: 'match-events/kickoff-tactics.png',
  QUICK_SNAP: 'match-events/kickoff-quick-snap.png',
  CHARGE: 'match-events/kickoff-charge.png',
  DODGY_SNACK: 'match-events/kickoff-dodgy-snack.png',
  PITCH_INVASION: 'match-events/kickoff-pitch-invasion.png',
};
const rampsById: ReadonlyMap<string, readonly string[]> = new Map(teamColorRamps.map(ramp => [ramp.id, ramp.colors]));

export type MatchSplashProps = {
  announcement: MatchAnnouncement | null; onDismiss: () => void; hold: boolean;
  exiting: boolean; rate: number; onExited?: () => void; onSkipGap?: () => void; cameraEnd?: 'home' | 'away';
  shadeHeld?: boolean; fading?: boolean;
  icon?: ReactNode; colors?: { accent?: string; secondary?: string };
};

/** No focus transfer: Escape and the explicit button dismiss without reaching pitch shortcuts. */
export function MatchSplash({ announcement, onDismiss, hold, exiting, rate, shadeHeld = false, fading = false,
  icon, colors, onExited, onSkipGap, cameraEnd = 'home' }: MatchSplashProps) {
  const [entranceRate] = useState(rate);
  const escapeAction = fading ? undefined : announcement ? onDismiss : onSkipGap;
  useEffect(() => {
    if (!escapeAction) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      event.preventDefault(); event.stopImmediatePropagation(); escapeAction();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [escapeAction]);
  const otherEnd = cameraEnd === 'home' ? 'away' : 'home';
  const screenTeam = cameraEnd === 'away' ? announcement?.team === 'home' ? 'away' : 'home' : announcement?.team;
  return <div className="match-splash-shade" data-announcement-id={announcement?.id} data-exiting={exiting}
    data-shade-held={shadeHeld} data-fading={fading} data-team={screenTeam}
    style={{ '--splash-rate': rate } as CSSProperties}
    onAnimationEnd={event => {
      if (!exiting || fading) return;
      const cardExit = event.target instanceof Element && event.target.classList.contains('match-splash')
        && ['match-splash-exit', 'match-splash-dim-out'].includes(event.animationName);
      if (cardExit) onExited?.();
    }}
    onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={event => event.stopPropagation()}>
    <div className="match-splash-shade-content" style={{ '--splash-entrance-rate': entranceRate } as CSSProperties}>
      {announcement && <MatchSplashCard key={announcement.id} {...{ announcement, onDismiss, hold, icon, colors, cameraEnd, otherEnd, fading }}/>}
    </div>
  </div>;
}

function MatchSplashCard({ announcement, onDismiss, hold, icon, colors, cameraEnd, otherEnd, fading }:
  Pick<MatchSplashProps, 'onDismiss' | 'hold' | 'icon' | 'colors'> & {
    announcement: MatchAnnouncement; cameraEnd: 'home' | 'away'; otherEnd: 'home' | 'away'; fading: boolean;
  }) {
  const teamColors = useTeamColorContext();
  const kit = teamColors[announcement.team];
  const neutral = announcement.kind === 'weather' || announcement.kind === 'halfTime' || announcement.code === 'DRAW'
    || announcement.kind === 'kickoff' && !announcement.teamSpecific;
  const { score, kickoffWeather } = announcement;
  const scorer = announcementScorer(announcement);
  const outcome = announcementOutcome(announcement);
  const highlightedTeam = announcement.kind === 'touchdown' || (outcome && announcement.code !== 'DRAW') ? announcement.team : null;
  const weatherCode = announcement.kind === 'weather' ? announcement.code : kickoffWeather?.code;
  const weatherSprite = weatherCode && weatherPresentation(weatherCode).sprite;
  const weatherTint: Record<string, string> = { SWELTERING_HEAT: '#ef9847', VERY_SUNNY: '#ffe17b', NICE: '#49beae', POURING_RAIN: '#9bbdd2', BLIZZARD: '#edf5ff' };
  const emblem = weatherSprite ? `weather/weather_${weatherSprite}.png`
    : announcement.kind === 'kickoff' ? kickoffEmblems[announcement.code ?? ''] : ['halfTime', 'fullTime'].includes(announcement.kind) ? 'match-events/whistle.png' : null;
  const accent = neutral ? weatherTint[weatherCode ?? ''] ?? '#edb644'
    : colors?.accent ?? rampsById.get(kit?.primary ?? '')?.[9] ?? '#edb644';
  const secondary = neutral ? '#426c9b' : colors?.secondary ?? rampsById.get(kit?.secondary ?? '')?.[12] ?? '#426c9b';
  const left = rampsById.get(teamColors[cameraEnd]?.primary ?? '')?.[9] ?? (cameraEnd === 'home' ? '#426c9b' : '#edb644');
  const right = rampsById.get(teamColors[otherEnd]?.primary ?? '')?.[9] ?? (otherEnd === 'home' ? '#426c9b' : '#edb644');
  const style = { '--splash-accent': accent, '--splash-secondary': secondary, '--splash-outline': splashOutline(accent),
    '--splash-left': left, '--splash-right': right, '--splash-left-outline': splashOutline(left), '--splash-right-outline': splashOutline(right) } as CSSProperties;
  return <section className={`match-splash match-splash-${announcement.kind}`} data-code={announcement.code} data-weather={weatherCode} data-held={hold} style={style} aria-label="Match announcement" inert={fading}>
      <button type="button" className="match-splash-close" aria-label="Dismiss announcement" aria-keyshortcuts="Escape"
        onClick={event => { event.stopPropagation(); onDismiss(); }}><span aria-hidden="true">×</span></button>
      <div className="match-splash-backdrop" aria-hidden="true"/>
      <div className="match-splash-ribbon" aria-hidden="true"/>
      {(announcement.kind === 'touchdown' || announcement.kind === 'halfTime' || announcement.kind === 'fullTime' && announcement.code === 'WIN')
        && <div className="match-splash-burst" aria-hidden="true"/>}
      {weatherCode && <div className="match-splash-weather-fx" aria-hidden="true"/>}
      <div className="match-splash-icon" aria-hidden="true">{icon ?? (emblem ? <img className="match-art" src={`${import.meta.env.BASE_URL}assets/game/ui/${emblem}`} alt=""/> : <MatchArt name={announcement.helmet} colors={teamColors[announcement.team]}/>)}</div>
      {!neutral && announcement.kind !== 'fullTime' && <p className="match-splash-team">{announcement.teamName}</p>}
      <h2>{announcementHeadline(announcement)}</h2>
      {score ? <div className="match-splash-reason">
        {scorer && <div className="match-splash-scorer">{scorer}</div>}
        <dl className="match-splash-score" aria-label="Current score">
          {(['home', 'away'] as const).map(team => <div key={team} data-highlighted={highlightedTeam === team}>
            <dt>{score[team].name}</dt>
            <dd>{score[team].points}</dd>
          </div>)}
        </dl>
        {outcome && <div className="match-splash-outcome">{outcome}</div>}
      </div> : kickoffWeather ? <p className="match-splash-reason">
        <strong className="match-splash-weather-condition">{kickoffWeather.label}</strong>
        {kickoffWeather.detail && <span>{kickoffWeather.detail}</span>}
      </p> : announcement.reason && <p className="match-splash-reason">{announcement.reason}</p>}
    </section>;
}

/** Mounted continuously so each changed message is announced once, independently of decorative artwork. */
export function MatchAnnouncementStatus({ announcement }: { announcement: MatchAnnouncement | null }) {
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement
    ? <span key={announcement.id}>{announcementText(announcement, 'splash')}</span> : null}</div>;
}
