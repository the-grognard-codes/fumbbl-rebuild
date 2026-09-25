import { useEffect, useRef, useState } from 'react';
import type { SetupPlayer, SetupState } from './setup-protocol.ts';
import './live-pitch.css';

const WIDTH = 960;
const HEIGHT = 564;
const CELL = 36;
const OFFSET = 12;
const humanSprites: Record<string, string> = {
  lineman: '10-lineman-man.png', blitzer: '02-blitzer-man.png', catcher: '05-catcher-man.png',
  thrower: '06-thrower-man.png', ogre: '01-ogre-man.png', halfling: '14-halfling-man.png'
};
const pitchUrl = import.meta.env.DEV ? '/live-pitch.svg' : '/assets/game/live-pitch.svg';

function spriteUrl(player: SetupPlayer) {
  if (player.art?.rosterId !== 'human') return null;
  const file = humanSprites[player.art.positionId];
  if (!file) return null;
  return import.meta.env.DEV ? `/preview/humans-64px-chibi-v1/${file}` : `/assets/team-sprites/humans/${file}`;
}

function PlayerMarker({ player, scale, active, selected, onSelect }: {
  player: SetupPlayer; scale: number; active: boolean; selected: boolean; onSelect: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const sprite = spriteUrl(player);
  const prone = player.state.toLowerCase().includes('prone');
  const stunned = player.state.toLowerCase().includes('stunned');
  return <button type="button" className={`live-marker ${player.role}${active ? ' active' : ''}${selected ? ' selected' : ''}${prone ? ' prone' : ''}${stunned ? ' stunned' : ''}`}
    aria-label={`${player.role} ${player.name}, number ${player.slot}, ${player.state}, square ${player.x}, ${player.y}`}
    title={`${player.name} #${player.slot} · ${player.state}`}
    style={{ left: (OFFSET + player.x! * CELL) * scale, top: (OFFSET + player.y! * CELL) * scale,
      width: CELL * scale, height: CELL * scale, zIndex: 10 + player.y! * 26 + player.x! }}
    onClick={event => { event.stopPropagation(); onSelect(); }}>
    {sprite && !failed ? <img src={sprite} alt="" onError={() => setFailed(true)} className={player.art?.positionId === 'ogre' ? 'large' : ''}/> :
      <span className="live-token">{player.role === 'home' ? 'H' : 'A'}{player.slot}</span>}
    <span className="live-number">{player.slot}</span>
  </button>;
}

/** Presentation only: positions, state, ball and identity come from the server projection. */
export function LivePitch({ view, selectedId, onSelectPlayer, onSquare }: {
  view: SetupState; selectedId: string; onSelectPlayer: (id: string) => void; onSquare: (x: number, y: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [size, setSize] = useState({ width: WIDTH, height: HEIGHT });
  const [zoom, setZoom] = useState(1);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const availableSquare = Math.min(size.width / WIDTH, size.height / HEIGHT) * CELL;
  const fitSquare = availableSquare >= 56 ? 56 : availableSquare >= 48 ? 48 : availableSquare >= 40 ? 40 : availableSquare;
  const scale = Math.max(.18, fitSquare / CELL * zoom);
  const point = (clientX: number, clientY: number) => {
    const rect = scene.current!.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) * WIDTH / rect.width - OFFSET) / CELL);
    const y = Math.floor(((clientY - rect.top) * HEIGHT / rect.height - OFFSET) / CELL);
    return x >= 0 && x < 26 && y >= 0 && y < 15 ? { x, y } : null;
  };
  return <section className="live-pitch" aria-label="Live match pitch">
    <div className="live-pitch-toolbar"><strong>Authoritative pitch</strong><span>{Math.round(CELL * scale)} px / square</span>
      <div><button type="button" aria-pressed={zoom === 1} onClick={() => setZoom(1)}>Fit</button>
        <button type="button" aria-pressed={zoom === 1.5} onClick={() => setZoom(1.5)}>1.5×</button>
        <button type="button" aria-pressed={zoom === 2} onClick={() => setZoom(2)}>2×</button></div>
    </div>
    <div ref={viewport} className="live-pitch-viewport" style={{ overflow: zoom === 1 ? 'hidden' : 'auto', touchAction: zoom === 1 ? 'pan-y' : 'none' }}
      onPointerDown={event => { if (zoom === 1 || event.button !== 0) return; const element = viewport.current!; drag.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, moved: false }; }}
      onPointerMove={event => { const start = drag.current; if (!start) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.abs(dx) + Math.abs(dy) > 6) { start.moved = true; viewport.current!.setPointerCapture(event.pointerId); } if (start.moved) { viewport.current!.scrollLeft = start.left - dx; viewport.current!.scrollTop = start.top - dy; } }}
      onPointerUp={() => { if (drag.current?.moved) suppressClick.current = true; drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}>
      <div className="live-pitch-center" style={{ minWidth: WIDTH * scale, minHeight: HEIGHT * scale }}>
        <div ref={scene} className="live-pitch-scene" style={{ width: WIDTH * scale, height: HEIGHT * scale }}
          onClick={event => { if (suppressClick.current) { suppressClick.current = false; return; } const square = point(event.clientX, event.clientY); if (square) onSquare(square.x, square.y); }}>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
            {backgroundFailed ? <><rect width={WIDTH} height={HEIGHT} fill="#263422"/><rect x={OFFSET} y={OFFSET} width="936" height="540" fill="#56632b"/></> :
              <image href={pitchUrl} width={WIDTH} height={HEIGHT} onError={() => setBackgroundFailed(true)}/>}
            {view.ball && <circle className="live-ball" cx={OFFSET + view.ball.x * CELL + CELL / 2} cy={OFFSET + view.ball.y * CELL + CELL / 2} r="6"/>}
          </svg>
          {view.players.filter(player => player.x !== null && player.y !== null).map(player =>
            <PlayerMarker key={player.id} player={player} scale={scale} active={player.id === view.activePlayerId}
              selected={player.id === selectedId} onSelect={() => onSelectPlayer(player.id)}/>)}
          {backgroundFailed && <span className="live-pitch-error">Pitch image unavailable; plain field shown.</span>}
        </div>
      </div>
    </div>
  </section>;
}
