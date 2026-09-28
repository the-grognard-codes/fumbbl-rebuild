import { spriteUrl } from './LivePitch.tsx';
import type { SetupPlayer } from './setup-protocol.ts';

export function PlayerHoverCard({ player, anchor }: { player: SetupPlayer; anchor: DOMRect }) {
  const left = Math.max(8, Math.min(anchor.right + 12, window.innerWidth - 326));
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - 390));
  return <aside className={`live-player-hover ${player.role}`} role="tooltip" style={{ left, top }} aria-label={`${player.name} player card`}>
    <header><div><small>#{player.number ?? player.slot} · {player.role} team</small><h3>{player.name}</h3><span>{player.position ?? player.role}</span>
      <dl className="live-player-stats">
        {([['MA', player.ma], ['ST', player.st], ['AG', player.ag === undefined ? undefined : `${player.ag}+`],
          ['PA', player.pa ? `${player.pa}+` : '—'], ['AV', player.av === undefined ? undefined : `${player.av}+`]] as const).map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}
      </dl></div>
      {spriteUrl(player) && <img src={spriteUrl(player)!} alt=""/>}</header>
    <div className="live-player-card-detail"><strong>Skills & traits</strong><p>{player.skills?.join(', ') || 'None'}</p></div>
    <div className="live-player-card-detail"><strong>Match notes</strong><p>{player.state} · {player.x === null ? player.offPitch ?? 'Off pitch' : `Square ${player.x}, ${player.y}`}</p></div>
  </aside>;
}
