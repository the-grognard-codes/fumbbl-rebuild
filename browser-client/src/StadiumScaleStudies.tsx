import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import architectureUrl from '../../assets/game/references/stadiums/scale-studies/empty-gatehouse.webp';
import seatingUrl from '../../assets/game/references/stadiums/scale-studies/empty-seating.png';
import seatingLayout from '../../assets/game/references/stadiums/scale-studies/empty-seating.json';
import benchLayout from '../../assets/game/references/stadiums/scale-studies/gatehouse-benches.json';
import seatingStudies from '../../assets/game/references/stadiums/scale-studies/bay-six/seats.json';
import { playerArtPlacement, resolvePlayerArt } from './player-art.ts';
import { bowl, drawBowlGround } from './stadium-bowl-study.ts';
import { MOCKUP_PLAYER_WIDTH_IN_SQUARES, STILL_LAYOUT, mockupPlayers } from './stadium-mockup.ts';
import './stadium-mockup.css';
import './stadium-scale-studies.css';

const bay = seatingLayout.bays.find(({ id }) => id === 6)!;
const square = STILL_LAYOUT.pixelsPerSquare;
const crop = { x: 0, y: bay.y - 17, width: bowl.pitchX + square + 6, height: bay.height + 38 };
const studyImages = import.meta.glob<string>('../../assets/game/references/stadiums/scale-studies/bay-six/*.png', {
  eager: true, query: '?url', import: 'default',
});
const studyImageRoot = '../../assets/game/references/stadiums/scale-studies/bay-six/';
const poseCellSize = 48;
const poseZoomSize = poseCellSize * 2;
const poseColumns = [
  ['seated-fist', 'Raised fist'],
  ['seated-tankard', 'Tankard'],
  ['seated-bottle', 'Bottle'],
  ['seated-food', 'Eating'],
  ['standing-fist', 'Raised fist'],
  ['seated-folded', 'Folded arms'],
];
const benchColors = [
  [202, 145, 254],
  [170, 235, 108],
  [255, 128, 104],
  [122, 159, 255],
  [232, 214, 196],
];
const benchAlpha = 135;
const maxPlanks = Math.max(...benchLayout.bays.map(({ planks }) => planks.length));
type SeatingStudy = typeof seatingStudies[number];
type Seat = SeatingStudy['seats'][number];
const fullPlan = seatingStudies[0].seats;

function seatKey({ x, y, plankId }: Pick<Seat, 'x' | 'y' | 'plankId'>) {
  return `${plankId}:${x},${y}`;
}

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

function buildBenchOverlay(seating: ImageData) {
  const overlay = drawingSurface();
  const context = overlay.getContext('2d')!;
  const pixels = context.createImageData(bowl.width, bowl.height);
  for (const { id, planks } of benchLayout.bays) {
    const bounds = seatingLayout.bays.find(bay => bay.id === id)!;
    for (const plank of planks) {
      const color = [...benchColors[(plank.id % 10) - 1], benchAlpha];
      for (const [left, top, width, height] of plank.rects) {
        for (let y = Math.max(0, top); y < Math.min(bounds.height, top + height); y++) {
          for (let x = Math.max(0, left); x < Math.min(bounds.width, left + width); x++) {
            const pixel = ((bounds.y + y) * bowl.width + bounds.x + x) * 4;
            if (seating.data[pixel] === id) pixels.data.set(color, pixel);
          }
        }
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  return overlay;
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
  const [architecture, seating, player, atlas, studies] = await Promise.all([
    image(architectureUrl, bowl),
    image(seatingUrl, bowl),
    loadScalePlayer(),
    image(studyImages[studyImageRoot + 'supporter-kits.png'],
      { width: poseColumns.length * poseCellSize, height: poseCellSize * 2 }),
    Promise.all(seatingStudies.map(async study => {
      const [crowd, rail] = await Promise.all([
        image(studyImages[studyImageRoot + study.id + '.png'], bay),
        image(studyImages[studyImageRoot + study.id + '-rail.png'], bay),
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
  const benches = buildBenchOverlay(pixels);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const bay = pixels.data[i];
    const away = bay >= 8 && bay <= 11;
    pixels.data.set(away ? [235, 132, 203, 145] : [64, 214, 195, 145], i);
    if (!bay) pixels.data[i+3] = 0;
  }
  context.putImageData(pixels, 0, 0);
  return { stadium, overlay, benches, player, atlas, studies };
}

function drawSeatMarkers(context: CanvasRenderingContext2D, seats: readonly Seat[]) {
  const occupied = new Set(seats.map(seatKey));
  context.strokeStyle = '#d4cdc1';
  for (const seat of fullPlan) {
    if (!occupied.has(seatKey(seat))) context.strokeRect(bay.x + seat.x - .5, bay.y + seat.y - .5, 2, 2);
  }
  for (const { knee } of seats) {
    if (!knee) continue;
    const x = bay.x + knee.x, y = bay.y + knee.y;
    context.fillStyle = '#101820';
    context.fillRect(x - 1, y - 1, 3, 3);
    context.fillStyle = '#ffe17b';
    context.fillRect(x, y, 1, 1);
  }
  const contacts = seats.flatMap(seat => seat.otherSole ? [seat, seat.otherSole] : [seat]);
  for (const contact of contacts) {
    const x = bay.x + contact.x, y = bay.y + contact.y;
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

function SupporterPose({ atlas, seat }: { atlas: HTMLImageElement; seat: Seat }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const column = poseColumns.findIndex(([pose]) => pose === seat.pose);
  const row = seat.neutral ? poseCellSize : 0;
  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.drawImage(atlas, column * poseCellSize, row, poseCellSize, poseCellSize,
      0, 0, poseZoomSize, poseZoomSize);
  }, [atlas, column, row]);

  return <li>
    <figure>
      <canvas ref={canvas} width={poseZoomSize} height={poseZoomSize} aria-hidden="true"/>
      <figcaption>{seat.stance === 'standing' ? 'Standing' : 'Seated'} · {poseColumns[column][1]} · {seat.neutral ? 'Neutral kit' : 'Home kit'}</figcaption>
    </figure>
  </li>;
}

export function StadiumScaleStudies() {
  const [layers, setLayers] = useState<Awaited<ReturnType<typeof loadLayers>>>();
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState(seatingStudies[0].id);
  const [benches, setBenches] = useState(false);
  const [rail, setRail] = useState(true);
  const [markers, setMarkers] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const native = useRef<HTMLCanvasElement>(null);
  const zoom = useRef<HTMLCanvasElement>(null);
  const study = seatingStudies.find(({ id }) => id === view);
  const standing = study?.seats.filter(({ stance }) => stance === 'standing').length ?? 0;
  const spacing = study?.spacing;
  const contactSpacing = spacing && (spacing.min === spacing.max ? spacing.min : `${spacing.min}–${spacing.max}`);
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
    if (benches) context.drawImage(layers.benches, 0, 0);
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
  }, [layers, view, masked, benches, rail, markers]);

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
        <label className="gatehouse-bench-toggle">
          <input type="checkbox" checked={benches} onChange={event => setBenches(event.target.checked)}
            aria-describedby={benches ? 'gatehouse-bench-key' : undefined}/>Bench tops
        </label>
      </div>
    </header>
    {masked && <p>Teal marks home seating. Pink marks the east away stand.</p>}
    {benches && <ul className="gatehouse-bench-key" id="gatehouse-bench-key" role="list" aria-label="Bench top key">
      {benchColors.slice(0, maxPlanks).map((color, index) => <li key={index}>
        <span aria-hidden="true" style={{ backgroundColor: `rgb(${color.join(' ')})` }}/>Plank {index + 1}
      </li>)}
    </ul>}
    {failed && <p role="alert">The stadium artwork could not be loaded.</p>}
    {!failed && !layers && <p role="status">Loading stadium artwork…</p>}
    {study && <section className="bay-six-review" aria-labelledby="bay-six-heading">
      <h2 id="bay-six-heading">West bay 6</h2>
      <div className="bay-six-toolbar">
        <p>{study.label} · <strong>{study.seats.length} of {study.capacity} occupied</strong> · {contactSpacing} px spacing along planks
          {standing > 0 && ` · ${study.seats.length - standing} seated, ${standing} standing`}</p>
        <div className="mockup-controls">
          <label><input type="checkbox" checked={rail} onChange={event => setRail(event.target.checked)}/>Front rail</label>
          <label><input type="checkbox" checked={markers} onChange={event => setMarkers(event.target.checked)}
            aria-describedby={markers ? 'bay-six-marker-key' : undefined}/>Seat markers</label>
        </div>
      </div>
      {markers && <p className="bay-six-marker-key" id="bay-six-marker-key">
        <span>Cyan crosses</span> mark hip or boot contact. <span>Gold dots</span> mark seated knees.
        {study.seats.length < study.capacity && <> <span>Grey squares</span> mark vacant seats.</>}
      </p>}
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
      {layers && <details className="bay-six-poses" key={study.id}>
        <summary>Inspect full poses</summary>
        <ol role="list" aria-label="Supporters in bay order">
          {study.seats.map(seat => <SupporterPose key={seatKey(seat)} atlas={layers.atlas} seat={seat}/>)}
        </ol>
      </details>}
    </section>}
    <div className="scale-study-crop gatehouse-overview">
      <canvas ref={canvas} width={bowl.width} height={bowl.height} data-ready={Boolean(layers)}
        aria-label={study ? 'Gatehouse stadium with ' + study.label + ' in west bay 6'
          : masked ? 'Gatehouse seating masks' : 'Empty Gatehouse stadium'}/>
    </div>
  </main>;
}
