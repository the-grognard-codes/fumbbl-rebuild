export type MatchTextSize = 'small' | 'medium' | 'large';

export const matchTextPixels: Record<MatchTextSize, number> = { small: 12, medium: 14, large: 18 };

export function readMatchTextSize(key: string): MatchTextSize {
  try { const saved = localStorage.getItem(key); return saved === 'small' || saved === 'large' ? saved : 'medium'; }
  catch { return 'medium'; }
}

export function saveMatchTextSize(key: string, size: MatchTextSize) {
  try { localStorage.setItem(key, size); } catch { /* Keep the current setting in memory. */ }
}

export function MatchTextSizeControls({ subject, size, onChange }: {
  subject: 'log' | 'chat'; size: MatchTextSize; onChange: (size: MatchTextSize) => void;
}) {
  return <div className="log-font-controls" role="group" aria-label={`${subject === 'log' ? 'Log' : 'Chat'} text size`}>
    {(['small', 'medium', 'large'] as const).map(choice => <button key={choice} type="button" data-log-size={choice}
      aria-label={`${choice[0].toUpperCase()}${choice.slice(1)} ${subject} text`} aria-pressed={size === choice}
      onClick={() => onChange(choice)}>A</button>)}
  </div>;
}
