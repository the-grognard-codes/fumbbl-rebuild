import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';
import { GameView } from '../src/SetupPanel.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { MovementRange } from '../src/movement-protocol.ts';

declare global {
  interface Window {
    threatState: SetupState;
    threatRange: MovementRange;
    threatIntents: unknown[];
    publishThreat: (state: SetupState, connected?: boolean, pending?: string | null) => void;
  }
}
function App() {
  const [view, setView] = useState(window.threatState);
  const [connected, setConnected] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  window.publishThreat = (state, connected = true, pending = null) => { setView(state); setConnected(connected); setPending(pending); };
  return <GameView hosted view={view} connected={connected} pending={pending} logRecords={[]} movementRange={{ ...window.threatRange, revision: view.revision }}
    mutate={(operation, fields) => window.threatIntents.push({ operation, fields })}
    matchControls={{ fullscreen: false, error: '', toggleFullscreen() {}, exitMatch() {}, reconnect() {} }}/>
}
createRoot(document.getElementById('app')!).render(<App/>);
