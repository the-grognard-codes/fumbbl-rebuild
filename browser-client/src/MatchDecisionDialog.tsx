import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MatchDecision } from './match-decision.ts';
import { DiceFace } from './DiceFace.tsx';
import './match-decision.css';

/** Native modal focus containment keeps required engine choices out of permanent match chrome. */
export function MatchDecisionDialog({ decision, disabled, activeX, onChoice, onAction }: {
  decision: MatchDecision; disabled: boolean; activeX: number | null;
  onChoice: (optionId: string) => void; onAction: (actionId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    element.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { element.close(); if (prior?.isConnected) prior.focus(); };
  }, [decision.key]);
  return createPortal(<dialog ref={dialog} className={`match-decision-dialog ${decision.kind === 'followUp' ? 'compact' : ''} ${activeX === null ? 'center' : activeX < 13 ? 'right' : 'left'}`}
    aria-label="Match decision" onCancel={event => event.preventDefault()}>
    <h2>{decision.title}</h2>
    <div className="match-decision-options">{decision.options.map(option => <button key={option.id} type="button" disabled={disabled}
      onClick={() => option.kind === 'choice' ? onChoice(option.id) : onAction(option.id)}>
      {option.face && <DiceFace face={option.face}/>}<span>{option.label}</span></button>)}</div>
  </dialog>, document.body);
}
