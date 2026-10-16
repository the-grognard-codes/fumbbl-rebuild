import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameView } from '../src/SetupPanel.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { MovementPlan, MovementRequest } from '../src/movement-protocol.ts';
import type { RoutePoint, RouteStep } from '../src/route-protocol.ts';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';

declare global {
  interface Window { waypointState: SetupState; waypointRequests: (MovementRequest | null)[]; waypointMutations: unknown[] }
}

function App() {
  const view = window.waypointState;
  const [plan, setPlan] = useState<MovementPlan | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const preview = (request: MovementRequest | null) => {
    window.waypointRequests.push(request);
    if (!request) { setPlan(null); return; }
    const player = view.players.find(player => player.id === request.playerId)!;
    const from = { x: player.x!, y: player.y! }, points = [...request.waypoints];
    const target = view.players.find(player => player.id === request.targetPlayerId);
    if (request.kind === 'blitz' && target) {
      const end = points.at(-1) ?? from;
      if (Math.max(Math.abs(end.x - target.x!), Math.abs(end.y - target.y!)) > 1)
        points.push({ x: target.x! - 1, y: target.y! });
    }
    const steps: RouteStep[] = [];
    let current: RoutePoint = from;
    for (const point of points) {
      while (current.x !== point.x || current.y !== point.y) {
        current = { x: current.x + Math.sign(point.x - current.x), y: current.y + Math.sign(point.y - current.y) };
        steps.push({ ...current, dodge: 0, rush: 0, dodgeModifier: 0, reactions: [], checks: [] });
      }
    }
    const endpoint = steps.at(-1) ?? from;
    // These are controlled server forecasts; native calculations have separate regression coverage.
    const range = { rangeVersion: 2 as const, playerId: player.id, from: endpoint, remaining: 8 - steps.length,
      normalRemaining: 6 - steps.length, normal: [{ x: endpoint.x + 1, y: endpoint.y }],
      full: [{ x: endpoint.x + 1, y: endpoint.y }], revision: view.revision };
    setPlan({ planVersion: 1, kind: request.kind, targetPlayerId: request.targetPlayerId, waypoints: points,
      route: { routeVersion: 3, playerId: player.id, from, remaining: 8, steps, revision: view.revision, actor: 'home' },
      ...{ range } });
  };
  return <GameView hosted view={view} connected pending={pending} movementPlan={plan} requestMovementPreview={preview}
    mutate={(operation, fields) => { window.waypointMutations.push({ operation, fields }); setPending('pending'); }}/>;
}
createRoot(document.getElementById('app')!).render(<App/>);
