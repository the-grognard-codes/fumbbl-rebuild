import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';
import { GameView } from '../src/SetupPanel.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { RoutePreview } from '../src/route-protocol.ts';

declare global {
  interface Window {
    roundupState: SetupState;
    roundupIntents: { operation: string; fields?: Record<string, unknown> }[];
    publishRoundup: (view: SetupState) => void;
  }
}
function App() {
  const [view, setView] = useState(window.roundupState);
  const [pending, setPending] = useState<string | null>(null);
  const [route, setRoute] = useState<RoutePreview | null>(null);
  window.publishRoundup = next => { setView(next); setPending(null); setRoute(null); };
  return <GameView hosted view={view} connected pending={pending} logUnavailable
    routePreview={route}
    requestRoutePreview={points => {
      const player = view.players.find(player => player.id === view.activePlayerId);
      if (!points.length || player?.x == null || player.y == null) { setRoute(null); return; }
      setRoute({ routeVersion: 3, playerId: player.id, from: { x: player.x, y: player.y }, remaining: 6,
        actor: view.actor, revision: view.revision,
        steps: points.map(point => ({ ...point, dodge: 0, rush: 0, dodgeModifier: 0, reactions: [], checks: [] })) });
    }}
    mutate={(operation, fields) => { window.roundupIntents.push({ operation, fields }); setPending('pending'); }}/>
}
createRoot(document.getElementById('app')!).render(<App/>);
