import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';
import { GameView } from '../src/SetupPanel.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';
declare global { interface Window {
  adjustmentState: SetupState; adjustmentRecords: TranscriptRecord[]; adjustmentIntents: unknown[];
  publishAdjustment: (state: SetupState) => void;
} }
function App() {
  const [view, setView] = useState(window.adjustmentState);
  const [pending, setPending] = useState<string | null>(null);
  window.publishAdjustment = state => { setView(state); setPending(null); };
  return <GameView hosted view={view} connected pending={pending} logRecords={window.adjustmentRecords}
    mutate={(operation, fields) => { window.adjustmentIntents.push({ operation, fields }); setPending('pending'); }}
    matchControls={{ fullscreen: false, error: '', toggleFullscreen() {}, exitMatch() {}, reconnect() {} }}/>;
}
createRoot(document.getElementById('app')!).render(<App/>);
