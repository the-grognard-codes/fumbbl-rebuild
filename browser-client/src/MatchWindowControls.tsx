import type { MatchWindowSize } from './match-window-size.ts';

export function WindowArrow({ direction }: { direction: 'up' | 'down' }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d={direction === 'up' ? 'M4 13 10 7 16 13' : 'M4 7 10 13 16 7'}/>
  </svg>;
}

export function MatchWindowControls({ subject, size, onChange }: {
  subject: string; size: MatchWindowSize; onChange: (size: MatchWindowSize) => void;
}) {
  return <div className="live-dugout-controls match-window-controls" role="group" aria-label={`${subject} window size`}>
    {size !== 'maximized' && <button key="expand" type="button"
      aria-label={`${size === 'minimized' ? 'Restore' : 'Expand'} ${subject}`} title={size === 'minimized' ? 'Restore default size' : 'Maximize window'}
      onClick={() => onChange(size === 'minimized' ? 'default' : 'maximized')}><WindowArrow direction="up"/></button>}
    {size !== 'minimized' && <button key="minimize" type="button"
      aria-label={`Minimize ${subject}`} title={size === 'maximized' ? 'Restore default size' : 'Show header only'}
      onClick={() => onChange(size === 'maximized' ? 'default' : 'minimized')}><WindowArrow direction="down"/></button>}
  </div>;
}
