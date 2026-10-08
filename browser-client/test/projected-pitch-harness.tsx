import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LivePitch } from '../src/LivePitch.tsx';
import type { SetupAction, SetupState } from '../src/setup-protocol.ts';
import type { DiceMoment } from '../src/dice-presentation.ts';

declare global {
  interface Window {
    initial: SetupState;
    initialDice?: DiceMoment | null;
    initialActions?: SetupAction[];
    initialPinnedAction?: SetupAction;
    intents: ({ player: string } | { x: number; y: number })[];
    selectionReports?: ({ x: number; width: number } | null)[];
    updatePitchView?: (view: SetupState) => void;
  }
}

function recordSelectionPosition(position: { x: number; width: number } | null) {
  (window.selectionReports ??= []).push(position);
}

function App() {
  const [selected, setSelected] = useState('human');
  const [view, setView] = useState(window.initial);
  window.updatePitchView = setView;
  return <LivePitch view={view} selectedId={selected} actions={window.initialActions ?? []}
    pinnedAction={window.initialPinnedAction} diceMoment={window.initialDice}
    routePreview={{ routeVersion: 2, playerId: 'human', from: { x: 12, y: 7 }, remaining: 6, revision: view.revision, actor: 'home',
      steps: [{ x: 11, y: 7, dodge: 0, rush: 0, dodgeModifier: 0, reactions: [] }, { x: 10, y: 8, dodge: 0, rush: 0, dodgeModifier: 0, reactions: [] }] }}
    readOnly={view.callerRole === 'spectator'}
    onSelectionPosition={recordSelectionPosition}
    onSelectPlayer={id => { window.intents.push({ player: id }); setSelected(id); }}
    onSquare={(x, y) => window.intents.push({ x, y })}/>;
}

createRoot(document.getElementById('app')!).render(<App/>);
