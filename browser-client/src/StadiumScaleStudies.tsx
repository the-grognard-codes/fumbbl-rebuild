import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { playerArtPlacement, resolvePlayerArt } from './player-art.ts';
import {
  MOCKUP_COLOR_PRESETS, MOCKUP_PLAYER_WIDTH_IN_SQUARES, STILL_LAYOUT, mockupColorPair,
  type MockupColorPreset, type MockupPlayer,
} from './stadium-mockup.ts';
import { teamColorArt } from './team-color-art.ts';
import type { TeamColors } from './team-colors.ts';
import inwardBowlUrl from '../../assets/game/references/stadiums/scale-studies/gatehouse-inward.webp';
import { bowl, drawBowlGround } from './stadium-bowl-study.ts';
import './stadium-mockup.css';
import './stadium-scale-studies.css';

const crop = { x: 0, y: 544, width: 416, height: 352 };
const { pitch, pixelsPerSquare } = STILL_LAYOUT;
const westBowlCrop = { ...crop, y: bowl.pitchY + crop.y - pitch.y };
const inwardViews = {
  full: { label: 'Whole bowl', x: 0, y: 0, width: bowl.width, height: bowl.height },
  south: { label: 'South gate', x: 80, y: 888, width: 630, height: 300 },
  east: { label: 'East away terrace', x: 490, y: 198, width: 300, height: 714 },
  north: { label: 'North banners', x: 60, y: 0, width: 670, height: 270 },
  west: { label: 'West terrace with players', ...westBowlCrop },
} as const;
type InwardView = keyof typeof inwardViews;
const touchline = pitch.x - crop.x;
function studyPlayer(role: 'home' | 'away', number: number, x: number, y: number): MockupPlayer {
  const art = role === 'home' ? { rosterId: 'human', positionId: 'blitzer' }
    : { rosterId: 'orc', positionId: 'orc-blitzer' };
  return { id: role + '-' + number, name: (role === 'home' ? 'Human' : 'Orc') + ' blitzer', number, slot: number,
    role, x, y, state: 'standing', art };
}

const players = [studyPlayer('home', 1, 8, 0), ...[0, 1, 2].map(y => studyPlayer('away', y + 1, 12, y)),
  ...[0, 1, 2].map(y => studyPlayer('home', y + 2, 13, y))];

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (image.naturalWidth !== bowl.width || image.naturalHeight !== bowl.height) throw Error('Invalid bowl dimensions');
  return image;
}

function StudyPlayers({ scale, pair, frame = crop, originX = touchline, originY = pitch.y - crop.y }: {
  scale: number; pair: Record<'home' | 'away', TeamColors>; frame?: { width: number; height: number };
  originX?: number; originY?: number;
}) {
  return players.map(player => {
    const body = resolvePlayerArt(player, { colors: pair[player.role], end: 'home', topDown: true })?.body;
    if (!body) return null;
    const size = pixelsPerSquare * MOCKUP_PLAYER_WIDTH_IN_SQUARES / 64 * scale;
    const x = originX + (player.y + .5) * pixelsPerSquare;
    const y = originY + (player.x + .5) * pixelsPerSquare;
    const { shadowAnchor: feet } = playerArtPlacement(body, true);
    return <img className="scale-study-player" key={player.id} src={body.url} alt={player.name}
      data-player-id={player.id} data-roster={player.art.rosterId}
      data-foot-x={x} data-foot-y={y} data-anchor-x={feet.x} data-anchor-y={feet.y}
      style={{ left: `${(x - feet.x * size) / frame.width * 100}%`, top: `${(y - feet.y * size) / frame.height * 100}%`,
        width: `${body.width * size / frame.width * 100}%`, height: `${body.height * size / frame.height * 100}%` }}/>;
  });
}

export function StadiumScaleStudies() {
  const [colors, setColors] = useState<MockupColorPreset>('defaults');
  const [inwardView, setInwardView] = useState<InwardView>('full');
  const [artwork, setArtwork] = useState<HTMLImageElement>();
  const [failed, setFailed] = useState(false);
  const inwardBowl = useRef<HTMLCanvasElement>(null);
  const pair = mockupColorPair(colors);
  const inwardFrame = inwardViews[inwardView];

  useSyncExternalStore(teamColorArt.subscribe, teamColorArt.snapshot);
  useEffect(() => {
    let disposed = false;
    const release = teamColorArt.retain();
    void teamColorArt.load('human');
    void teamColorArt.load('orc');
    document.title = 'Gatehouse stadium gallery';
    loadImage(inwardBowlUrl).then(
      assets => { if (!disposed) setArtwork(assets); },
      () => { if (!disposed) setFailed(true); },
    );
    return () => { disposed = true; release(); };
  }, []);

  useLayoutEffect(() => {
    const context = inwardBowl.current?.getContext('2d');
    if (!context || !artwork) return;
    context.imageSmoothingEnabled = false;
    context.save();
    context.translate(-inwardFrame.x, -inwardFrame.y);
    drawBowlGround(context, true);
    context.drawImage(artwork, 0, 0);
    context.restore();
  }, [artwork, inwardFrame]);

  return <main className="stadium-mockup scale-studies">
    {failed && <p className="mockup-status" role="alert">The study artwork failed to load. Reload the page to retry.</p>}
    {!artwork && !failed && <p role="status">Loading study artwork…</p>}
    <section id="inward-bowl" aria-labelledby="inward-bowl-heading">
      <h1 id="inward-bowl-heading">Gatehouse stadium</h1>
      <div className="mockup-controls scale-study-controls">
        <label>Kit colours
          <select value={colors} onChange={event => setColors(event.target.value as MockupColorPreset)}>
            {MOCKUP_COLOR_PRESETS.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>Bowl view
          <select value={inwardView} onChange={event => setInwardView(event.target.value as InwardView)}>
            {Object.entries(inwardViews).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="scale-study-crop" style={{ maxWidth: inwardFrame.width }}
        data-view={inwardView} data-ready={Boolean(artwork)}>
        <canvas key={inwardView} ref={inwardBowl} width={inwardFrame.width} height={inwardFrame.height}
          role="img" aria-label={inwardFrame.label + ' at native scale'}/>
        {artwork && (inwardView === 'full' || inwardView === 'west') && <StudyPlayers scale={1.25} pair={pair}
          frame={inwardFrame} originX={bowl.pitchX - inwardFrame.x} originY={bowl.pitchY - inwardFrame.y}/>}
      </div>
    </section>
  </main>;
}
