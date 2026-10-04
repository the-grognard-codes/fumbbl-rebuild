import { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePitchPlayback } from '../src/use-pitch-playback.ts';
import { LivePitch } from '../src/LivePitch.tsx';
import { DiceFace } from '../src/DiceFace.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

type Input = { view: SetupState; records: TranscriptRecord[]; enabled: boolean; mode: 'live' | 'replay' };
declare global {
  interface Window {
    playbackInput: Input;
    publishPlayback: (input: Input) => void;
    playbackFrames: { revision: number; x: number | null; active: boolean }[];
  }
}
function Harness() {
  const [input, setInput] = useState(window.playbackInput);
  window.publishPlayback = setInput;
  const { pitchView, playbackActive, diceMoment } = usePitchPlayback(input.view, input.records, input.enabled, 1, input.mode);
  useLayoutEffect(() => {
    window.playbackFrames.push({ revision: pitchView.revision, x: pitchView.players[0]?.x ?? null, active: playbackActive });
  }, [pitchView, playbackActive]);
  return <main className="play-runtime">
    <output id="playback-state" data-revision={pitchView.revision} data-x={pitchView.players[0]?.x}
      data-active={playbackActive} data-roll-key={diceMoment?.rollKey ?? ''}/>
    {!playbackActive && input.view.actions.some(action => action.kind === 'blockDie') && <button id="required-choice">Required block choice</button>}
    <LivePitch view={pitchView} selectedId="" actions={[]} diceMoment={diceMoment} readOnly onSelectPlayer={() => {}} onSquare={() => {}}/>
    <div id="dice-specimens">{['1','2','3','4','5','6','SKULL','BOTH DOWN','PUSHBACK','PUSHBACK','POW/PUSH','POW','unknown'].map((face,index) => <DiceFace key={index} face={face} selected={index===11}/>)}</div>
  </main>;
}
createRoot(document.getElementById('app')!).render(<Harness/>);
