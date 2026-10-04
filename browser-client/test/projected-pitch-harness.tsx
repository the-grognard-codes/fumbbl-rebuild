import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LivePitch } from '../src/LivePitch.tsx';
import type { SetupState } from '../src/setup-protocol.ts';

declare global {
  interface Window {
    initial: SetupState;
    intents: ({ player: string } | { x: number; y: number })[];
  }
}

function App() {
  const [selected, setSelected] = useState('human');
  return <LivePitch view={window.initial} selectedId={selected} actions={[]}
    routePreview={{ from: { x: 12, y: 7 }, steps: [{ x: 11, y: 7 }, { x: 10, y: 8 }] }}
    readOnly={window.initial.callerRole === 'spectator'}
    onSelectPlayer={id => { window.intents.push({ player: id }); setSelected(id); }}
    onSquare={(x, y) => window.intents.push({ x, y })}/>;
}

createRoot(document.getElementById('app')!).render(<App/>);
