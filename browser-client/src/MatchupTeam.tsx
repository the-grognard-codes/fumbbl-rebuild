import type { ReactNode } from 'react';

export function MatchupTeam({ name, side, children }: { name: string; side: 'home' | 'away'; children?: ReactNode }) {
  return <div className={`spectate-team spectate-team-${side}`}>
    <span className="spectate-team-mark" aria-hidden="true">
      <svg viewBox="0 0 44 52" focusable="false"><path d="M1.5 1.5H42.5V40.5L22 50.5L1.5 40.5Z" /></svg>
      <span>{name.trim().slice(0, 1).toUpperCase()}</span>
    </span>
    <div><h3>{name}</h3>{children}</div>
  </div>;
}
