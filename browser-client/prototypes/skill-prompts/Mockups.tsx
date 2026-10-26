// THROWAWAY: Three circular skill prompt concepts on the existing pitch-preview surface.
// Local illustrative snapshots only. Never sends game actions or creates real deadlines.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { PitchScenery } from '../../src/PitchScenery.tsx';
import { PitchProjection, type Point } from '../../src/pitch-projection.ts';
import { resolvePlayerArt, playerArtPlacement } from '../../src/player-art.ts';
import { PolygonDie } from '../../src/PolygonDie.tsx';
import type { SetupPlayer } from '../../src/setup-protocol.ts';
import './mockups.css';

type Variant = 'A' | 'B' | 'C';
type Scenario = 'wrestle' | 'pickup' | 'pass' | 'catch' | 'dodge' | 'dodgeSpent' | 'block' | 'long' | 'untimed' | 'preferences';
type Rect = { x: number; y: number; width: number; height: number };
const variants: Variant[] = ['A', 'B', 'C'];
const names = { A: 'Orbit', B: 'Crest', C: 'Dial' };
const descriptions = {
  A: 'Selected design: Orbit’s inset buttons and open center, with the Crest picker’s navy and gold palette.',
  B: 'A gold medallion with broad curved Yes / No segments and a strong central band.',
  C: 'An ice-blue instrument dial with round buttons, fine tick marks and a framed question.',
};
const scenarios: Record<Scenario, { label: string; skill: string; timed: boolean; sources?: string[] }> = {
  wrestle: { label: 'Wrestle · binary skill use', skill: 'Wrestle', timed: true },
  pickup: { label: 'Failed Pick Up · Sure Hands first', skill: 'Sure Hands', timed: false },
  pass: { label: 'Failed Pass · Pass first', skill: 'Pass', timed: false },
  catch: { label: 'Failed Catch · Catch first', skill: 'Catch', timed: false },
  dodge: { label: 'Failed Dodge · Dodge first', skill: 'Dodge', timed: false },
  dodgeSpent: { label: 'Later Dodge · Dodge already used', skill: 'Dodge', timed: false,
    sources: ['Pro', 'Team re-roll'] },
  block: { label: 'Block rerolls · excluded reference', skill: 'Brawler', timed: false,
    sources: ['Brawler · Both Down die', 'Pro · first die', 'Pro · second die', 'Team re-roll'] },
  long: { label: 'Long label · skill reroll', skill: 'Consummate Professional', timed: true },
  untimed: { label: 'Untimed · skill use', skill: 'Dodge', timed: false },
  preferences: { label: 'Skill + modifying skill + preference', skill: 'Wrestle', timed: true,
    sources: ['Wrestle', 'Modifying skill', 'Do not use for this action'] },
};
const home = [[12,6], [13,7], [11,8], [14,9], [15,5], [10,5], [13,4], [16,8], [10,9], [15,10], [9,7]];
const away = [[13,6], [12,7], [12,8], [14,8], [15,6], [11,5], [14,4], [16,9], [10,10], [15,11], [9,8]];
const basePlayers: SetupPlayer[] = (['home', 'away'] as const).flatMap(role =>
  (role === 'home' ? home : away).map(([x, y], index) => ({
    id: `${role === 'home' ? 'H' : 'O'}${index + 1}`, role, x, y, number: index + 1, slot: index + 1,
    name: `${role === 'home' ? 'Human' : 'Orc'} #${index + 1}`, state: 'is standing', offPitch: 'pitch',
    art: { rosterId: role === 'home' ? 'human' : 'orc', positionId: role === 'home'
      ? index === 0 ? 'blitzer' : index === 1 ? 'thrower' : 'lineman' : index < 2 ? 'orc-blitzer' : 'orc-lineman' },
  })));
const points = (polygon: Point[]) => polygon.map(p => `${p.x},${p.y}`).join(' ');
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const intersects = (a: Rect, b: Rect, gap = 10) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
  && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

function playerView(player: SetupPlayer, camera: PitchProjection) {
  const art = resolvePlayerArt(player, { end: camera.end, topDown: camera.mode === 'top-down' });
  if (!art || player.x === null || player.y === null) return null;
  const pos = camera.project({ x: player.x + .5, y: player.y + .5 });
  if (!pos) return null;
  const { body } = art, { anchor } = playerArtPlacement(body, camera.mode === 'top-down');
  const scale = pos.pixelsPerSquare * 1.08 / 64;
  return { body, pos, scale, anchor, rect: { x: pos.x + (body.bounds.x - anchor.x) * scale,
    y: pos.y + (body.bounds.y - anchor.y) * scale, width: body.bounds.width * scale, height: body.bounds.height * scale } };
}

function Player({ player, camera }: { player: SetupPlayer; camera: PitchProjection }) {
  const view = playerView(player, camera);
  if (!view) return null;
  const { body, pos, scale, anchor } = view;
  return <div className="review-player" data-player={player.id} style={{ left: pos.x, top: pos.y, zIndex: 10 + Math.round(pos.y) }}>
    <span className="player-shadow" style={{ width: pos.pixelsPerSquare * .6, height: pos.pixelsPerSquare * .15 }}/>
    <img alt={player.name} className="player-art" draggable={false} src={body.url}
      style={{ width: body.width * scale, height: body.height * scale, left: -anchor.x * scale, top: -anchor.y * scale,
        transform: body.mirror ? 'scaleX(-1)' : undefined }}/>
    <span className={`player-number ${player.role}`} style={{ left: pos.pixelsPerSquare * .24 }}>{player.number}</span>
  </div>;
}

function Ribbon({ remaining, duration, timed }: { remaining: number; duration: number; timed: boolean }) {
  const fraction = clamp(remaining / duration, 0, 1), urgent = fraction <= .2;
  return <svg className={`timer-ribbon${urgent && timed ? ' urgent' : ''}`} viewBox="0 0 200 200"
    role={timed ? 'timer' : undefined} aria-label={timed ? `${Math.ceil(remaining)} seconds remaining` : 'Untimed decision'}>
    <circle className="ribbon-track" cx="100" cy="100" r="88"/>
    {timed && <>
      <circle className="ribbon-progress" cx="100" cy="100" r="88" pathLength="100"
        strokeDasharray={`${fraction * 100} 100`} transform="rotate(-90 100 100)"/>
      <circle className="ribbon-number-bed" cx="188" cy="100" r="11"/>
      <text className="ribbon-number" x="188" y="100" dominantBaseline="central" textAnchor="middle">{Math.ceil(remaining)}</text>
    </>}
  </svg>;
}

type PromptProps = { title: string; remaining: number; duration: number; timed: boolean; onYes: () => void; onNo?: () => void };
function Orbit(props: PromptProps) {
  return <div className="prompt-face orbit"><Ribbon {...props}/>
    <button className="answer yes" aria-label="Yes" onClick={props.onYes}>✓ Yes</button>
    <h2 className="decision-question">{props.title}</h2>
    {props.onNo && <button className="answer no" aria-label="No" onClick={props.onNo}>× No</button>}
  </div>;
}
function Crest(props: PromptProps) {
  return <div className="prompt-face crest"><div className="crest-inner"/>
    <button className="answer yes" aria-label="Yes" onClick={props.onYes}><span>✓</span> Yes</button>
    <h2 className="decision-question">{props.title}</h2>
    {props.onNo && <button className="answer no" aria-label="No" onClick={props.onNo}><span>×</span> No</button>}
    <Ribbon {...props}/>
  </div>;
}
function Dial(props: PromptProps) {
  return <div className="prompt-face dial"><svg className="dial-marks" viewBox="0 0 200 200" aria-hidden="true">
    {Array.from({ length: 32 }, (_, i) => <path key={i} d={`M100 26v${i % 4 ? 3 : 6}`} transform={`rotate(${i * 11.25} 100 100)`}/>)}</svg>
    <Ribbon {...props}/><button className="answer yes" aria-label="Yes" onClick={props.onYes}><span>✓</span>Yes</button>
    <h2 className="decision-question">{props.title}</h2>
    {props.onNo && <button className="answer no" aria-label="No" onClick={props.onNo}><span>×</span>No</button>}
  </div>;
}

function PrototypeSwitcher({ variant, choose }: { variant: Variant; choose: (value: Variant) => void }) {
  const cycle = (delta: number) => choose(variants[(variants.indexOf(variant) + delta + 3) % 3]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [variant]);
  if (!import.meta.env.DEV) return null;
  return <nav className="variant-switcher" aria-label="Mockup style">
    <button aria-label="Previous mockup" onClick={() => cycle(-1)}>←</button>
    {variants.map(value => <button key={value} data-variant-choice={value} aria-pressed={variant === value}
      onClick={() => choose(value)}><b>{value}</b> {names[value]}</button>)}
    <button aria-label="Next mockup" onClick={() => cycle(1)}>→</button>
  </nav>;
}

function Mockups() {
  const initial = new URLSearchParams(location.search).get('variant') as Variant;
  const [variant, setVariant] = useState<Variant>(variants.includes(initial) ? initial : 'A');
  const [scenario, setScenario] = useState<Scenario>('wrestle');
  const [edge, setEdge] = useState('center');
  const [mode, setMode] = useState<'perspective' | 'top-down'>('perspective');
  const [end, setEnd] = useState<'home' | 'away'>('home');
  const [theme, setTheme] = useState('contrast');
  const [duration, setDuration] = useState(30), [remaining, setRemaining] = useState(30), [running, setRunning] = useState(false);
  const [source, setSource] = useState<string | null>(null), [outcome, setOutcome] = useState<string | null>(null);
  const [playback, setPlayback] = useState(false), [pending, setPending] = useState(false);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const stage = useRef<HTMLDivElement>(null), deadline = useRef(0);
  const [size, setSize] = useState({ width: 1000, height: 560 });
  const settings = scenarios[scenario];
  const primarySkillReroll = scenario === 'pickup' || scenario === 'pass' || scenario === 'catch' || scenario === 'dodge';
  const blockScene = scenario === 'wrestle' || scenario === 'block' || scenario === 'preferences';
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect; if (width && height) setSize({ width, height });
    });
    observer.observe(stage.current!); return () => observer.disconnect();
  }, []);
  const reset = (next: Scenario = scenario, seconds = duration) => {
    setScenario(next); setSource(null); setOutcome(null); setPending(false); setRemaining(seconds); setRunning(false); setRecoveryCount(0);
  };
  const finish = (value: string) => { setOutcome(value); setRunning(false); setPending(false); };
  const seek = (value: number) => { setRemaining(value); if (running) deadline.current = performance.now() + value * 1000; };
  useEffect(() => {
    if (!running || !settings.timed || outcome || playback) return;
    const interval = setInterval(() => {
      const seconds = Math.max(0, (deadline.current - performance.now()) / 1000);
      setRemaining(seconds);
      if (!seconds) finish('Deadline reached · existing decline continuation (illustration)');
    }, 70);
    return () => clearInterval(interval);
  }, [running, settings.timed, outcome, playback]);
  useEffect(() => {
    if (!pending) return;
    const timeout = setTimeout(() => finish(source === 'Do not use for this action'
      ? 'Do not use for this action · preference selected' : `Yes · ${source ?? settings.skill}`), 750);
    return () => clearTimeout(timeout);
  }, [pending]);
  const choose = (value: Variant) => {
    setVariant(value); const url = new URL(location.href); url.searchParams.set('variant', value); history.replaceState(null, '', url);
  };
  // Portrait previews crop a normal-width camera rather than shrinking its lens
  // to a one-pixel scale on a tall viewport. This is preview framing only.
  const camera = new PitchProjection({ width: Math.max(900, size.width), height: size.height,
    focus: 12.5, transverseFocus: 7.5, mode, end, zoom: 1.35 });
  // Near a viewport edge and near a pitch sideline are separate placement stresses.
  const subjectWorld = edge === 'sideline' ? { x: 12, y: 1 } : { x: 12, y: 6 };
  const players = basePlayers.map(player => player.id === 'H1' ? { ...player, ...subjectWorld }
    : player.id === 'O1' ? { ...player, x: subjectWorld.x + 1, y: subjectWorld.y } : player);
  const subject = playerView(players[0], camera)!;
  const involved = playerView(players[11], camera)!;
  // The edge fixture pans the whole camera, so pitch, sprites and protection stay aligned.
  const pan = edge === 'edge' ? { x: 28 - subject.rect.x, y: 70 - subject.rect.y }
    : { x: size.width < 900 ? size.width * .46 - subject.pos.x : 0, y: 0 };
  const shifted = (r: Rect): Rect => ({ ...r, x: r.x + pan.x, y: r.y + pan.y });
  const ballPos = camera.project({ x: subjectWorld.x + .5, y: subjectWorld.y + 1.5 })!;
  const ballRect = { x: ballPos.x + pan.x - 10, y: ballPos.y + pan.y - 9, width: 20, height: 18 };
  const diceRect = { x: clamp(size.width * .65 - 58, 12, size.width - 128), y: size.height * .5 - 34, width: 116, height: 86 };
  const protectedRects = [shifted(subject.rect), shifted(involved.rect), ballRect, diceRect];
  const diameter = size.width < 340 ? 164 : size.width < 550 ? 180 : 196;
  const showChooser = !!settings.sources && source === null;
  const chooserWidth = size.width < 340 ? 112 : size.width < 550 ? 148 : 164;
  const footprintWidth = diameter + (showChooser ? chooserWidth + 8 : 0);
  const height = showChooser ? Math.max(diameter, (settings.sources!.length + (scenario === 'block' ? 0 : 1)) * (size.width < 550 ? 40 : 32) + 32)
    : diameter + (settings.sources ? 35 : 0);
  const candidates: Rect[] = [];
  for (let y = 12; y <= size.height - height - 12; y += 18) {
    for (let x = 12; x <= size.width - footprintWidth - 12; x += 18) candidates.push({ x, y, width: footprintWidth, height });
  }
  const anchor = shifted(subject.rect);
  const score = (r: Rect) => protectedRects.filter(p => intersects(r, p)).length * 1e6
    + Math.hypot(r.x + diameter / 2 - anchor.x - anchor.width / 2, r.y + diameter / 2 - anchor.y - anchor.height / 2);
  const placement = candidates.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best,
    { x: 12, y: 12, width: footprintWidth, height });
  const collisions = protectedRects.filter(r => intersects(placement, r)).length;
  const pointerStart = { x: placement.x + diameter / 2, y: placement.y + diameter / 2 };
  const target = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  const question = source === 'Do not use for this action' ? 'Skip for this action?'
    : scenario === 'pickup' ? 'Use Sure Hands?'
    : scenario === 'long' ? `Use ${settings.skill}?` : `Use ${source ?? settings.skill}?`;
  const props: PromptProps = { title: showChooser ? 'Choose a skill or reroll' : question, remaining, duration, timed: settings.timed,
    onYes: () => setPending(true), onNo: scenario === 'block' ? undefined : () => finish(primarySkillReroll
      ? `No · decline ${settings.skill}; resolve original roll without another reroll prompt`
      : 'No · existing decline action') };
  const show = !outcome && !playback;
  const Prompt = variant === 'A' ? Orbit : variant === 'B' ? Crest : Dial;
  return <main className="skill-review" data-variant={variant} data-theme={theme}>
    <header className="review-header"><a href="?variant=A" className="wordmark">MUTP<span>SKILL DECISIONS</span></a><span className="review-label">INTERACTIVE MOCKUPS</span></header>
    <section className="intro"><div><p className="eyebrow">LESS PANEL. MORE PITCH.</p><h1>{variant} · {names[variant]}</h1><p>{descriptions[variant]}</p></div>
      <span className="intro-note">Same choices.<br/>Three visual treatments.</span></section>
    <div className="review-layout"><section className="match-frame" aria-label="Match preview">
      <div className="scoreboard"><span>HUMANS <b>0</b></span><small>HALF 1 · TURN 4</small><span><b>0</b> ORCS</span></div>
      <div className="pitch-stage" ref={stage}>
        <div className="world-layer" style={{ width: camera.width, height: camera.height, transform: `translate(${pan.x}px,${pan.y}px)` }}>
          <PitchScenery camera={camera} onError={() => console.error('Pitch artwork failed to load')}/>
          <svg className="pitch-lines" viewBox={`0 0 ${camera.width} ${camera.height}`} aria-hidden="true">
            {Array.from({ length: 390 }, (_, i) => ({ x: Math.floor(i / 15), y: i % 15 })).map(square =>
              <polygon key={`${square.x},${square.y}`} points={points(camera.square(square, 0, true))} fill="none" stroke="#e0e1ad" strokeOpacity=".16"/>)}
            <polyline points={points([camera.project({ x: 13, y: 0 })!, camera.project({ x: 13, y: 15 })!])} fill="none" stroke="#f6eed5" strokeOpacity=".4" strokeWidth="2"/>
            <polygon points={points(camera.square(subjectWorld, .06))} fill="#45e7ff15" stroke="#bde9ff" strokeWidth="2"/>
          </svg>
          {players.map(player => <Player key={player.id} player={player} camera={camera}/>)}
          {[subject, involved].map((view, index) => <span key={index} data-protected={`player-${index}`}
            className="protected-player-bounds" aria-hidden="true" style={{ left: view.rect.x, top: view.rect.y, width: view.rect.width, height: view.rect.height }}/>)}
        </div>
        <img className="review-ball" data-protected="ball" alt="Ball" src="/assets/game/ui/ball-v1.svg" style={{ left: ballRect.x, top: ballRect.y, width: ballRect.width, height: ballRect.height }}/>
        <div className="board-dice" data-protected="dice" style={{ left: diceRect.x, top: diceRect.y }}>
          <small>{scenario === 'pickup' ? 'PICK UP · FAILED' : scenario === 'pass' ? 'PASS · FAILED' : scenario === 'catch' ? 'CATCH · FAILED'
            : scenario === 'dodge' || scenario === 'dodgeSpent' ? 'DODGE · FAILED' : blockScene ? 'BLOCK RESULT' : 'ORIGINAL ROLL'}</small>
          <div>{(blockScene ? ['BOTH DOWN', 'PUSHBACK'] : ['1']).map((face, index) => <button key={index}
            className="die-choice" aria-label={`Keep original die ${index + 1}`} disabled={scenario !== 'block' || !!outcome || playback || pending}
            onClick={() => finish(`Original die ${index + 1} · ${face}`)}>
            <PolygonDie kind={face === '1' ? 'd6' : 'block'} face={face} index={index}/></button>)}</div>
          {scenario === 'block' && <small>SELECT A DIE TO CONTINUE</small>}
        </div>
        {show && <>
          <svg className="prompt-pointer" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true"><path d={`M${pointerStart.x},${pointerStart.y} L${target.x},${target.y}`}/>
            <circle cx={target.x} cy={target.y} r="3"/></svg>
          <div key={recoveryCount} className={`decision-position${pending ? ' pending' : ''}`} data-collisions={collisions}
            style={{ left: placement.x, top: placement.y, width: footprintWidth, '--prompt-size': `${diameter}px`, '--chooser-width': `${chooserWidth}px` } as CSSProperties}>
            {showChooser ? <div className="prompt-face chooser-face"><Ribbon {...props}/><h2>Choose a skill<br/>or reroll</h2><span className="chooser-arrow">↓</span></div>
              : <div role="dialog" aria-label={question} aria-busy={pending}><fieldset disabled={pending}><Prompt {...props}/></fieldset></div>}
            {showChooser ? <div className="source-chooser" aria-label="Available choices">
              {settings.sources!.map(value => <button key={value} onClick={() => setSource(value)}>{value}</button>)}
              {scenario !== 'block' && <button className="decline-choice" onClick={() => finish('No · existing decline action')}>No · decline</button>}
            </div> : settings.sources && <button className="back-choice" disabled={pending} onClick={() => setSource(null)}>← Back / change choice</button>}
            {pending && <span className="pending-note" role="status">Sending choice…</span>}
          </div>
        </>}
        {(outcome || playback) && <div className="outcome"><strong>{playback ? 'Replay · recorded dice only' : outcome}</strong>
          {!playback && <button onClick={() => reset()}>Show prompt again</button>}</div>}
        <div className="pitch-caption">{edge === 'center' ? 'MIDFIELD' : edge === 'sideline' ? 'SIDELINE' : 'VIEWPORT EDGE'}<span>Prompted player · cyan square</span></div>
      </div>
      <div className="pitch-footer"><span>{mode === 'top-down' ? 'Top-down' : 'Perspective'} · {end} end</span><span>Dice stay on the board</span></div>
    </section>
    <aside className="review-controls" aria-label="Preview controls"><h2>Try the decision</h2>
      <label>Scenario<select value={scenario} onChange={e => reset(e.target.value as Scenario)}>{Object.entries(scenarios).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label>
      <label>Placement<select value={edge} onChange={e => setEdge(e.target.value)}><option value="center">Midfield · nearby opponent + ball</option><option value="sideline">Pitch sideline</option><option value="edge">Player near viewport corner</option></select></label>
      <div className="control-pair"><label>Camera<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="perspective">Perspective</option><option value="top-down">Top-down</option></select></label>
        <label>View from<select value={end} onChange={e => setEnd(e.target.value as typeof end)}><option value="home">Home</option><option value="away">Away</option></select></label></div>
      <label>Surface contrast<select value={theme} onChange={e => setTheme(e.target.value)}><option value="mutp">MUTP navy</option><option value="contrast">MUTP high contrast preview</option></select></label>
      <div className="timer-controls"><h3>{settings.timed ? 'Countdown preview' : 'Untimed · static perimeter'}</h3>
        {settings.timed && <><label>Starting allowance<select value={duration} onChange={e => { const value = Number(e.target.value); setDuration(value); reset(scenario, value); }}><option value="30">30 seconds</option><option value="15">15 seconds · future allowance</option><option value="60">60 seconds · future allowance</option></select></label>
          <label>Time remaining · {Math.ceil(remaining)}s<input aria-label="Time remaining" type="range" min="0" max={duration} step=".1" value={remaining} onChange={e => seek(Number(e.target.value))}/></label>
          <div className="control-pair"><button disabled={!!outcome || playback} onClick={() => { if (!running) deadline.current = performance.now() + remaining * 1000; setRunning(!running); }}>{running ? 'Pause' : 'Run timer'}</button>
            <button onClick={() => seek(duration * .2)}>Final 20%</button></div></>}
      </div>
      <button className="reset-button" onClick={() => reset()}>Reset scenario</button>
      <label className="check"><input type="checkbox" checked={playback} onChange={e => { setPlayback(e.target.checked); setRunning(false); }}/>Replay preview · hide decisions</label>
      <button disabled={!settings.timed || !!outcome || playback} onClick={() => setRecoveryCount(n => n + 1)}>Remount prompt · retain time</button>
      <div className="state-readout" aria-live="polite"><h3>Preview state</h3><dl>
        <dt>Style</dt><dd>{variant} · {names[variant]}</dd><dt>Decision</dt><dd>{source ?? (settings.sources ? 'Choosing source' : settings.skill)}</dd>
        <dt>Clock</dt><dd>{settings.timed ? `${Math.ceil(remaining)} / ${duration}s · ${running ? 'running' : 'paused'}` : 'No decision deadline'}</dd>
        <dt>Placement</dt><dd>{collisions ? `${collisions} protected overlaps · inspect` : 'Players, ball + dice clear'}</dd>
        <dt>Remounts</dt><dd>{recoveryCount}</dd><dt>Result</dt><dd>{playback ? 'Replay' : outcome ?? (pending ? 'Pending' : 'Awaiting choice')}</dd>
      </dl><p>Illustrative state only. No match connection. Remount and replay controls demonstrate the intended appearance; production recovery remains to be tested.</p></div>
    </aside></div>
    <footer className="review-footnote">Choose a style, or combine details from several. All three preserve the same choices and timing.</footer>
    <PrototypeSwitcher variant={variant} choose={choose}/>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Mockups/>);
