import { useTeamColorContext } from './TeamColorArtProvider.tsx';
import { useRef, useState } from 'react';
import { spriteUrl } from './LivePitch.tsx';
import { resolvePlayerPortrait } from './player-art.ts';
import { playerCardStatuses, playerCardSubtypes } from './player-card-details.ts';
import type { SetupPlayer } from './setup-protocol.ts';
import { useTooltipLayer } from './Tooltip.tsx';

export function PlayerHoverCard({ player, teamName }: { player: SetupPlayer; teamName: string }) {
  const card = useRef<HTMLElement>(null);
  useTooltipLayer(card, true);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const dock = player.role === 'home' ? 'left' : 'right';
  const subtypes = playerCardSubtypes(player);
  const colors = useTeamColorContext();
  const image = resolvePlayerPortrait(player, colors[player.role]) ?? spriteUrl(player);
  return <aside ref={card} popover="manual" className={`live-player-hover tooltip-popover ${player.role} dock-${dock}`} role="tooltip" aria-label={`${player.name} player card`}>
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
    <div className="live-player-card-detail"><strong>Skills & traits</strong><p>{(player.skillMarkers?.details ?? player.skills)?.join(', ') || 'None'}</p></div>
    <div className="live-player-card-detail"><strong>Status:</strong><p>{playerCardStatuses(player).map((entry, index) =>
      <span key={entry.label}>{index > 0 && ', '}<span className={entry.negative ? 'live-negative-status' : undefined}>{entry.label}</span></span>)}</p></div>
  </aside>;
}
