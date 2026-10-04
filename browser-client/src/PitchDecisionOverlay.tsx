import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { MatchDecision } from './match-decision.ts';
import { DiceFace } from './DiceFace.tsx';

/** Keep required pitch choices inside the visible viewport, including after pan/resize. */
export function PitchDecisionOverlay({ decision, disabled, viewport, scene, x, y, onAction }: {
  decision: MatchDecision; disabled: boolean; viewport: RefObject<HTMLDivElement | null>;
  scene: RefObject<HTMLDivElement | null>; x: number; y: number; onAction?: (id: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
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
      const width = Math.max(1, Math.min(245, right - left));
      const maxHeight = Math.max(1, bottom - top);
      const height = Math.min(element.getBoundingClientRect().height, maxHeight);
      const next = { left: Math.max(left, Math.min(ground.left + x, right - width)),
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
  return createPortal(<div ref={panel} className="live-dice-overlay interactive" role="dialog" aria-label={decision.title}
    style={{ position: 'fixed', ...bounds, visibility: ready ? 'visible' : 'hidden' }}
    onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <strong>{decision.title}</strong><div className="live-dice-choices">{decision.options.map(option => <button key={option.id} type="button"
      disabled={disabled} aria-label={option.label} onClick={() => onAction?.(option.id)}>
      {option.face && <DiceFace face={option.face}/>}<span>{option.face ? option.label.replace(/^Choose /, '') : option.label}</span>
    </button>)}</div>
  </div>, document.body);
}
