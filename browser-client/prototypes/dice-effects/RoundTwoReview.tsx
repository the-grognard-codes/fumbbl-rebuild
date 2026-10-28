// ROUND TWO: original polygon tumble plus fade; fantasy-football outcome art.
// Illustrative report stages only. No requests, native result mapping or app mutations.
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { PolygonDie } from '../../src/PolygonDie.tsx';
import { PitchProjection } from '../../src/pitch-projection.ts';
import { PitchScenery } from '../../src/PitchScenery.tsx';
import { playerArtPlacement, resolvePlayerArt } from '../../src/player-art.ts';
import type { SetupPlayer } from '../../src/setup-protocol.ts';
import type { DieKind } from '../../src/die-geometry.ts';
import { outcomes, type Outcome } from './OutcomeGraphic.tsx';
import { RoundTwoOutcomeGraphic } from './RoundTwoOutcomeGraphic.tsx';
import { NativeReviewDie, ReviewClock } from './NativeReviewDie.tsx';
import './review.css';
import './round-two.css';

type Variant = 'MUTP' | 'RESULT';
type DiceMotion = 'native' | 'round-one';
type Sample = { id: string; label: string; stage: string; faces: readonly string[]; kind?: Outcome; offset: number; hold: number; shapes?: readonly DieKind[] };
const variants: Variant[] = ['MUTP', 'RESULT'];
const names = { MUTP: 'MUTP blue · navy · yellow', RESULT: 'Colors by outcome' };
const CYCLE = 4400;
const gallery: Sample[] = outcomes.map(value => ({ ...value, kind: value.id, offset: 0, hold: 2400 }));
const ordinary: Sample = { id: 'ordinary', label: 'Ordinary rolls', stage: 'Dice shapes',
  faces: ['5', '8', '12', 'POW'], shapes: ['d6', 'd8', 'd16', 'block'], offset: 0, hold: 1200 };
const comparison: Sample = { id: 'motion-comparison', label: 'D6 pair', stage: 'Same result · same clock', faces: ['5', '6'], offset: 0, hold: 2400 };
const player = (id: string, role: 'home' | 'away', x: number, y: number, number: number): SetupPlayer => ({
  id, role, x, y, number, name: `${role} ${number}`, slot: number, state: 'is standing', offPitch: 'pitch',
  art: { rosterId: role === 'home' ? 'human' : 'orc', positionId: role === 'home' ? 'lineman' : 'orc-lineman' },
});
const players = [player('H4', 'home', 12, 6, 4), player('O7', 'away', 13, 6, 7),
  player('H8', 'home', 14, 8, 8), player('O2', 'away', 11, 9, 2)];

/** CSS animations are paused and inspected at a shared clock, including 50/100 ms phases. */
const DiceGroup = memo(function DiceGroup({ sample, motion = 'native', baseline = false }: { sample: Sample; motion?: DiceMotion; baseline?: boolean }) {
  const style = { '--offset': `${sample.offset}ms`, '--exit-at': `${50 + sample.hold}ms`,
    '--semantic-color': outcomes.find(value => value.id === sample.kind)?.color ?? '#4db2ff' } as CSSProperties;
  return <div className={`dice-group${baseline ? ' no-entrance-fade' : ''}`} style={style} data-sample={sample.id} data-hold={sample.hold} data-dice-motion={motion}>
    <div className="group-exit">
      <div className="review-arrival">
        <span className="roll-label">{sample.stage}</span>
        <div className="dice-and-outcome">
          <div className="dice-row">{sample.faces.map((face, index) => motion === 'native'
            ? <NativeReviewDie key={index} kind={sample.shapes?.[index] ?? 'd6'} face={face} index={index} offset={sample.offset}/>
            : <div className={`die-arrival direction-${index % 2}`} key={index}>
              <div className={`review-tumble tumble-${index % 2}`}><PolygonDie kind={sample.shapes?.[index] ?? 'd6'} face={face}/></div>
            </div>)}</div>
          {sample.kind && <span className="outcome-reveal"><RoundTwoOutcomeGraphic kind={sample.kind}/></span>}
        </div>
      </div>
      <div className="evaporation" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(index =>
        <i key={index} style={{ '--wisp': index } as CSSProperties}/>)}</div>
    </div>
  </div>;
});

function Pitch({ samples, motion }: { samples: Sample[]; motion: DiceMotion }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(850);
  const [assetError, setAssetError] = useState(false);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    observer.observe(host.current!); return () => observer.disconnect();
  }, []);
  const height = Math.max(340, Math.min(480, width * .53));
  const camera = new PitchProjection({ width, height, focus: 13, transverseFocus: 7.5, zoom: 1.8, mode: 'perspective', end: 'home' });
  return <div className="pitch-review" ref={host} style={{ height }}>
    <PitchScenery camera={camera} onError={() => setAssetError(true)}/>
    <svg className="pitch-players" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {Array.from({ length: 390 }, (_, index) => ({ x: Math.floor(index / 15), y: index % 15 })).map(square =>
        <polygon key={`${square.x}:${square.y}`} points={camera.square(square, 0, true).map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#d0d7a6" strokeOpacity=".16"/>)}
      {players.map(value => {
        const art = resolvePlayerArt(value, { end: 'home', topDown: false });
        const pos = camera.project({ x: value.x! + .5, y: value.y! + .5 });
        if (!art || !pos) return null;
        const { body } = art, { anchor } = playerArtPlacement(body, false);
        const scale = pos.pixelsPerSquare * 1.08 / 64;
        return <g key={value.id}><ellipse cx={pos.x} cy={pos.y} rx={pos.pixelsPerSquare * .25} ry={pos.pixelsPerSquare * .08} fill="#07141b80"/>
          <image href={body.url} x={pos.x - anchor.x * scale} y={pos.y - anchor.y * scale}
            width={body.width * scale} height={body.height * scale} onError={() => setAssetError(true)}/></g>;
      })}
    </svg>
    <span className="pitch-note">Actual size · 44 px dice / 48 px effects</span>
    <div className="pitch-rolls">{samples.map(sample => <DiceGroup sample={sample} motion={motion} key={sample.id}/>)}</div>
    {assetError && <p role="alert" className="asset-error">Pitch or player artwork failed to load.</p>}
  </div>;
}

function Review() {
  const initial = new URLSearchParams(location.search).get('variant');
  const [variant, setVariant] = useState<Variant>(initial === 'RESULT' ? 'RESULT' : 'MUTP');
  const [diceMotion, setDiceMotion] = useState<DiceMotion>('native');
  const [selected, setSelected] = useState('bh');
  const [sequence, setSequence] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [systemReduced, setSystemReduced] = useState(reduced);
  const last = useRef<number | undefined>(undefined);
  const root = useRef<HTMLElement>(null);
  const clock = useRef(0);
  const samples = useMemo(() => {
    const picked = gallery.find(value => value.id === selected) ?? ordinary;
    if (!sequence || !picked.kind || picked.kind === 'armor') return [picked];
    const stages = [{ ...gallery[0], offset: 0 }];
    if (['stun', 'ko', 'casualty'].includes(picked.kind)) return [...stages, { ...picked, offset: 500 }];
    stages.push({ ...gallery[3], offset: 500 });
    if (picked.stage === 'Serious injury') stages.push({ id: 'serious-pending', label: 'Serious injury required',
      stage: 'Casualty', faces: ['4'], offset: 1000, hold: 2400 });
    return [...stages, { ...picked, offset: picked.stage === 'Serious injury' ? 1500 : 1000 }];
  }, [selected, sequence]);
  const selection = gallery.find(value => value.id === selected) ?? ordinary;
  const chooseVariant = (next: Variant) => {
    setVariant(next); const url = new URL(location.href); url.searchParams.set('variant', next); history.replaceState(null, '', url);
  };
  const cycleVariant = (direction: number) => chooseVariant(variants[(variants.indexOf(variant) + direction + variants.length) % variants.length]);
  const seek = (value: number) => {
    clock.current = value; setElapsed(value); root.current?.style.setProperty('--elapsed', `${value}ms`); last.current = undefined;
  };
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { setSystemReduced(preference.matches); setReduced(preference.matches); };
    preference.addEventListener('change', change); return () => preference.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable],button')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); cycleVariant(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [variant]);
  useEffect(() => {
    if (!playing || reduced) { last.current = undefined; return; }
    let frame = 0;
    const tick = (now: number) => {
      // Hidden-tab recovery resumes locally instead of racing through unseen loops.
      if (last.current !== undefined) clock.current = (clock.current + Math.min(64, now - last.current) * speed) % CYCLE;
      last.current = now;
      root.current?.style.setProperty('--elapsed', `${clock.current}ms`);
      setElapsed(Math.round(clock.current));
      frame = requestAnimationFrame(tick);
    };
    const visible = () => { last.current = undefined; };
    document.addEventListener('visibilitychange', visible);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); last.current = undefined; document.removeEventListener('visibilitychange', visible); };
  }, [playing, speed, reduced]);

  const first = samples[0];
  const firstPhase = elapsed < 50 ? 'Materializing' : elapsed < 310 ? 'Tumbling' : elapsed < first.hold + 50 ? 'Holding'
    : elapsed < first.hold + 150 ? 'Evaporating' : 'Removed';
  return <ReviewClock.Provider value={{ elapsed, reduced }}><main className={`dice-review ${reduced ? 'static-study' : ''}`} data-variant={variant} data-round="2" ref={root}>
    <header className="review-header"><a href="?round=2&variant=MUTP" className="brand">MUTP <span>DICE / OUTCOME STUDY</span></a>
      <span className="review-tag">ROUND TWO · #374</span></header>
    <section className="intro"><p className="eyebrow">Chainmail. Face cages. The original tumble.</p>
      <h1>A harder hit. The same dice.</h1><p>The original polygon motion, materializing over 50 ms. Fantasy-football kit for every outcome.</p>
      <p className="round-links"><a href="?round=1&variant=MUTP">Open preserved round one</a><span>Approved evaporation and outcome choreography retained.</span></p>
      <p className="prototype-note">Illustrative outcomes · animation approval pending · gameplay is unchanged</p></section>
    <div className="review-layout"><section className="match-frame" aria-label="Pitch context">
      <div className="match-header"><span>HUMANS <b>0</b></span><small>HALF 1 · TURN 4</small><span><b>0</b> ORCS</span></div>
      <Pitch samples={samples} motion={diceMotion}/>
      <div className="match-footer"><span>{names[variant]}</span><span>50 ms in · 310 ms tumble · 100 ms out</span></div>
    </section>
    <aside className="review-controls" aria-label="Review controls"><h2>Watch the detail</h2>
      <label>Dice motion<select aria-label="Dice motion" value={diceMotion} onChange={event => { setDiceMotion(event.target.value as DiceMotion); seek(0); }}>
        <option value="native">Original polygon tumble + fade</option><option value="round-one">Round-one preview motion + fade</option>
      </select></label>
      <label>Outcome<select aria-label="Outcome" value={selected} onChange={event => { setSelected(event.target.value); seek(0); }}>
        {gallery.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}<option value="ordinary">Ordinary dice · all shapes</option>
      </select></label>
      <label className="check"><input type="checkbox" checked={sequence} onChange={event => { setSequence(event.target.checked); seek(0); }}/>
        Show preceding rolls</label>
      <div className="control-buttons"><button onClick={() => setPlaying(!playing)} disabled={reduced}>{playing ? 'Pause' : 'Play'}</button>
        <button onClick={() => { seek(0); setPlaying(true); }} disabled={reduced}>Restart</button></div>
      <label>Playback speed<select value={speed} onChange={event => setSpeed(Number(event.target.value))}>
        {[.5, 1, 2, 4].map(value => <option value={value} key={value}>{value}×{value === 1 ? ' · actual timing' : ''}</option>)}
      </select></label>
      <label className="check"><input type="checkbox" checked={reduced} disabled={systemReduced} onChange={event => setReduced(event.target.checked)}/>
        Static / reduced motion</label>
      <div className="state-readout"><span>{reduced ? 'Static symbols' : firstPhase}</span><strong>{reduced ? 'No motion' : `${elapsed} ms`}</strong>
        <p>{selection.hold.toLocaleString()} ms visibility · fade times additional</p>
        <p>{sequence && samples.length > 1 ? 'New groups arrive every 500 ms; earlier dice stay visible.' : 'Single roll study.'}</p>
      </div>
    </aside></div>
    <section className="timeline" aria-label="Animation timeline"><label htmlFor="review-time">Inspect a moment <output>{elapsed} ms</output></label>
      <input id="review-time" type="range" min="0" max={CYCLE - 1} step="1" value={elapsed} disabled={reduced}
        onChange={event => { setPlaying(false); seek(Number(event.target.value)); }}/>
      <div className="phase-buttons">{[['Entrance midpoint', 25], ['Mid tumble', 150], ['Settled', 900], ['Exit midpoint', 2500], ['After exit', 2600]].map(([label, value]) =>
        <button key={label} disabled={reduced} onClick={() => { setPlaying(false); seek(Number(value)); }}>{label}</button>)}</div>
    </section>
    <section className="motion-comparison" aria-label="Dice motion comparison">
      <div className="section-heading"><h2>Compare the roll.</h2><p>One clock and the same result: compare the native tumble with and without the fade, then the preserved round-one motion.</p></div>
      <div className="motion-options">
        <article data-motion-comparison="baseline"><h3>Original polygon tumble</h3><p>Without the entrance fade</p><div className="native-sample"><DiceGroup sample={comparison} baseline/></div></article>
        <article data-motion-comparison="native"><h3>Original polygon + materialize</h3><p>Same motion · 50 ms entrance fade</p><div className="native-sample"><DiceGroup sample={comparison}/></div></article>
        <article data-motion-comparison="round-one"><h3>Round-one preview</h3><p>Preserved as an alternative</p><div className="native-sample"><DiceGroup sample={comparison} motion="round-one"/></div></article>
      </div>
    </section>
    <section className="enlarged-study" aria-label="Enlarged selected effect"><div><p className="eyebrow">INSPECTION VIEW · 2.7×</p>
      <h2>{selection.label}</h2><p>Same clock, same artwork. One-shot actions settle into their final pose.</p></div>
      <div className="enlarged"><DiceGroup sample={selection} motion={diceMotion}/></div></section>
    <section className="catalogue" aria-labelledby="catalogue-title"><div className="section-heading"><h2 id="catalogue-title">Nine outcomes. One visual family.</h2>
      <p>Each tile pairs a native-size sample with a 2.7× inspection view. All follow the shared clock.</p></div>
      <div className="outcome-grid">{gallery.map(sample => <article key={sample.id} data-outcome-tile={sample.id}>
        <h3>{sample.label}</h3><div className="native-sample"><DiceGroup sample={sample} motion={diceMotion}/></div>
        <div className="enlarged"><DiceGroup sample={sample} motion={diceMotion}/></div>
        <p>{sample.kind === 'armor' || sample.kind === 'ko' || sample.kind === 'casualty' ? 'Play once → hold final pose' : sample.kind === 'stun' ? 'Swirling stars' : 'Gentle pulse → readable final result'}</p>
      </article>)}</div>
    </section>
    <section className="palette-reference" aria-label="Palette reference"><h2>Palette references</h2><p>Static-site blue / navy / yellow, with the player action menu’s blue borders and selected-state yellow.</p>
      <div className="swatches">{[['#4db2ff', 'Light blue'], ['#101c2b', 'Dark blue'], ['#ffe17b', 'Yellow'], ['#426c9b', 'Menu border'], ['#091726', 'Menu backdrop']].map(([color, label]) =>
        <span key={color}><i style={{ background: color }}/>{label}<code>{color}</code></span>)}</div>
      <p>Color-by-outcome keeps those dark outlines and uses restrained green, amber and rose accents. Shapes and labels carry the meaning in both sets.</p>
    </section>
    <nav className="palette-switcher" aria-label="Palette variants"><button aria-label="Previous palette" onClick={() => cycleVariant(-1)}>←</button>
      {variants.map(value => <button key={value} aria-pressed={variant === value} onClick={() => chooseVariant(value)}>{names[value]}</button>)}
      <button aria-label="Next palette" onClick={() => cycleVariant(1)}>→</button></nav>
  </main></ReviewClock.Provider>;
}

createRoot(document.getElementById('root')!).render(<Review/>);
