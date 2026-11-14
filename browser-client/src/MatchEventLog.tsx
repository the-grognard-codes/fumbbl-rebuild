import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { appendMatchLogLines } from './match-log.ts';
import type { MatchLogLine } from './match-log.ts';
import { LogDie } from './LogDie.tsx';
import { readMatchLogPreferences, saveMatchLogPreferences, subscribeMatchLogPreferences } from './match-log-preferences.ts';
import type { MatchLogPreferences } from './match-log-preferences.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { MatchTextSizeControls, matchTextPixels, readMatchTextSize, saveMatchTextSize } from './MatchTextSizeControls.tsx';
import type { MatchTextSize } from './MatchTextSizeControls.tsx';
import './match-log.css';

const fontKey = 'ffb.match.log.font-size';
const mountedLogLimit = 100;

function LogText({ line }: { line: MatchLogLine }) {
  const dice = line.dice;
  if (!dice?.inline) return <>{line.text}</>;
  let cursor = 0;
  const parts: ReactNode[] = [];
  const unmatched: number[] = [];
  dice.faces.forEach((face, index) => {
    const expression = new RegExp(`(?<![\\p{L}\\p{N}])${face}(?![\\p{L}\\p{N}])`, 'gu');
    expression.lastIndex = cursor;
    const found = expression.exec(line.text);
    if (!found) { unmatched.push(index); return; }
    if (found.index > cursor) parts.push(line.text.slice(cursor, found.index));
    parts.push(<LogDie key={`die-${index}`} kind={dice.kinds[index] ?? 'd6'} face={face}/>);
    cursor = found.index + found[0].length;
  });
  if (unmatched.length) parts.unshift(<span key="unmatched" className="match-log-dice">{unmatched.map(index =>
    <LogDie key={index} kind={dice.kinds[index] ?? 'd6'} face={dice.faces[index]}/>)}</span>);
  if (cursor < line.text.length) parts.push(line.text.slice(cursor));
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>;
}

export function MatchEventLog({ records, loading, unavailable, showSettings = true, minimized = false, headerControls }: {
  records: TranscriptRecord[]; loading: boolean; unavailable: boolean; showSettings?: boolean;
  minimized?: boolean; headerControls?: ReactNode;
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
  const [fontSize, setFontSize] = useState<MatchTextSize>(() => readMatchTextSize(fontKey));
  const pane = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ key: string; revision: number; offset: number } | null>(null);
  const follow = useRef(true);
  const wasMinimized = useRef(minimized);
  const matchId = records[0]?.state.matchId;
  const [historyEnd, setHistoryEnd] = useState<{ matchId: string | undefined; key: string; revision: number } | null>(null);
  const pageChanged = useRef(false);
  const retainedEnd = historyEnd?.matchId === matchId ? historyEnd : null;
  const endIndex = retainedEnd ? lines.findIndex(line => line.key === retainedEnd.key) : -1;
  const fallbackEnd = retainedEnd ? lines.reduce((found, line, index) => line.revision <= retainedEnd.revision ? index : found, -1) : -1;
  const windowEnd = retainedEnd ? Math.min(lines.length, Math.max(1, (endIndex >= 0 ? endIndex : fallbackEnd) + 1)) : lines.length;
  const windowStart = Math.max(0, windowEnd - mountedLogLimit);
  const visibleLines = minimized ? [] : lines.slice(windowStart, windowEnd);
  const showHistory = (end: number) => {
    anchor.current = null;
    follow.current = end >= lines.length;
    pageChanged.current = true;
    const line = lines[Math.max(0, end - 1)];
    setHistoryEnd(end >= lines.length || !line ? null : { matchId, key: line.key, revision: line.revision });
  };
  useLayoutEffect(() => { anchor.current = null; follow.current = true; }, [matchId]);
  const rememberPosition = () => {
    const element = pane.current;
    if (!element || minimized) return;
    if (element.scrollHeight - element.scrollTop - element.clientHeight <= 36) {
      follow.current = true;
      anchor.current = null;
      return;
    }
    follow.current = false;
    // Retain the mounted window while a coach reads, even after more than 100 new events.
    if (!retainedEnd && lines[windowEnd - 1]) {
      const last = lines[windowEnd - 1];
      setHistoryEnd({ matchId, key: last.key, revision: last.revision });
    }
    const paneTop = element.getBoundingClientRect().top;
    const row = Array.from(element.querySelectorAll<HTMLElement>('[data-log-key]'))
      .find(row => row.getBoundingClientRect().bottom > paneTop);
    if (row) anchor.current = { key: row.dataset.logKey!, revision: Number(row.dataset.revision),
      offset: row.getBoundingClientRect().top - paneTop };
  };
  useLayoutEffect(() => {
    const element = pane.current;
    if (!element) return;
    if (minimized) { wasMinimized.current = true; return; }
    if (wasMinimized.current) { anchor.current = null; follow.current = true; wasMinimized.current = false; }
    if (pageChanged.current) {
      element.scrollTop = follow.current ? element.scrollHeight : 0;
      pageChanged.current = false;
    } else if (anchor.current) {
      const saved = anchor.current;
      const rows = Array.from(element.querySelectorAll<HTMLElement>('[data-log-key]'));
      const row = rows.find(row => row.dataset.logKey === saved.key) ?? rows.find(row => Number(row.dataset.revision) >= saved.revision);
      if (row) element.scrollTop += row.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset;
      anchor.current = null;
    } else if (follow.current) element.scrollTop = element.scrollHeight;
  }, [lines, fontSize, minimized, windowEnd]);
  useEffect(() => subscribeMatchLogPreferences(next => {
    if (JSON.stringify(next) === signature) return;
    rememberPosition();
    setPreferences(next);
  }), [signature, lines, historyEnd]);
  const choosePreference = (name: keyof MatchLogPreferences, value: boolean) =>
    saveMatchLogPreferences({ ...preferences, [name]: value });
  return <section className="match-event-log" data-font-size={fontSize} aria-label="Match log">
    <header><h3>Game Log</h3>{!minimized && <MatchTextSizeControls subject="log" size={fontSize} onChange={size => {
      rememberPosition(); setFontSize(size); saveMatchTextSize(fontKey, size);
    }}/>} {headerControls}</header>
    {showSettings && <div className="match-log-settings" role="group" aria-label="Game Log settings">
      {([['debug', 'Debug'], ['movement', 'Movement'], ['rollModifiers', 'Roll modifiers']] as const).map(([name, label]) =>
        <label key={name}><input type="checkbox" checked={preferences[name]}
          onChange={event => choosePreference(name, event.target.checked)}/>{label}</label>)}
    </div>}
    {!lines.length && <p>{loading ? 'Loading recorded history…' : unavailable ? 'Recorded history is unavailable for this match.' : 'No recorded events yet.'}</p>}
    {!minimized && lines.length > mountedLogLimit && <nav className="match-log-history" aria-label="Game Log history">
      <button type="button" aria-label="Earlier log events" disabled={windowStart === 0}
        onClick={() => showHistory(windowStart)}>Earlier</button>
      <span>{windowStart + 1} to {windowEnd} of {lines.length}</span>
      <button type="button" aria-label="Later log events" disabled={windowEnd === lines.length}
        onClick={() => showHistory(windowEnd + mountedLogLimit)}>Later</button>
      <button type="button" aria-label="Latest log events" disabled={!retainedEnd}
        onClick={() => showHistory(lines.length)}>Latest</button>
    </nav>}
    <div ref={pane} tabIndex={0} role="log" aria-label="Authoritative match events" aria-live={retainedEnd ? 'off' : 'polite'} className="match-event-scroll"
      style={{ fontSize: `${matchTextPixels[fontSize]}px`, lineHeight: 1.5 }}
      onScroll={rememberPosition}>
      {visibleLines.map(line => <p key={line.key} data-log-key={line.key} data-revision={line.revision} aria-live={line.announcement ? 'off' : undefined}>
        {line.dice && !line.dice.inline && <span className="match-log-dice">{line.dice.faces.map((face, index) =>
          <LogDie key={index} kind={line.dice?.kinds[index] ?? 'block'} face={face}
            selected={line.dice?.selected === index} uphill={line.dice?.uphill} chosenBy={line.dice?.chooser}/>)}</span>}
        <LogText line={line}/>{line.debug && <small className="match-log-debug">{line.debug}</small>}</p>)}
    </div>
  </section>;
}
