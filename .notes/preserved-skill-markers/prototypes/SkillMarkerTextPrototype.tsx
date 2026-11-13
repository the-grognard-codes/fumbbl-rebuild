// Throwaway visual review of text marker artwork, separate from match routes and behavior.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { LivePitch } from './LivePitch.tsx';
import { PlayerHoverCard } from './PlayerHoverCard.tsx';
import type { SetupPlayer, SetupState } from './setup-protocol.ts';
import rawSamples from '../../.notes/player-skill-markers/text-round-1/samples.json?raw';
import './coach-match.css';
import './skill-marker-text-prototype.css';

const urls = import.meta.glob('../../.notes/player-skill-markers/text-round-1/icons/*.svg', { eager: true, query: '?url', import: 'default' });
const iconUrl = (id: string) => urls[`../../.notes/player-skill-markers/text-round-1/icons/${id}.svg`] as string;
const sizes = { small: [12, 16], medium: [15, 20], large: [18, 24] } as const;
type Size = keyof typeof sizes;
const samples: { id: string; name: string; label: string; category: string; fill: string }[] = JSON.parse(rawSamples);
const definitions = new Map(samples.map(s => [s.id, s]));
const skillIds: Record<string, string[]> = {
  'h-blitzer': ['block', 'dodge', 'tackle'], 'h-catcher': ['dodge', 'safe-pair-of-hands'],
  'h-ogre': ['bone-head', 'loner', 'mighty-blow', 'guard'], 'h-thrower': ['pass', 'hail-mary-pass'],
  'h-fouler': ['dirty-player'], 'h-line': ['block'], 'a-blitzer': ['block', 'guard'],
  'a-thrower': ['pass'], 'a-bigun': ['mighty-blow'], 'a-line': ['tackle'],
  'a-specimen': ['claws', 'very-long-legs'], 'a-animosity': ['animosity'],
};
const fixture = [
  ['h-blitzer', 'Alden', 'human', 'blitzer', 11, 6, 2],
  ['h-catcher', 'Mira', 'human', 'catcher', 9, 4, 4],
  ['h-ogre', 'Borr', 'human', 'ogre', 12, 9, 1],
  ['h-thrower', 'Silas', 'human', 'thrower', 8, 8, 6],
  ['h-fouler', 'Ada', 'human', 'lineman', 10, 11, 8],
  ['h-line', 'Bran', 'human', 'lineman', 12, 6, 10],
  ['a-blitzer', 'Rakka', 'orc', 'orc-blitzer', 14, 6, 2],
  ['a-thrower', 'Orga', 'orc', 'orc-thrower', 16, 4, 6],
  ['a-bigun', 'Grom', 'orc', 'big-un-blocker', 14, 9, 3],
  ['a-line', 'Kragg', 'orc', 'orc-lineman', 15, 11, 8],
  ['a-specimen', 'Mutation typography specimen', 'orc', 'big-un-blocker', 17, 8, 11],
  ['a-animosity', 'Animosity typography specimen', 'orc', 'orc-lineman', 17, 11, 12],
] as const;
const players: SetupPlayer[] = fixture.map(([id, name, rosterId, positionId, x, y, number]) => ({
  id, name, slot: number, number, role: id.startsWith('h-') ? 'home' : 'away', x, y, state: 'standing',
  art: { rosterId, positionId }, position: positionId, ma: positionId === 'ogre' ? 5 : 6,
  st: positionId === 'ogre' ? 5 : 3, ag: positionId === 'ogre' ? 4 : 3, pa: 4, av: 9,
  skills: skillIds[id].map(key => definitions.get(key)!.name), offPitch: 'pitch',
}));
const view: SetupState = { matchId: 'text-marker-art-review', revision: 0, callerRole: 'home', phase: 'PLAY',
  actor: 'home', prompt: null, players, weather: 'Nice', homeRerolls: 3, awayRerolls: 2, actions: [],
  turn: 4, turnMode: 'regular', ball: { x: 11, y: 6 }, activePlayerId: null, half: 1,
  homeTurn: 4, awayTurn: 4, homeScore: 1, awayScore: 0, drive: 2,
  homeTeamName: 'Steelbound Comets', awayTeamName: 'Redtooth Raiders',
  homeTeamArt: { rosterId: 'human', league: 'Old World Classic' }, awayTeamArt: { rosterId: 'orc', league: 'Badlands Brawl' },
};

function BadgeRow({ ids, size }: { ids: string[]; size: Size }) {
  const [width, height] = sizes[size];
  return <span className="sample-marker-row" style={{ height }} aria-label={ids.map(id => definitions.get(id)!.name).join(', ')}>
    {ids.slice(0, 3).map(id => <img key={id} className="sample-marker-icon" src={iconUrl(id)}
      alt={definitions.get(id)!.name} style={{ width, height }} draggable={false}/>)}
    {ids.length > 3 && <span className="sample-overflow" style={{ height, fontSize: height * .48 }}>+{ids.length - 3}</span>}
  </span>;
}

function PitchBadges({ host, size }: { host: HTMLElement; size: Size }) {
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const art = host.querySelector<HTMLImageElement>('img:not(.sample-marker-icon)');
      const x = host.clientWidth / 2;
      const y = Math.min(0, art ? art.offsetTop + art.clientHeight * .08 : 0) - sizes[size][1] - 3;
      setAnchor(before => before.x === x && before.y === y ? before : { x, y });
    };
    const resize = new ResizeObserver(measure); resize.observe(host);
    const mutation = new MutationObserver(measure); mutation.observe(host, { attributes: true, attributeFilter: ['style'] });
    measure();
    return () => { resize.disconnect(); mutation.disconnect(); };
  }, [host, size]);
  return createPortal(<span className="sample-marker-anchor" style={{ left: anchor.x, top: anchor.y }}>
    <BadgeRow ids={skillIds[host.dataset.playerId!] ?? []} size={size}/>
  </span>, host);
}

function Prototype() {
  const query = new URLSearchParams(location.search);
  const [size, setSize] = useState<Size>((query.get('size') as Size) in sizes ? query.get('size') as Size : 'medium');
  const [tab, setTab] = useState(query.get('view') === 'icons' ? 'icons' : 'pitch');
  const [crowded, setCrowded] = useState(query.get('formation') === 'crowded');
  const [zoom, setZoom] = useState(1.35);
  const [selected, setSelected] = useState('');
  const [card, setCard] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => { const next = new URL(location.href); next.searchParams.set('size', size); next.searchParams.set('view', tab); next.searchParams.set('formation', crowded ? 'crowded' : 'open'); history.replaceState(null, '', next); }, [size, tab, crowded]);
  useLayoutEffect(() => {
    if (tab !== 'pitch') { setHosts([]); return; }
    let frame = 0;
    const collect = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setHosts([...stage.current!.querySelectorAll<HTMLElement>('.live-marker')])); };
    const observer = new ResizeObserver(collect); observer.observe(stage.current!); collect();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [tab, zoom, crowded]);
  const focused = card && players.find(player => player.id === card.id);
  const sampleView = crowded ? view : { ...view, players: players.map(player => player.id === 'h-line' ? { ...player, y: 7 } : player) };
  return <main className="play-runtime marker-text-prototype" data-size={size}>
    <header className="review-header"><div><span className="review-kicker">MOLES UNDER THE PITCH · ART REVIEW</span>
      <h1>Text skill markers <small>Sample round</small></h1></div><span className="review-status">14 of 108 core identities · awaiting review</span></header>
    <nav className="review-controls" aria-label="Artwork preview controls"><div>
      <button type="button" onClick={() => setTab('pitch')} aria-pressed={tab === 'pitch'}>On the pitch</button>
      <button type="button" onClick={() => setTab('icons')} aria-pressed={tab === 'icons'}>Icon specimens</button></div>
      <div className="review-size"><span>Marker size</span>{(Object.keys(sizes) as Size[]).map(value => <button key={value} type="button"
        aria-pressed={value === size} onClick={() => setSize(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      {tab === 'pitch' && <><div><button type="button" onClick={() => setCrowded(false)} aria-pressed={!crowded}>Open spacing</button>
        <button type="button" onClick={() => setCrowded(true)} aria-pressed={crowded}>Crowded</button></div>
        <div><button type="button" onClick={() => setZoom(1)}>Overview</button><button type="button" onClick={() => setZoom(1.5)}>Detail</button></div></>}
    </nav>
    {tab === 'icons' ? <section className="specimen-sheet" aria-label="Text icon sample sheet">
      <div className="sheet-intro"><h2>Portrait frames. MUTP lettering. Seven category colors.</h2><p>Enlarged vector master above; Small, Medium, and Large at actual CSS-pixel sizes below.</p></div>
      <div className="specimen-grid">{samples.map(sample => <article key={sample.id} className="specimen" data-sample-id={sample.id}>
        <div className="specimen-master"><img src={iconUrl(sample.id)} alt={`${sample.name} marker`} width="54" height="72"/></div>
        <h3>{sample.name}</h3><span className="specimen-category" data-category={sample.category} style={{ color: sample.fill }}>{sample.category === 'TRAIT' ? 'Trait' : sample.category[0] + sample.category.slice(1).toLowerCase()}</span>
        <div className="native-sizes">{(Object.keys(sizes) as Size[]).map(value => <div key={value}>
          <img src={iconUrl(sample.id)} alt={`${sample.label} ${value}`} width={sizes[value][0]} height={sizes[value][1]}/><small>{value[0].toUpperCase()}</small></div>)}</div>
      </article>)}</div>
      <div className="sheet-bottom"><div><b>On a player</b><BadgeRow ids={skillIds['h-blitzer']} size={size}/></div>
        <div><b>Negative traits first, then skills</b><BadgeRow ids={skillIds['h-ogre']} size={size}/></div>
        <p>Labels stay letter-only. A +N card indicates hidden markers; the complete skill list stays on the player card.</p></div>
    </section> : <>
      <section className="review-match" aria-label="Game pitch mockup">
        <div className="review-score"><strong>Steelbound Comets</strong><span><b>1</b><i>—</i><b>0</b></span><strong>Redtooth Raiders</strong><small>1st half · turn 4</small></div>
        <div className="review-pitch" ref={stage}>
          <LivePitch view={sampleView} selectedId={selected} actions={[]} zoom={zoom} onZoomChange={setZoom}
            onSelectPlayer={id => { setSelected(id); const host = stage.current?.querySelector<HTMLElement>(`[data-player-id="${id}"]`); if (host) setCard({ id, anchor: host.getBoundingClientRect() }); }}
            onFocusPlayer={(id, anchor) => setCard({ id, anchor })} onBlurPlayer={() => setCard(null)} onSquare={() => setSelected('')}
            showToolbar={false} debugOpen={false} allowThreats={false}/>
          {hosts.map(host => <PitchBadges key={host.dataset.playerId} host={host} size={size}/>)}
        </div>
        {focused && card && <PlayerHoverCard player={focused} anchor={card.anchor} teamName={focused.role === 'home' ? view.homeTeamName! : view.awayTeamName!}/>}
      </section>
      <div className="pitch-caption"><span>Existing game renderer and sprites · sample labels shown for art review · hover or click a player for the complete list</span><span>{sizes[size][0]} × {sizes[size][1]} px / marker</span></div>
    </>}
    <footer className="review-foot"><span><i style={{ background: '#49dfff' }}/>General</span><span><i style={{ background: '#ffe17b' }}/>Agility</span>
      <span><i style={{ background: '#e4777f' }}/>Strength</span><span><i style={{ background: '#b696de' }}/>Mutation</span>
      <span><i style={{ background: '#7ac59c' }}/>Passing</span><span><i style={{ background: '#e7aa6a' }}/>Devious</span>
      <span><i style={{ background: '#10141a', border: '1px solid #b4c7d5' }}/>Traits</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Prototype/>);
