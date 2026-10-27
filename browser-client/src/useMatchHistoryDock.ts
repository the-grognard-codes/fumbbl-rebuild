import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

import { matchWindowHeight } from './match-window-size.ts';
import type { MatchWindowSize } from './match-window-size.ts';

const obstacles = '.live-resources, .live-resource-counts, .live-chess-clock, .clock-end-turn, .coach-score-center, .game-menu-trigger, .live-camera-controls, .match-menu-triggers, .match-debug-toggle, .drive-phase-tracker';

// Measure actual HUD bounds so font size, resource wrapping and browser zoom
// reserve the same space as their rendered controls, on each side independently.
export function useMatchHistoryDock(ref: RefObject<HTMLDivElement | null>, enabled: boolean,
  chatSize: MatchWindowSize, logSize: MatchWindowSize) {
  useLayoutEffect(() => {
    const host = enabled ? ref.current?.closest<HTMLElement>('.coach-match') : null;
    if (!host) return;
    host.dataset.historyDocked = 'true';
    let frame = 0;
    const properties = new Set<string>();
    const set = (name: string, value: number) => {
      const property = `--${name}`;
      properties.add(property);
      const next = `${Math.round(value * 100) / 100}px`;
      if (host.style.getPropertyValue(property) !== next) host.style.setProperty(property, next);
    };
    const measure = () => {
      const bounds = host.getBoundingClientRect();
      const style = getComputedStyle(host);
      const bottom = parseFloat(style.getPropertyValue('--history-panel-bottom')) || 0;
      const baseline = parseFloat(style.getPropertyValue('--history-panel-height')) || 152;
      const gap = parseFloat(style.getPropertyValue('--dugout-panel-gap')) || 8;
      for (const [subject, role, size] of [['chat', 'home', chatSize], ['log', 'away', logSize]] as const) {
        const panel = host.querySelector<HTMLElement>(`.match-history-${subject}`);
        const header = panel?.querySelector<HTMLElement>('header');
        if (!panel || !header) continue;
        const panelBounds = panel.getBoundingClientRect();
        const dugout = host.querySelector<HTMLElement>(`.live-dugout.${role}`);
        const dugoutBounds = dugout?.getBoundingClientRect();
        // Include the dugout's width when looking for overhead obstructions.
        const left = Math.min(panelBounds.left, dugoutBounds?.left ?? panelBounds.left);
        const right = Math.max(panelBounds.right, dugoutBounds?.right ?? panelBounds.right);
        let top = bounds.top;
        for (const obstacle of host.querySelectorAll<HTMLElement>(obstacles)) {
          const rect = obstacle.getBoundingClientRect();
          if (rect.width && rect.height && rect.left < right && rect.right > left) top = Math.max(top, rect.bottom + gap);
        }
        const panelStyle = getComputedStyle(panel);
        const headerHeight = header.getBoundingClientRect().height
          + parseFloat(panelStyle.paddingTop) + parseFloat(panelStyle.paddingBottom)
          + parseFloat(panelStyle.borderTopWidth) + parseFloat(panelStyle.borderBottomWidth);
        const available = bounds.bottom - bottom - top - (dugoutBounds ? dugoutBounds.height + gap : 0);
        set(`${subject}-panel-height`, matchWindowHeight(size, headerHeight, baseline, available));
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    const observed = new Set<Element>();
    const observe = () => {
      for (const element of observed) {
        if (element !== host && !host.contains(element)) { observer.unobserve(element); observed.delete(element); }
      }
      for (const element of [host, ...host.querySelectorAll(`.live-dugout, .match-history header, ${obstacles}`)]) {
        if (!observed.has(element)) { observer.observe(element); observed.add(element); }
      }
      schedule();
    };
    const mutations = new MutationObserver(observe);
    mutations.observe(host, { childList: true, subtree: true });
    observe();
    measure();
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', schedule);
      delete host.dataset.historyDocked;
      properties.forEach(property => host.style.removeProperty(property));
    };
  }, [ref, enabled, chatSize, logSize]);
}
