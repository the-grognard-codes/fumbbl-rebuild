import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { spriteUrl } from './pitch-demo';

const samples = [
  { number: 7, name: 'Bram Ironroot', position: 'Blitzer', zone: 'Reserves', stats: ['6', '3', '3+', '4+', '9+'], skills: 'Block, Guard', injury: 'None', spp: 2, earned: '1 casualty', career: 18 },
  { number: 8, name: 'Pip Quickstep', position: 'Catcher', zone: 'Reserves', stats: ['8', '2', '3+', '5+', '8+'], skills: 'Catch, Dodge', injury: 'None', spp: 3, earned: '1 touchdown', career: 9 },
  { number: 9, name: 'Oren Oakfist', position: 'Lineman', zone: 'Knocked out', stats: ['6', '3', '3+', '4+', '9+'], skills: 'Wrestle', injury: 'Knocked out · awaiting recovery', spp: 0, earned: 'No SPP earned yet', career: 6 },
  { number: 10, name: 'Moss Flint', position: 'Thrower', zone: 'Casualties', stats: ['6', '3', '3+', '2+', '9+'], skills: 'Pass, Sure Hands', injury: 'Broken arm · miss next game', spp: 1, earned: '1 completion', career: 13 }
];

export function PlayerMarker({ player, team, onSelect, onActions }: { player: typeof samples[number] & { sprite?: string }; team: string; onSelect?: () => void; onActions?: () => void }) {
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const cancel = () => { if (timer.current) clearTimeout(timer.current); };
  const close = () => { cancel(); setAnchor(null); };
  const open = () => {
    document.dispatchEvent(new CustomEvent('pitch-preview-player-open', { detail: id }));
    cancel();
    const rect = trigger.current!.getBoundingClientRect();
    const drawerTop = trigger.current!.closest('.preview-drawer')?.getBoundingClientRect().top;
    setAnchor({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 304)), top: Math.max(8, drawerTop !== undefined ? drawerTop - 348 : (rect.bottom + 348 <= window.innerHeight ? rect.bottom + 8 : rect.top - 348)) });
  };
  const leave = () => { cancel(); timer.current = setTimeout(() => setAnchor(null), 180); };
  useEffect(() => {
    const anotherPlayer = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !card.current?.contains(event.target as Node)) close(); };
    document.addEventListener('keydown', escape);
    document.addEventListener('pitch-preview-player-open', anotherPlayer);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    return () => { cancel(); document.removeEventListener('pitch-preview-player-open', anotherPlayer); document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); };
  }, []);
  return <>
    <button ref={trigger} className={`dugout-player ${team}`} aria-label={`${player.name}, ${player.position}, ${player.zone}`} aria-describedby={anchor ? id : undefined}
      onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
      onMouseEnter={() => { if (onSelect) { cancel(); timer.current = setTimeout(open, 350); } else open(); }} onMouseLeave={leave} onFocus={open} onBlur={leave}
      onContextMenu={event => { if (onActions) { event.preventDefault(); event.stopPropagation(); close(); onActions(); } }}
      onClick={event => { event.stopPropagation(); if (onSelect) { close(); onSelect(); } else open(); }}>
      <img src={spriteUrl(player.sprite ?? ({ Blitzer: '02-blitzer-man.png', Catcher: '04-catcher-woman.png', Lineman: '08-lineman-man.png', Thrower: '06-thrower-man.png' }[player.position] ?? '08-lineman-man.png'))} alt="" className={player.position === 'Ogre' ? 'ogre-sprite' : ''}/>

    </button>
    {anchor && createPortal(<div ref={card} id={id} role="tooltip" className={`player-preview-card ${team}`} style={anchor} onMouseEnter={cancel} onMouseLeave={leave}>
      <div className="player-card-kicker">#{player.number} · {player.position} · {player.zone}</div>
      <h3>{player.name}</h3>
      <dl className="player-stats">{['MA', 'ST', 'AG', 'PA', 'AV'].map((label, index) => <div key={label}><dt>{label}</dt><dd>{player.stats[index]}</dd></div>)}</dl>
      <dl className="player-details"><dt>Skills</dt><dd>{player.skills}</dd><dt>Injuries / status</dt><dd>{player.injury}</dd><dt>SPP this game</dt><dd><strong>{player.spp}</strong> · {player.earned}</dd><dt>Career SPP before match</dt><dd>{player.career}</dd></dl>
      <small>Illustrative player · Escape or tap outside to dismiss</small>
    </div>, document.body)}
  </>;
}

export function Dugout({ team }: { team: string }) {
  return <div className={`dugout ${team}`} role="group" aria-label={`${team} dugout`}>
    {['Reserves', 'Knocked out', 'Casualties'].map(zone => <div className="dugout-zone" key={zone}><span>{zone} <b>{samples.filter(p => p.zone === zone).length}</b></span><div className="dugout-players">{samples.filter(p => p.zone === zone).map(player => <PlayerMarker key={player.number} team={team} player={team === 'home' ? player : { ...player, name: ['Ash Copper', 'Fern Fleet', 'Rowan Stone', 'Vale Reed'][player.number - 7], number: player.number + 4 }}/>)}</div></div>)}
  </div>;
}

