import { useState } from 'react';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';
import { createRoot } from 'react-dom/client';
import { GameView } from '../src/SetupPanel.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

declare global {
  interface Window {
    hudState: SetupState;
    hudIntents: unknown[];
    hudMessages: string[];
    hudRecords?: TranscriptRecord[];
    publishHud: (state: SetupState, setupErrors?: string[]) => void;
  }
}
function App() {
  const [view, setView] = useState(window.hudState);
  const [setupErrors, setSetupErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [sent, setSent] = useState<{ text: string; id: string } | null>(null);
  window.publishHud = (state, errors = []) => { setView(state); setSetupErrors(errors); setPending(null); };
  return <GameView hosted view={view} connected pending={pending} setupErrors={setupErrors}
    logRecords={window.hudRecords ?? []}
    mutate={(operation, fields) => { window.hudIntents.push({ operation, fields }); setPending('pending'); }}
    sendChat={text => { window.hudMessages.push(text); setSent({ text, id: String(window.hudMessages.length) }); }} chatSent={sent}
    matchControls={{ fullscreen: false, error: '', toggleFullscreen() {}, exitMatch() {}, reconnect() {} }}/>
}
createRoot(document.getElementById('app')!).render(<App/>);
