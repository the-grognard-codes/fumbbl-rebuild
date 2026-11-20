import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { playerArtPlacement, resolvePlayerArt } from './player-art.ts';
import { allPaintingLayers, drawStadiumMockupPainting, loadStadiumMockupPainting } from './StadiumMockupPainting.tsx';
import {
  MOCKUP_COLOR_PRESETS, MOCKUP_PLAYER_WIDTH_IN_SQUARES, STILL_LAYOUT, mockupColorPair,
  type MockupColorPreset, type MockupPlayer,
} from './stadium-mockup.ts';
import { recolorTeamImage, teamColorArt } from './team-color-art.ts';
import type { TeamColors } from './team-colors.ts';
import standUrl from '../../assets/game/references/stadiums/scale-studies/mask-first-sideline.png';
import materialUrl from '../../assets/game/references/stadiums/scale-studies/mask-first-sideline.materials.png';
import cutoutUrl from '../../assets/game/references/stadiums/scale-studies/mask-first-sideline.cutout.png';
import cutoutMaterialUrl from '../../assets/game/references/stadiums/scale-studies/mask-first-sideline.cutout.materials.png';
import rearUrl from '../../assets/game/references/stadiums/scale-studies/mask-first-sideline.rear.png';
import paintedUrl from '../../assets/game/references/stadiums/scale-studies/painted-terrace.webp';
import bowlUrl from '../../assets/game/references/stadiums/scale-studies/stepped-bowl.webp';
import inwardBowlUrl from '../../assets/game/references/stadiums/scale-studies/gatehouse-inward.webp';
import { bowl, drawBowl, drawBowlGround } from './stadium-bowl-study.ts';
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
const standSize = { width: 112, height: 416 };
const variants = [
  { id: 'a', label: 'Gatehouse', scale: 1 },
  { id: 'b', label: 'Gatehouse', scale: 1.25 },
  { id: 'c', label: 'Rebuilt sideline', scale: 1.25 },
  { id: 'd', label: 'Painted terrace', scale: 1.25 },
] as const;
type Variant = typeof variants[number]['id'];
const backgrounds = ['Checkerboard', 'Light', 'Dark'] as const;
type Background = typeof backgrounds[number];
const standLayers = [['stand', 'Full stand'], ['cutout', 'Fans and props']] as const;
type StandLayer = typeof standLayers[number][0];

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
  return image;
}

async function loadStand(sourceUrl: string, materialsUrl: string) {
  const [stand, materials] = await Promise.all([loadImage(sourceUrl), loadImage(materialsUrl)]);
  const { width, height } = standSize;
  if ([stand, materials].some(image => image.naturalWidth !== width || image.naturalHeight !== height))
    throw Error('Invalid sideline study dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw Error('Sideline study canvas unavailable');
  context.drawImage(stand, 0, 0);
  const rgba = new Uint8Array(context.getImageData(0, 0, width, height).data);
  context.clearRect(0, 0, width, height);
  context.drawImage(materials, 0, 0);
  const mask = context.getImageData(0, 0, width, height).data;
  const indices = new Uint8Array(width * height);
  const rampSteps = [4, 8, 11, 15];
  for (let pixel = 0; pixel < indices.length; pixel++) {
    const offset = pixel * 4;
    const slot = mask[offset], shade = mask[offset + 1];
    if (rgba[offset + 3] && (slot === 1 || slot === 2) && shade >= 1 && shade <= rampSteps.length)
      indices[pixel] = (slot - 1) * 16 + rampSteps[shade - 1];
  }
  return { rgba, indices };
}

async function loadArtwork() {
  const [gatehouse, stand, cutout, painted, rear, bowlArt, inwardArt] = await Promise.all([
    loadStadiumMockupPainting(), loadStand(standUrl, materialUrl), loadStand(cutoutUrl, cutoutMaterialUrl),
    loadImage(paintedUrl), loadImage(rearUrl), loadImage(bowlUrl), loadImage(inwardBowlUrl),
  ]);
  if (painted.naturalWidth !== touchline || painted.naturalHeight !== crop.height)
    throw Error('Invalid painted terrace study dimensions');
  if (rear.naturalWidth !== touchline - standSize.width || rear.naturalHeight !== standSize.height)
    throw Error('Invalid rear terrace study dimensions');
  if (inwardArt.naturalWidth !== bowl.width || inwardArt.naturalHeight !== bowl.height)
    throw Error('Invalid inward-facing bowl dimensions');
  return { gatehouse, stand, cutout, painted, rear, bowlArt, inwardArt };
}
type StudyArtwork = Awaited<ReturnType<typeof loadArtwork>>;

function drawGrid(context: CanvasRenderingContext2D) {
  context.fillStyle = 'rgba(215, 231, 180, .24)';
  for (let x = touchline + pixelsPerSquare; x < crop.width; x += pixelsPerSquare)
    context.fillRect(x, 0, 1, crop.height);
  for (let y = (pitch.y - crop.y) % pixelsPerSquare; y < crop.height; y += pixelsPerSquare)
    context.fillRect(touchline, y, crop.width - touchline, 1);
  context.fillStyle = '#ece8cf';
  context.fillRect(touchline, 0, 1, crop.height);
}

function drawCrop(context: CanvasRenderingContext2D, gatehouse: HTMLCanvasElement, variant: Variant,
  stand: HTMLCanvasElement, { painted, rear }: Pick<StudyArtwork, 'painted' | 'rear'>) {
  const { x, y, width, height } = crop;
  context.imageSmoothingEnabled = false;
  context.drawImage(gatehouse, x, y, width, height, 0, 0, width, height);
  if (variant === 'c') {
    context.fillStyle = '#342c24';
    context.fillRect(0, 0, touchline, height);
    const top = (height - stand.height) / 2;
    context.drawImage(rear, 0, top);
    context.drawImage(stand, touchline - stand.width, top);
  }
  if (variant === 'd') context.drawImage(painted, 0, 0);
  drawGrid(context);
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
  const [background, setBackground] = useState<Background>('Checkerboard');
  const [standLayer, setStandLayer] = useState<StandLayer>('stand');
  const [inwardView, setInwardView] = useState<InwardView>('full');
  const [artwork, setArtwork] = useState<StudyArtwork>();
  const [failed, setFailed] = useState(false);
  const crops = useRef<(HTMLCanvasElement | null)[]>([]);
  const wholeBowl = useRef<HTMLCanvasElement>(null);
  const bowlDetail = useRef<HTMLCanvasElement>(null);
  const inwardBowl = useRef<HTMLCanvasElement>(null);
  const isolatedStand = useRef<HTMLCanvasElement>(null);
  const pair = mockupColorPair(colors);
  const inwardFrame = inwardViews[inwardView];

  useSyncExternalStore(teamColorArt.subscribe, teamColorArt.snapshot);
  useEffect(() => {
    let disposed = false;
    const release = teamColorArt.retain();
    void teamColorArt.load('human');
    void teamColorArt.load('orc');
    document.title = 'Player scale studies · Old World Classic';
    loadArtwork().then(
      assets => { if (!disposed) setArtwork(assets); },
      () => { if (!disposed) setFailed(true); },
    );
    return () => { disposed = true; release(); };
  }, []);

  useLayoutEffect(() => {
    if (!artwork) return;
    const standCanvas = document.createElement('canvas');
    standCanvas.width = standSize.width;
    standCanvas.height = standSize.height;
    const standContext = standCanvas.getContext('2d');
    if (!standContext) return;
    standContext.putImageData(new ImageData(recolorTeamImage(artwork.stand, mockupColorPair(colors).home),
      standSize.width, standSize.height), 0, 0);

    const gatehouse = document.createElement('canvas');
    gatehouse.width = STILL_LAYOUT.width;
    gatehouse.height = STILL_LAYOUT.height;
    const base = gatehouse.getContext('2d');
    if (!base) return;
    drawStadiumMockupPainting(base, artwork.gatehouse, { end: 'home', preset: 'balanced', colors, visitor: 'orc',
      visible: allPaintingLayers });
    crops.current.forEach((canvas, i) => {
      const context = canvas?.getContext('2d');
      if (context) drawCrop(context, gatehouse, variants[i].id, standCanvas, artwork);
    });
  }, [artwork, colors]);

  useLayoutEffect(() => {
    const context = isolatedStand.current?.getContext('2d');
    if (!artwork || !context) return;
    context.putImageData(new ImageData(recolorTeamImage(artwork[standLayer], mockupColorPair(colors).home),
      standSize.width, standSize.height), 0, 0);
  }, [artwork, colors, standLayer]);

  useLayoutEffect(() => {
    const canvas = wholeBowl.current;
    const full = canvas?.getContext('2d');
    const detail = bowlDetail.current?.getContext('2d');
    if (!canvas || !full || !detail || !artwork) return;
    drawBowl(full, artwork.bowlArt);
    const { x, y, width, height } = westBowlCrop;
    detail.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  }, [artwork]);

  useLayoutEffect(() => {
    const context = inwardBowl.current?.getContext('2d');
    if (!context || !artwork) return;
    context.imageSmoothingEnabled = false;
    context.save();
    context.translate(-inwardFrame.x, -inwardFrame.y);
    drawBowlGround(context, true);
    context.drawImage(artwork.inwardArt, 0, 0);
    context.restore();
  }, [artwork, inwardFrame]);

  return <main className="stadium-mockup scale-studies">
    <header className="scale-study-header">
      <a href="?">Back to Gatehouse gallery</a>
      <h1>Player scale studies</h1>
      <p>Compare the stands and player sizes on a pitch drawn at 32 pixels per square.</p>
    </header>
    <div className="mockup-controls scale-study-controls">
      <label>Kit colours
        <select value={colors} onChange={event => setColors(event.target.value as MockupColorPreset)}>
          {MOCKUP_COLOR_PRESETS.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <a href="#stand-edges">Inspect stand edges</a>
    </div>
    {failed && <p className="mockup-status" role="alert">The study artwork failed to load. Reload the page to retry.</p>}
    {!artwork && !failed && <p role="status">Loading study artwork…</p>}
    <section id="inward-bowl" aria-labelledby="inward-bowl-heading">
      <h2 id="inward-bowl-heading">F · Inward-facing Gatehouse bowl</h2>
      <div className="mockup-controls scale-study-controls">
        <label>Bowl view
          <select value={inwardView} onChange={event => setInwardView(event.target.value as InwardView)}>
            {Object.entries(inwardViews).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <a href="#stepped-bowl">Compare Study E</a>
      </div>
      <div className="scale-study-crop" style={{ maxWidth: inwardFrame.width }}
        data-view={inwardView} data-ready={Boolean(artwork)}>
        <canvas key={inwardView} ref={inwardBowl} width={inwardFrame.width} height={inwardFrame.height}
          role="img" aria-label={inwardFrame.label + ' at native scale'}/>
        {artwork && (inwardView === 'full' || inwardView === 'west') && <StudyPlayers scale={1.25} pair={pair}
          frame={inwardFrame} originX={bowl.pitchX - inwardFrame.x} originY={bowl.pitchY - inwardFrame.y}/>}
      </div>
    </section>
    <section id="stepped-bowl" aria-labelledby="bowl-heading">
      <h2 id="bowl-heading">E · Stepped Gatehouse bowl</h2>
      <p>A 1½-square dirt apron surrounds the pitch. Compare the front row with the touchline blitzer at 125%.</p>
      <div className="scale-study-crop bowl-detail">
        <canvas ref={bowlDetail} width={crop.width} height={crop.height} aria-label="Native-scale west terrace and shaggy touchline"/>
        {artwork && <StudyPlayers scale={1.25} pair={pair} originX={bowl.pitchX}/>}
      </div>
      <details><summary>View the whole bowl</summary>
        <div className="scale-study-crop">
          <canvas ref={wholeBowl} width={bowl.width} height={bowl.height} aria-label="Four terraces and the southern gate"/>
          {artwork && <StudyPlayers scale={1.25} pair={pair} frame={bowl} originX={bowl.pitchX} originY={bowl.pitchY}/>}
        </div>
      </details>
    </section>
    <p>The painted crowds in D, E and F have fixed colours. Kit changes apply to players in every study.</p>
    <div className="scale-study-comparisons" data-ready={Boolean(artwork)}>
      {variants.map(({ id, label, scale }, i) => <figure key={id} className="scale-study-variant" data-variant={id}>
        <figcaption>
          <span className="scale-study-variant-id">{id.toUpperCase()}</span>
          <span>{label}</span>
          <strong>{scale * 100}% sprites</strong>
        </figcaption>
        <div className="scale-study-crop">
          <canvas ref={element => { crops.current[i] = element; }} width={crop.width} height={crop.height}
            role="img" aria-label={label + ' and pitch at the left touchline'}/>
          {artwork && <StudyPlayers scale={scale} pair={pair}/>}
        </div>
      </figure>)}
    </div>
    <section className="scale-study-inspector" aria-labelledby="stand-edges">
      <h2 id="stand-edges">Stand edge inspection</h2>
      <p>View the isolated rebuilt stand against different backgrounds to check its transparent edges.</p>
      <div className="mockup-controls scale-study-controls">
        <label>Artwork
          <select value={standLayer} onChange={event => setStandLayer(event.target.value as StandLayer)}>
            {standLayers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Background
          <select value={background} onChange={event => setBackground(event.target.value as Background)}>
            {backgrounds.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="scale-study-stand" data-background={background} data-ready={Boolean(artwork)}>
        <canvas ref={isolatedStand} width={standSize.width} height={standSize.height} role="img"
          aria-label={(standLayer === 'stand' ? 'Isolated rebuilt sideline stand' : 'Isolated fans, standards and props') + ' with transparent edges'}/>
      </div>
    </section>
  </main>;
}
