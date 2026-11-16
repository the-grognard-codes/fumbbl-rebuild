import { useTeamColorContext } from './TeamColorArtProvider.tsx';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { MatchArt } from './MatchScoreboard.tsx';
import { announcementHeadline, announcementText } from './match-announcements.ts';
import type { MatchAnnouncement } from './match-announcements.ts';
import './match-splash.css';
import { teamColorRamps } from './team-color-art.ts';

export type MatchSplashProps = {
  announcement: MatchAnnouncement; onDismiss: () => void; hold: boolean;
  exiting: boolean; rate: number; onExited?: () => void;
  icon?: ReactNode; colors?: { accent?: string; secondary?: string };
};

/** No focus transfer: Escape and the explicit button dismiss without reaching pitch shortcuts. */
export function MatchSplash({ announcement, onDismiss, hold, exiting, rate, icon, colors, onExited }: MatchSplashProps) {
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
  const style = { '--splash-accent': colors?.accent ?? teamColorRamps.find(ramp => ramp.id === kit?.primary)?.colors[9],
    '--splash-secondary': colors?.secondary ?? teamColorRamps.find(ramp => ramp.id === kit?.secondary)?.colors[12] } as CSSProperties;
  return <div className="match-splash-shade" data-announcement-id={announcement.id} data-exiting={exiting} data-phase={exiting ? 'exit' : phase} data-team={announcement.team}
    style={{ '--splash-rate': rate } as CSSProperties}
    onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === 'match-splash-dim-out' && exiting) onExited?.(); }}
    onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={event => event.stopPropagation()}>
    <section className={`match-splash match-splash-${announcement.kind}`} style={style} aria-label="Match announcement">
      {hold && <button type="button" className="match-splash-close" aria-label="Dismiss announcement" aria-keyshortcuts="Escape"
        onClick={event => { event.stopPropagation(); onDismiss(); }}><span aria-hidden="true">×</span></button>}
      <div className="match-splash-backdrop" aria-hidden="true"/>
      <div className="match-splash-ribbon" aria-hidden="true"/>
      <div className="match-splash-rule" aria-hidden="true"/>
      <div className="match-splash-icon" aria-hidden="true">{icon ?? <MatchArt name={announcement.helmet} colors={teamColors[announcement.team]}/>}</div>
      <p className="match-splash-team">{announcement.teamName}</p>
      <h2>{announcementHeadline(announcement)}</h2>
      {announcement.reason && <p className="match-splash-reason">{announcement.reason}</p>}
    </section>
  </div>;
}

/** Mounted continuously so each changed message is announced once, independently of decorative artwork. */
export function MatchAnnouncementStatus({ announcement }: { announcement: MatchAnnouncement | null }) {
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement
    ? <span key={announcement.id}>{announcementText(announcement)}</span> : null}</div>;
}
