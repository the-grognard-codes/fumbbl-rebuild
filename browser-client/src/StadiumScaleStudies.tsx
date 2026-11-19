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
import './stadium-scale-studies.css';

const crop = { x: 0, y: 544, width: 416, height: 352 };
const { pitch, pixelsPerSquare } = STILL_LAYOUT;
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
  const [gatehouse, stand, cutout, painted, rear] = await Promise.all([
    loadStadiumMockupPainting(), loadStand(standUrl, materialUrl), loadStand(cutoutUrl, cutoutMaterialUrl),
    loadImage(paintedUrl), loadImage(rearUrl),
  ]);
  if (painted.naturalWidth !== touchline || painted.naturalHeight !== crop.height)
    throw Error('Invalid painted terrace study dimensions');
  if (rear.naturalWidth !== touchline - standSize.width || rear.naturalHeight !== standSize.height)
    throw Error('Invalid rear terrace study dimensions');
  return { gatehouse, stand, cutout, painted, rear };
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

function StudyPlayers({ scale, pair }: { scale: number; pair: Record<'home' | 'away', TeamColors> }) {
  return players.map(player => {
    const body = resolvePlayerArt(player, { colors: pair[player.role], end: 'home', topDown: true })?.body;
    if (!body) return null;
    const size = pixelsPerSquare * MOCKUP_PLAYER_WIDTH_IN_SQUARES / 64 * scale;
    const x = touchline + (player.y + .5) * pixelsPerSquare;
    const y = pitch.y - crop.y + (player.x + .5) * pixelsPerSquare;
    const { shadowAnchor: feet } = playerArtPlacement(body, true);
    return <img className="scale-study-player" key={player.id} src={body.url} alt={player.name}
      data-player-id={player.id} data-roster={player.art.rosterId}
      data-foot-x={x} data-foot-y={y} data-anchor-x={feet.x} data-anchor-y={feet.y}
      style={{ left: `${(x - feet.x * size) / crop.width * 100}%`, top: `${(y - feet.y * size) / crop.height * 100}%`,
        width: `${body.width * size / crop.width * 100}%`, height: `${body.height * size / crop.height * 100}%` }}/>;
  });
}

export function StadiumScaleStudies() {
  const [colors, setColors] = useState<MockupColorPreset>('defaults');
  const [background, setBackground] = useState<Background>('Checkerboard');
  const [standLayer, setStandLayer] = useState<StandLayer>('stand');
  const [artwork, setArtwork] = useState<StudyArtwork>();
  const [failed, setFailed] = useState(false);
  const crops = useRef<(HTMLCanvasElement | null)[]>([]);
  const isolatedStand = useRef<HTMLCanvasElement>(null);
  const pair = mockupColorPair(colors);

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

  return <main className="stadium-mockup scale-studies">
    <header className="scale-study-header">
      <a href="?">Back to Gatehouse gallery</a>
      <h1>Player scale studies</h1>
      <p>Compare a lone Human by the touchline and two adjacent rows of opposing blitzers.
        Each crop holds the pitch at 32 pixels per square and keeps every player’s feet on the same point.</p>
    </header>
    <div className="mockup-controls scale-study-controls">
      <label>Kit colours
        <select value={colors} onChange={event => setColors(event.target.value as MockupColorPreset)}>
          {MOCKUP_COLOR_PRESETS.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <a href="#stand-edges">Inspect stand edges</a>
    </div>
    <p>The painted terrace crowd keeps its original colours. The kit selection applies to players in all four studies.</p>
    {failed && <p className="mockup-status" role="alert">The study artwork failed to load. Reload the page to retry.</p>}
    {!artwork && !failed && <p role="status">Loading study artwork…</p>}
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
