import { createRoot } from 'react-dom/client';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';
import '../src/coach-match.css';

import { LiveDugouts } from '../src/LiveDugouts.tsx';
import type { SetupPlayer } from '../src/setup-protocol.ts';

declare global {
  interface Window { dugoutPlayers: SetupPlayer[]; dugoutSelections: string[] }
}

createRoot(document.getElementById('app')!).render(<main className="play-runtime live-match-page"><section className="hosted-match coach-match">
  <LiveDugouts players={window.dugoutPlayers} homeName="Rovers" awayName="Crew"
    onSelect={id => window.dugoutSelections.push(id)}/>
</section></main>);
