import { spriteUrl } from './LivePitch.tsx';
import type { OffPitchCategory, SetupPlayer } from './setup-protocol.ts';

const zones: { id: OffPitchCategory; label: string }[] = [
  { id: 'reserve', label: 'Reserves' },
  { id: 'knockedOut', label: 'Knocked out' },
  { id: 'casualty', label: 'Casualties' },
  { id: 'sentOff', label: 'Sent off' },
  { id: 'other', label: 'Other' },
];

export function LiveDugouts({ players, onSelect }: { players: SetupPlayer[]; onSelect: (id: string) => void }) {
  return <div className="live-dugouts match-bench" aria-label="Team dugouts">{(['home', 'away'] as const).map(role => {
    const team = players.filter(player => player.role === role && player.x === null);
    return <section key={role} className={`live-dugout ${role}`} aria-label={`${role} dugout`}>
      {zones.filter(zone => zone.id === 'reserve' || zone.id === 'knockedOut' || zone.id === 'casualty' || team.some(player => player.offPitch === zone.id)).map(zone => {
        const members = team.filter(player => (player.offPitch ?? 'reserve') === zone.id);
        return <div className="live-dugout-zone" key={zone.id}><span>{zone.label} <b>{members.length}</b></span><div className="live-dugout-players">
          {members.map(player => <button key={player.id} type="button" onClick={() => onSelect(player.id)} aria-label={`${player.name}, number ${player.number ?? player.slot}, ${zone.label}`} title={`${player.name} #${player.number ?? player.slot} · ${zone.label}`}>
            {spriteUrl(player) ? <img src={spriteUrl(player)!} alt=""/> : <span>{player.number ?? player.slot}</span>}
          </button>)}
        </div></div>;
      })}
    </section>;
  })}</div>;
}
