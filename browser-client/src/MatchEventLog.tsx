import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { appendMatchLogLines } from './match-log.ts';
import type { MatchLogLine } from './match-log.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

const PAGE = 160;
type LogFontSize = 'small' | 'medium' | 'large';
const fontPixels: Record<LogFontSize, number> = { small: 12, medium: 14, large: 18 };
const fontKey = 'ffb.match.log.font-size';

export function MatchEventLog({ records, loading, unavailable }: {
  records: TranscriptRecord[]; loading: boolean; unavailable: boolean;
}) {
  const cache = useRef<{ processed: number; lines: MatchLogLine[] }>({ processed: 0, lines: [] });
  const lines = useMemo(() => {
    if (records.length < cache.current.processed) cache.current = { processed: 0, lines: [] };
    for (let index = cache.current.processed; index < records.length; index++)
      appendMatchLogLines(cache.current.lines, records[index]);
    cache.current.processed = records.length;
    return cache.current.lines;
  }, [records]);
  const [windowRange, setWindowRange] = useState<{ first: number; last: number } | null>(null);
  const [fontSize, setFontSize] = useState<LogFontSize>(() => {
    try { const saved = localStorage.getItem(fontKey); return saved === 'small' || saved === 'large' ? saved : 'medium'; }
    catch { return 'medium'; }
  });
  const chooseFontSize = (size: LogFontSize) => {
    setFontSize(size);
    try { localStorage.setItem(fontKey, size); } catch { /* Keep the current setting in memory. */ }
  };
  const pane = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const first = windowRange?.first ?? Math.max(0, lines.length - PAGE);
  const last = windowRange?.last ?? lines.length;
  useLayoutEffect(() => {
    if (!pane.current) return;
    if (anchor.current) {
      pane.current.scrollTop = anchor.current.top + pane.current.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (windowRange === null) pane.current.scrollTop = pane.current.scrollHeight;
  }, [lines.length, windowRange]);
  const earlier = () => {
    if (pane.current) anchor.current = { height: pane.current.scrollHeight, top: pane.current.scrollTop };
    setWindowRange({ first: Math.max(0, first - PAGE), last });
  };
  const later = () => setWindowRange({ first, last: Math.min(lines.length, last + PAGE) });
  return <section className="match-event-log" data-font-size={fontSize} aria-label="Match log">
    <header><h3>Game Log</h3><div className="log-font-controls" role="group" aria-label="Log text size">
      {(['small', 'medium', 'large'] as const).map(size => <button key={size} type="button" data-log-size={size}
        aria-label={`${size[0].toUpperCase()}${size.slice(1)} log text`} aria-pressed={fontSize === size}
        onClick={() => chooseFontSize(size)}>A</button>)}
    </div></header>
    <p className="match-log-count">{lines.length ? `Entries ${first + 1}–${last} of ${lines.length}` : loading ? 'Loading recorded history…' : unavailable ? 'Recorded history is unavailable for this match.' : 'No recorded events yet.'}</p>
    <div ref={pane} role="log" aria-label="Authoritative match events" aria-live="polite" className="match-event-scroll" style={{ fontSize: `${fontPixels[fontSize]}px` }}
      onScroll={event => { if (windowRange !== null) return; const element = event.currentTarget;
        if (element.scrollHeight - element.scrollTop - element.clientHeight > 36)
          setWindowRange({ first, last }); }}>
      {lines.slice(first, last).map(line => <p key={line.key}><time dateTime={new Date(line.at).toISOString()}>{new Date(line.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        <span className="match-log-revision">#{line.revision}</span>{line.text}</p>)}
    </div>
    {lines.length > PAGE && <div className="match-log-paging">
      <button type="button" onClick={earlier} disabled={first === 0}>Earlier</button>
      <button type="button" onClick={later} disabled={last >= lines.length}>Later</button>
    </div>}
  </section>;
}
