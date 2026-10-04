import { useLayoutEffect, useRef, useState } from 'react';
import { spriteUrl } from './LivePitch.tsx';
import { resolvePlayerPortrait } from './player-art.ts';
import { playerCardStatus, playerCardSubtypes } from './player-card-details.ts';
import type { SetupPlayer } from './setup-protocol.ts';

export function PlayerHoverCard({ player, anchor, teamName, dock }: { player: SetupPlayer; anchor: DOMRect; teamName: string; dock?: 'left' | 'right' }) {
  const card = useRef<HTMLElement>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const style = dock ? undefined : { left: Math.max(8, Math.min(anchor.right + 12, window.innerWidth - 326)),
    top: Math.max(8, Math.min(anchor.top, window.innerHeight - 390)) };
  useLayoutEffect(() => {
    if (dock) return;
    const element = card.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const beside = anchor.right + width + 20 <= window.innerWidth ? anchor.right + 12 : anchor.left - width - 12;
    element.style.left = `${Math.max(8, Math.min(beside, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - height - 8))}px`;
  }, [anchor, player, dock]);
  const subtypes = playerCardSubtypes(player);
  const image = resolvePlayerPortrait(player) ?? spriteUrl(player);
  return <aside ref={card} className={`live-player-hover ${player.role}${dock ? ` dock-${dock}` : ''}`} role="tooltip" style={style} aria-label={`${player.name} player card`}>
    <header><div className="live-player-card-intro"><small>#{player.number ?? player.slot} · {teamName}</small><h3>{player.name}</h3>
      <span>{player.position ?? player.role}{subtypes && ` (${subtypes})`}</span></div>
      <div className="live-player-card-main">
      <dl className="live-player-stats">
        {([['MA', player.ma], ['ST', player.st], ['AG', player.ag === undefined ? undefined : `${player.ag}+`],
          ['PA', player.pa ? `${player.pa}+` : '—'], ['AV', player.av === undefined ? undefined : `${player.av}+`]] as const).map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}
      </dl>
      {image && failedImage !== image ? <img src={image} alt="" onError={() => setFailedImage(image)}/>
        : <span className="live-player-card-token" aria-label={`${teamName} number ${player.number ?? player.slot}`}>{player.number ?? player.slot}</span>}</div></header>
    <div className="live-player-card-detail"><strong>Skills & traits</strong><p>{player.skills?.join(', ') || 'None'}</p></div>
    <div className="live-player-card-detail"><strong>Status</strong><p>{playerCardStatus(player)}</p></div>
  </aside>;
}
