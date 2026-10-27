export type MatchWindowSize = 'minimized' | 'default' | 'maximized';
export type MatchWindow = 'chat' | 'log';

export function readMatchWindowSize(window: MatchWindow): MatchWindowSize {
  try {
    const value = localStorage.getItem(`ffb.match.${window}.window-size`);
    return value === 'minimized' || value === 'maximized' ? value : 'default';
  } catch { return 'default'; }
}

export function saveMatchWindowSize(window: MatchWindow, size: MatchWindowSize) {
  try { localStorage.setItem(`ffb.match.${window}.window-size`, size); } catch { /* Keep the in-memory choice. */ }
}

export function matchWindowHeight(size: MatchWindowSize, header: number, baseline: number, available: number): number {
  const maximum = Math.max(header, available);
  return size === 'minimized' ? header : size === 'maximized' ? maximum : Math.min(Math.max(header, baseline), maximum);
}
