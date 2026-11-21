import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PitchScenery } from './PitchScenery.tsx';
import { allPaintingLayers, StadiumMockupPainting, type PaintingVisibility } from './StadiumMockupPainting.tsx';
import { StadiumMockupTurf, useMockupTurf } from './StadiumMockupTurf.tsx';
import { StadiumScaleStudies } from './StadiumScaleStudies.tsx';
import { PITCH_LENGTH, PITCH_WIDTH, type PitchEnd, type Point } from './pitch-projection.ts';
import { playerArtPlacement, resolvePlayerArt } from './player-art.ts';
import { teamColorArt } from './team-color-art.ts';
import {
  ANGLED_HEIGHT, CONCEPT_HEIGHT, MOCKUP_COLOR_PRESETS, MOCKUP_PLAYER_WIDTH_IN_SQUARES, STILL_LAYOUT,
  mockupCamera, mockupColorPair, mockupPaintingFrame, mockupPlayers,
  type MockupAngle, type MockupColorPreset, type PitchPreset, type Visitor,
} from './stadium-mockup.ts';
import concept from '../../assets/game/references/stadiums/concept-round-3/01-old-world-classic-human-home.webp';
import './stadium-mockup.css';

const candidateFiles = import.meta.glob('../../assets/game/references/stadiums/round-four/candidate-*.{png,webp}',
  { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const candidates = Object.entries(candidateFiles).sort().map(([path, url]) => ({
  url,
  label: 'Candidate ' + path.slice(path.lastIndexOf('-') + 1, path.lastIndexOf('.')),
}));
const approvedCandidate = candidates.find(({ label }) => label === 'Candidate 02');
const defaultCandidate = approvedCandidate ?? candidates[0];
const conceptReference = {
  url: concept,
  label: 'Round three concept',
  alt: 'Old World Classic concept with tiered supporters, stone walls, blue and gold banners, and torches',
};
const angles = [90, 30, 40, 50] as const;
const comparisonModes = [
  ['render', 'Stadium'], ['side-by-side', 'Side by side'], ['crossfade', 'Cross-fade'],
] as const;
type ComparisonMode = typeof comparisonModes[number][0];
const layerLabels: Record<keyof PaintingVisibility, string> = {
  sides: 'Side stands', ends: 'End walls', visitor: 'Visiting section', turf: 'Turf',
};

function svgPoints(points: readonly Point[]) {
  return points.map(({ x, y }) => [x, y].join(',')).join(' ');
}

export function StadiumMockup() {
  return new URLSearchParams(window.location.search).get('view') === 'scale' ? <StadiumScaleStudies/> : <GatehouseGallery/>;
}

function GatehouseGallery() {
  const [end, setEnd] = useState<PitchEnd>('home');
  const [angle, setAngle] = useState<MockupAngle>(90);
  const [focus, setFocus] = useState(PITCH_LENGTH / 2);
  const [transverse, setTransverse] = useState(PITCH_WIDTH / 2);
  const [zoom, setZoom] = useState(1);
  const [visitor, setVisitor] = useState<Visitor>('orc');
  const [colors, setColors] = useState<MockupColorPreset>('defaults');
  const [pitchPreset, setPitchPreset] = useState<PitchPreset>('balanced');
  const [players, setPlayers] = useState(true);
  const [grid, setGrid] = useState(true);
  const [visible, setVisible] = useState(allPaintingLayers);
  const [layoutOnly, setLayoutOnly] = useState(false);
  const [comparison, setComparison] = useState<ComparisonMode>('render');
  const [compareSubject, setCompareSubject] = useState('rendered');
  const [compareReference, setCompareReference] = useState('approved');
  const [candidateUrl, setCandidateUrl] = useState(defaultCandidate?.url);
  const [blend, setBlend] = useState(50);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState<number>(STILL_LAYOUT.width);
  const viewport = useRef<HTMLDivElement>(null);

  const onError = useCallback(() => setFailed(true), []);
  const turfImage = useMockupTurf(onError);
  const reviewingStill = comparison !== 'render';
  const candidate = candidates.find(({ url }) => url === candidateUrl) ?? defaultCandidate;
  useSyncExternalStore(teamColorArt.subscribe, teamColorArt.snapshot);
  useEffect(() => {
    const release = teamColorArt.retain();
    void teamColorArt.load('human');
    void teamColorArt.load('orc');
    document.title = 'Old World Classic · Gatehouse gallery';
    return release;
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [reviewingStill]);

  const camera = mockupCamera(end, zoom, focus, transverse, angle);
  const overhead = camera.mode === 'top-down';
  const sceneHeight = overhead ? STILL_LAYOUT.height : ANGLED_HEIGHT;
  const colorPair = mockupColorPair(colors, visitor);
  const paintingFrame = layoutOnly ? null : mockupPaintingFrame(camera);
  const reference = compareReference === 'approved' && approvedCandidate
    ? { url: approvedCandidate.url, label: 'Approved Gatehouse still', alt: 'Approved Gatehouse stadium painting' }
    : conceptReference;
  const conceptFraming = reference === conceptReference;
  const compareLabel = compareSubject === 'rendered' ? 'Layered Gatehouse' : candidate?.label;
  const line = (x: number, y: number, x1: number, y1: number) =>
    svgPoints(camera.polygon([{ x, y }, { x: x1, y: y1 }, { x: x1, y: y1 }]));

  function captureLayout() {
    setComparison('render');
    setEnd('home');
    setAngle(90);
    setFocus(PITCH_LENGTH / 2);
    setTransverse(PITCH_WIDTH / 2);
    setZoom(1);
    setPlayers(false);
    setGrid(true);
    setVisible(allPaintingLayers);
    setLayoutOnly(true);
  }

  return <main className={comparison === 'side-by-side' ? 'stadium-mockup mockup-wide' : 'stadium-mockup'}>
    <header className="mockup-heading">
      <h1>Old World Classic</h1>
      <a className="mockup-scale-link" href="?view=scale">Compare player scales</a>
      {candidates.length > 0 && <a href="#candidate-heading">Browse painted candidates</a>}
    </header>
    {failed && <p className="mockup-status" role="status">Turf failed to load or a painted layer is unavailable. Reload this page to retry.</p>}
    <div className="mockup-controls mockup-reference-controls">
      {candidates.length > 0 && <label>Comparison
        <select aria-label="Comparison" value={comparison} onChange={event => setComparison(event.target.value as ComparisonMode)}>
          {comparisonModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>}
      {reviewingStill && <label>Compare
        <select aria-label="Compare" value={compareSubject} onChange={event => setCompareSubject(event.target.value)}>
          <option value="rendered">Layered Gatehouse</option><option value="candidate">Painted candidate</option>
        </select>
      </label>}
      {reviewingStill && compareSubject === 'candidate' && <label>Painted still
        <select aria-label="Painted still" value={candidate?.url} onChange={event => setCandidateUrl(event.target.value)}>
          {candidates.map(({ url, label }) => <option key={url} value={url}>{label}</option>)}
        </select>
      </label>}
      {reviewingStill && <label>Reference
        <select aria-label="Reference" value={compareReference} onChange={event => setCompareReference(event.target.value)}>
          {approvedCandidate && <option value="approved">Approved Gatehouse still</option>}
          <option value="concept">Round three concept</option>
        </select>
      </label>}
      {comparison === 'crossfade' && <label>Reference opacity
        <input aria-label="Reference opacity" aria-valuetext={blend + '%'} type="range" min="0" max="100" step="1" value={blend}
          onChange={event => setBlend(Number(event.target.value))}/>
        <output aria-hidden="true">{blend}%</output>
      </label>}
      {!reviewingStill && (layoutOnly
        ? <button type="button" onClick={() => setLayoutOnly(false)}>Show painted layers</button>
        : <button type="button" onClick={captureLayout}>Frame empty pitch</button>)}
    </div>
    {reviewingStill && candidate ? <>
      <p>{conceptFraming
        ? 'Both images use the same centre and width, cropped to the concept’s sideline frame.'
        : 'Both images share the full home overhead frame.'}</p>
      <div className={'mockup-comparison ' + (comparison === 'side-by-side' ? 'mockup-side-by-side' : '')}>
        <figure className="mockup-reference">
          <div className="mockup-concept-frame"
            style={{ aspectRatio: STILL_LAYOUT.width + ' / ' + (conceptFraming ? CONCEPT_HEIGHT : STILL_LAYOUT.height) }}>
            {compareSubject === 'rendered'
              ? <StadiumMockupPainting end="home" preset="balanced" colors="defaults" visitor="orc"
                visible={allPaintingLayers} onError={onError}/>
              : <img className="mockup-compared-still" src={candidate.url} alt={candidate.label}/>}
            {comparison === 'crossfade' &&
              <img className="mockup-overlay" src={reference.url} alt={reference.alt} style={{ opacity: blend / 100 }}/>}
          </div>
          <figcaption>{comparison === 'crossfade' ? compareLabel + ' / ' + reference.label : compareLabel}</figcaption>
        </figure>
        {comparison === 'side-by-side' && <figure className="mockup-reference">
          <img className="mockup-concept" src={reference.url} alt={reference.alt}/>
          <figcaption>{reference.label}</figcaption>
        </figure>}
      </div>
    </> : <>
      <div className="mockup-controls mockup-render-controls">
        <label>Visiting team
          <select aria-label="Visiting team" value={visitor} onChange={event => setVisitor(event.target.value as Visitor)}>
            <option value="orc">Orc</option><option value="human">Human mirror</option>
          </select>
        </label>
        <label>Coach end
          <select aria-label="Coach end" value={camera.end} onChange={event => setEnd(event.target.value as PitchEnd)}>
            <option value="home">Home</option><option value="away">Away</option>
          </select>
        </label>
        <label>Camera
          <select aria-label="Camera" value={camera.elevation} onChange={event => setAngle(Number(event.target.value) as MockupAngle)}>
            {angles.map(value => <option value={value} key={value}>{value === 90 ? 'Overhead' : value + '°'}</option>)}
          </select>
        </label>
        <label>Zoom
          <input aria-label="Zoom" aria-valuetext={Math.round(zoom * 100) + '%'}
            type="range" min=".5" max="2" step=".25" value={zoom} onChange={event => setZoom(Number(event.target.value))}/>
          <output aria-hidden="true">{Math.round(zoom * 100)}%</output>
        </label>
        <label>Longitudinal pan
          <input type="range" min="0" max={PITCH_LENGTH} step=".5" value={camera.focus}
            onChange={event => setFocus(Number(event.target.value))}/>
        </label>
        <label>Transverse pan
          <input type="range" min="0" max={PITCH_WIDTH} step=".5" value={camera.transverseFocus}
            onChange={event => setTransverse(Number(event.target.value))}/>
        </label>
        <label>Colour pair
          <select aria-label="Colour pair" value={colors} onChange={event => setColors(event.target.value as typeof colors)}>
            {MOCKUP_COLOR_PRESETS.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        {paintingFrame && <label>Pitch preset
          <select aria-label="Pitch preset" value={pitchPreset} onChange={event => setPitchPreset(event.target.value as PitchPreset)}>
            <option value="balanced">Balanced</option><option value="calm">Calm</option>
          </select>
        </label>}
      </div>
      <fieldset className="mockup-layers">
        <legend>Layers</legend>
        <label><input type="checkbox" checked={players} onChange={event => setPlayers(event.target.checked)}/>Players</label>
        <label><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)}/>Grid</label>
        {(paintingFrame ? Object.entries(layerLabels) : [['turf', layerLabels.turf]]).map(([layer, label]) => {
          const key = layer as keyof PaintingVisibility;
          return <label key={key}><input type="checkbox" checked={visible[key]}
            onChange={event => setVisible(current => ({ ...current, [key]: event.target.checked }))}/>{label}</label>;
        })}
      </fieldset>
      <p>The native overhead frame uses 32 pixels per square at 100% zoom, with a two-square apron.</p>
      <div ref={viewport} className="mockup-viewport" style={{ aspectRatio: STILL_LAYOUT.width + ' / ' + sceneHeight }}>
        <div className="mockup-stage" role="region" data-end={camera.end} data-angle={camera.elevation} data-zoom={zoom}
          data-ready={Boolean(turfImage)} aria-label="Stadium rendering"
          style={{ width: STILL_LAYOUT.width, height: sceneHeight, transform: 'scale(' + width / STILL_LAYOUT.width + ')' }}>
          <div className="mockup-camera"
            style={{ top: overhead ? sceneHeight / 2 - camera.center.y : 0, height: camera.height }}>
            {paintingFrame
              ? <div className="mockup-painting" style={{ left: paintingFrame.left, top: paintingFrame.top,
                transform: 'scale(' + paintingFrame.scale + ')' }}>
                <StadiumMockupPainting end={end} preset={pitchPreset} colors={colors} visitor={visitor} visible={visible} onError={onError}/>
              </div>
              : visible.turf && (overhead
                ? <StadiumMockupTurf camera={camera} image={turfImage}/>
                : <PitchScenery camera={camera} onError={onError}/>)}
            {grid && <svg className="mockup-ground" width={STILL_LAYOUT.width} height={camera.height} aria-hidden="true">
              {Array.from({ length: PITCH_LENGTH * PITCH_WIDTH }, (_, index) => {
                const x = index % PITCH_LENGTH, y = Math.floor(index / PITCH_LENGTH);
                return <polygon key={index} data-cell-x={x} data-cell-y={y} points={svgPoints(camera.square({ x, y }))}
                  fill="none" stroke="#d7e7b4" strokeOpacity=".25" strokeWidth=".6"/>;
              })}
              {[0, 1, 13, 25, 26].map(x => <polyline key={'x' + x} points={line(x, 0, x, PITCH_WIDTH)}
                fill="none" stroke="#ece8cf" strokeWidth="1.5"/>)}
              {[0, 4, 11, 15].map(y => <polyline key={'y' + y} points={line(0, y, PITCH_LENGTH, y)}
                fill="none" stroke="#ece8cf" strokeWidth="1.5" strokeDasharray={y === 4 || y === 11 ? '10 9' : undefined}/>)}
            </svg>}
            {players && mockupPlayers(visitor).map(player => {
              const position = camera.project({ x: player.x + .5, y: player.y + .5 });
              const body = resolvePlayerArt(player, { end: camera.end, topDown: overhead, colors: colorPair[player.role] })?.body;
              if (!position || !body) return null;
              const scale = position.pixelsPerSquare * MOCKUP_PLAYER_WIDTH_IN_SQUARES / 64;
              const anchor = playerArtPlacement(body, overhead).anchor;
              return <img key={player.id} className="mockup-player" data-player-id={player.id} data-roster={player.art.rosterId}
                data-center-x={position.x} data-center-y={position.y} src={body.url} alt={player.role + ' player ' + player.number}
                style={{ left: position.x - anchor.x * scale, top: position.y - anchor.y * scale,
                  width: body.width * scale, height: body.height * scale }}/>;
            })}
          </div>
        </div>
      </div>
    </>}
    {candidates.length > 0 && <section className="mockup-candidates" aria-labelledby="candidate-heading">
      <h2 id="candidate-heading">Painted candidates</h2>
      {candidates.map(({ url, label }) => <figure key={url}>
        <a href={url}><img src={url} alt={label} width={STILL_LAYOUT.width} height={STILL_LAYOUT.height} loading="lazy"/></a>
        <figcaption>{label}</figcaption>
      </figure>)}
    </section>}
  </main>;
}
