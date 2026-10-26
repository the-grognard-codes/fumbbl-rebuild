import { useLayoutEffect, useRef, useState } from 'react';
import { drivePhaseRows } from './drive-phase-tracker.ts';
import type { DriveTrackerPresentation } from './setup-protocol.ts';

export function DrivePhaseTracker({ tracker }: { tracker: DriveTrackerPresentation }) {
  const element = useRef<HTMLOListElement>(null);
  const [top, setTop] = useState(64);
  const [maximumHeight, setMaximumHeight] = useState<number>();
  const side = tracker.receivingRole;
  useLayoutEffect(() => {
    const list = element.current;
    const scoreboard = list?.parentElement;
    const host = list?.closest<HTMLElement>('.coach-match');
    if (!list || !scoreboard || !host) return;
    const resources = scoreboard.querySelector<HTMLElement>(`.live-resources.${side}`)
      ?? scoreboard.querySelector<HTMLElement>('.coach-score-center');
    const menu = host.querySelector<HTMLElement>(side === 'away' ? '.match-menu-triggers' : '.match-debug-toggle');
    const docks = Array.from(host.querySelectorAll<HTMLElement>(`.live-dugout.${side}, .match-history > section`));
    const align = () => {
      const start = Math.max(resources?.getBoundingClientRect().bottom ?? 0, menu?.getBoundingClientRect().bottom ?? 0) + 6;
      setTop(start - scoreboard.getBoundingClientRect().top);
      const visibleDocks = docks.map(dock => dock.getBoundingClientRect()).filter(box => box.height > 0);
      const lowerEdge = Math.min(host.getBoundingClientRect().bottom, ...visibleDocks.map(box => box.top));
      setMaximumHeight(Math.max(24, lowerEdge - start - 8));
    };
    const observer = new ResizeObserver(align);
    for (const anchor of [host, scoreboard, resources, menu, ...docks]) if (anchor) observer.observe(anchor);
    align();
    return () => observer.disconnect();
  }, [tracker, side]);
  useLayoutEffect(() => {
    const list = element.current;
    const current = list?.querySelector<HTMLElement>('[aria-current=step]');
    if (list && current) list.scrollTop = Math.max(0, current.offsetTop - (list.clientHeight - current.offsetHeight) / 2);
  }, [tracker, top, maximumHeight]);
  return <ol ref={element} className={`drive-phase-tracker ${side}`} aria-label="Start of drive"
    style={{ top, maxHeight: maximumHeight, '--drive-tracker-top': `${top}px` } as React.CSSProperties}>
    {drivePhaseRows(tracker).map(row => <li key={row.id} data-phase={row.id}
      className={[row.past ? 'past' : '', row.event ? 'kickoff-event' : ''].filter(Boolean).join(' ') || undefined}
      aria-current={row.current ? 'step' : undefined}>{row.label}</li>)}
  </ol>;
}
