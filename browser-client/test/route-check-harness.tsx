import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { LivePitch } from '../src/LivePitch.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { RoutePreview } from '../src/route-protocol.ts';
import type { MovementRange } from '../src/movement-protocol.ts';

declare global {
  interface Window {
    routeCase: { state: SetupState; route: RoutePreview | null; range?: MovementRange | null };
    updateRouteCase: (input: { state: SetupState; route: RoutePreview | null; range?: Window['routeCase']['range'] }) => void;
    undoCount: number;
    squareClicks: number;
  }
}
function App() {
  const [input, setInput] = useState(window.routeCase);
  window.updateRouteCase = next => flushSync(() => setInput(next));
  // Display real catalog artwork at native fixture coordinates; synthetic engine players have no frozen art mapping.
  const display = { ...input.state, players: input.state.players.map(player => ({ ...player,
    art: player.art ?? { rosterId: player.role === 'home' ? 'human' : 'orc', positionId: player.role === 'home' ? 'lineman' : 'orc-lineman' } })) };
  return <LivePitch view={display} selectedId="actor" actions={input.state.actions} routePreview={input.route} movementRange={input.range} waypoints={input.route ? [input.route.steps.at(-1)!] : []}
    onUndoWaypoint={() => { window.undoCount++; }} onSelectPlayer={() => {}} onSquare={() => { window.squareClicks++; }}/>;
}
createRoot(document.getElementById('app')!).render(<App/>);
