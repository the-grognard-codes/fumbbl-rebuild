import { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePitchPlayback } from '../src/use-pitch-playback.ts';
import { LivePitch } from '../src/LivePitch.tsx';
import { DiceFace } from '../src/DiceFace.tsx';
import { matchDecision } from '../src/match-decision.ts';
import type { SetupState } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';
import type { RoutePreview } from '../src/route-protocol.ts';

type Input = { view: SetupState; records: TranscriptRecord[]; enabled: boolean; mode: 'live' | 'replay'; interactive?: boolean;
  requestPending?: string | null; speed?: number; snapshotKey?: number };
declare global {
  interface Window {
    playbackInput: Input;
    publishPlayback: (input: Input) => void;
    playbackActions: string[];
    beginProvisional: (route: RoutePreview) => void;
    playbackFrames: { ms: number; revision: number; x: number | null; actorX: number | null; ballX: number | null;
      carrier: string | null; active: boolean; duration: number; faces: string[]; labels: string[] }[];
  }
}
function Harness() {
  const [input, setInput] = useState(window.playbackInput);
  window.publishPlayback = setInput;
  window.playbackActions ??= [];
  const { pitchView, playbackActive, diceMoment, diceSnapshot, movementDuration, beginProvisional, synchronizing } =
    usePitchPlayback(input.view, input.records, input.enabled, input.speed ?? 1, input.mode, input.requestPending ?? null, input.snapshotKey);
  window.beginProvisional = beginProvisional;
  useLayoutEffect(() => {
    window.playbackFrames.push({ ms: Date.now(), revision: pitchView.revision, x: pitchView.players[0]?.x ?? null,
      actorX: pitchView.players.find(player => player.id === 'actor')?.x ?? null,
      ballX: pitchView.ball?.x ?? null, carrier: pitchView.ballState?.carrierPlayerId ?? null, active: playbackActive,
      duration: movementDuration, faces: diceMoment?.faces ?? [], labels: diceMoment?.groups?.map(group => group.label) ?? [] });
  }, [pitchView, playbackActive, diceMoment, movementDuration]);
  return <main className="play-runtime">
    <output id="playback-state" data-revision={pitchView.revision} data-x={pitchView.players[0]?.x}
      data-active={playbackActive} data-synchronizing={synchronizing} data-duration={movementDuration} data-roll-key={diceMoment?.rollKey ?? ''}/>
    {!playbackActive && (input.view.prompt || input.view.actions.length > 0) && <button id="required-choice">Required choice</button>}
    <LivePitch view={pitchView} selectedId="" actions={[]} diceMoment={diceMoment} readOnly={!input.interactive || playbackActive} playback={playbackActive}
      diceSnapshot={diceSnapshot && !playbackActive}
      movementDuration={playbackActive ? movementDuration : 0}
      decision={input.interactive && !playbackActive ? matchDecision(input.view, input.view.actions) : null}
      onDecisionAction={id => window.playbackActions.push(id)}
      onSelectPlayer={() => {}} onSquare={() => {}}/>
    <div id="dice-specimens">{['1','2','3','4','5','6','SKULL','BOTH DOWN','PUSHBACK','PUSHBACK','POW/PUSH','POW','unknown'].map((face,index) => <DiceFace key={index} face={face} selected={index===11}/>)}</div>
  </main>;
}
createRoot(document.getElementById('app')!).render(<Harness/>);
