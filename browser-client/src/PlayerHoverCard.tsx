import { useLayoutEffect, useRef } from 'react';
import { spriteUrl } from './LivePitch.tsx';
import { playerCardStatus, playerCardSubtypes } from './player-card-details.ts';
import type { SetupPlayer } from './setup-protocol.ts';

export function PlayerHoverCard({ player, anchor, teamName }: { player: SetupPlayer; anchor: DOMRect; teamName: string }) {
  const card = useRef<HTMLElement>(null);
  const left = Math.max(8, Math.min(anchor.right + 12, window.innerWidth - 326));
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - 390));
  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const beside = anchor.right + width + 20 <= window.innerWidth ? anchor.right + 12 : anchor.left - width - 12;
    element.style.left = `${Math.max(8, Math.min(beside, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - height - 8))}px`;
  }, [anchor, player]);
  const subtypes = playerCardSubtypes(player);
  const image = spriteUrl(player);
  return <aside ref={card} className={`live-player-hover ${player.role}`} role="tooltip" style={{ left, top }} aria-label={`${player.name} player card`}>
    <header><div className="live-player-card-intro"><small>#{player.number ?? player.slot} · {teamName}</small><h3>{player.name}</h3>
      <span>{player.position ?? player.role}{subtypes && ` (${subtypes})`}</span></div>
      <div className="live-player-card-main">
      <dl className="live-player-stats">
        {([['MA', player.ma], ['ST', player.st], ['AG', player.ag === undefined ? undefined : `${player.ag}+`],
          ['PA', player.pa ? `${player.pa}+` : '—'], ['AV', player.av === undefined ? undefined : `${player.av}+`]] as const).map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}
      </dl>
      {image && <img src={image} alt=""/>}</div></header>
    <div className="live-player-card-detail"><strong>Skills & traits</strong><p>{player.skills?.join(', ') || 'None'}</p></div>
    <div className="live-player-card-detail"><strong>Status</strong><p>{playerCardStatus(player)}</p></div>
  </aside>;
}
