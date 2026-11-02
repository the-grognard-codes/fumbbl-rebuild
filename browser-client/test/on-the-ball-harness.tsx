import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';
import { GameView } from '../src/SetupPanel.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { MovementPlan, MovementRequest } from '../src/movement-protocol.ts';

declare global {
  interface Window {
    onBallFixture: { selection: SetupState; active: SetupState; plan: MovementPlan; emptyPlan: MovementPlan; finished: SetupState };
    onBallState: SetupState;
    onBallIntents: { operation: string; fields?: Record<string, unknown> }[];
    onBallPreviews: MovementRequest[];
    publishOnBall: (state: SetupState) => void;
  }
}
function App() {
  const [view, setView] = useState(window.onBallState);
  const [pending, setPending] = useState<string | null>(null);
  const [plan, setPlan] = useState<MovementPlan | null>(null);
  const [error, setError] = useState('');
  const fixture = window.onBallFixture;
  window.publishOnBall = state => { setView(state); setPending(null); setPlan(null); setError(''); };
  return <GameView hosted view={view} connected pending={pending} logUnavailable
    movementPlan={plan} movementError={error} movementRange={fixture.emptyPlan.range ?? null}
    requestMovementPreview={request => {
      setError('');
      if (!request) { setPlan(null); return; }
      window.onBallPreviews.push(request);
      const response = request.waypoints.length ? fixture.plan : fixture.emptyPlan;
      if (request.playerId !== response.route.playerId || request.kind !== 'move'
        || JSON.stringify(request.waypoints) !== JSON.stringify(response.waypoints)) {
        setPlan(null); setError('NO ROUTE'); return;
      }
      setPlan(response);
    }}
    mutate={(operation, fields) => { window.onBallIntents.push({ operation, fields }); setPending('pending'); }}/>
}
createRoot(document.getElementById('app')!).render(<App/>);
