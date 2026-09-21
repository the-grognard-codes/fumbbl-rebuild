import { useId } from 'react';

type ArtName = 'human' | 'orc' | 'weather' | 'wizard' | 'keg' | 'bribe' | 'apothecary' | 'ball';
const art: Record<ArtName, number[]> = {
  human: [64, 106, 336, 317], orc: [515, 67, 311, 355], weather: [943, 97, 340, 331],
  wizard: [1361, 81, 383, 340], keg: [81, 512, 293, 306], bribe: [504, 492, 323, 315],
  apothecary: [931, 489, 360, 315], ball: [1385, 514, 341, 292]
};

export function MatchArt({ name }: { name: ArtName }) {
  const [x, y, width, height] = art[name];
  return <svg className={`match-art art-${name}`} viewBox={`${x} ${y} ${width} ${height}`} aria-hidden="true" focusable="false">
    <image href={`${import.meta.env.BASE_URL}preview/mvp-art/match-ui-icon-atlas-v1.png`} width="1774" height="887"/>
  </svg>;
}

function TeamResources({ team }: { team: 'home' | 'away' }) {
  const id = useId();
  const home = team === 'home';
  const resources: { icon: ArtName; label: string; count: number }[] = [
    { icon: 'wizard', label: 'Wizard', count: home ? 1 : 0 },
    { icon: 'keg', label: 'Kegs', count: home ? 0 : 2 },
    { icon: 'bribe', label: 'Bribes', count: home ? 1 : 0 },
    { icon: 'apothecary', label: 'Apothecary', count: home ? 1 : 0 }
  ];
  return <section className={`team-resources reroll-box ${team}`} aria-label={`${home ? 'Home' : 'Away'} team resources`}>
    <div className="reroll-main"><span>Rerolls</span><strong>{home ? 2 : 1}</strong></div>
    <div className="inducement-icons">{resources.map(({ icon, label, count }) => <div key={icon} className={`resource-item ${!count ? 'empty' : ''}`}>
      <button type="button" aria-label={`${label}: ${count} available`} aria-describedby={`${id}-${icon}`}><MatchArt name={icon}/><b>{count}</b></button>
      <span className="resource-tooltip" role="tooltip" id={`${id}-${icon}`}>{label} · {count} available</span>
    </div>)}</div>
  </section>;
}

export function MatchScoreboard({ turn, half }: { turn: number; half: number }) {
  return <div className="match-scoreboard reference-scoreboard" aria-label="Match scoreboard">
    <TeamResources team="home"/>
    <div className="team-nameplate home"><MatchArt name="human"/><strong>Humans</strong><b aria-label="Home score 1">1</b></div>
    <div className="match-clock"><strong>Half {half}</strong><span>Turn {turn} / 8</span><small>Humans to act</small></div>
    <div className="team-nameplate away"><span className="weather"><MatchArt name="weather"/><small>Nice</small></span><strong>Orcs</strong><b aria-label="Away score 0">0</b><MatchArt name="orc"/></div>
    <TeamResources team="away"/>
  </div>;
}
