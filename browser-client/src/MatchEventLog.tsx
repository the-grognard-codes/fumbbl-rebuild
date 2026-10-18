import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { appendMatchLogLines } from './match-log.ts';
import type { MatchLogLine } from './match-log.ts';
import { PolygonDie } from './PolygonDie.tsx';
import { readMatchLogPreferences, saveMatchLogPreferences, subscribeMatchLogPreferences } from './match-log-preferences.ts';
import type { MatchLogPreferences } from './match-log-preferences.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { MatchTextSizeControls, matchTextPixels, readMatchTextSize, saveMatchTextSize } from './MatchTextSizeControls.tsx';
import type { MatchTextSize } from './MatchTextSizeControls.tsx';
import './match-log.css';

const fontKey = 'ffb.match.log.font-size';

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
    parts.push(<PolygonDie key={`die-${index}`} kind={dice.kinds[index] ?? 'd6'} face={face}/>);
    cursor = found.index + found[0].length;
  });
  if (unmatched.length) parts.unshift(<span key="unmatched" className="match-log-dice">{unmatched.map(index =>
    <PolygonDie key={index} kind={dice.kinds[index] ?? 'd6'} face={dice.faces[index]}/>)}</span>);
  if (cursor < line.text.length) parts.push(line.text.slice(cursor));
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>;
}

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
  const [fontSize, setFontSize] = useState<MatchTextSize>(() => readMatchTextSize(fontKey));
  const pane = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ key: string; revision: number; offset: number } | null>(null);
  const follow = useRef(true);
  const matchId = records[0]?.state.matchId;
  useLayoutEffect(() => { anchor.current = null; follow.current = true; }, [matchId]);
  const rememberPosition = () => {
    const element = pane.current;
    if (!element) return;
    if (element.scrollHeight - element.scrollTop - element.clientHeight <= 36) {
      follow.current = true;
      anchor.current = null;
      return;
    }
    follow.current = false;
    const paneTop = element.getBoundingClientRect().top;
    const row = Array.from(element.querySelectorAll<HTMLElement>('[data-log-key]'))
      .find(row => row.getBoundingClientRect().bottom > paneTop);
    if (row) anchor.current = { key: row.dataset.logKey!, revision: Number(row.dataset.revision),
      offset: row.getBoundingClientRect().top - paneTop };
  };
  useLayoutEffect(() => {
    const element = pane.current;
    if (!element) return;
    if (anchor.current) {
      const saved = anchor.current;
      const rows = Array.from(element.querySelectorAll<HTMLElement>('[data-log-key]'));
      const row = rows.find(row => row.dataset.logKey === saved.key) ?? rows.find(row => Number(row.dataset.revision) >= saved.revision);
      if (row) element.scrollTop += row.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset;
      anchor.current = null;
    } else if (follow.current) element.scrollTop = element.scrollHeight;
  }, [lines, fontSize]);
  useEffect(() => subscribeMatchLogPreferences(next => {
    if (JSON.stringify(next) === signature) return;
    rememberPosition();
    setPreferences(next);
  }), [signature, lines]);
  const choosePreference = (name: keyof MatchLogPreferences, value: boolean) =>
    saveMatchLogPreferences({ ...preferences, [name]: value });
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
    <div ref={pane} role="log" aria-label="Authoritative match events" aria-live="polite" className="match-event-scroll"
      style={{ fontSize: `${matchTextPixels[fontSize]}px`, lineHeight: 1.5 }}
      onScroll={rememberPosition}>
      {lines.map(line => <p key={line.key} data-log-key={line.key} data-revision={line.revision}>
        {line.dice && !line.dice.inline && <span className="match-log-dice">{line.dice.faces.map((face, index) =>
          <PolygonDie key={index} kind={line.dice?.kinds[index] ?? 'block'} face={face}
            selected={line.dice?.selected === index} uphill={line.dice?.uphill} chosenBy={line.dice?.chooser}/>)}</span>}
        <LogText line={line}/>{line.debug && <small className="match-log-debug">{line.debug}</small>}</p>)}
    </div>
  </section>;
}
