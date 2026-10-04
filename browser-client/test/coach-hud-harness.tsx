import { useState } from 'react';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';
import { createRoot } from 'react-dom/client';
import { GameView } from '../src/SetupPanel.tsx';
import type { SetupState } from '../src/setup-protocol.ts';

declare global {
  interface Window {
    hudState: SetupState;
    hudIntents: unknown[];
    hudMessages: string[];
    publishHud: (state: SetupState) => void;
  }
}
function App() {
  const [view, setView] = useState(window.hudState);
  const [pending, setPending] = useState<string | null>(null);
  const [sent, setSent] = useState<{ text: string; id: string } | null>(null);
  window.publishHud = state => { setView(state); setPending(null); };
  return <GameView hosted view={view} connected pending={pending}
    mutate={(operation, fields) => { window.hudIntents.push({ operation, fields }); setPending('pending'); }}
    sendChat={text => { window.hudMessages.push(text); setSent({ text, id: String(window.hudMessages.length) }); }} chatSent={sent}
    matchControls={{ fullscreen: false, error: '', toggleFullscreen() {}, exitMatch() {}, reconnect() {} }}/>
}
createRoot(document.getElementById('app')!).render(<App/>);
