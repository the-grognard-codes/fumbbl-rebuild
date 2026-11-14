import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { GameView } from '../src/GameView.tsx';
import { DiagnosticsBoundary, useDiagnostics } from '../src/PerformanceDiagnostics.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';

declare global { interface Window {
  domInput: { view: SetupState; records: TranscriptRecord[] };
  publishDom: (input: typeof window.domInput) => void;
  diagnosticsMode: (mode: 'off' | 'graph') => void;
} }
function Harness() {
  const [input, setInput] = useState(window.domInput);
  const diagnostics = useDiagnostics();
  window.publishDom = input => flushSync(() => setInput(input));
  window.diagnosticsMode = mode => flushSync(() => diagnostics?.service?.setMode(mode));
  return <GameView hosted view={input.view} connected pending={null} logRecords={input.records}
    mutate={() => { throw Error('The DOM workload must not send gameplay commands'); }}
    matchControls={{ fullscreen: false, error: '', toggleFullscreen() {}, exitMatch() {}, reconnect() {} }}/>;
}
createRoot(document.getElementById('app')!).render(<DiagnosticsBoundary environment="dev"><Harness/></DiagnosticsBoundary>);
