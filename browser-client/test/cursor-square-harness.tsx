import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LivePitch } from '../src/LivePitch.tsx';
import { HostedResult } from '../src/HostedResult.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { MatchDecision } from '../src/match-decision.ts';

type Input = { view: SetupState; selectedId: string; readOnly?: boolean; playback?: boolean;
  interactionBlocked?: boolean; decision?: MatchDecision | null; draggingPlayerId?: string; replayResult?: boolean };
declare global {
  interface Window {
    cursorInput: Input;
    publishCursorInput: (input: Input) => void;
    cursorIntents: ({ player: string } | { x: number; y: number })[];
  }
}
function Harness() {
  const [input, setInput] = useState(window.cursorInput);
  window.publishCursorInput = setInput;
  if (input.replayResult) return <HostedResult matchId={input.view.matchId}
    result={{ formatVersion: 3, engineVersion: 'ffb-3.4.0-bb2025-m3d.1', ruleset: 'BB2025',
      catalogVersion: 'bb2025-exhibition-2026-09-25.1', presetId: 'exhibition-1150', presetVersion: 'bb2025-exhibition-2026-09-25.1',
      matchId: input.view.matchId, finalRevision: 10, eventCount: 11, homeScore: 0, awayScore: 0 }}
    event={{ revision: input.view.revision, kind: 'action', state: input.view }} index={input.view.revision}
    connected pending={!!input.interactionBlocked} onLoad={() => {}} onReplay={() => {}}
    logRecords={[]} logLoading={false} logUnavailable={false} chatMessages={[]} chatLoading={false} chatUnavailable={false}/>;
  return <LivePitch {...input} actions={input.view.actions}
    onSelectPlayer={player => { window.cursorIntents.push({ player }); setInput(current => ({ ...current, selectedId: player })); }}
    onSquare={(x, y) => window.cursorIntents.push({ x, y })}/>;
}
createRoot(document.getElementById('app')!).render(<Harness/>);
