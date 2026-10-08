import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MatchEventLog } from '../src/MatchEventLog.tsx';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';
import '../src/live-pitch.css';
import '../src/coach-match.css';
declare global { interface Window { logFixture: TranscriptRecord[]; publishLogRecords: (records: TranscriptRecord[]) => void } }
function App() {
  const [records, setRecords] = useState(window.logFixture);
  window.publishLogRecords = setRecords;
  return <main className="play-runtime live-match-page" data-fixture-match={records[0]?.state.matchId}><section className="coach-match hosted-match"><div className="match-history"><MatchEventLog records={records} loading={false} unavailable={false}/></div></section></main>;
}
createRoot(document.getElementById('app')!).render(<App/>);
