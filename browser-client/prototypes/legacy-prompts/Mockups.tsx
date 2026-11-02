// THROWAWAY: horizontal vs vertical rectangular prompts on the pitch-preview surface.
// All names, resources and outcomes are fixtures. No transport or native game actions.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PitchScenery } from '../../src/PitchScenery.tsx';
import { PitchProjection } from '../../src/pitch-projection.ts';
import { resolvePlayerArt, resolvePlayerPortrait, playerArtPlacement } from '../../src/player-art.ts';
import { MatchArt } from '../../src/MatchScoreboard.tsx';
import type { SetupPlayer } from '../../src/setup-protocol.ts';
import './mockups.css';

type Choice = { label: string; icon: string; detail?: string; player?: number };
const cases: Record<string, { title: string; context: string; choices: Choice[]; player?: number; chooser?: boolean }> = {
  coin: { title: 'Call the coin toss', context: 'Choose your side of the MUTP coin.', choices: [{ label: 'Heads', icon: 'heads' }, { label: 'Tails', icon: 'tails' }] },
  kickoff: { title: 'Kick or receive?', context: 'You won the toss. Choose how to begin.', choices: [{ label: 'Kick', icon: 'kick' }, { label: 'Receive', icon: 'receive' }] },
  apothecary: { title: 'Use apothecary?', context: '#7 · Aldric · Badly hurt', player: 7, choices: [{ label: 'Use apothecary', icon: 'apothecary', detail: '1 available' }, { label: 'Accept injury', icon: 'badly-hurt', detail: 'Save your apothecary' }] },
  multiple: { title: 'Choose a player to treat', context: 'Two injuries · 1 apothecary available', chooser: true, choices: [{ label: '#7 · Aldric', icon: 'apothecary', detail: 'Badly hurt', player: 7 }, { label: '#9 · Bram', icon: 'apothecary', detail: 'Broken arm', player: 9 }] },
  argue: { title: 'Argue the call?', context: '#7 · Aldric · Sent off', player: 7, choices: [{ label: 'Argue the call', icon: 'argue', detail: 'Appeal to the referee' }, { label: 'Decline', icon: 'decline', detail: 'Do not argue' }] },
  bribe: { title: 'Use a bribe?', context: '#7 · Aldric · Sent off', player: 7, choices: [{ label: 'Use a bribe', icon: 'bribe', detail: '1 available' }, { label: 'Decline', icon: 'decline', detail: 'Save your bribe' }] },
  interception: { title: 'Choose an interceptor', context: 'Select a player, then confirm your choice.', chooser: true, choices: [{ label: '#7 · Aldric', icon: 'intercept', detail: 'Lineman', player: 7 }, { label: '#9 · Bram', icon: 'intercept', detail: 'Thrower', player: 9 }, { label: '#11 · Cedric', icon: 'intercept', detail: 'Lineman', player: 11 }] },
};
const players: SetupPlayer[] = [
  [7, 12, 6, 'Aldric'], [9, 14, 7, 'Bram'], [11, 11, 9, 'Cedric'], [3, 13, 5, 'Opponent'], [4, 15, 8, 'Opponent'],
].map(([number, x, y, name], index) => ({
  id: `review-${number}`, number: Number(number), slot: index + 1, x: Number(x), y: Number(y), name: String(name),
  role: index < 3 ? 'home' : 'away', state: 'is standing', offPitch: 'pitch',
  art: { rosterId: index < 3 ? 'human' : 'orc', positionId: index < 3 ? Number(number) === 9 ? 'thrower' : 'lineman' : 'orc-lineman' },
}));

// New review-only SVG pictograms extend the existing navy/ivory/gold injury badge vocabulary.
function Icon({ name }: { name: string }) {
  if (['apothecary', 'badly-hurt'].includes(name)) return <svg className="choice-icon" viewBox="0 0 48 48" aria-hidden="true"><use href={`/assets/game/ui/injury-icons-v1.svg#${name}`}/></svg>;
  const ball = <g transform="rotate(-25 24 23)"><ellipse cx="24" cy="23" rx="11" ry="7" fill="#b67b4d"/><path d="M19 23h10m-8-3v6m4-6v6" stroke="#fff2ce" strokeWidth="1.5"/></g>;
  return <svg className="choice-icon" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 2 43 9v23L24 46 5 32V9Z" fill="#10283f" stroke="#b9995b" strokeWidth="2"/>
    <path d="M24 5 40 11v19L24 42 8 30V11Z" fill="#205270" stroke="#5fd1e3"/>
    {['heads', 'tails'].includes(name) && <><circle cx="24" cy="24" r="15" fill="#ac8040" stroke="#ffe3a1" strokeWidth="2"/><circle cx="24" cy="24" r="12" fill="#725128" stroke="#e5bb67"/>
      {name === 'heads' ? <><path d="M13 26q0-14 12-12 7 0 9 10l-8 8-11-2Z" fill="#ead5a2"/><path d="m25 20 10 4-8 4Z" fill="#c09568"/><circle cx="25" cy="21" r="1.5" fill="#10283f"/><path d="M15 16 24 13l6 4-1 3H15Z" fill="#10283f"/><circle cx="22" cy="16" r="2" fill="#5fd1e3"/></> : <><path d="M14 26q5-16 16-7l-3 10-10 2Z" fill="#ead5a2"/><path d="M27 28q12 4 8-7" fill="none" stroke="#e7b4a2" strokeWidth="3"/><path d="m16 29-2 4m10-4 1 4" stroke="#fff2ce" strokeWidth="2"/></>}</>}
    {name === 'kick' && <><path d="m11 11 8 1 2 16 8 5-1 5H15l-3-8Z" fill="#e8dfbf" stroke="#fff2ce"/><g transform="translate(10 -9) scale(.8)">{ball}</g><path d="m29 13 6-4m-5 9 9-1" stroke="#edcf7c" strokeWidth="2"/></>}
    {['receive', 'intercept'].includes(name) && <>{ball}<path d="m11 21 3 12 10 5 10-5 3-12-5 2-3 7H19l-3-7Z" fill="#e8dfbf" stroke="#fff2ce"/>{name === 'intercept' && <path d="m12 12 7-4m-2 11 7-5" stroke="#edcf7c" strokeWidth="2"/>}</>}
    {name === 'argue' && <><path d="M11 12h26v17H25l-8 7v-7h-6Z" fill="#e8dfbf" stroke="#fff2ce"/><path d="M24 16v7m0 2v2" stroke="#10283f" strokeWidth="3"/></>}
    {name === 'bribe' && <><path d="m19 12 10 0-2 7q11 8 8 15H13q-3-7 8-15Z" fill="#b67b4d" stroke="#fff2ce"/><path d="M19 19h10" stroke="#edcf7c" strokeWidth="3"/><circle cx="24" cy="28" r="5" fill="#edcf7c" stroke="#725128"/></>}
    {name === 'decline' && <path d="m16 16 16 16m0-16L16 32" stroke="#e8dfbf" strokeWidth="4" strokeLinecap="round"/>}
  </svg>;
}

function HorizontalIcon({ choice, scenario }: { choice: Choice; scenario: string }) {
  if (scenario === 'interception' && choice.player) {
    const player = players.find(candidate => candidate.number === choice.player)!;
    return <img className="choice-icon portrait" src={resolvePlayerPortrait(player)!} alt=""/>;
  }
  if (choice.icon === 'apothecary' || choice.icon === 'bribe') return <MatchArt name={choice.icon}/>;
  if (choice.icon === 'argue') return <svg className="choice-icon" viewBox="0 0 100 80" aria-hidden="true"><path d="M12 7h76q8 0 8 8v39q0 8-8 8H49L27 76l5-14H12q-8 0-8-8V15q0-8 8-8Z" fill="#f4e5c7" stroke="#b9995b" strokeWidth="3"/><text x="50" y="44" textAnchor="middle" fill="#10283f" fontFamily="MUTP" fontSize="26">#@!$%</text></svg>;
  const name = choice.icon === 'badly-hurt' ? 'stretcher' : choice.icon === 'decline' ? ['argue', 'bribe'].includes(scenario) ? 'referee' : null : choice.icon;
  if (!name) return <svg className="choice-icon plain-decline" viewBox="0 0 48 48" aria-hidden="true"><path d="m14 14 20 20m0-20L14 34" stroke="#f4e5c7" strokeWidth="4" strokeLinecap="round"/></svg>;
  const moleVersion = new URLSearchParams(location.search).get('art') !== 'goblin' && ['stretcher', 'referee'].includes(name);
  return <img className={`choice-icon ${name}`} src={`/prototypes/legacy-prompts/art/${moleVersion ? 'mole-' : ''}${name}.png`} alt=""/>;
}

function Player({ player, camera }: { player: SetupPlayer; camera: PitchProjection }) {
  const art = resolvePlayerArt(player, { end: 'home', topDown: false });
  const point = camera.project({ x: player.x! + .5, y: player.y! + .5 });
  if (!art || !point) return null;
  const { body } = art, { anchor } = playerArtPlacement(body, false), scale = point.pixelsPerSquare * 1.08 / 64;
  return <div className="review-player" style={{ left: point.x, top: point.y, zIndex: Math.round(point.y) }}>
    <img draggable={false} alt={player.name} src={body.url} style={{ width: body.width * scale, height: body.height * scale, left: -anchor.x * scale, top: -anchor.y * scale, transform: body.mirror ? 'scaleX(-1)' : undefined }}/>
    <b>{player.number}</b>
  </div>;
}

function Review() {
  const query = new URLSearchParams(location.search);
  const [variant, setVariant] = useState(query.get('variant') === 'vertical' ? 'vertical' : 'horizontal');
  const [scenario, setScenario] = useState((query.get('scenario') ?? '') in cases ? query.get('scenario')! : 'coin');
  const [selected, setSelected] = useState<number | null>(null), [result, setResult] = useState('Awaiting decision');
  const [offPitch, setOffPitch] = useState(query.get('offPitch') === 'true');
  const [pan, setPan] = useState({ x: 0, y: 0 }), [zoom, setZoom] = useState(1.3);
  const stage = useRef<HTMLDivElement>(null), panel = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 640 }), [panelHeight, setPanelHeight] = useState(280);
  const current = cases[scenario], blocking = scenario === 'coin' || scenario === 'kickoff';
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height })); observer.observe(stage.current!); return () => observer.disconnect(); }, []);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setPanelHeight(entry.borderBoxSize[0].blockSize)); observer.observe(panel.current!); return () => observer.disconnect(); }, []);
  useEffect(() => { const url = new URL(location.href); url.searchParams.set('variant', variant); url.searchParams.set('scenario', scenario); url.searchParams.set('offPitch', String(offPitch)); history.replaceState(null, '', url); }, [variant, scenario, offPitch]);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || (event.target as HTMLElement).closest('input,select,textarea,button,[contenteditable]')) return; setVariant(value => value === 'horizontal' ? 'vertical' : 'horizontal'); }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, []);
  const camera = new PitchProjection({ width: Math.max(900, size.width), height: size.height, focus: 12.5, transverseFocus: 7.5, zoom });
  const shift = { x: (size.width - camera.width) / 2 + pan.x - (size.width > 700 ? 140 : 0), y: pan.y - (size.width <= 700 ? 140 : 0) };
  const playerId = current.chooser ? selected : current.player;
  const subject = players.find(player => player.number === playerId);
  const projected = subject ? camera.project({ x: subject.x! + .5, y: subject.y! + .5 }) : null;
  const point = projected ? { x: projected.x + shift.x, y: projected.y + shift.y } : null;
  const visible = point && !offPitch && point.x >= 0 && point.x <= size.width && point.y >= 0 && point.y <= size.height;
  const panelWidth = Math.min(variant === 'horizontal' ? 340 : 400, size.width - 24);
  const left = blocking ? (size.width - panelWidth) / 2 : size.width > 700 ? size.width - panelWidth - 30 : 12;
  const top = blocking ? 100 : size.width > 700 ? 65 : Math.max(210, size.height - panelHeight - 18);
  const chooseScenario = (value: string) => { setScenario(value); setSelected(null); setResult('Awaiting decision'); setPan({ x: 0, y: 0 }); };
  return <main>
    <header><div className="brand">MOLES UNDER THE PITCH <span>DECISION PROMPTS</span></div><span className="review-tag">DESIGN REVIEW · NOT LIVE PLAY</span></header>
    <div className="toolbar"><label>Prompt <select value={scenario} onChange={event => chooseScenario(event.target.value)}>{Object.entries(cases).map(([key, value]) => <option key={key} value={key}>{value.title}{key === 'multiple' ? ' · multiple injuries' : ''}</option>)}</select></label><label className="check"><input type="checkbox" checked={offPitch} onChange={event => setOffPitch(event.target.checked)} disabled={blocking}/> Off-pitch subject</label><p>Compare the same prompt in a row or a stack.</p></div>
    <section className="match-frame" data-variant={variant}>
      <div className="scoreboard"><span>REIKLAND REAVERS</span><b>0 <i>:</i> 0</b><span>GOUGED EYE</span><small>FIRST HALF · TURN 4</small></div>
      <div className="pitch-stage" ref={stage} onPointerDown={event => { if (blocking || (event.target as HTMLElement).closest('button,.prompt')) return; drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (drag.current) setPan({ x: drag.current.px + event.clientX - drag.current.x, y: drag.current.py + event.clientY - drag.current.y }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="world" style={{ width: camera.width, height: camera.height, transform: `translate(${shift.x}px,${shift.y}px)` }}>
          <PitchScenery camera={camera} onError={() => console.error('Pitch artwork failed')}/>
          <svg className="grid" width={camera.width} height={camera.height}>{Array.from({ length: 390 }, (_, i) => ({ x: Math.floor(i / 15), y: i % 15 })).map(square => <polygon key={`${square.x}-${square.y}`} points={camera.square(square, 0, true).map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#e0e1ad" strokeOpacity=".18"/>)}</svg>
          {players.filter(player => !offPitch || player.number !== playerId).map(player => <Player key={player.id} player={player} camera={camera}/>)}
        </div>
        {blocking && <div className="scrim"/>}
        {visible && point && <svg className="connector" width={size.width} height={size.height} aria-label={`Focus on player ${playerId}`}><path d={`M ${left + 12} ${top + panelHeight / 2} L ${point.x} ${point.y}`} stroke="#08131f" strokeWidth="5"/><path d={`M ${left + 12} ${top + panelHeight / 2} L ${point.x} ${point.y}`} stroke="#63e1ed" strokeWidth="2"/><circle cx={point.x} cy={point.y} r="5" fill="#baf8ff" stroke="#10283f" strokeWidth="2"/></svg>}
        <section ref={panel} className={`prompt ${variant}`} style={{ left, top, width: panelWidth }} role="dialog" aria-modal={blocking} aria-labelledby="prompt-title">
          {variant !== 'horizontal' && <div className="eyebrow">{blocking ? 'MATCH DECISION' : 'COACH DECISION'}</div>}
          <h1 id="prompt-title">{variant === 'horizontal' && scenario === 'interception' ? 'Nominate an interceptor' : current.title}</h1>
          {!(variant === 'horizontal' && ['coin', 'kickoff', 'interception'].includes(scenario)) && <p className="context">{offPitch && !blocking && !current.chooser ? `Player #${current.player}` : current.context}</p>}
          <div className={`options ${variant === 'horizontal' && scenario === 'coin' ? 'coin-options' : ''}`}>{current.choices.map(choice => <button key={choice.label} aria-label={choice.label} className={`option ${selected === choice.player ? 'selected' : ''}`} aria-pressed={current.chooser ? selected === choice.player : undefined} onClick={() => { if (current.chooser) { setSelected(choice.player!); setResult(`Previewing player #${choice.player}`); } else setResult(`Preview outcome: ${choice.label}`); }}>
            {variant === 'horizontal' ? <HorizontalIcon choice={choice} scenario={scenario}/> : <Icon name={choice.icon}/>}<span><strong>{offPitch && choice.player ? `Player #${choice.player}` : choice.label}</strong>{choice.detail && <small>{choice.detail}</small>}</span>{current.chooser && <em>{selected === choice.player ? 'SELECTED' : 'SELECT'}</em>}
          </button>)}</div>
          {current.chooser && <>{!(variant === 'horizontal' && scenario === 'interception') && <p className="selection-note">{selected ? `Player #${selected} selected${offPitch ? ' · off pitch' : ''}. You can change your choice.` : 'No player selected.'}</p>}<div className="actions"><button className="confirm" disabled={!selected} onClick={() => setResult(`Confirmed player #${selected} (local preview only)`)}>{scenario === 'multiple' ? 'Treat selected player' : 'Confirm interceptor'}</button><button onClick={() => { setSelected(null); setResult('Declined (local preview only)'); }}>{variant === 'horizontal' ? <HorizontalIcon choice={{ label: 'Decline', icon: 'decline' }} scenario={scenario}/> : <Icon name="decline"/>}{scenario === 'multiple' ? 'Accept all injuries' : 'Decline'}</button></div></>}
        </section>
        {!blocking && <div className="camera-controls"><button aria-label="Zoom out" onClick={() => setZoom(value => Math.max(.8, value - .15))}>−</button><button aria-label="Zoom in" onClick={() => setZoom(value => Math.min(2, value + .15))}>+</button><button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1.3); }}>Reset view</button></div>}
      </div>
      <footer>{blocking ? 'Choose an option to continue · pitch navigation locked' : 'Drag to pan · inspect the pitch before deciding'}<span>{variant === 'horizontal' ? 'A · HORIZONTAL ROW' : 'B · VERTICAL STACK'}</span></footer>
    </section>
    <output className="state">Prototype state: {result}. {offPitch ? 'Off-pitch fixture.' : 'On-pitch fixture.'} No game commands are sent.</output>
    <nav className="switcher" aria-label="Mockup orientation"><button onClick={() => setVariant(variant === 'horizontal' ? 'vertical' : 'horizontal')}>←</button><button aria-pressed={variant === 'horizontal'} onClick={() => setVariant('horizontal')}>A · Horizontal</button><button aria-pressed={variant === 'vertical'} onClick={() => setVariant('vertical')}>B · Vertical</button><button onClick={() => setVariant(variant === 'horizontal' ? 'vertical' : 'horizontal')}>→</button></nav>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
