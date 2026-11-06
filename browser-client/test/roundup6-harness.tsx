import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameView } from '../src/GameView.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';
import type { MovementPlan, MovementRequest } from '../src/movement-protocol.ts';
import type { RoutePreview } from '../src/route-protocol.ts';
import '../../site/src/assets/site.css';
import '../../site/src/assets/play.css';
import '../src/play-brand.css';

type Input = { view: SetupState; records: TranscriptRecord[]; route?: RoutePreview };
declare global { interface Window {
  roundup6Input: Input;
  publishRoundup6: (input: Input) => void;
  roundup6Intents: unknown[];
  roundup6Previews: (MovementRequest | null)[];
} }
function Harness() {
  const [input, setInput] = useState(window.roundup6Input);
  const [pending, setPending] = useState<string | null>(null);
  const [plan, setPlan] = useState<MovementPlan | null>(null);
  window.roundup6Previews ??= [];
  window.publishRoundup6 = next => { setInput(next); setPending(null); setPlan(null); };
  return <GameView hosted view={input.view} connected pending={pending} logRecords={input.records}
    movementPlan={plan} requestMovementPreview={input.route ? intent => {
      window.roundup6Previews.push(intent);
      if (!intent) { setPlan(null); return; }
      const player = input.view.players.find(player => player.id === intent.playerId)!;
      const route = { ...input.route!, playerId: intent.playerId, revision: input.view.revision,
        actor: input.view.actor, from: { x: player.x!, y: player.y! },
        steps: intent.waypoints.length ? input.route!.steps : [] };
      setPlan({ ...intent, planVersion: 1, route });
    } : undefined}
    mutate={(operation, fields) => { window.roundup6Intents.push({ operation, fields }); setPending(operation); }}/>;
}
createRoot(document.getElementById('app')!).render(<main className="play-runtime live-match-page"><Harness/></main>);
