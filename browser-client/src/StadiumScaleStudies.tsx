import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import architectureUrl from '../../assets/game/references/stadiums/scale-studies/empty-gatehouse.webp';
import seatingUrl from '../../assets/game/references/stadiums/scale-studies/empty-seating.png';
import seatingLayout from '../../assets/game/references/stadiums/scale-studies/empty-seating.json';
import seatingStudies from '../../assets/game/references/stadiums/scale-studies/bay-six/seats.json';
import { playerArtPlacement, resolvePlayerArt } from './player-art.ts';
import { bowl, drawBowlGround } from './stadium-bowl-study.ts';
import { MOCKUP_PLAYER_WIDTH_IN_SQUARES, STILL_LAYOUT, mockupPlayers } from './stadium-mockup.ts';
import './stadium-mockup.css';
import './stadium-scale-studies.css';

const bay = seatingLayout.bays.find(({ id }) => id === 6)!;
const square = STILL_LAYOUT.pixelsPerSquare;
const crop = { x: 0, y: bay.y - 17, width: bowl.pitchX + square + 6, height: bay.height + 38 };
const studyImages = import.meta.glob('../../assets/game/references/stadiums/scale-studies/bay-six/*.png', {
  eager: true, query: '?url', import: 'default',
});
const studyImageRoot = '../../assets/game/references/stadiums/scale-studies/bay-six/';

async function image(url: string, dimensions: { width: number; height: number }) {
  const result = new Image();
  result.src = url;
  await result.decode();
  if (result.width !== dimensions.width || result.height !== dimensions.height) {
    throw Error('Invalid Gatehouse layer dimensions');
  }
  return result;
}

function drawingSurface() {
  const canvas = document.createElement('canvas');
  canvas.width = bowl.width;
  canvas.height = bowl.height;
  return canvas;
}

async function loadScalePlayer() {
  const player = mockupPlayers('human')[0];
  const body = resolvePlayerArt(player, { end: 'home', topDown: true })!.body;
  const art = await image(body.url, body);
  const anchor = playerArtPlacement(body, true).anchor;
  const scale = square * MOCKUP_PLAYER_WIDTH_IN_SQUARES / 64;
  return {
    art,
    x: Math.round(bowl.pitchX + square / 2 - anchor.x * scale),
    y: Math.round(bowl.pitchY + (Math.floor((bay.y + bay.height / 2 - bowl.pitchY) / square) + .5) * square - anchor.y * scale),
    width: Math.round(body.width * scale),
    height: Math.round(body.height * scale),
  };
}

async function loadLayers() {
  const [architecture, seating, player, studies] = await Promise.all([
    image(architectureUrl, bowl),
    image(seatingUrl, bowl),
    loadScalePlayer(),
    Promise.all(seatingStudies.map(async study => {
      const [crowd, rail] = await Promise.all([
        image(studyImages[studyImageRoot + study.id + '.png'] as string, bay),
        image(studyImages[studyImageRoot + study.id + '-rail.png'] as string, bay),
      ]);
      return { ...study, crowd, rail };
    })),
  ]);
  const stadium = drawingSurface();
  const baseContext = stadium.getContext('2d')!;
  drawBowlGround(baseContext, true);
  baseContext.drawImage(architecture, 0, 0);

  const overlay = drawingSurface();
  const context = overlay.getContext('2d')!;
  context.drawImage(seating, 0, 0);
  const pixels = context.getImageData(0, 0, bowl.width, bowl.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const bay = pixels.data[i];
    const away = bay >= 8 && bay <= 11;
    pixels.data.set(away ? [235, 132, 203, 145] : [64, 214, 195, 145], i);
    if (!bay) pixels.data[i+3] = 0;
  }
  context.putImageData(pixels, 0, 0);
  return { stadium, overlay, player, studies };
}

function drawSeatMarkers(context: CanvasRenderingContext2D, seats: readonly {x: number; y: number}[]) {
  for (const seat of seats) {
    const x = bay.x + seat.x, y = bay.y + seat.y;
    context.fillStyle = '#101820';
    context.fillRect(x - 2, y - 1, 5, 3);
    context.fillRect(x - 1, y - 2, 3, 5);
    context.fillStyle = '#80f5ff';
    context.fillRect(x - 1, y, 3, 1);
    context.fillRect(x, y - 1, 1, 3);
  }
}

function drawCrop(target: HTMLCanvasElement | null, source: HTMLCanvasElement) {
  const context = target?.getContext('2d');
  if (!target || !context) return;
  context.imageSmoothingEnabled = false;
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, target.width, target.height);
}

export function StadiumScaleStudies() {
  const [layers, setLayers] = useState<Awaited<ReturnType<typeof loadLayers>>>();
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState(seatingStudies[0].id);
  const [rail, setRail] = useState(true);
  const [markers, setMarkers] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const native = useRef<HTMLCanvasElement>(null);
  const zoom = useRef<HTMLCanvasElement>(null);
  const study = seatingStudies.find(({ id }) => id === view);
  const masked = view === 'masks';

  useEffect(() => {
    let active = true;
    document.title = 'Gatehouse stadium';
    loadLayers().then(value => { if (active) setLayers(value); }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  useLayoutEffect(() => {
    const full = canvas.current;
    const context = full?.getContext('2d');
    if (!full || !context || !layers) return;
    context.imageSmoothingEnabled = false;
    context.drawImage(layers.stadium, 0, 0);
    if (masked) context.drawImage(layers.overlay, 0, 0);
    const variant = layers.studies.find(({ id }) => id === view);
    if (variant) {
      const { player } = layers;
      context.drawImage(variant.crowd, bay.x, bay.y);
      if (rail) context.drawImage(variant.rail, bay.x, bay.y);
      context.drawImage(player.art, player.x, player.y, player.width, player.height);
      if (markers) drawSeatMarkers(context, variant.seats);
      drawCrop(native.current, full);
      drawCrop(zoom.current, full);
    }
  }, [layers, view, masked, rail, markers]);

  return <main className="stadium-mockup scale-studies gatehouse-bay-gallery">
    <header className="mockup-heading">
      <h1>Gatehouse stadium</h1>
      <div className="mockup-controls">
        <label>Gallery view
          <select value={view} onChange={event => setView(event.target.value)}>
            {seatingStudies.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            <option value="empty">Empty stadium</option>
            <option value="masks">Show seating masks</option>
          </select>
        </label>
      </div>
    </header>
    {masked && <p>Teal marks home seating. Pink marks the east away stand.</p>}
    {failed && <p role="alert">The stadium artwork could not be loaded.</p>}
    {!failed && !layers && <p role="status">Loading stadium artwork…</p>}
    {study && <section className="bay-six-review" aria-labelledby="bay-six-heading">
      <h2 id="bay-six-heading">West bay 6</h2>
      <div className="bay-six-toolbar">
        <p>{study.label} · {study.height} px tall · {study.pitch} px seat spacing · {study.seats.length} seats</p>
        <div className="mockup-controls">
          <label><input type="checkbox" checked={rail} onChange={event => setRail(event.target.checked)}/>Front rail</label>
          <label><input type="checkbox" checked={markers} onChange={event => setMarkers(event.target.checked)}/>Seat markers</label>
        </div>
      </div>
      {layers && <div className="bay-six-crops">
        <figure>
          <figcaption id="bay-six-native">Native size · 1×</figcaption>
          <canvas ref={native} width={crop.width} height={crop.height} aria-labelledby="bay-six-native"/>
        </figure>
        <figure>
          <figcaption id="bay-six-zoom">Pixel zoom · 4×</figcaption>
          <div className="bay-six-zoom" tabIndex={0} role="region" aria-labelledby="bay-six-zoom">
            <canvas ref={zoom} width={crop.width * 4} height={crop.height * 4} aria-labelledby="bay-six-zoom"/>
          </div>
        </figure>
      </div>}
    </section>}
    <div className="scale-study-crop gatehouse-overview">
      <canvas ref={canvas} width={bowl.width} height={bowl.height} data-ready={Boolean(layers)}
        aria-label={study ? 'Gatehouse stadium with ' + study.label + ' in west bay 6'
          : masked ? 'Gatehouse seating masks' : 'Empty Gatehouse stadium'}/>
    </div>
  </main>;
}
