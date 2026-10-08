import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { appendMatchLogLines } from './match-log.ts';
import type { MatchLogLine } from './match-log.ts';
import { DiceFace } from './DiceFace.tsx';
import { readMatchLogPreferences, saveMatchLogPreferences, subscribeMatchLogPreferences } from './match-log-preferences.ts';
import type { MatchLogPreferences } from './match-log-preferences.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { MatchTextSizeControls, matchTextPixels, readMatchTextSize, saveMatchTextSize } from './MatchTextSizeControls.tsx';
import type { MatchTextSize } from './MatchTextSizeControls.tsx';
import './match-log.css';

const PAGE = 160;
const fontKey = 'ffb.match.log.font-size';
type Boundary = { key: string; revision: number };
const boundary = (line: MatchLogLine): Boundary => ({ key: line.key, revision: line.revision });
const locate = (lines: MatchLogLine[], point: Boundary, end = false) => {
  const exact = lines.findIndex(line => line.key === point.key);
  if (exact >= 0) return exact;
  const index = lines.findIndex(line => line.revision >= point.revision);
  return index >= 0 ? index : end ? lines.length - 1 : 0;
};

export function MatchEventLog({ records, loading, unavailable, showSettings = true }: {
  records: TranscriptRecord[]; loading: boolean; unavailable: boolean; showSettings?: boolean;
}) {
  const [preferences, setPreferences] = useState(readMatchLogPreferences);
  const signature = JSON.stringify(preferences);
  const cache = useRef<{ records: TranscriptRecord[]; signature: string; lines: MatchLogLine[] }>({ records: [], signature: '', lines: [] });
  const lines = useMemo(() => {
    const old = cache.current;
    if (old.signature !== signature || old.records.length > records.length || old.records.some((record, index) => record !== records[index]))
      cache.current = { records: [], signature, lines: [] };
    for (let index = cache.current.records.length; index < records.length; index++)
      appendMatchLogLines(cache.current.lines, records[index], preferences);
    cache.current.records = records.slice();
    return cache.current.lines.slice();
  }, [records, signature, preferences]);
  const [windowRange, setWindowRange] = useState<{ first: Boundary; last: Boundary } | null>(null);
  const [fontSize, setFontSize] = useState<MatchTextSize>(() => readMatchTextSize(fontKey));
  const pane = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ key: string; revision: number; offset: number } | null>(null);
  const matchId = records[0]?.state.matchId;
  useLayoutEffect(() => { anchor.current = null; setWindowRange(null); }, [matchId]);
  const first = windowRange ? locate(lines, windowRange.first) : Math.max(0, lines.length - PAGE);
  const last = windowRange ? locate(lines, windowRange.last, true) + 1 : lines.length;
  const rememberPosition = () => {
    const element = pane.current;
    if (!element) return;
    const row = Array.from(element.querySelectorAll<HTMLElement>('[data-log-key]'))
      .find(row => row.offsetTop + row.offsetHeight > element.scrollTop);
    if (row) anchor.current = { key: row.dataset.logKey!, revision: Number(row.dataset.revision), offset: row.offsetTop - element.scrollTop };
  };
  useLayoutEffect(() => {
    const element = pane.current;
    if (!element) return;
    if (anchor.current) {
      const saved = anchor.current;
      const rows = Array.from(element.querySelectorAll<HTMLElement>('[data-log-key]'));
      const row = rows.find(row => row.dataset.logKey === saved.key) ?? rows.find(row => Number(row.dataset.revision) >= saved.revision);
      if (row) element.scrollTop = row.offsetTop - saved.offset;
      anchor.current = null;
    } else if (windowRange === null) element.scrollTop = element.scrollHeight;
  }, [lines, windowRange, fontSize]);
  useEffect(() => subscribeMatchLogPreferences(next => {
    if (JSON.stringify(next) === signature) return;
    rememberPosition();
    if (windowRange === null && lines.length && pane.current
      && pane.current.scrollHeight - pane.current.scrollTop - pane.current.clientHeight > 36)
      setWindowRange({ first: boundary(lines[first]), last: boundary(lines[last - 1]) });
    setPreferences(next);
  }), [signature, lines, windowRange, first, last]);
  const choosePreference = (name: keyof MatchLogPreferences, value: boolean) =>
    saveMatchLogPreferences({ ...preferences, [name]: value });
  const earlier = () => {
    rememberPosition();
    setWindowRange({ first: boundary(lines[Math.max(0, first - PAGE)]), last: boundary(lines[last - 1]) });
  };
  const later = () => setWindowRange({ first: boundary(lines[first]), last: boundary(lines[Math.min(lines.length, last + PAGE) - 1]) });
  return <section className="match-event-log" data-font-size={fontSize} aria-label="Match log">
    <header><h3>Game Log</h3><MatchTextSizeControls subject="log" size={fontSize} onChange={size => {
      rememberPosition(); setFontSize(size); saveMatchTextSize(fontKey, size);
    }}/></header>
    {showSettings && <div className="match-log-settings" role="group" aria-label="Game Log settings">
      {([['debug', 'Debug'], ['movement', 'Movement'], ['rollModifiers', 'Roll modifiers']] as const).map(([name, label]) =>
        <label key={name}><input type="checkbox" checked={preferences[name]}
          onChange={event => choosePreference(name, event.target.checked)}/>{label}</label>)}
    </div>}
    {!lines.length && <p>{loading ? 'Loading recorded history…' : unavailable ? 'Recorded history is unavailable for this match.' : 'No recorded events yet.'}</p>}
    <div ref={pane} role="log" aria-label="Authoritative match events" aria-live="polite" className="match-event-scroll" style={{ fontSize: `${matchTextPixels[fontSize]}px` }}
      onScroll={event => { if (windowRange !== null || !lines.length) return; const element = event.currentTarget;
        if (element.scrollHeight - element.scrollTop - element.clientHeight > 36)
          setWindowRange({ first: boundary(lines[first]), last: boundary(lines[last - 1]) }); }}>
      {lines.slice(first, last).map(line => <p key={line.key} data-log-key={line.key} data-revision={line.revision}>
        {line.dice && <span className="match-log-dice">{line.dice.faces.map((face, index) =>
          <DiceFace key={index} face={face} selected={line.dice?.selected === index}/>)}</span>}
        {line.text}{line.debug && <small className="match-log-debug">{line.debug}</small>}</p>)}
    </div>
    {lines.length > PAGE && <div className="match-log-paging">
      <button type="button" onClick={earlier} disabled={first === 0}>Earlier</button>
      <button type="button" onClick={later} disabled={last >= lines.length}>Later</button>
    </div>}
  </section>;
}
