import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LivePitch } from '../src/LivePitch.tsx';
import { GameView } from '../src/SetupPanel.tsx';
import { usePitchPlayback } from '../src/use-pitch-playback.ts';
import type { BlockContext } from '../src/block-context.ts';
import type { DiceMoment } from '../src/dice-presentation.ts';
import type { SetupState } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';
import journeys from './fixtures/block-visibility.json';
import multipleJourney from './fixtures/block-visibility-multiple.json';
import '../../site/src/assets/site.css';
import '../../site/src/assets/play.css';
import '../src/play-brand.css';

type Input = { view: SetupState; records: TranscriptRecord[]; mode: 'pitch' | 'game' | 'replay';
  animated: boolean; enabled: boolean; proposal: BlockContext | null; dice: DiceMoment | null };
type Journey = { blitz: boolean; uphill: boolean; multiple?: boolean; ready: SetupState; rolled: SetupState; resolved: SetupState; records: TranscriptRecord[] };
const fixtures = [...journeys, { ...multipleJourney, blitz: false, uphill: false, multiple: true }] as Journey[];
declare global {
  interface Window {
    publishBlockVisibility: (input: Partial<Input>, reset?: boolean) => number;
    blockVisibilityCommitted: number;
    blockVisibilityIntents: unknown[];
    blockVisibilityFrames: { revision: number; active: boolean; context: BlockContext | null }[];
  }
}
window.blockVisibilityIntents = [];
window.blockVisibilityFrames = [];

function PlaybackPitch({ input }: { input: Input }) {
  const { pitchView, playbackActive, diceMoment } = usePitchPlayback(input.view, input.records, input.enabled, 4, 'replay');
  useLayoutEffect(() => {
    window.blockVisibilityFrames.push({ revision: pitchView.revision, active: playbackActive, context: pitchView.blockContext ?? null });
  }, [pitchView, playbackActive]);
  return <><output id="block-playback-state" data-revision={pitchView.revision} data-active={playbackActive}/>
    <LivePitch view={pitchView} selectedId="" actions={[]} readOnly diceMoment={diceMoment}
      animateBlockMarkers={input.animated} onSelectPlayer={() => {}} onSquare={() => {}}/></>;
}

function Harness() {
  const [caseIndex, setCaseIndex] = useState(0);
  const [frame, setFrame] = useState<'ready' | 'rolled' | 'resolved'>('rolled');
  const [instance, setInstance] = useState(0);
  const nextPublication = useRef(0);
  const [publication, setPublication] = useState(0);
  const [input, setInput] = useState<Input>({ view: fixtures[0].rolled, records: fixtures[0].records,
    mode: 'pitch', animated: true, enabled: true, proposal: null, dice: null });
  window.publishBlockVisibility = (next, reset = false) => {
    const serial = ++nextPublication.current;
    setInput(previous => ({ ...previous, ...next }));
    if (reset) setInstance(previous => previous + 1);
    setPublication(serial);
    return serial;
  };
  // A publication is ready only after the keyed child mounts and its effects attach.
  // Old cleared frames can have the same marker counts as the requested new frame.
  useEffect(() => { window.blockVisibilityCommitted = publication; }, [publication]);
  const chooseFixture = (index: number, nextFrame = frame) => {
    setCaseIndex(index); setFrame(nextFrame); setInstance(previous => previous + 1);
    setInput(previous => ({ ...previous, view: { ...fixtures[index][nextFrame], callerRole: previous.view.callerRole },
      records: fixtures[index].records, proposal: null, dice: null }));
  };
  return <><output id="block-harness-state" hidden data-publication={publication} data-role={input.view.callerRole}
    data-revision={input.view.revision} data-mode={input.mode}/><header className="block-review-controls">
    <label>Native case <select aria-label="Native case" value={caseIndex} onChange={event => chooseFixture(Number(event.target.value))}>
      {fixtures.map((journey, index) => <option key={index} value={index}>{journey.multiple ? 'Multiple Block' : journey.blitz ? 'Blitz' : 'Block'} / {journey.uphill ? 'uphill' : 'offensive assist'}</option>)}
    </select></label>
    <label>Frame <select aria-label="Frame" value={frame} onChange={event => chooseFixture(caseIndex, event.target.value as typeof frame)}>
      <option value="ready">Private proposal ready</option><option value="rolled">Committed roll</option><option value="resolved">Resolved</option>
    </select></label>
    <label>Viewer <select aria-label="Viewer" value={input.view.callerRole} onChange={event => setInput({ ...input,
      view: { ...input.view, callerRole: event.target.value as SetupState['callerRole'] } })}>
      <option value="home">Home</option><option value="away">Away</option><option value="spectator">Spectator</option>
    </select></label>
    <label>Component <select aria-label="Component" value={input.mode} onChange={event => setInput({ ...input, mode: event.target.value as Input['mode'] })}>
      <option value="pitch">Production pitch</option><option value="game">Production GameView</option><option value="replay">Production replay hook</option>
    </select></label>
    <label><input type="checkbox" checked={input.animated} onChange={event => setInput({ ...input, animated: event.target.checked })}/> Animate markers</label>
    <span>Revision {input.view.revision}; native fixtures, no game commands sent.</span>
  </header>
    <div className={input.mode === 'game' ? 'block-review-game' : 'block-review-pitch'} key={`${input.mode}:${instance}`}>
      {input.mode === 'game' ? <GameView hosted view={input.view} connected pending={null} logRecords={input.records}
        mutate={(operation, fields) => window.blockVisibilityIntents.push({ operation, fields })}
        matchControls={{ fullscreen: false, error: '', toggleFullscreen() {}, exitMatch() {}, reconnect() {} }}/>
        : input.mode === 'replay' ? <PlaybackPitch input={input}/>
          : <LivePitch view={input.view} selectedId={input.view.blockContext?.blocks[0].playerId ?? ''} actions={[]}
            blockPreview={input.proposal} diceMoment={input.dice} animateBlockMarkers={input.animated}
            readOnly={input.view.callerRole === 'spectator'} onSelectPlayer={() => {}} onSquare={() => {}}/>}
    </div>
  </>;
}
createRoot(document.getElementById('app')!).render(<Harness/>);
