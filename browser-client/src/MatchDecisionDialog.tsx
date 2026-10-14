import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DecisionOption, MatchDecision } from './match-decision.ts';
import { DiceFace } from './DiceFace.tsx';
import './match-decision.css';

const injuryIcons = `${import.meta.env.BASE_URL}assets/game/ui/injury-icons-v1.svg`;

/** Kick remains open while the coach inspects the pitch; other decisions contain focus. */
export function MatchDecisionDialog({ decision, disabled, activeX, onChoice, onAction }: {
  decision: MatchDecision; disabled: boolean; activeX: number | null;
  onChoice: (optionId: string) => void; onAction: (actionId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [skillChoices, setSkillChoices] = useState<DecisionOption | null>(null);
  useEffect(() => {
    const element = dialog.current;
    setSkillChoices(null);
    if (!element) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (decision.kind === 'kickSkill') element.show();
    else element.showModal();
    element.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { element.close(); if (prior?.isConnected) prior.focus(); };
  }, [decision.key]);
  return createPortal(<dialog ref={dialog} className={`match-decision-dialog ${decision.kind === 'apothecary' ? 'apothecary-decision' : ''} ${['followUp', 'kickSkill'].includes(decision.kind) ? 'compact' : ''} ${activeX === null ? 'center' : activeX < 13 ? 'right' : 'left'}`}
    aria-label="Match decision" aria-modal={decision.kind !== 'kickSkill'} onCancel={event => event.preventDefault()}>
    <h2>{decision.title}</h2>
    {decision.playerName && <p className="apothecary-player">{decision.playerName}</p>}
    {decision.instruction && <p>{decision.instruction}</p>}
    <div className="match-decision-options">{decision.options.map(option => <button key={option.id} type="button" disabled={disabled}
      onClick={() => option.choices ? setSkillChoices(option) : option.kind === 'choice' ? onChoice(option.id) : onAction(option.id)}>
      {option.face && <DiceFace face={option.face}/>}
      {option.icon?.startsWith('injury:') && <svg className="injury-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <use href={`${injuryIcons}#${option.icon.slice(7)}`}/>
      </svg>}
      {option.playerName && <strong className="apothecary-player">{option.playerName}</strong>}
      <span>{option.label}</span></button>)}</div>
    {skillChoices && <div className="pitch-skill-choices" aria-label={`${skillChoices.label} choices`}>
      {skillChoices.choices?.map(option => <button key={option.id} type="button" disabled={disabled} onClick={() => onAction(option.id)}>{option.label}</button>)}
      <button type="button" disabled={disabled} onClick={() => setSkillChoices(null)}>Cancel skill choice</button>
    </div>}
  </dialog>, document.body);
}
