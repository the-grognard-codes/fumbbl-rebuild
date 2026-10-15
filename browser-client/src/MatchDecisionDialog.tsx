import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DecisionOption, MatchDecision } from './match-decision.ts';
import { DiceFace } from './DiceFace.tsx';
import './match-decision.css';

const injuryIcons = `${import.meta.env.BASE_URL}assets/game/ui/injury-icons-v1.svg`;

/** Kick and follow-up remain open while the coach inspects the pitch. */
export function MatchDecisionDialog({ decision, disabled, activeX, onChoice, onAction }: {
  decision: MatchDecision; disabled: boolean; activeX: number | null;
  onChoice: (optionId: string) => void; onAction: (actionId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [skillChoices, setSkillChoices] = useState<DecisionOption | null>(null);
  const nonModal = ['followUp', 'kickSkill'].includes(decision.kind);
  useEffect(() => {
    const element = dialog.current;
    setSkillChoices(null);
    if (!element) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (nonModal) element.show();
    else element.showModal();
    const scene = decision.kind === 'followUp' ? document.querySelector('.live-marker.active')?.closest('.live-pitch-scene') : null;
    const positionFollowUp = () => {
      if (decision.kind !== 'followUp') return;
      const prompt = element.getBoundingClientRect(), center = window.innerHeight / 2;
      const left = (window.innerWidth - prompt.width) / 2, right = left + prompt.width;
      const obstacles = [...(scene?.querySelectorAll('.live-marker.active, .live-follow-up-preview') ?? [])]
        .filter(marker => getComputedStyle(marker).visibility !== 'hidden')
        .map(marker => marker.getBoundingClientRect())
        .filter(box => box.right > left - 8 && box.left < right + 8);
      const fits = (y: number) => y - prompt.height / 2 >= 8 && y + prompt.height / 2 <= window.innerHeight - 8
        && obstacles.every(box => y + prompt.height / 2 <= box.top - 8 || y - prompt.height / 2 >= box.bottom + 8);
      const candidates = [center, ...obstacles.flatMap(box => [box.top - 8 - prompt.height / 2, box.bottom + 8 + prompt.height / 2])];
      const top = candidates.filter(fits).sort((a, b) => Math.abs(a - center) - Math.abs(b - center))[0] ?? center;
      element.style.top = `${top}px`;
    };
    positionFollowUp();
    const observer = scene ? new MutationObserver(positionFollowUp) : null;
    if (scene) observer?.observe(scene, { attributes: true, childList: true, subtree: true });
    const resize = decision.kind === 'followUp' ? new ResizeObserver(positionFollowUp) : null;
    resize?.observe(element);
    if (decision.kind === 'followUp') window.addEventListener('resize', positionFollowUp);
    element.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      observer?.disconnect(); resize?.disconnect(); window.removeEventListener('resize', positionFollowUp);
      element.style.removeProperty('top'); element.close(); if (prior?.isConnected) prior.focus();
    };
  }, [decision.key]);
  return createPortal(<dialog ref={dialog} className={`match-decision-dialog ${decision.kind === 'apothecary' ? 'apothecary-decision' : ''} ${nonModal ? 'compact' : ''} ${decision.kind === 'followUp' ? 'follow-up center' : activeX === null ? 'center' : activeX < 13 ? 'right' : 'left'}`}
    aria-label="Match decision" aria-modal={!nonModal} onCancel={event => event.preventDefault()}>
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
