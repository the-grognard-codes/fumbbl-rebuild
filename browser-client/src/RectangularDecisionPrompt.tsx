import { useTeamColorContext } from './TeamColorArtProvider.tsx';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DecisionOption, MatchDecision } from './match-decision.ts';
import type { SetupPlayer } from './setup-protocol.ts';
import { MatchArt } from './MatchScoreboard.tsx';
import { resolvePlayerPortrait } from './player-art.ts';
import { placeSkillPrompt } from './skill-prompt-placement.ts';
import { ReactionCountdown } from './ReactionCountdown.tsx';
import './rectangular-decision.css';

export function isRectangularDecision(decision: MatchDecision) {
  return ['coin', 'receive', 'argueTheCall', 'bribe', 'interception', 'secretWeapon'].includes(decision.kind)
    || decision.kind === 'apothecary' && !decision.options.some(option => /(?:^|:)injury:(old|new)$/.test(option.id));
}
const declines = (option: DecisionOption) => /(?:^|:)(?:no|none)$/.test(option.id);
function ChoiceArt({ decision, option, player }: { decision: MatchDecision; option: DecisionOption; player?: SetupPlayer }) {
  const colors = useTeamColorContext();
  const decline = declines(option);
  if (['interception', 'secretWeapon'].includes(decision.kind) && player) {
    const portrait = resolvePlayerPortrait(player, colors[player.role]);
    return portrait ? <img className="decision-art portrait" src={portrait} alt=""/> : <span className="decision-art">#{player.number}</span>;
  }
  if (!decline && ['apothecary', 'bribe'].includes(decision.kind)) return <MatchArt name={decision.kind === 'bribe' ? 'bribe' : 'apothecary'}/>;
  if (!decline && decision.kind === 'argueTheCall') return <svg className="decision-art" viewBox="0 0 100 80" aria-hidden="true"><path d="M12 7h76q8 0 8 8v39q0 8-8 8H49L27 76l5-14H12q-8 0-8-8V15q0-8 8-8Z" fill="#f4e5c7" stroke="#b9995b" strokeWidth="3"/><text x="50" y="44" textAnchor="middle" fill="#10283f" fontFamily="MUTP" fontSize="26">#@!$%</text></svg>;
  const icon = ['coin', 'receive'].includes(decision.kind) ? option.id : decision.kind === 'apothecary' ? 'mole-stretcher'
    : ['argueTheCall', 'bribe'].includes(decision.kind) ? 'mole-referee' : null;
  return icon ? <img className={`decision-art ${icon}`} src={`${import.meta.env.BASE_URL}assets/game/ui/decision-prompts-v1/${icon}.png`} alt=""/>
    : <span className="decision-decline" aria-hidden="true">×</span>;
}

/** Local candidate previews never submit a command. The owning view validates every final action. */
export function RectangularDecisionPrompt({ decision, players, disabled, onChoice, onAction }: {
  decision: MatchDecision; players: SetupPlayer[]; disabled: boolean;
  onChoice: (id: string) => void; onAction: (id: string) => void;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const centered = ['coin', 'receive'].includes(decision.kind);
  const choices = decision.options.filter(option => !declines(option));
  const candidateIds = new Set(choices.map(option => option.targetPlayerId).filter(Boolean));
  const chooser = ['interception', 'secretWeapon'].includes(decision.kind) || candidateIds.size > 1;
  const selected = choices.find(option => option.id === selectedId);
  const subjectId = chooser ? selected?.targetPlayerId : decision.options.find(option => option.targetPlayerId)?.targetPlayerId;
  const subject = players.find(player => player.id === subjectId);
  const [position, setPosition] = useState<{ left: number; top: number; x?: number; y?: number } | null>(null);
  useEffect(() => {
    const element = panel.current!;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Mandatory decisions must leave Game Menu available, including concession.
    element.show();
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    return () => { element.close(); if (prior?.isConnected) prior.focus({ preventScroll: true }); };
  }, [decision.key]);
  useEffect(() => {
    const element = panel.current!;
    const update = () => {
      const frame = document.querySelector('.live-pitch-scene')?.getBoundingClientRect();
      const bounds = { left: Math.max(0, frame?.left ?? 0), top: Math.max(0, frame?.top ?? 0),
        width: Math.min(innerWidth, frame?.right ?? innerWidth) - Math.max(0, frame?.left ?? 0),
        height: Math.min(innerHeight, frame?.bottom ?? innerHeight) - Math.max(0, frame?.top ?? 0) };
      const size = element.getBoundingClientRect();
      const marker = [...document.querySelectorAll<HTMLElement>('.live-marker[data-player-id]')].find(node => node.dataset.playerId === subjectId);
      const box = marker?.getBoundingClientRect();
      const visible = subject?.x != null && subject.y != null && box && box.right > bounds.left && box.left < bounds.left + bounds.width
        && box.bottom > bounds.top && box.top < bounds.top + bounds.height && getComputedStyle(marker!).visibility !== 'hidden';
      // Protect the projected 3x3 ground cells, including empty neighbors, and the player's artwork.
      const cells = visible ? [...document.querySelectorAll<SVGPolygonElement>('.live-pitch-scene [data-cell-x][data-cell-y]')]
        .filter(cell => Math.abs(Number(cell.dataset.cellX) - subject.x!) <= 1 && Math.abs(Number(cell.dataset.cellY) - subject.y!) <= 1)
        .map(cell => cell.getBoundingClientRect()) : [];
      if (visible) { cells.push(box); const art = marker!.querySelector('img')?.getBoundingClientRect(); if (art) cells.push(art); }
      const protectedSubject = cells.length ? { left: Math.min(...cells.map(cell => cell.left)), top: Math.min(...cells.map(cell => cell.top)),
        width: Math.max(...cells.map(cell => cell.right)) - Math.min(...cells.map(cell => cell.left)),
        height: Math.max(...cells.map(cell => cell.bottom)) - Math.min(...cells.map(cell => cell.top)) } : null;
      const obstacles = [...document.querySelectorAll('.live-match-scoreboard, .match-command-bar, .match-menu-triggers')].map(node => node.getBoundingClientRect());
      const next = centered ? { left: (innerWidth - size.width) / 2, top: Math.max(8, (innerHeight - size.height) / 2) }
        : { ...placeSkillPrompt(bounds.width > 0 && bounds.height > size.height + 16 ? bounds : { left: 0, top: 0, width: innerWidth, height: innerHeight }, { width: size.width, height: size.height }, protectedSubject, obstacles),
          ...(visible ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : {}) };
      setPosition(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    update();
    const resize = new ResizeObserver(update); resize.observe(element);
    const mutations = new MutationObserver(records => {
      if (records.some(record => !(record.target instanceof Element) || !record.target.closest('.rectangular-decision,.decision-pointer'))) update();
    });
    mutations.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    return () => { resize.disconnect(); mutations.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [subjectId, subject?.x, subject?.y, decision.key, centered]);
  const submit = (option: DecisionOption) => {
    if (!disabled && decision.options.some(current => current.id === option.id)) {
      if (option.kind === 'choice') onChoice(option.id); else onAction(option.id);
    }
  };
  const identity = (player: SetupPlayer) => player.x == null || player.y == null ? `Player #${player.number ?? player.slot}` : `#${player.number ?? player.slot} · ${player.name}`;
  const renderOption = (option: DecisionOption, preview: boolean) => {
    const player = players.find(player => player.id === option.targetPlayerId);
    const label = ['argueTheCall', 'bribe', 'interception'].includes(decision.kind) && declines(option) ? 'Decline'
      : decision.kind === 'argueTheCall' ? 'Argue the call' : decision.kind === 'bribe' ? 'Use a bribe' : option.label;
    return <button key={option.id} type="button" disabled={disabled} aria-pressed={preview ? selectedId === option.id : undefined}
      onClick={() => preview ? setSelectedId(option.id) : submit(option)}>
      <ChoiceArt decision={decision} option={option} player={player}/>
      <span>{preview && player ? identity(player) : label}</span>
      {preview && decision.kind === 'apothecary' && <small>{option.label}</small>}
    </button>;
  };
  return createPortal(<>
    {position?.x !== undefined && <svg className="decision-pointer" aria-hidden="true"><path d={`M${position.left + (panel.current?.offsetWidth ?? 340) / 2},${position.top + (panel.current?.offsetHeight ?? 150) / 2} L${position.x},${position.y}`}/><circle cx={position.x} cy={position.y} r="3"/></svg>}
    <dialog ref={panel} className="match-decision-dialog rectangular-decision" aria-label="Match decision" aria-modal={false} aria-busy={disabled}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }} onCancel={event => event.preventDefault()}>
      <h2>{decision.kind === 'interception' ? 'Nominate an interceptor' : decision.kind === 'receive' ? 'Kick or receive?' : decision.kind === 'apothecary' && chooser ? 'Choose a player to treat' : decision.title}</h2>
      {subject && !chooser && <p>{identity(subject)}</p>}
      {decision.reaction && <ReactionCountdown reaction={decision.reaction} matchId={decision.reaction.matchId}/>}
      <div className="match-decision-options">{(chooser ? choices : [...choices, ...decision.options.filter(declines)]).map(option => renderOption(option, chooser))}</div>
      {chooser && <div className="decision-confirm"><button type="button" disabled={disabled || !selected} onClick={() => { if (selected) submit(selected); }}>{decision.kind === 'interception' ? 'Confirm interceptor' : decision.kind === 'apothecary' ? 'Treat selected player' : 'Confirm player'}</button>
        {decision.options.filter(declines).map(option => renderOption(option, false))}</div>}
    </dialog>
  </>, document.body);
}

