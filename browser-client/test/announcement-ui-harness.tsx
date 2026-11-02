import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LivePitch } from '../src/LivePitch.tsx';
import { GameMenu } from '../src/GameMenu.tsx';
import { usePitchPlayback } from '../src/use-pitch-playback.ts';
import '../src/play-brand.css';
import '../src/coach-match.css';
import type { SetupState } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

type Input = { view: SetupState; records: TranscriptRecord[]; enabled: boolean; mode: 'live' | 'replay'; speed?: number;
  snapshotKey?: number; colors?: { accent: string; secondary: string } };
declare global {
  interface Window { announcementInput: Input; publishAnnouncements: (input: Input) => void; pitchClicks: number }
}
function Harness() {
  const [input, setInput] = useState(window.announcementInput);
  window.publishAnnouncements = setInput;
  window.pitchClicks ??= 0;
  const playback = usePitchPlayback(input.view, input.records, input.enabled, input.speed ?? 1, input.mode, null, input.snapshotKey);
  return <main className="play-runtime live-match-page">
    <style>{`body { margin: 0; background: #091320; } #focus-anchor, #required-choice { position: fixed; left: 8px; top: 8px; z-index: 200; } .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }`}</style>
    <button id="focus-anchor">Match controls</button>
    <output id="announcement-state" data-revision={playback.pitchView.revision} data-active={playback.playbackActive}/>
    {!playback.playbackActive && input.view.actions.length > 0 && <button id="required-choice">Required choice</button>}
    <div className="coach-match hosted-match"><div className="match-layout"><div className="match-board">
    <GameMenu view={input.view} connected pending={false} mutate={() => { window.pitchClicks++; }}
      records={input.records} logLoading={false} logUnavailable={false}/>
    <LivePitch view={playback.pitchView} selectedId="" actions={[]} showToolbar={false} debugOpen={false}
      readOnly={playback.playbackActive} playback={playback.playbackActive}
      diceMoment={playback.diceMoment} movementDuration={playback.movementDuration}
      splash={playback.announcement ? { announcement: playback.announcement, onDismiss: playback.dismissAnnouncement,
        hold: playback.holdAnnouncements, exiting: playback.announcementExiting, rate: playback.announcementRate, colors: input.colors } : undefined}
      onSquare={() => { window.pitchClicks++; }} onSelectPlayer={() => { window.pitchClicks++; }}/>
    </div></div></div>
  </main>;
}
createRoot(document.getElementById('app')!).render(<Harness/>);
