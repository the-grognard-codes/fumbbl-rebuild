import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';
import { GameView } from '../src/SetupPanel.tsx';
import { HostedResult } from '../src/HostedResult.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { MatchResultMetadata } from '../src/result-protocol.ts';

type Input = { view: SetupState; replay: boolean };
declare global { interface Window {
  markerInput: Input; publishMarkerState: (input: Input) => void; markerIntents: unknown[];
} }
function Harness() {
  const [input, setInput] = useState(window.markerInput);
  window.publishMarkerState = setInput;
  const view = input.view;
  const result: MatchResultMetadata = { formatVersion: 3, engineVersion: 'ffb-3.4.0-bb2025-m3d.1', ruleset: 'BB2025',
    catalogVersion: 'bb2025-exhibition-2026-09-25.1', presetId: 'exhibition-1150', presetVersion: 'bb2025-exhibition-2026-09-25.1',
    matchId: view.matchId, finalRevision: 10, eventCount: 11, homeScore: 0, awayScore: 0 };
  return input.replay ? <HostedResult matchId={view.matchId} result={result} event={{ revision: view.revision, kind: 'action', state: view }}
    index={view.revision} pending={false} connected onLoad={() => {}} onReplay={() => {}}
    logRecords={[]} logLoading={false} logUnavailable={false} chatMessages={[]} chatLoading={false} chatUnavailable={false}/>
    : <GameView hosted view={view} connected pending={null} mutate={(...args) => window.markerIntents.push(args)}
      logRecords={[]} logUnavailable matchControls={{ fullscreen: false, error: '', toggleFullscreen() {}, exitMatch() {}, reconnect() {} }}/ >;
}
createRoot(document.getElementById('app')!).render(<Harness/>);
