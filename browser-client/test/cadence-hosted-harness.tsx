import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameView } from '../src/SetupPanel.tsx';
import { HostedResult } from '../src/HostedResult.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';
import '../../site/src/assets/site.css';
import '../../site/src/assets/play.css';
import '../src/play-brand.css';

type Input = { view: SetupState; records: TranscriptRecord[]; replay: boolean };
declare global { interface Window {
  cadenceHostedInput: Input;
  publishCadenceHosted: (input: Input) => void;
  cadenceIntents: unknown[];
} }
function Harness() {
  const [input, setInput] = useState(window.cadenceHostedInput);
  window.publishCadenceHosted = setInput;
  const { view, records } = input;
  if (!input.replay) return <GameView hosted view={view} connected pending={null} logRecords={records}
    mutate={(...args) => window.cadenceIntents.push(args)}/>;
  return <HostedResult matchId={view.matchId} result={{ formatVersion: 3, engineVersion: 'fixture', ruleset: 'BB2025',
    catalogVersion: 'fixture', presetId: 'fixture', presetVersion: 'fixture', matchId: view.matchId,
    finalRevision: records.length - 1, eventCount: records.length, homeScore: 0, awayScore: 0 }}
    event={{ revision: view.revision, kind: 'ACTION', state: view }} index={view.revision} connected pending={false}
    onLoad={() => {}} onReplay={revision => setInput(previous => ({ ...previous, view: records[revision].state }))}
    logRecords={records} logLoading={false} logUnavailable={false} chatMessages={[]} chatLoading={false} chatUnavailable={false}/>;
}
createRoot(document.getElementById('app')!).render(<main className="play-runtime"><Harness/></main>);
