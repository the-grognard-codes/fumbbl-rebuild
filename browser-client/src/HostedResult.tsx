import { useEffect, useMemo, useState } from 'react';

import { LivePitch } from './LivePitch.tsx';
import { DiceFace } from './DiceFace.tsx';
import { recordDice } from './dice-presentation.ts';
import type { MatchResultMetadata, ReplayEvent } from './result-protocol.ts';
import { MatchHistory } from './MatchHistory.tsx';
import type { TranscriptRecord } from './transcript-protocol.ts';
import type { ChatMessage } from './chat-protocol.ts';
import { usePitchPlayback } from './use-pitch-playback.ts';
import { matchTeamName } from './match-team-name.ts';

export function HostedResult({ matchId, result, event, index, pending, connected, onLoad, onReplay,
  logRecords, logLoading, logUnavailable, chatMessages, chatLoading, chatUnavailable }: {
  matchId: string; result: MatchResultMetadata | null; event: ReplayEvent | null; index: number | null;
  pending: boolean; connected: boolean; onLoad: () => void; onReplay: (index: number) => void;
  logRecords: TranscriptRecord[]; logLoading: boolean; logUnavailable: boolean;
  chatMessages: ChatMessage[]; chatLoading: boolean; chatUnavailable: boolean;
}) {
  const ready = connected && !pending;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [skipAnimations, setSkipAnimations] = useState(true);
  const [seekInput, setSeekInput] = useState('1');
  const [replayBusy, setReplayBusy] = useState(false);
  const [displayRevision, setDisplayRevision] = useState<number | null>(null);
  useEffect(() => { if (index !== null) setSeekInput(String(index + 1)); }, [index]);
  useEffect(() => { if (!connected) setPlaying(false); }, [connected]);
  useEffect(() => { if (!event) { setReplayBusy(false); setDisplayRevision(null); } }, [event]);
  useEffect(() => {
    if (!playing || !ready || replayBusy || !result || index === null) return;
    if (index >= result.eventCount - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => onReplay(index + 1), 1000 / speed);
    return () => clearTimeout(timer);
  }, [playing, ready, replayBusy, result?.eventCount, index, speed]);
  const turnStops = useMemo(() => {
    const stops = [{ index: 0, label: 'Match start' }];
    const seen = new Set<string>();
    for (const record of logRecords) {
      if (record.index === 0 || record.actor === 'system' || record.state.phase !== 'PLAY') continue;
      const turn = record.actor === 'home' ? record.state.homeTurn : record.state.awayTurn;
      const key = `${record.state.half}:${record.actor}:${turn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stops.push({ index: record.index, label: `Half ${record.state.half} · ${matchTeamName(record.state, record.actor)} turn ${turn}` });
    }
    return stops;
  }, [logRecords]);
  const shownRevision = skipAnimations ? event?.revision ?? -1 : displayRevision ?? event?.revision ?? -1;
  const names = event?.state ?? logRecords[0]?.state ?? {};
  return <section aria-label="Authoritative result" className="hosted-result">
    <p>Completed match {matchId}. Final score and recorded events are loaded from the game server.</p>
    <button type="button" onClick={onLoad} disabled={!ready}>Reload result</button>
    {pending && <p role="status">Loading saved match history…</p>}
    {result && <>
      <div className="match-scoreboard" aria-label="Final score"><div><span>{matchTeamName(names, 'home')}</span><strong>{result.homeScore}</strong></div><p>Full time</p><div><span>{matchTeamName(names, 'away')}</span><strong>{result.awayScore}</strong></div></div>
      <p>{result.eventCount} recorded events · {result.ruleset}</p>
      <nav className="replay-controls" aria-label="Replay controls">
        <button type="button" onClick={() => onReplay(0)} disabled={!ready || index === 0}>First</button>
        <button type="button" onClick={() => onReplay(Math.max(0, (index ?? 0) - 1))} disabled={!ready || index === null || index <= 0}>Previous</button>
        <button type="button" onClick={() => onReplay(Math.min(result.eventCount - 1, (index ?? -1) + 1))} disabled={!ready || index === result.eventCount - 1}>Next</button>
        <button type="button" onClick={() => onReplay(result.eventCount - 1)} disabled={!ready || index === result.eventCount - 1}>Last</button>
      </nav>
      <div className="replay-seek" aria-label="Replay navigation">
        <label>Turn <select value={[...turnStops].reverse().find(stop => stop.index <= (index ?? 0))?.index ?? 0}
          onChange={choice => onReplay(Number(choice.target.value))} disabled={!ready}>
          {turnStops.map(stop => <option key={stop.index} value={stop.index}>{stop.label}</option>)}
        </select></label>
        <form onSubmit={submit => { submit.preventDefault(); const number = Number(seekInput);
          if (ready && Number.isInteger(number) && number >= 1 && number <= result.eventCount) onReplay(number - 1); }}>
          <label>Event <input type="number" min="1" max={result.eventCount} value={seekInput} onChange={change => setSeekInput(change.target.value)}/></label>
          <button type="submit" disabled={!ready}>Seek</button>
        </form>
        <button type="button" onClick={() => { if (playing) setPlaying(false);
          else { if (index === null || index >= result.eventCount - 1) onReplay(0); setPlaying(true); } }} disabled={!ready}>{playing ? 'Pause' : 'Play'}</button>
        <label>Speed <select value={speed} onChange={choice => setSpeed(Number(choice.target.value))}>
          {[0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}×</option>)}
        </select></label>
        <label className="replay-skip"><input type="checkbox" checked={skipAnimations} onChange={choice => setSkipAnimations(choice.target.checked)}/> Skip animations</label>
      </div>
      {event ? <section aria-label="Replay event"><h2>Event {event.revision + 1} of {result.eventCount}: {event.kind}</h2>
        <p>Half {event.state.half} · Drive {event.state.drive} · {matchTeamName(event.state, 'home')} turn {event.state.homeTurn} · {matchTeamName(event.state, 'away')} turn {event.state.awayTurn} · {event.state.weather}</p>
        <ReplayBoard event={event} records={logRecords} skipAnimations={skipAnimations} speed={speed} onBusy={setReplayBusy} onRevision={setDisplayRevision}/>
      </section> : <p>Choose First or Last to view the recorded pitch.</p>}
      {result.formatVersion >= 2 && <MatchHistory matchId={matchId} records={logRecords.filter(record => record.revision <= shownRevision)} logLoading={logLoading} logUnavailable={logUnavailable}
        homeTeamName={matchTeamName(names, 'home')} awayTeamName={matchTeamName(names, 'away')}
        messages={chatMessages.filter(message => message.revision <= shownRevision)} chatLoading={chatLoading} chatUnavailable={chatUnavailable || result.formatVersion < 3}
        connected={connected} sending={false} canSend={false} onSend={() => {}} sendError="" sent={null}/>}
    </>}
  </section>;
}

function ReplayBoard({ event, records, skipAnimations, speed, onBusy, onRevision }: {
  event: ReplayEvent; records: TranscriptRecord[]; skipAnimations: boolean; speed: number;
  onBusy: (busy: boolean) => void; onRevision: (revision: number) => void;
}) {
  const { pitchView, playbackActive, diceMoment } = usePitchPlayback(event.state, records, !skipAnimations, speed);
  useEffect(() => { onBusy(playbackActive); onRevision(pitchView.revision); }, [playbackActive, pitchView.revision]);
  const moments = records[pitchView.revision] ? recordDice(records[pitchView.revision]) : [];
  const visibleDice = playbackActive ? diceMoment : moments.at(-1) ?? null;
  return <><LivePitch view={pitchView} selectedId="" actions={[]} readOnly diceMoment={visibleDice} onSelectPlayer={() => {}} onSquare={() => {}}/>
    {moments.length > 1 && <div className="replay-dice" aria-label="Dice at this event">{moments.map((moment, index) =>
      <div key={index}><span>{moment.label}</span>{moment.faces.map((face, faceIndex) => <DiceFace key={faceIndex} face={face} selected={moment.selected === faceIndex}/>)}</div>)}</div>}
  </>;
}
