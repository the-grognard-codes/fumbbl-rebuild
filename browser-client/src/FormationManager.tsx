import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { TeamDraft } from './team-protocol.ts';
import { formationErrors, placeFormationPlayer, starterFormations } from './team-formations.ts';
import type { FormationRole, TeamFormations } from './team-formations.ts';
import './FormationManager.css';

export function FormationManager({ draft, save, close }: { draft: TeamDraft; save: (formations: TeamFormations) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [formations, setFormations] = useState(() => structuredClone(draft.formations ?? starterFormations(draft.players)));
  const [selection, setSelection] = useState<{ role: FormationRole; index: number } | null>(() => {
    const initial = draft.formations ?? starterFormations(draft.players);
    return initial.offense.length ? { role: 'offense', index: 0 } : initial.defense.length ? { role: 'defense', index: 0 } : null;
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number; jerseyNumber: number } | null>(null);
  const drag = useRef<{ jerseyNumber: number; x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const formation = selection ? formations[selection.role][selection.index] : null;
  const rosterNumbers = new Set(draft.players.map(player => player.jerseyNumber));
  const numbers = [...new Set([...rosterNumbers, ...(formation?.players.map(player => player.jerseyNumber) ?? [])])].sort((a, b) => a - b);
  const errors = [...formations.offense, ...formations.defense].flatMap(formationErrors);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus(); };
  }, []);

  function edit(change: Partial<NonNullable<typeof formation>>) {
    if (!selection || !formation) return;
    setFormations(previous => ({ ...previous, [selection.role]: previous[selection.role].map((item, index) => index === selection.index ? { ...item, ...change } : item) }));
  }
  function place(jerseyNumber: number, square: { column: number; depth: number } | null) {
    if (formation) edit({ players: placeFormationPlayer(formation.players, jerseyNumber, square) });
  }
  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, jerseyNumber: number) {
    if (event.button !== 0) return;
    drag.current = { jerseyNumber, x: event.clientX, y: event.clientY };
    dragged.current = false;
    setSelected(jerseyNumber);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent) {
    const current = drag.current;
    if (!current || Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
    dragged.current = true;
    setDragPosition({ x: event.clientX, y: event.clientY, jerseyNumber: current.jerseyNumber });
  }
  function pointerUp(event: ReactPointerEvent) {
    const current = drag.current;
    drag.current = null; setDragPosition(null);
    if (!current || !dragged.current) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-formation-cell], [data-formation-reserves]');
    if (!target || !dialog.current?.contains(target)) return;
    if (target.dataset.formationReserves !== undefined) place(current.jerseyNumber, null);
    else place(current.jerseyNumber, { column: Number(target.dataset.column), depth: Number(target.dataset.depth) });
  }
  function create(role: FormationRole) {
    if (formations[role].length >= 3) return;
    setFormations({ ...formations, [role]: [...formations[role], { name: role === 'offense' ? 'New Offense' : 'New Defense', players: [] }] });
    setSelection({ role, index: formations[role].length }); setSelected(null);
  }
  function remove() {
    if (!selection) return;
    setFormations({ ...formations, [selection.role]: formations[selection.role].filter((_, index) => index !== selection.index) });
    setSelection(null); setSelected(null);
  }
  function makeDefault() {
    if (!selection || !formation) return;
    setFormations({ ...formations, [selection.role]: [formation, ...formations[selection.role].filter((_, index) => index !== selection.index)] });
    setSelection({ role: selection.role, index: 0 });
  }

  return <dialog ref={dialog} className="formation-dialog" aria-labelledby="formation-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="formation-manager" onPointerDownCapture={() => { dragged.current = false; }} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; setDragPosition(null); }}>
      <header><div><h2 id="formation-title">Saved Formations</h2><p>Plan deployments for this team. Save your team to keep changes.</p></div><button type="button" onClick={close} aria-label="Close formation manager">Close</button></header>
      <div className="formation-groups">{(['offense', 'defense'] as const).map(role => <section key={role} aria-label={`${role} formations`}>
        <h3>{role === 'offense' ? 'Offense · Receiving' : 'Defense · Kicking'}</h3>
        <div className="formation-list">{formations[role].map((item, index) => <button type="button" key={index} aria-pressed={selection?.role === role && selection.index === index}
          onClick={() => { setSelection({ role, index }); setSelected(null); }}>
          {item.name || 'Unnamed'}{index === 0 && <small>Default</small>}
        </button>)}</div>
        <button type="button" className="button secondary" disabled={formations[role].length >= 3} onClick={() => create(role)}>Create {role === 'offense' ? 'offensive' : 'defensive'} formation</button>
      </section>)}</div>
      {formation && <section className="formation-editor" aria-label="Formation editor">
        <div className="formation-edit-heading"><label>Formation name<input aria-label="Formation name" maxLength={16} value={formation.name} onChange={event => edit({ name: event.target.value })} onBlur={() => edit({ name: formation.name.trim() })}/></label>
          <button type="button" className="button secondary" disabled={selection?.index === 0} onClick={makeDefault}>Make default</button>
          <button type="button" className="button secondary" onClick={remove}>Delete formation</button></div>
        <p id="formation-instructions">Drag a number, or select a chit and then a square. Use arrow keys to move between squares. Select Reserves to remove a chit. Missing numbers are marked with a dashed border.</p>
        <p className="formation-selection" role="status">{selected === null ? 'Select a numbered chit.' : `Selected #${selected}${rosterNumbers.has(selected) ? '' : ' (missing from roster)'}.`}</p>
        <div className="formation-pitch" aria-label="Formation pitch" aria-describedby="formation-instructions">
          <div className="formation-opponent" aria-hidden="true">{Array.from({ length: 30 }, (_, index) => <span key={index}/>)}</div>
          <div className="formation-los">Line of scrimmage</div>
          <div className="formation-grid">{Array.from({ length: 195 }, (_, index) => {
            const column = index % 15, depth = Math.floor(index / 15);
            const player = formation.players.find(player => player.column === column && player.depth === depth);
            return <button type="button" key={index} data-formation-cell data-column={column} data-depth={depth}
              className={`${column < 4 || column > 10 ? 'wide' : ''} ${column === 3 || column === 10 ? 'wide-boundary' : ''} ${depth === 12 ? 'endzone' : ''} ${player ? 'occupied' : ''}`}
              aria-label={`Column ${column + 1}, row ${depth + 1}${player ? `, number ${player.jerseyNumber}${rosterNumbers.has(player.jerseyNumber) ? '' : ', missing from roster'}` : ', empty'}`}
              tabIndex={index === 0 ? 0 : -1}
              onKeyDown={event => {
                const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -15, ArrowDown: 15 } as Record<string, number>)[event.key];
                if (delta === undefined) return;
                event.preventDefault();
                const next = Math.min(194, Math.max(0, index + delta));
                dialog.current?.querySelector<HTMLButtonElement>(`[data-formation-cell][data-column="${next % 15}"][data-depth="${Math.floor(next / 15)}"]`)?.focus();
              }}
              onPointerDown={event => { if (player) beginDrag(event, player.jerseyNumber); }}
              onClick={() => { if (dragged.current) { dragged.current = false; return; } if (selected !== null) place(selected, { column, depth }); else if (player) setSelected(player.jerseyNumber); }}>
              {player && <span className={`formation-chit ${!rosterNumbers.has(player.jerseyNumber) ? 'missing' : ''} ${selected === player.jerseyNumber ? 'selected' : ''}`}>{player.jerseyNumber}</span>}
            </button>;
          })}</div>
          <div className="formation-endzone-label" aria-hidden="true">Own end zone</div>
        </div>
        <div className="formation-reserves" data-formation-reserves>
          <button type="button" className="button secondary" onClick={() => { if (selected !== null) place(selected, null); }}>Reserves</button>
          <div>{numbers.filter(number => !formation.players.some(player => player.jerseyNumber === number)).map(number => <button type="button" key={number}
            className={`formation-chit ${rosterNumbers.has(number) ? '' : 'missing'} ${selected === number ? 'selected' : ''}`}
            aria-label={`Select number ${number}${rosterNumbers.has(number) ? '' : ', missing from roster'}`} aria-pressed={selected === number}
            onPointerDown={event => beginDrag(event, number)} onClick={() => { dragged.current = false; setSelected(number); }}>{number}</button>)}</div>
        </div>
      </section>}
      {errors.length > 0 && <ul className="formation-errors" aria-label="Formation validation">{[...new Set(errors)].map(error => <li key={error}>{error}</li>)}</ul>}
      <footer><button type="button" disabled={errors.length > 0} onClick={() => save(formations)}>{formation ? 'Save formation' : 'Save formation changes'}</button><p>Changes stay in your draft until you save the team.</p></footer>
      {dragPosition && <span className="formation-chit formation-drag" style={{ left: dragPosition.x, top: dragPosition.y }}>{dragPosition.jerseyNumber}</span>}
    </div>
  </dialog>;
}
