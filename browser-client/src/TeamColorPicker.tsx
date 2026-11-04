import { teamColorRamps } from './team-color-art.ts';
import { defaultTeamColors, type TeamColors } from './team-colors.ts';
import { useTeamColorContext } from './TeamColorArtProvider.tsx';
import { resolvePlayerArt, resolvePlayerPortrait } from './player-art.ts';
import { MatchArt } from './MatchScoreboard.tsx';
import type { SetupPlayer } from './setup-protocol.ts';
import './team-colors.css';

export function builderArtPlayer(rosterId: string, positionId: string): SetupPlayer {
  return { id: 'preview', name: '', slot: 1, role: 'home', state: 'standing', x: 0, y: 0, art: { rosterId, positionId } };
}
export function BuilderPortrait({ rosterId, positionId }: { rosterId: string; positionId: string }) {
  const colors = useTeamColorContext();
  const url = resolvePlayerPortrait(builderArtPlayer(rosterId, positionId), colors.home);
  return url ? <img className="sprite" src={url} alt=""/> : null;
}
export function TeamColorPicker({ rosterId, colors = defaultTeamColors(rosterId), disabled, onChange }: {
  rosterId: string; colors?: TeamColors; disabled: boolean; onChange: (colors: TeamColors) => void;
}) {
  useTeamColorContext();
  const player = builderArtPlayer(rosterId, rosterId === 'orc' ? 'orc-lineman' : 'lineman');
  const body = resolvePlayerArt(player, { end: 'home', facing: 'south-east', colors })?.body;
  return <section className="panel team-colors" aria-label="Team colors">
    {(['primary', 'secondary'] as const).map(channel => <fieldset key={channel} disabled={disabled}>
      <legend>{channel === 'primary' ? 'Primary' : 'Secondary'}: <strong>{teamColorRamps.find(ramp => ramp.id === colors[channel])?.name}</strong></legend>
      <div className="team-color-grid" role="radiogroup" aria-label={`${channel === 'primary' ? 'Primary' : 'Secondary'} color`}>
        {teamColorRamps.map((ramp, index) => <button key={ramp.id} type="button" role="radio" aria-label={ramp.name}
          aria-checked={colors[channel] === ramp.id} tabIndex={colors[channel] === ramp.id ? 0 : -1}
          title={ramp.name} style={{ backgroundColor: ramp.colors[9] }}
          onClick={() => onChange({ ...colors, [channel]: ramp.id })}
          onKeyDown={event => {
            const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 }[event.key];
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 15 : offset === undefined ? null : (index + offset + 16) % 16;
            if (next === null) return;
            event.preventDefault(); onChange({ ...colors, [channel]: teamColorRamps[next].id });
            (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
          }}><span aria-hidden="true">{colors[channel] === ramp.id ? '✓' : ''}</span></button>)}
      </div>
    </fieldset>)}
    <div className="team-color-preview" aria-label="Unsaved kit preview">
      <MatchArt name={rosterId === 'orc' ? 'orc' : 'human'} colors={colors}/>
      {body && <img src={body.url} alt="Pitch player preview" width={body.width} height={body.height}/>}
    </div>
  </section>;
}
