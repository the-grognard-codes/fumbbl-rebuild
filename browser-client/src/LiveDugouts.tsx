import { useState } from 'react';

import { spriteUrl } from './LivePitch.tsx';
import { resolvePlayerPortrait } from './player-art.ts';
import type { OffPitchCategory, SetupPlayer } from './setup-protocol.ts';
import './live-dugouts.css';

type DugoutMode = 'condensed' | 'compact' | 'expanded';
type Zone = { id: Exclude<OffPitchCategory, 'pitch'>; label: string };

const zones: Zone[] = [
  { id: 'reserve', label: 'Reserves' },
  { id: 'knockedOut', label: 'Knocked out' },
  { id: 'casualty', label: 'Casualties' },
  { id: 'sentOff', label: 'Sent off' },
  { id: 'other', label: 'Other' },
];

function DugoutArrow({ direction }: { direction: 'up' | 'down' }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d={direction === 'up' ? 'M4 13 10 7 16 13' : 'M4 7 10 13 16 7'}/>
  </svg>;
}

export function LiveDugouts({ players, homeName, awayName, onSelect, onFocusPlayer, onBlurPlayer,
  draggableIds, reserveDropIds, draggingPlayerId = '', onStartDrag, onEndDrag, onDropReserve }: {
  players: SetupPlayer[]; homeName?: string | null; awayName?: string | null; onSelect: (id: string) => void;
  onFocusPlayer?: (id: string, anchor: DOMRect) => void; onBlurPlayer?: () => void;
  draggableIds?: Set<string>; reserveDropIds?: Set<string>; draggingPlayerId?: string; onStartDrag?: (id: string) => void; onEndDrag?: () => void;
  onDropReserve?: (id: string, role: 'home' | 'away') => void;
}) {
  const [modes, setModes] = useState<Record<'home' | 'away', DugoutMode>>({ home: 'compact', away: 'compact' });
  const [failedImages, setFailedImages] = useState<Record<string, string>>({});
  const setMode = (role: 'home' | 'away', mode: DugoutMode) => setModes(current => ({ ...current, [role]: mode }));
  return <div className="live-dugouts match-bench" aria-label="Team dugouts">{(['home', 'away'] as const).map(role => {
    const mode = modes[role];
    const name = role === 'home' ? homeName || 'Home' : awayName || 'Away';
    const team = players.filter(player => player.role === role);
    const canReceive = mode === 'expanded' && !!onDropReserve && !!reserveDropIds?.has(draggingPlayerId)
      && team.some(player => player.id === draggingPlayerId && player.x !== null);
    return <section key={role} className={`live-dugout ${role} ${mode}${canReceive ? ' drop-ready' : ''}`} aria-label={`${name} dugout`}
      onDragOver={event => { if (canReceive) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
      onDrop={event => {
        if (!canReceive) return;
        const id = event.dataTransfer.getData('application/x-fumbbl-setup-player');
        if (id !== draggingPlayerId) return;
        event.preventDefault(); event.stopPropagation();
        onDropReserve?.(id, role); onEndDrag?.();
      }}>
      <header className="live-dugout-heading"><strong>{name} Dugout</strong><div className="live-dugout-controls">
        {mode !== 'expanded' && <button type="button" aria-label={`${mode === 'condensed' ? 'Restore' : 'Expand'} ${name} dugout`}
          title={mode === 'condensed' ? 'Show state counts' : 'Show players'} onClick={() => setMode(role, mode === 'condensed' ? 'compact' : 'expanded')}><DugoutArrow direction="up"/></button>}
        {mode !== 'condensed' && <button type="button" aria-label={`${mode === 'expanded' ? 'Minimize' : 'Condense'} ${name} dugout`}
          title={mode === 'expanded' ? 'Show state counts' : 'Show header only'} onClick={() => setMode(role, mode === 'expanded' ? 'compact' : 'condensed')}><DugoutArrow direction="down"/></button>}
      </div></header>
      {mode !== 'condensed' && <div className={`live-dugout-zones${mode === 'compact' ? ' compact-summary' : ''}`}>{zones.map(zone => {
        const members = team.filter(player => player.x === null && (player.offPitch ?? 'reserve') === zone.id);
        return <div className="live-dugout-zone" key={zone.id}>
          {mode === 'compact' ? <button type="button" className="live-dugout-zone-summary" onClick={() => setMode(role, 'expanded')}
            aria-label={`${name} ${zone.label}: ${members.length}; expand dugout`}>{zone.label} <b>{members.length}</b></button>
            : <><span>{zone.label} <b>{members.length}</b></span><div className="live-dugout-players">
          {members.map(player => { const image = resolvePlayerPortrait(player) ?? spriteUrl(player); return <button key={player.id} type="button" onClick={() => onSelect(player.id)} draggable={draggableIds?.has(player.id) ?? false}
            onDragStart={event => { if (!draggableIds?.has(player.id)) return;
              event.dataTransfer.setData('application/x-fumbbl-setup-player', player.id); event.dataTransfer.effectAllowed = 'move'; onStartDrag?.(player.id); }}
            onDragEnd={() => onEndDrag?.()}
            onPointerEnter={event => { if (event.pointerType !== 'touch') onFocusPlayer?.(player.id, event.currentTarget.getBoundingClientRect()); }} onPointerLeave={onBlurPlayer}
            onFocus={event => onFocusPlayer?.(player.id, event.currentTarget.getBoundingClientRect())} onBlur={onBlurPlayer}
            aria-label={`${player.name}, number ${player.number ?? player.slot}, ${zone.label}`}>
            {image && failedImages[player.id] !== image ? <img src={image} alt="" draggable={false} onError={() => setFailedImages(current => ({ ...current, [player.id]: image }))}/>
              : <span>{player.number ?? player.slot}</span>}
          </button>; })}
        </div></>}
        </div>;
      })}</div>}
    </section>;
  })}</div>;
}
