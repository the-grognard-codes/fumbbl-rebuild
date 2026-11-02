import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import './tooltip.css';

/** Tooltips escape every ancestor stacking context without raising their controls. */
export function useTooltipLayer(element: RefObject<HTMLElement | null>, visible: boolean) {
  useLayoutEffect(() => {
    const tooltip = element.current;
    if (!tooltip) return;
    if (visible) tooltip.showPopover();
    else if (tooltip.matches(':popover-open')) tooltip.hidePopover();
    return () => { if (tooltip.matches(':popover-open')) tooltip.hidePopover(); };
  }, [element, visible]);
}

export function Tooltip({ children, content, className, alignEnd = false }: {
  children: (id: string) => ReactNode; content: ReactNode; className: string; alignEnd?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useTooltipLayer(tooltip, visible);
  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      const element = tooltip.current, trigger = anchor.current;
      if (!element || !trigger) return;
      const at = trigger.getBoundingClientRect(), box = element.getBoundingClientRect();
      const left = alignEnd ? at.right - box.width : at.left;
      const top = at.bottom + 6 + box.height <= window.innerHeight - 8 ? at.bottom + 6 : at.top - box.height - 6;
      element.style.left = `${Math.max(8, Math.min(left, window.innerWidth - box.width - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - box.height - 8))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(anchor.current!); observer.observe(tooltip.current!);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { capture: true, passive: true });
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [visible, alignEnd]);
  return <div ref={anchor} className="live-resource-item" onMouseEnter={() => setVisible(true)}
    onMouseLeave={() => { if (!anchor.current?.contains(document.activeElement)) setVisible(false); }}
    onFocus={() => setVisible(true)} onBlur={() => { if (!anchor.current?.matches(':hover')) setVisible(false); }}
    onKeyDown={event => { if (event.key === 'Escape') setVisible(false); }}>
    {children(id)}
    <span ref={tooltip} id={id} role="tooltip" popover="manual" className={`${className} tooltip-popover`}>{content}</span>
  </div>;
}
