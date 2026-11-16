import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import facts from './fixtures/match-splash-events.json';
import { TeamColorArtProvider } from '../src/TeamColorArtProvider.tsx';
import { MatchSplash } from '../src/MatchSplash.tsx';
import type { MatchAnnouncement } from '../src/match-announcements.ts';
import '../src/play-brand.css';
import '../src/coach-match.css';

const kinds: MatchAnnouncement['kind'][] = ['touchdown', 'turnover', 'turnStart', 'kickoff', 'weather', 'halfTime', 'fullTime'];
function Review() {
  const [kind, setKind] = useState<MatchAnnouncement['kind']>('touchdown');
  const [variant, setVariant] = useState('');
  const [outcome, setOutcome] = useState('WIN');
  const [serial, setSerial] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [team, setTeam] = useState<'home' | 'away'>('home');
  const [pair, setPair] = useState('gold');
  const [rate, setRate] = useState(1);
  const detail = facts.find(fact => fact.kind === kind && fact.code === variant) ?? facts.find(fact => fact.kind === kind);
  const savedColors = { version: 1 as const, primary: pair === 'black' ? 'black' : pair === 'white' ? 'white' : 'gold', secondary: pair === 'black' ? 'black' : pair === 'white' ? 'ivory' : 'navy' };
  const restart = () => { setExiting(false); setSerial(value => value + 1); };
  return <main className="play-runtime splash-review">
    <style>{`.splash-review { display:grid; grid-template-rows:auto minmax(0,1fr); height:100dvh; max-width:none; margin:0; padding:0; } .splash-review nav { padding:8px; gap:8px; } .splash-review nav :is(label,select,button) { margin:0; } .splash-review .review-stage { height:auto; min-height:0; } body { margin:0; background:#070d16; color:#edf5ff; font-family:MUTP,sans-serif; } nav { position:relative; z-index:200; display:flex; flex-wrap:wrap; gap:12px; padding:12px; } label { display:flex; gap:8px; align-items:center; } select, button { min-height:44px; background:#101c2b; color:#edf5ff; border:1px solid #40637e; } .review-stage { position:relative; height:calc(100dvh - 100px); min-height:400px; background:#1c5a32 url('/assets/game/pitch/live-pitch.svg') center/cover; }`}</style>
    <nav aria-label="Splash review controls">
      <label>Event<select aria-label="Event" value={kind} onChange={e => { setKind(e.target.value as MatchAnnouncement['kind']); restart(); }}>{kinds.map(value => <option key={value}>{value}</option>)}</select></label>
      {(kind === 'kickoff' || kind === 'weather') && <label>Variant<select aria-label="Variant" value={detail?.code} onChange={e => { setVariant(e.target.value); restart(); }}>{facts.filter(fact => fact.kind === kind).map(fact => <option key={fact.code} value={fact.code}>{fact.headline}</option>)}</select></label>}
      <label>Team<select aria-label="Team" value={team} onChange={e => { setTeam(e.target.value as 'home' | 'away'); restart(); }}><option value="home">Human</option><option value="away">Orc</option></select></label>
      <label>Colours<select aria-label="Colours" value={pair} onChange={e => { setPair(e.target.value); restart(); }}><option value="gold">Gold / blue</option><option value="black">Black / black</option><option value="white">White / ivory</option></select></label>
      {kind === 'fullTime' && <label>Outcome<select aria-label="Outcome" value={outcome} onChange={e => { setOutcome(e.target.value); restart(); }}><option value="WIN">Winner</option><option value="DRAW">Draw</option><option value="CONCEDED">Conceded</option></select></label>}
      <label>Speed<select aria-label="Speed" value={rate} onChange={e => { setRate(Number(e.target.value)); restart(); }}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
      <button onClick={restart}>Replay animation</button><button onClick={() => setExiting(true)}>Exit</button>
    </nav>
    <TeamColorArtProvider home={{ rosterId: 'human', league: null, colors: savedColors }} away={{ rosterId: 'orc', league: null, colors: savedColors }}><div className="review-stage"><MatchSplash key={serial} announcement={{ id: String(serial), kind, team, turn: 3, half: 1,
      teamName: team === 'home' ? 'Altdorf Blue Badgers' : 'Blackwater Green Giants', helmet: team === 'home' ? 'human' : 'orc',
      reason: kind === 'turnover' ? 'Pippin failed to dodge.' : kind === 'kickoff' ? 'The offence may reposition D3+3 open players one square each.' : kind === 'weather' ? '−1 to pick up, catch and intercept.' : kind === 'halfTime' || kind === 'fullTime' ? 'Altdorf Blue Badgers 2 – 1 Blackwater Green Giants' : null,
      ...(detail ? { headline: detail.headline, code: detail.code, reason: detail.reason } : kind === 'kickoff' ? { headline: 'Quick Snap', code: 'QUICK_SNAP' } : kind === 'weather' ? { headline: 'Pouring Rain', code: 'POURING_RAIN' } : kind === 'fullTime' ? { headline: outcome === 'CONCEDED' ? 'MATCH CONCEDED' : 'FULL TIME', code: outcome, reason: outcome === 'DRAW' ? 'Altdorf Blue Badgers 1 – 1 Blackwater Green Giants — DRAW' : 'Altdorf Blue Badgers 2 – 1 Blackwater Green Giants — Altdorf Blue Badgers wins' } : {}) }} hold exiting={exiting} rate={rate} onDismiss={() => setExiting(true)}/></div></TeamColorArtProvider>
  </main>;
}
createRoot(document.getElementById('app')!).render(<Review/>);
