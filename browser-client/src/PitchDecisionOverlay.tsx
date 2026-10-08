import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { DecisionOption, MatchDecision } from './match-decision.ts';
import { DiceFace } from './DiceFace.tsx';
import type { DiceMoment } from './dice-presentation.ts';
import './pitch-decision-overlay.css';

const resourceIcon = `${import.meta.env.BASE_URL}assets/game/ui/reroll-v1.png`;
const skillIcons = `${import.meta.env.BASE_URL}assets/game/ui/skill-icons-v1.svg`;

/** Keep required pitch choices inside the visible viewport, including after pan/resize. */
export function PitchDecisionOverlay({ decision, diceMoment = null, disabled, viewport, scene, x, y, onAction }: {
  decision: MatchDecision; disabled: boolean; viewport: RefObject<HTMLDivElement | null>;
  diceMoment?: DiceMoment | null;
  scene: RefObject<HTMLDivElement | null>; x: number; y: number; onAction?: (id: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [skillChoices, setSkillChoices] = useState<DecisionOption | null>(null);
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    const element = panel.current, frame = viewport.current, surface = scene.current;
    if (!element || !frame || !surface) return;
    const update = () => {
      const rect = frame.getBoundingClientRect(), ground = surface.getBoundingClientRect();
      let left = Math.max(8, rect.left + 8), top = Math.max(8, rect.top + 8);
      let right = Math.min(window.innerWidth - 8, rect.right - 8);
      let bottom = Math.min(window.innerHeight - 8, rect.bottom - 8);
      // A scrolled-off or very small pitch must still expose the required response.
      if (right - left < 120 || bottom - top < 120) {
        left = 8; top = 8; right = window.innerWidth - 8; bottom = window.innerHeight - 8;
      }
      const priorWidth = element.style.width;
      element.style.width = 'max-content';
      const naturalWidth = Math.max(element.getBoundingClientRect().width, element.scrollWidth + 2);
      element.style.width = priorWidth;
      const width = Math.max(1, Math.min(naturalWidth, 245, right - left));
      const maxHeight = Math.max(1, bottom - top);
      const height = Math.min(element.getBoundingClientRect().height, maxHeight);
      const next = { left: Math.max(left, Math.min(ground.left + x - width / 2, right - width)),
        top: Math.max(top, Math.min(ground.top + y, bottom - height)), width, maxHeight };
      setBounds(prior => prior && Object.keys(next).every(key => prior[key as keyof typeof next] === next[key as keyof typeof next]) ? prior : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame); observer.observe(surface); observer.observe(element);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [decision.key, viewport, scene, x, y]);
  const ready = bounds !== null;
  useEffect(() => {
    if (!ready) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    return () => { if (prior?.isConnected) prior.focus({ preventScroll: true }); };
  }, [decision.key, ready]);
  return createPortal(<div ref={panel} className="live-dice-overlay interactive pitch-decision-overlay" role="dialog" aria-label={decision.title} aria-busy={disabled}
    style={{ position: 'fixed', ...bounds, visibility: ready ? 'visible' : 'hidden' }}
    onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <strong className={diceMoment || decision.options.some(option => option.face) ? 'sr-only' : undefined}>{decision.title}</strong>
    {decision.originalFaces && <div className="pitch-decision-roll" role="status" aria-label={decision.originalLabel ?? 'Original block dice'}>
      {decision.originalFaces.map((face, index) => <DiceFace key={index} face={face}/>)}</div>}
    {decision.proTest && <div className="pitch-pro-test" role="status" aria-label={`Pro test: ${decision.proTest.face}, ${decision.proTest.successful ? 'success' : 'failure'}`}>
      <span>Pro</span><DiceFace face={decision.proTest.face}/></div>}
    {diceMoment && !decision.proTest && <div className="pitch-decision-roll" role="status" aria-label={`${diceMoment.label}: ${diceMoment.faces.join(', ')}`}>
      {diceMoment.faces.map((face, index) => <span key={index} title={diceMoment.rolls?.[index]?.label ?? diceMoment.label}><DiceFace face={face} selected={diceMoment.selected === index} rollKey={diceMoment.rolls?.[index]?.rollKey ?? diceMoment.rollKey}/></span>)}</div>}
    <div className="live-dice-choices">{decision.options.map(option => <button key={option.id} type="button"
      className={option.face ? 'live-die-choice' : option.icon ? 'pitch-dice-icon-choice' : undefined}
      disabled={disabled} aria-label={option.label} title={option.choices ? option.choices.map(choice => choice.label).join('\n') : disabled ? `${option.label} (pending)` : option.label}
      aria-expanded={option.choices ? skillChoices?.id === option.id : undefined}
      onClick={() => option.choices ? setSkillChoices(skillChoices?.id === option.id ? null : option) : onAction?.(option.id)}>
      {option.face && <DiceFace face={option.face}/>}
      {option.icon === 'resource' && <img src={resourceIcon} alt="" aria-hidden="true"/>}
      {option.icon?.startsWith('custom:') && <svg aria-hidden="true" viewBox="0 0 48 48" className="pitch-dice-custom-icon">
        <use href={`${skillIcons}#badge`}/><text x="24" y="31">{option.icon.slice(7).split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase()}</text>
      </svg>}
      {option.icon && option.icon !== 'resource' && !option.icon.startsWith('custom:') && <svg aria-hidden="true" viewBox="0 0 48 48"><use href={`${skillIcons}#${option.icon}`}/></svg>}
      <span className={option.face || option.icon ? 'sr-only' : undefined}>{option.label}</span>
    </button>)}</div>
    {skillChoices && <div className="pitch-skill-choices" aria-label={`${skillChoices.label} choices`}>
      {skillChoices.choices?.map(option => <button key={option.id} type="button" disabled={disabled}
        onClick={() => onAction?.(option.id)}>{option.label}</button>)}
      <button type="button" disabled={disabled} onClick={() => setSkillChoices(null)}>Cancel skill choice</button>
    </div>}
  </div>, document.body);
}
