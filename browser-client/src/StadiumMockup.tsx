import { useEffect, useRef, useState } from 'react';
import { PitchProjection, type PerspectiveElevation, type Point } from './pitch-projection.ts';
import { StadiumMockupTurf } from './StadiumMockupTurf.tsx';
import { StadiumMockupSurface, useMockupImages } from './StadiumMockupSurface.tsx';
import { CrowdGestureProvider } from './CrowdGestureProvider.tsx';
import { playerArtPlacement, resolvePlayerArt } from './player-art.ts';
import { JIGSAW_PIECES, visibleGesturePieces } from './stadium-jigsaw.ts';
import { MOCKUP_PLAYERS, mockupModules, TURF_DETAIL, VISITOR_SECTION } from './stadium-mockup.ts';
import concept from '../../assets/game/references/stadiums/concept-round-3/01-old-world-classic-human-home.webp';
import './pitch-scenery.css';
import './stadium-mockup.css';
import { StadiumMockupCloth, mockupColorPair } from './StadiumMockupCloth.tsx';
import { useStadiumMockupColors } from './use-stadium-mockup-colors.ts';
import { StadiumMockupLife } from './StadiumMockupLife.tsx';
import { mockupAsset } from './stadium-mockup-assets.ts';

const points = (values: readonly Point[]) => values.map(point => `${point.x},${point.y}`).join(' ');
const layerNames = ['architecture', 'crowd', 'props', 'cloth', 'gestures', 'players'] as const;
type Layer = typeof layerNames[number];

export function StadiumMockup() {
  const [end, setEnd] = useState<'home' | 'away'>('home');
  const [angle, setAngle] = useState<30 | 40 | 50 | 90>(40);
  const [focus, setFocus] = useState(13), [zoom, setZoom] = useState(.75);
  const [visitor, setVisitor] = useState<'orc' | 'human'>('orc');
  const [detail, setDetail] = useState<keyof typeof TURF_DETAIL>('calm');
  const [colors, setColors] = useState('defaults');
  const [randomColors, setRandomColors] = useState(0);
  const [reduced, setReduced] = useState(true), [osReduced, setOsReduced] = useState(false);
  const [seams, setSeams] = useState(false), [compare, setCompare] = useState(false);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ architecture: true, crowd: true, props: true, cloth: true, gestures: true, players: true });
  const [size, setSize] = useState({ width: 1280, height: 720 });
  const [failed, setFailed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const colorPair = mockupColorPair(colors, randomColors);
  const colorError = () => setFailed(true);
  const humanColors = useStadiumMockupColors('human-sides-indexed-v1', colorPair.home, colorPair.away, colorError);
  const orcColors = useStadiumMockupColors('orc-sides-indexed-v1', colorPair.home, colorPair.away, colorError);
  const endColors = useStadiumMockupColors('human-ends-indexed-v2', colorPair.home, colorPair.away, colorError);
  const gestureColors = useStadiumMockupColors('human-sides-gesture-v1', colorPair.home, colorPair.away, colorError);
  useEffect(() => {
    document.title = 'Old World Classic · Stadium review';
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }));
    observer.observe(stage.current!);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setOsReduced(media.matches);
    sync(); media.addEventListener('change', sync);
    return () => { observer.disconnect(); media.removeEventListener('change', sync); };
  }, []);
  const camera = new PitchProjection({ ...size, end, focus, zoom, mode: angle === 90 ? 'top-down' : 'perspective', perspectiveElevation: (angle === 90 ? 40 : angle) as PerspectiveElevation });
  const modules = mockupModules(camera, visitor);
  const sourceFor = (module: typeof modules[number]) => {
    const { file } = module.art;
    const original = file.startsWith('../mockup/')
      ? mockupAsset(file.slice('../mockup/'.length))
      : `${import.meta.env.BASE_URL}assets/game/pitch/stadiums/jigsaw/${file}`;
    if (module.role !== 'crowd') return original;
    const recolored = file.includes('human-ends') ? endColors : file.includes('orc-') ? orcColors : humanColors;
    return recolored?.[module.team ?? 'home'] ?? original;
  };
  const turfUrl = `${import.meta.env.BASE_URL}assets/game/pitch/stadium-v1.png`;
  const imageUrls = [turfUrl, ...new Set(modules.map(sourceFor)), ...(gestureColors ? [gestureColors.home] : [])];
  const images = useMockupImages(imageUrls, colorError);
  const motion = !reduced && !osReduced && layers.gestures;
  const polygon = (x0: number, y0: number, x1: number, y1: number) => points(camera.polygon([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], true));
  const line = (a: Point, b: Point) => camera.polygon([a, b, b], true).map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join('');
  return <main className="stadium-mockup">
    <header><h1>Old World Classic</h1><p>Stadium review · art in progress · no live integration</p></header>
    <div className="mockup-controls">
      <label>Visiting team<select aria-label="Visiting team" value={visitor} onChange={event => setVisitor(event.target.value as typeof visitor)}><option value="orc">Orc</option><option value="human">Human mirror</option></select></label>
      <label>Coach end<select aria-label="Coach end" value={end} onChange={event => setEnd(event.target.value as typeof end)}><option value="home">Home</option><option value="away">Away</option></select></label>
      <label>Camera<select aria-label="Camera" value={angle} onChange={event => setAngle(Number(event.target.value) as typeof angle)}>{[30, 40, 50, 90].map(value => <option value={value} key={value}>{value === 90 ? 'Overhead' : `${value}°`}</option>)}</select></label>
      <label>Travel<select aria-label="Travel" value={focus} onChange={event => setFocus(Number(event.target.value))}><option value={end === 'home' ? 0 : 26}>Near end</option><option value={13}>Midfield</option><option value={end === 'home' ? 26 : 0}>Far end</option></select></label>
      <label>Zoom<input type="range" min=".5" max="2" step=".05" value={zoom} onChange={event => setZoom(Number(event.target.value))}/></label>
      <label>Pitch detail<select aria-label="Pitch detail" value={detail} onChange={event => setDetail(event.target.value as typeof detail)}>{Object.keys(TURF_DETAIL).map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Colour pair<select aria-label="Colour pair" value={colors} onChange={event => { setColors(event.target.value); setRandomColors(Math.floor(Math.random() * 16)); }}>{['defaults', 'identical', 'white / black', 'yellow / purple', 'similar blues', 'random'].map(value => <option key={value}>{value}</option>)}</select></label>
      {colors === 'random' && <button type="button" onClick={() => setRandomColors(previous => (previous + 1) % 16)}>Another pair</button>}
      <label><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)}/>Reduced motion{osReduced ? ' (system enabled)' : ''}</label>
      <label><input type="checkbox" checked={seams} onChange={event => setSeams(event.target.checked)}/>Seam bounds</label>
      <label><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)}/>Concept beside render</label>
    </div>
    <fieldset className="mockup-layers"><legend>Layers</legend>{layerNames.map(layer => <label key={layer}><input type="checkbox" checked={layers[layer]} onChange={event => setLayers(previous => ({ ...previous, [layer]: event.target.checked }))}/>{layer}</label>)}</fieldset>
    <p className="mockup-status" role="status">Generated review candidates · architecture, crowd and cloth are independent. Visual acceptance is pending. {failed ? 'An artwork file failed to load; original colours are retained.' : ''}</p>
    <div className={`mockup-comparison ${compare ? 'comparing' : ''}`}>
      <div ref={stage} className="mockup-stage" data-end={end} data-angle={angle} data-focus={focus} data-zoom={zoom} data-detail={detail} data-motion={motion} aria-label="Stadium rendering">
        <StadiumMockupTurf camera={camera} image={images.get(turfUrl)}/>
        <svg className="mockup-ground" width={size.width} height={size.height} aria-hidden="true">
          <polygon points={polygon(0, 0, 26, 15)} fill="#426528" opacity={1 - TURF_DETAIL[detail]}/>
          {Array.from({ length: 390 }, (_, index) => { const x = index % 26, y = Math.floor(index / 26); return <polygon key={index} data-cell-x={x} data-cell-y={y} points={points(camera.square({ x, y }, 0, true))} fill="none" stroke="#d7e7b4" strokeOpacity=".16" strokeWidth=".6"/>; })}
          <path data-pitch-lines d={[0, 1, 13, 25, 26].map(x => line({ x, y: 0 }, { x, y: 15 })).concat([0, 15].map(y => line({ x: 0, y }, { x: 26, y }))).join(' ')} fill="none" stroke="#ece8cf" strokeWidth="1.5"/>
          {[4, 11].map(y => <path key={y} d={line({ x: 0, y }, { x: 26, y })} stroke="#ece8cf" strokeWidth="1.5" strokeDasharray="10 9"/>)}
          {layers.players && <g>{[6, 7, 8, 9].map(x => <polygon key={x} points={points(camera.square({ x, y: 7 }, .05, true))} fill="#68d8cc" fillOpacity=".3" stroke="#b5fff1"/>)}<path d={line({ x: 6.5, y: 7.5 }, { x: 9.5, y: 7.5 })} stroke="#fff0a3" strokeWidth="3"/></g>}
          {layers.players && <g data-readability-overlays="block-assist-ball">
            <polygon points={points(camera.square({ x: 12, y: 7 }, .05, true))} fill="#f5992740" stroke="#f4ce74" strokeWidth="2"/>
            <polygon points={points(camera.square({ x: 12, y: 6 }, .12, true))} fill="none" stroke="#d9f5ff" strokeWidth="2"/>
            {(() => { const p = camera.project({ x: 9.5, y: 7.5 }); return p ? <image href={`${import.meta.env.BASE_URL}assets/game/ui/ball-v1.svg`} x={p.x - p.pixelsPerSquare * .12} y={p.y - p.pixelsPerSquare * .3} width={p.pixelsPerSquare * .24} height={p.pixelsPerSquare * .3}/> : null; })()}
          </g>}
        </svg>
        <CrowdGestureProvider eligible={motion && gestureColors ? visibleGesturePieces(modules, camera) : []}>
          <div className="mockup-structure" data-colors-ready={!!humanColors && !!orcColors && !!endColors && imageUrls.every(url => images.has(url))}>{modules.filter(module => layers[module.role === 'crowd' ? 'crowd' : module.role === 'sideline-gear' ? 'props' : 'architecture']).map((module, index) => <StadiumMockupSurface key={module.id} camera={camera} module={module} image={images.get(sourceFor(module))} gesture={gestureColors ? images.get(gestureColors.home) : undefined} order={index} motion={motion}/>)}</div>
        </CrowdGestureProvider>
        {layers.cloth && <StadiumMockupCloth camera={camera} preset={colors} random={randomColors} onError={() => setFailed(true)}/>}
        {motion && layers.architecture && <StadiumMockupLife camera={camera} modules={modules}/>}
        {layers.players && MOCKUP_PLAYERS.map(player => {
          const position = camera.project({ x: player.x! + .5, y: player.y! + .5 });
          const body = resolvePlayerArt(player, { end, topDown: angle === 90 })?.body;
          if (!position || !body || camera.square({ x: player.x!, y: player.y! }, 0, true).length < 3) return null;
          const scale = position.pixelsPerSquare * 1.08 / 64, anchor = playerArtPlacement(body, angle === 90).anchor;
          return <img key={player.id} className="mockup-player" data-player-id={player.id} data-center-x={position.x} data-center-y={position.y} src={body.url} alt={`${player.role} player ${player.number}`} style={{ left: position.x - anchor.x * scale, top: position.y - anchor.y * scale, width: body.width * scale, height: body.height * scale, transform: body.mirror ? 'scaleX(-1)' : undefined }}/ >;
        })}
        {seams && <svg className="mockup-seams" width={size.width} height={size.height}>{JIGSAW_PIECES.map(piece => <polygon key={piece.id} data-section={piece.id} data-owner={piece.id === VISITOR_SECTION ? 'away' : 'home'} points={polygon(piece.bounds.x0, piece.bounds.y0, piece.bounds.x1, piece.bounds.y1)} fill="none" stroke={piece.id === VISITOR_SECTION ? '#ffce64' : '#79dff7'} strokeWidth="2"/>)}</svg>}
      </div>
      {compare && <figure><img src={concept} alt="Approved Old World Classic concept: dense blue supporters, stone walls, timber, banners and torches"/><figcaption>Visual authority · pitch detail intentionally reduced in the render</figcaption></figure>}
    </div>
  </main>;
}
