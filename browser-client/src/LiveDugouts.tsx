import { useState } from 'react';

import { spriteUrl } from './LivePitch.tsx';
import type { OffPitchCategory, SetupPlayer } from './setup-protocol.ts';

type DugoutMode = 'compact' | 'normal' | 'expanded';
type Zone = { id: Exclude<OffPitchCategory, 'pitch' | 'other'>; label: string };

const zones: Zone[] = [
  { id: 'reserve', label: 'Reserves' },
  { id: 'knockedOut', label: 'Knocked out' },
  { id: 'casualty', label: 'Casualties' },
  { id: 'sentOff', label: 'Sent off' },
];

function DugoutArrow({ direction }: { direction: 'up' | 'down' }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d={direction === 'up' ? 'M4 13 10 7 16 13' : 'M4 7 10 13 16 7'}/>
  </svg>;
}

export function LiveDugouts({ players, homeName, awayName, onSelect, onFocusPlayer, onBlurPlayer }: {
  players: SetupPlayer[]; homeName?: string | null; awayName?: string | null; onSelect: (id: string) => void;
  onFocusPlayer?: (id: string, anchor: DOMRect) => void; onBlurPlayer?: () => void;
}) {
  const [modes, setModes] = useState<Record<'home' | 'away', DugoutMode>>({ home: 'normal', away: 'normal' });
  const setMode = (role: 'home' | 'away', mode: DugoutMode) => setModes(current => ({ ...current, [role]: mode }));
  return <div className="live-dugouts match-bench" aria-label="Team dugouts">{(['home', 'away'] as const).map(role => {
    const mode = modes[role];
    const name = role === 'home' ? homeName || 'Home' : awayName || 'Away';
    const team = players.filter(player => player.role === role);
    return <section key={role} className={`live-dugout ${role} ${mode}`} aria-label={`${role} dugout`}>
      <header className="live-dugout-heading"><strong>{name} Dugout</strong><div className="live-dugout-controls">
        {mode !== 'expanded' && <button type="button" aria-label={`${mode === 'compact' ? 'Restore' : 'Expand'} ${role} dugout`} title={mode === 'compact' ? 'Restore dugout' : 'Expand dugout'} onClick={() => setMode(role, mode === 'compact' ? 'normal' : 'expanded')}><DugoutArrow direction="up"/></button>}
        {mode !== 'compact' && <button type="button" aria-label={`${mode === 'expanded' ? 'Restore' : 'Minimize'} ${role} dugout`} title={mode === 'expanded' ? 'Restore dugout' : 'Minimize dugout'} onClick={() => setMode(role, mode === 'expanded' ? 'normal' : 'compact')}><DugoutArrow direction="down"/></button>}
      </div></header>
      {mode !== 'compact' && <div className="live-dugout-zones">{zones.map(zone => {
        const members = team.filter(player => player.x === null && (player.offPitch ?? 'reserve') === zone.id);
        return <div className="live-dugout-zone" key={zone.id}><span>{zone.label} <b>{members.length}</b></span><div className="live-dugout-players">
          {members.map(player => <button key={player.id} type="button" onClick={() => onSelect(player.id)}
            onPointerEnter={event => { if (event.pointerType !== 'touch') onFocusPlayer?.(player.id, event.currentTarget.getBoundingClientRect()); }} onPointerLeave={onBlurPlayer}
            onFocus={event => onFocusPlayer?.(player.id, event.currentTarget.getBoundingClientRect())} onBlur={onBlurPlayer}
            aria-label={`${player.name}, number ${player.number ?? player.slot}, ${zone.label}`}>
            {spriteUrl(player) ? <img src={spriteUrl(player)!} alt=""/> : <span>{player.number ?? player.slot}</span>}
          </button>)}
        </div></div>;
      })}</div>}
    </section>;
  })}</div>;
}
