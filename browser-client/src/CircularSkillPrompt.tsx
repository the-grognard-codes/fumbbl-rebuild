import { useEffect, useRef, useState, type RefObject, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { MatchDecision, DecisionOption } from './match-decision.ts';
import type { Reaction } from './setup-protocol.ts';
import { useReactionCountdown } from './ReactionCountdown.tsx';
import { placeSkillPrompt } from './skill-prompt-placement.ts';
import { skillPromptOptions } from './skill-prompt-options.ts';
import './circular-skill-prompt.css';

function CountdownRibbon({ reaction }: { reaction: Reaction & { matchId: string } }) {
  const { seconds, remainingMs, allowanceMs } = useReactionCountdown(reaction, reaction.matchId);
  const fraction = Math.min(1, remainingMs / allowanceMs);
  return <><svg className={`skill-ribbon${fraction <= .2 ? ' urgent' : ''}`} viewBox="0 0 200 200"
    role="timer" aria-label="Reaction time remaining" aria-live="off">
    <circle className="skill-ribbon-track" cx="100" cy="100" r="88"/>
    <circle className="skill-ribbon-progress" cx="100" cy="100" r="88" pathLength="100"
      strokeDasharray={`${fraction * 100} 100`} transform="rotate(-90 100 100)"/>
    <circle className="skill-ribbon-number-bed" cx="188" cy="100" r="11"/>
    <text className="skill-ribbon-number" x="188" y="100" dominantBaseline="central" textAnchor="middle">{seconds}</text>
  </svg>{seconds === 0 && <span className="skill-expiry-status" role="status">Awaiting server</span>}</>;
}

/** Native IDs and availability stay authoritative; this component only stages an explicit choice. */
export function CircularSkillPrompt({ decision, disabled, viewport, activePlayerId, layoutKey, onAction, selectingDestination = false, onDestinationStage }: {
  decision: MatchDecision; disabled: boolean; viewport: RefObject<HTMLDivElement | null>;
  activePlayerId?: string | null; layoutKey: string; onAction?: (id: string) => void;
  selectingDestination?: boolean; onDestinationStage?: (selecting: boolean) => void;
}) {
  const options = decision.options.flatMap(option => option.choices ?? [option]);
  const { choices, decline, preferred, timeoutDefault } = skillPromptOptions(decision);
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const selected = choices.length === 1 ? choices[0] : selectedId === undefined ? preferred : choices.find(option => option.id === selectedId);
  const chooser = !decision.pitchSelection && choices.length > 1 && !selected;
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; diameter: number; chooserWidth: number; targetX?: number; targetY?: number } | null>(null);
  const sourceId = decision.pitchSelection?.playerId ?? selected?.sourcePlayerId ?? choices.find(option => option.sourcePlayerId)?.sourcePlayerId ?? activePlayerId;
  useEffect(() => { setSelectedId(undefined); }, [decision.key]);
  // The ancestor pitch ref is attached after child layout effects on first mount.
  useEffect(() => {
    const frame = viewport.current, element = panel.current;
    if (!frame || !element) return;
    const update = () => {
      const rect = frame.getBoundingClientRect();
      let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
      let width = Math.max(1, Math.min(innerWidth, rect.right) - left), height = Math.max(1, Math.min(innerHeight, rect.bottom) - top);
      if (width < 188 || height < 200) { left = 0; top = 0; width = innerWidth; height = innerHeight; }
      const diameter = (width < 320 ? 172 : 196) * .75;
      const chooserWidth = Math.max(100, Math.min(168, width - diameter - 24));
      const markers = [...frame.querySelectorAll<HTMLElement>('.live-marker[data-player-id]')];
      const playerBounds = (marker: HTMLElement) => {
        const ground = marker.getBoundingClientRect(), art = marker.querySelector(':scope > img')?.getBoundingClientRect();
        if (!art) return ground;
        const left = Math.min(ground.left, art.left), top = Math.min(ground.top, art.top);
        return { left, top, width: Math.max(ground.right, art.right) - left, height: Math.max(ground.bottom, art.bottom) - top };
      };
      const owner = markers.find(marker => marker.dataset.playerId === sourceId);
      const subject = owner ? playerBounds(owner) : null;
      const protect = [...document.querySelectorAll<HTMLElement>('.pitch-decision-overlay, .live-push-choice, .live-match-scoreboard > *, .match-menu-triggers, .match-command-bar, .match-history-chat, .match-history-log, .live-ball-highlight, .live-ball-football')]
        .filter(node => node.getClientRects().length > 0).map(node => node.getBoundingClientRect());
      const dice = [...document.querySelectorAll<HTMLElement>('.pitch-decision-overlay')]
        .filter(node => node.getClientRects().length > 0).map(node => node.getBoundingClientRect());
      const list = element.querySelector<HTMLElement>('.skill-source-chooser');
      // Reserve the status line even before pending/expiry so it cannot clip or move the controls.
      const contentHeight = chooser ? Math.max(diameter + 20, list?.getBoundingClientRect().height ?? diameter) : diameter + (choices.length > 1 ? 60 : 20);
      const result = placeSkillPrompt({ left, top, width, height },
        { width: diameter + (chooser ? chooserWidth + 8 : 0), height: Math.min(height - 16, contentHeight) }, subject,
        protect, markers.filter(marker => marker.dataset.playerId !== sourceId).map(playerBounds), dice);
      const next = { left: result.left, top: result.top, diameter, chooserWidth,
        ...(subject ? { targetX: subject.left + subject.width / 2, targetY: subject.top + subject.height / 2 } : {}) };
      setPosition(prior => prior && JSON.stringify(prior) === JSON.stringify(next) ? prior : next);
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(frame); observer.observe(element);
    // Dice are a separate body portal and can arrive after the skill prompt.
    const mutations = new MutationObserver(records => {
      if (records.some(record => !(record.target instanceof Element) || !record.target.closest('.circular-skill-prompt,.skill-prompt-pointer'))) update();
    });
    mutations.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['style', 'class'] });
    const delayed = requestAnimationFrame(update);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    return () => { observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(delayed);
      window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [viewport, layoutKey, sourceId, decision.key, chooser, choices.length]);
  useEffect(() => {
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focus = requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }));
    return () => { cancelAnimationFrame(focus); if (prior?.isConnected && !panel.current?.contains(prior)) prior.focus({ preventScroll: true }); };
  }, [decision.key, chooser]);
  const submit = (option?: DecisionOption) => {
    if (!disabled && option && options.some(current => current.id === option.id)) onAction?.(option.id);
  };
  const title = decision.pitchSelection ? selectingDestination ? 'Choose a Sidestep arrow' : decision.title
    : selected ? selected.label === 'Yes' ? decision.title : `${selected.label.replace(/\?$/, '')}?` : 'Choose a skill or reroll';
  return createPortal(<>
    {position?.targetX !== undefined && <svg className="skill-prompt-pointer" aria-hidden="true">
      <path d={`M${position.left + position.diameter / 2},${position.top + position.diameter / 2} L${position.targetX},${position.targetY}`}/>
      <circle cx={position.targetX} cy={position.targetY} r="3"/>
    </svg>}
    <div ref={panel} className="circular-skill-prompt" role="dialog" aria-modal="false" aria-label={decision.title} aria-busy={disabled}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden',
        '--skill-circle-size': `${position?.diameter ?? 147}px`, '--skill-chooser-width': `${position?.chooserWidth ?? 168}px` } as CSSProperties}
      onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
      <div className="skill-circle">
        {decision.reaction ? <CountdownRibbon reaction={decision.reaction}/> : <svg className="skill-ribbon" viewBox="0 0 200 200" aria-hidden="true"><circle className="skill-ribbon-track" cx="100" cy="100" r="88"/></svg>}
        {decision.pitchSelection && !decision.pitchSelection.committed && <button type="button" className="skill-answer yes" disabled={disabled}
          aria-label={selectingDestination ? 'Back to Sidestep choice' : 'Use Sidestep'}
          onClick={() => { if (!disabled) onDestinationStage?.(!selectingDestination); }}>{selectingDestination ? 'Back' : '✓ Yes'}</button>}
        {!decision.pitchSelection && selected && <button type="button" className="skill-answer yes" disabled={disabled} aria-label={selected.label}
          title={selected.label} onClick={() => submit(selected)}><span aria-hidden="true">✓ </span>Yes</button>}
        <div className="skill-question-frame"><span className="skill-divider" aria-hidden="true"/>
          <h2 className={`skill-question${title.length > 40 ? ' long' : ''}`}>{title}</h2>
          <span className="skill-divider" aria-hidden="true"/></div>
        {chooser && !decline && <span className="skill-choose-arrow" aria-hidden="true">→</span>}
        {decline && <button type="button" className={`skill-answer no${timeoutDefault?.id === decline.id ? ' skill-timeout-default' : ''}`}
          disabled={disabled} aria-label={decline.label}
          aria-description={timeoutDefault?.id === decline.id ? 'Selected automatically if the timer expires' : undefined}
          title={timeoutDefault?.id === decline.id ? `${decline.label} (default when time runs out)` : decline.label}
          onClick={() => submit(decline)}><span aria-hidden="true">× </span>No</button>}
      </div>
      {chooser && <div className="skill-source-chooser" role="group" aria-label="Available skill and reroll choices">
        {choices.map(option => <button type="button" key={option.id} disabled={disabled} onClick={() => setSelectedId(option.id)}>{option.label}</button>)}
      </div>}
      {choices.length > 1 && selected && <button type="button" className="skill-change-choice" disabled={disabled}
        onClick={() => setSelectedId(null)}>{selectedId === undefined ? 'Other choices' : '← Back / change choice'}</button>}
      {decision.detail && <span className="sr-only">{decision.detail}</span>}
      {disabled && <span className="skill-pending" role="status">Awaiting response</span>}
    </div>
  </>, document.body);
}
