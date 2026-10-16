import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DecisionOption, MatchDecision } from './match-decision.ts';
import { PolygonDie } from './PolygonDie.tsx';
import './match-decision.css';

const injuryIcons = `${import.meta.env.BASE_URL}assets/game/ui/injury-icons-v1.svg`;

/** Pitch decisions remain open while the coach inspects and pans the board. */
export function MatchDecisionDialog({ decision, disabled, activeX, onChoice, onAction }: {
  decision: MatchDecision; disabled: boolean; activeX: number | null;
  onChoice: (optionId: string) => void; onAction: (actionId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [skillChoices, setSkillChoices] = useState<DecisionOption | null>(null);
  const centeredPitchDecision = ['followUp', 'hitAndRun'].includes(decision.kind);
  const nonModal = centeredPitchDecision || decision.kind === 'kickSkill';
  useEffect(() => {
    const element = dialog.current;
    setSkillChoices(null);
    if (!element) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (nonModal) element.show();
    else element.showModal();
    const scene = centeredPitchDecision ? document.querySelector('.live-marker.active')?.closest('.live-pitch-scene') : null;
    const positionPitchDecision = () => {
      if (!centeredPitchDecision) return;
      const prompt = element.getBoundingClientRect(), center = window.innerHeight / 2;
      const left = (window.innerWidth - prompt.width) / 2, right = left + prompt.width;
      const obstacles = [...(scene?.querySelectorAll('.live-marker.active, .live-follow-up-preview, .live-hit-and-run-choice') ?? [])]
        .filter(marker => getComputedStyle(marker).visibility !== 'hidden')
        .map(marker => marker.getBoundingClientRect())
        .filter(box => box.right > left - 8 && box.left < right + 8);
      const fits = (y: number) => y - prompt.height / 2 >= 8 && y + prompt.height / 2 <= window.innerHeight - 8
        && obstacles.every(box => y + prompt.height / 2 <= box.top - 8 || y - prompt.height / 2 >= box.bottom + 8);
      const candidates = [center, ...obstacles.flatMap(box => [box.top - 8 - prompt.height / 2, box.bottom + 8 + prompt.height / 2])];
      const top = candidates.filter(fits).sort((a, b) => Math.abs(a - center) - Math.abs(b - center))[0] ?? center;
      element.style.top = `${top}px`;
    };
    positionPitchDecision();
    const observer = scene ? new MutationObserver(positionPitchDecision) : null;
    if (scene) observer?.observe(scene, { attributes: true, childList: true, subtree: true });
    const resize = centeredPitchDecision ? new ResizeObserver(positionPitchDecision) : null;
    resize?.observe(element);
    if (centeredPitchDecision) window.addEventListener('resize', positionPitchDecision);
    element.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      observer?.disconnect(); resize?.disconnect(); window.removeEventListener('resize', positionPitchDecision);
      element.style.removeProperty('top'); element.close(); if (prior?.isConnected) prior.focus();
    };
  }, [decision.key]);
  return createPortal(<dialog ref={dialog} className={`match-decision-dialog ${decision.kind === 'apothecary' ? 'apothecary-decision' : ''} ${nonModal ? 'compact' : ''} ${centeredPitchDecision ? `${decision.kind === 'followUp' ? 'follow-up' : 'hit-and-run'} center` : activeX === null ? 'center' : activeX < 13 ? 'right' : 'left'}`}
    aria-label="Match decision" aria-modal={!nonModal} onCancel={event => event.preventDefault()}>
    <h2>{decision.title}</h2>
    {decision.playerName && <p className="apothecary-player">{decision.playerName}</p>}
    {decision.instruction && <p>{decision.instruction}</p>}
    <div className="match-decision-options">{decision.options.map(option => <button key={option.id} type="button" disabled={disabled}
      onClick={() => option.choices ? setSkillChoices(option) : option.kind === 'choice' ? onChoice(option.id) : onAction(option.id)}>
      {option.face && <PolygonDie kind={option.dieKind ?? 'block'} face={option.face}/>}
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
