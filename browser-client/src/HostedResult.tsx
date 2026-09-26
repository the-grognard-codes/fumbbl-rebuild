import { LivePitch } from './LivePitch.tsx';
import type { MatchResultMetadata, ReplayEvent } from './result-protocol.ts';

export function HostedResult({ matchId, result, event, index, pending, connected, onLoad, onReplay }: {
  matchId: string; result: MatchResultMetadata | null; event: ReplayEvent | null; index: number | null;
  pending: boolean; connected: boolean; onLoad: () => void; onReplay: (index: number) => void;
}) {
  const ready = connected && !pending;
  return <section aria-label="Authoritative result" className="hosted-result">
    <p>Completed match {matchId}. Final score and recorded events are loaded from the game server.</p>
    <button type="button" onClick={onLoad} disabled={!ready}>Reload result</button>
    {pending && <p role="status">Loading saved match history…</p>}
    {result && <>
      <div className="match-scoreboard" aria-label="Final score"><div><span>Home</span><strong>{result.homeScore}</strong></div><p>Full time</p><div><span>Away</span><strong>{result.awayScore}</strong></div></div>
      <p>{result.eventCount} recorded events · {result.ruleset}</p>
      <nav className="replay-controls" aria-label="Replay controls">
        <button type="button" onClick={() => onReplay(0)} disabled={!ready || index === 0}>First</button>
        <button type="button" onClick={() => onReplay(Math.max(0, (index ?? 0) - 1))} disabled={!ready || index === null || index <= 0}>Previous</button>
        <button type="button" onClick={() => onReplay(Math.min(result.eventCount - 1, (index ?? -1) + 1))} disabled={!ready || index === result.eventCount - 1}>Next</button>
        <button type="button" onClick={() => onReplay(result.eventCount - 1)} disabled={!ready || index === result.eventCount - 1}>Last</button>
      </nav>
      {event ? <section aria-label="Replay event"><h2>Event {event.revision + 1} of {result.eventCount}: {event.kind}</h2>
        <p>Half {event.state.half} · Drive {event.state.drive} · Home turn {event.state.homeTurn} · Away turn {event.state.awayTurn} · {event.state.weather}</p>
        <LivePitch view={event.state} selectedId="" actions={[]} readOnly onSelectPlayer={() => {}} onSquare={() => {}}/>
      </section> : <p>Choose First or Last to view the recorded pitch.</p>}
    </>}
  </section>;
}
