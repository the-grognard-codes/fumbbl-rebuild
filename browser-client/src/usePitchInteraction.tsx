import { useEffect, useMemo, useState } from 'react';
import { PlayerMarker } from './DugoutPreview';
import { adjacent, initialPlayers, routesFor } from './pitch-demo';
import type { Square, Route } from './pitch-demo';

type Action = 'Move' | 'Block' | 'Blitz' | 'Foul' | 'Pass' | 'Hand-off';
export function usePitchInteraction() {
  const [players, setPlayers] = useState(initialPlayers);
  const [events, setEvents] = useState(['Turn 4 begins.', 'Alden gains 2 SPP from a casualty.', 'Mira recovers from KO.']);
  const [turn, setTurn] = useState(4);
  const [half, setHalf] = useState(1);
  const [crowded, setCrowded] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [action, setAction] = useState<Action>('Move');
  const [target, setTarget] = useState<Square | null>(null);
  const [hover, setHover] = useState<Square | null>(null);
  const [assisted, setAssisted] = useState(true);
  const [menu, setMenu] = useState(false);
  const [details, setDetails] = useState(false);
  const [inspectedId, setInspectedId] = useState(1);
  const [message, setMessage] = useState('Select a player, then a destination. Nothing happens until you commit.');
  const [spent, setSpent] = useState<string[]>([]);
  const [ballCarrier, setBallCarrier] = useState(1);
  const hasSelection = activeId !== null;
  const active = players.find(p => p.number === activeId) ?? players[0];
  const inspected = players.find(p => p.number === inspectedId) ?? active;
  const routes = useMemo(() => hasSelection ? routesFor(active, players) : new Map<string, Route>(), [hasSelection, active, players]);
  const pointed = target ?? hover;
  const opponent = pointed && players.find(p => p.x === pointed.x && p.y === pointed.y);
  const inferred: Action = assisted && opponent?.team === 'away' ? opponent.zone === 'Prone' ? 'Foul' : adjacent(active, opponent) ? 'Block' : 'Blitz' : action;
  const effective = action === 'Pass' || action === 'Hand-off' ? action : inferred;
  const route = pointed && (effective === 'Move' ? routes.get(`${pointed.x},${pointed.y}`) : (effective === 'Blitz' || effective === 'Foul') && !adjacent(active, pointed) ? [...routes.values()].filter(r => adjacent(r.path[r.path.length - 1], pointed)).sort((a, b) => a.path.length - b.path.length)[0] : undefined);
  const path = route?.path ?? [];
  const cost = Math.max(0, path.length - 1);
  const risk = route?.dodge && route?.rush ? 'Dodge + rush checks' : route?.dodge ? 'Dodge check' : route?.rush ? 'Rush check' : 'No roll on this sample route';
  const legal = hasSelection && !!target && (effective === 'Move' ? !!route : effective === 'Block' ? opponent?.team === 'away' && opponent.zone !== 'Prone' && adjacent(active, opponent) : effective === 'Blitz' || effective === 'Foul' ? opponent?.team === 'away' && (effective === 'Foul' ? opponent.zone === 'Prone' : opponent.zone !== 'Prone') && (adjacent(active, opponent) || !!route) && !spent.includes(effective) : opponent?.team === 'home' && opponent.number !== activeId && ballCarrier === activeId && !spent.includes(effective) && (effective === 'Pass' || adjacent(active, opponent)));
  const cancel = () => { setTarget(null); setHover(null); setMenu(false); setDetails(false); };
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); }, []);
  const select = (number: number, toggle = true) => {
    if (toggle && number === activeId) { setActiveId(null); setAction('Move'); cancel(); setMessage('Select a player to plan an action.'); return; }
    const player = players.find(p => p.number === number)!;
    if (player.team === 'away' || (hasSelection && (action === 'Pass' || action === 'Hand-off') && player.number !== activeId)) { if (hasSelection) setTarget(player); setInspectedId(number); if (!hasSelection) setDetails(true); return; }
    setActiveId(number); setInspectedId(number); setAction('Move'); cancel();
  };
  const choose = (value: Action) => { setAction(value); setAssisted(false); setTarget(null); setHover(null); setMenu(false); };
  const commit = () => {
    if (!legal || !target) return;
    if (effective === 'Move' || effective === 'Blitz' || effective === 'Foul') {
      const destination = path[path.length - 1] ?? active;
      setPlayers(old => old.map(p => p.number === activeId ? { ...p, x: destination.x, y: destination.y, used: p.used + cost } : p));
    }
    if (effective === 'Blitz' || effective === 'Foul' || effective === 'Pass' || effective === 'Hand-off') setSpent(old => [...old, effective]);
    if ((effective === 'Pass' || effective === 'Hand-off') && opponent) setBallCarrier(opponent.number);
    setEvents(old => [`${active.name}: ${effective.toLowerCase()}${cost ? ` (${cost} squares)` : ''} · sample success.`, ...old].slice(0, 50));
    setMessage(`Demo ${effective.toLowerCase()} committed${cost ? ` · ${cost} squares` : ''}. Assumed success; no dice or server rules executed.`);
    setTarget(null); setHover(null);
  };
  // Shared confirmation path: engine integration must retain these guards and
  // route both the button and shortcut through the same validated command.
  useEffect(() => {
    const confirm = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      if (element?.closest('button, a, [role="button"]') && !element.closest('.pitch-player')) return;
      if (menu || details || document.querySelector('dialog[open], .end-turn-confirm')) return;
      if (!legal) return;
      event.preventDefault();
      if (!event.repeat) commit();
    };
    document.addEventListener('keydown', confirm);
    return () => document.removeEventListener('keydown', confirm);
  });
  const overlay = hasSelection ? <g pointerEvents="none" data-testid="movement-overlays">
    {action === 'Move' && [...routes.entries()].map(([key, r]) => { const p = r.path[r.path.length - 1]; const color = r.dodge && r.rush ? '#fb7185' : r.dodge ? '#f59e0b' : r.rush ? '#b699ff' : '#5eead4'; return <rect key={key} x={p.x * 36 + 1} y={p.y * 36 + 1} width="34" height="34" fill={color} fillOpacity={r.dodge || r.rush ? '.38' : '.17'} stroke={color} strokeOpacity=".35"/>; })}
    {path.length > 1 && <g data-testid="movement-path"><polyline points={path.map(p => `${p.x * 36 + 18},${p.y * 36 + 18}`).join(' ')} fill="none" stroke="#102532" strokeWidth="7"/><polyline points={path.map(p => `${p.x * 36 + 18},${p.y * 36 + 18}`).join(' ')} fill="none" stroke="#fff3b0" strokeWidth="3" strokeDasharray="7 3"/>{path.slice(1).map((p, i) => <g key={i}><circle cx={p.x * 36 + 18} cy={p.y * 36 + 18} r="7" fill="#102532"/><text x={p.x * 36 + 18} y={p.y * 36 + 22} textAnchor="middle" fontSize="10" fill="#fff3b0">{i + 1}</text></g>)}</g>}
    {pointed && <rect x={pointed.x * 36 + 2} y={pointed.y * 36 + 2} width="32" height="32" fill="none" stroke="#fff3b0" strokeWidth="3"/>}
  </g> : null;
  const markers = (scene: { x: number; y: number }, scale: number) => players.map(player => <div key={player.number} className={`pitch-player ${player.team} ${player.number === activeId ? 'selected' : ''} ${player.zone === 'Prone' ? 'prone' : ''}`} data-player={player.number} style={{ left: (scene.x + player.x * 36) * scale, top: (scene.y + player.y * 36) * scale, width: 36 * scale, height: 36 * scale, zIndex: 10 + player.y * 26 + player.x }}>
    <PlayerMarker player={player} team={player.team} onSelect={() => select(player.number)} onActions={() => { if (player.team === 'home') { select(player.number, false); setMenu(true); } else { setInspectedId(player.number); setDetails(true); } }}/><span className="pitch-number">{player.number}{player.number === ballCarrier ? ' ●' : ''}</span>
  </div>);
  const panel = <section className="pitch-command" aria-label="Player action strip">
    <div className="command-heading"><strong>{hasSelection ? `#${active.number} ${active.name} · ${active.position}` : 'No player selected'}</strong><span>{hasSelection ? `${action} · Movement ${Math.max(0, Number(active.stats[0]) - active.used)} · ${active.skills}` : 'Click or tap a player to select; repeat to deselect.'}</span><button disabled={!hasSelection} onClick={() => { setInspectedId(activeId!); setDetails(!details); }}>Details</button><button onClick={() => { setCrowded(false); setAssisted(true); setInspectedId(1); setTurn(4); setHalf(1); setEvents(['Sample reset. Turn 4 begins.']); setPlayers(initialPlayers); setSpent([]); setBallCarrier(1); setActiveId(1); setAction('Move'); cancel(); setMessage('Sample reset.'); }}>Reset demo</button></div>
    <div className="command-buttons">{(['Move', 'Block', 'Blitz'] as Action[]).map(value => <button disabled={!hasSelection} key={value} aria-pressed={action === value} onClick={() => choose(value)}>{value}{spent.includes(value) ? ' · used' : ''}</button>)}<button disabled={!hasSelection} aria-expanded={menu} onClick={() => setMenu(!menu)}>More actions</button><button aria-pressed={assisted} onClick={() => { setAssisted(!assisted); setTarget(null); }}>Target assist: {assisted ? 'on' : 'off'}</button><button onClick={cancel}>Cancel</button></div>
    {menu && <div className="command-menu" aria-label="Additional actions">{(['Foul', 'Pass', 'Hand-off'] as Action[]).map(value => <button key={value} onClick={() => choose(value)}>{value}</button>)}<span>Choose an action, then its target.</span></div>}
    <div className="command-preview"><span>{target ? `${effective} → (${target.x}, ${target.y}) · ${cost ? `${cost} squares · ${risk}` : 'Review target'}${legal ? '' : ' · unavailable in this sample'}` : hover && route ? `${cost} squares · ${risk} · click to preview` : message}</span><button className="commit-action" aria-keyshortcuts="Space" title="Confirm previewed action (Space)" disabled={!legal} onClick={commit}>Commit {effective.toLowerCase()}{effective === 'Move' && cost ? ` · ${cost} squares` : ''}</button></div>
    <div className="risk-legend"><span>◆ No roll</span><span>◆ Dodge</span><span>◆ Rush</span><span>◆ Dodge + rush</span><small>Illustrative shortest routes; not engine odds. Preview → commit · Space to confirm.</small></div>
    {details && <div className="command-details"><button onClick={() => setDetails(false)}>Close details</button><h3>{inspected.name} · {inspected.position}</h3><p>MA {inspected.stats[0]} · ST {inspected.stats[1]} · AG {inspected.stats[2]} · PA {inspected.stats[3]} · AV {inspected.stats[4]}</p><p>Skills: {inspected.skills} · Status: {inspected.injury}</p><p>SPP this game: {inspected.spp} ({inspected.earned}) · Career: {inspected.career}</p></div>}
  </section>;
  const toggleFormation = () => {
    const next = !crowded; setCrowded(next); cancel(); setActiveId(null); setSpent([]); setBallCarrier(1);
    setPlayers(next ? Array.from({ length: 16 }, (_, i) => {
      const original = initialPlayers[(i % 4 < 2 ? 0 : 3) + Math.floor(i / 2) % 3];
      return { ...original, number: i + 1, name: i < 6 ? original.name : `Scrum player ${i + 1}`, x: 10 + i % 4, y: 5 + Math.floor(i / 4), team: i % 4 < 2 ? 'home' : 'away', used: 0, zone: i === 6 || i === 9 ? 'Prone' : 'Standing' };
    }) : initialPlayers);
  };
  const endTurn = () => { setEvents(old => [`Sample turn ${turn} ended. Movement and actions refreshed.`, ...old].slice(0, 50)); setTurn(turn === 8 ? 1 : turn + 1); if (turn === 8) setHalf(half === 1 ? 2 : 1); setSpent([]); setPlayers(old => old.map(p => ({ ...p, used: 0 }))); setActiveId(null); cancel(); };
  return { selectedPlayer: hasSelection ? active : null, events, turn, half, endTurn, inspect: () => { if (hasSelection) { setInspectedId(activeId!); setDetails(true); } }, crowded, toggleFormation, overlay, markers, panel, cancel, setHover: (p: Square | null) => { if (hasSelection) setHover(p); }, setTarget: (p: Square | null) => { if (hasSelection) setTarget(p); } };
}
