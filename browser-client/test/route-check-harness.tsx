import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { LivePitch } from '../src/LivePitch.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { RoutePreview } from '../src/route-protocol.ts';

declare global {
  interface Window {
    routeCase: { state: SetupState; route: RoutePreview | null };
    updateRouteCase: (input: { state: SetupState; route: RoutePreview | null }) => void;
  }
}
function App() {
  const [input, setInput] = useState(window.routeCase);
  window.updateRouteCase = next => flushSync(() => setInput(next));
  return <LivePitch view={input.state} selectedId="actor" actions={input.state.actions} routePreview={input.route} waypoints={input.route ? [input.route.steps.at(-1)!] : []}
    readOnly onSelectPlayer={() => {}} onSquare={() => {}}/>;
}
createRoot(document.getElementById('app')!).render(<App/>);
