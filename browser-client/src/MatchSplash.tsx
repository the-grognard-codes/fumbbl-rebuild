import { useTeamColorContext } from './TeamColorArtProvider.tsx';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { MatchArt } from './MatchScoreboard.tsx';
import { announcementHeadline, announcementText } from './match-announcements.ts';
import type { MatchAnnouncement } from './match-announcements.ts';
import './match-splash.css';
import { teamColorRamps } from './team-color-art.ts';
import { weatherPresentation } from './weather-presentation.ts';
import { splashOutline } from './splash-colors.ts';

export type MatchSplashProps = {
  announcement: MatchAnnouncement; onDismiss: () => void; hold: boolean;
  exiting: boolean; rate: number; onExited?: () => void; cameraEnd?: 'home' | 'away';
  icon?: ReactNode; colors?: { accent?: string; secondary?: string };
};

/** No focus transfer: Escape and the explicit button dismiss without reaching pitch shortcuts. */
export function MatchSplash({ announcement, onDismiss, hold, exiting, rate, icon, colors, onExited, cameraEnd = 'home' }: MatchSplashProps) {
  const teamColors = useTeamColorContext();
  const [phase, setPhase] = useState<'enter' | 'impact' | 'hold'>('enter');
  useEffect(() => {
    setPhase('enter');
    const impact = setTimeout(() => setPhase('impact'), 350 / rate);
    const hold = setTimeout(() => setPhase('hold'), 700 / rate);
    return () => { clearTimeout(impact); clearTimeout(hold); };
  }, [announcement.id, rate]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      event.preventDefault(); event.stopImmediatePropagation(); onDismiss();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [onDismiss]);
  const kit = teamColors[announcement.team];
  const neutral = announcement.kind === 'weather' || announcement.kind === 'halfTime' || announcement.code === 'DRAW'
    || announcement.kind === 'kickoff' && !['SOLID_DEFENCE', 'QUICK_SNAP', 'CHARGE', 'HIGH_KICK'].includes(announcement.code ?? '');
  const weatherTint: Record<string, string> = { SWELTERING_HEAT: '#ef9847', VERY_SUNNY: '#ffe17b', NICE: '#49beae', POURING_RAIN: '#9bbdd2', BLIZZARD: '#edf5ff' };
  const emblem = announcement.kind === 'weather' ? `weather/weather_${weatherPresentation(announcement.code ?? '').sprite}.png`
    : announcement.kind === 'kickoff' ? 'match-events/kickoff.svg' : ['halfTime', 'fullTime'].includes(announcement.kind) ? 'match-events/whistle.svg' : null;
  const accent = neutral ? weatherTint[announcement.code ?? ''] ?? '#edb644'
    : colors?.accent ?? teamColorRamps.find(ramp => ramp.id === kit?.primary)?.colors[9] ?? '#edb644';
  const secondary = neutral ? '#426c9b' : colors?.secondary ?? teamColorRamps.find(ramp => ramp.id === kit?.secondary)?.colors[12] ?? '#426c9b';
  const left = teamColorRamps.find(ramp => ramp.id === teamColors[cameraEnd]?.primary)?.colors[9] ?? (cameraEnd === 'home' ? '#426c9b' : '#edb644');
  const right = teamColorRamps.find(ramp => ramp.id === teamColors[cameraEnd === 'home' ? 'away' : 'home']?.primary)?.colors[9] ?? (cameraEnd === 'home' ? '#edb644' : '#426c9b');
  const style = { '--splash-accent': accent, '--splash-secondary': secondary, '--splash-outline': splashOutline(accent),
    '--splash-left': left, '--splash-right': right, '--splash-left-outline': splashOutline(left), '--splash-right-outline': splashOutline(right) } as CSSProperties;
  const screenTeam = cameraEnd === 'away' ? announcement.team === 'home' ? 'away' : 'home' : announcement.team;
  const { touchdown } = announcement;
  return <div className="match-splash-shade" data-announcement-id={announcement.id} data-exiting={exiting} data-phase={exiting ? 'exit' : phase} data-team={screenTeam}
    style={{ '--splash-rate': rate } as CSSProperties}
    onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === 'match-splash-dim-out' && exiting) onExited?.(); }}
    onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={event => event.stopPropagation()}>
    <section className={`match-splash match-splash-${announcement.kind}`} data-code={announcement.code} data-held={hold} style={style} aria-label="Match announcement">
      <button type="button" className="match-splash-close" aria-label="Dismiss announcement" aria-keyshortcuts="Escape"
        onClick={event => { event.stopPropagation(); onDismiss(); }}><span aria-hidden="true">×</span></button>
      <div className="match-splash-backdrop" aria-hidden="true"/>
      <div className="match-splash-ribbon" aria-hidden="true"/>
      {announcement.kind === 'halfTime' && <div className="match-splash-half-pitch" aria-hidden="true"/>}
      {(announcement.kind === 'touchdown' || announcement.kind === 'fullTime' && announcement.code === 'WIN') && <div className="match-splash-burst" aria-hidden="true"/>}
      {announcement.kind === 'weather' && <div className="match-splash-weather-fx" aria-hidden="true"/>}
      <div className="match-splash-icon" aria-hidden="true">{icon ?? (emblem ? <img className="match-art" src={`${import.meta.env.BASE_URL}assets/game/ui/${emblem}`} alt=""/> : <MatchArt name={announcement.helmet} colors={teamColors[announcement.team]}/>)}</div>
      {!neutral && announcement.kind !== 'fullTime' && <p className="match-splash-team">{announcement.teamName}</p>}
      <h2>{announcementHeadline(announcement)}</h2>
      {touchdown ? <div className="match-splash-reason">
        {touchdown.scorer && <div className="match-splash-scorer">{touchdown.scorer}</div>}
        <dl className="match-splash-score" aria-label="Current score">
          {(['home', 'away'] as const).map(team => <div key={team} data-scoring={announcement.team === team}>
            <dt>{touchdown.score[team].name}</dt>
            <dd>{touchdown.score[team].points}</dd>
          </div>)}
        </dl>
      </div> : announcement.reason && <p className="match-splash-reason">{announcement.reason}</p>}
    </section>
  </div>;
}

/** Mounted continuously so each changed message is announced once, independently of decorative artwork. */
export function MatchAnnouncementStatus({ announcement }: { announcement: MatchAnnouncement | null }) {
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement
    ? <span key={announcement.id}>{announcementText(announcement)}</span> : null}</div>;
}
