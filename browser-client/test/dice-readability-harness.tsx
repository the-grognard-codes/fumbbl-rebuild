import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { GameMenu } from '../src/GameMenu.tsx';
import { PitchDiceGroup } from '../src/PitchDiceGroup.tsx';
import { PitchDecisionOverlay } from '../src/PitchDecisionOverlay.tsx';
import type { DiceMoment } from '../src/dice-presentation.ts';
import type { SetupState } from '../src/setup-protocol.ts';
import type { MatchDecision } from '../src/match-decision.ts';
import '../src/coach-match.css';

type ReadabilityInput = { groups: DiceMoment[]; decision?: MatchDecision; moment?: DiceMoment; show?: boolean };
declare global {
  interface Window {
    readabilityState: SetupState;
    readabilityInput: ReadabilityInput;
    publishReadability: (input: ReadabilityInput) => void;
    readabilityActions: string[];
  }
}

function Harness() {
  const [input, setInput] = useState(window.readabilityInput);
  const viewport = useRef<HTMLDivElement>(null);
  window.publishReadability = input => flushSync(() => setInput(input));
  return <main className="play-runtime live-match-page">
    <GameMenu view={window.readabilityState} connected pending={false} mutate={() => { throw Error('No game mutations in this harness'); }}
      records={[]} logLoading={false} logUnavailable={false}/>
    <div ref={viewport} style={{ width: '100%', height: 500 }}>
      {input.show !== false && ['live', 'replay'].map(mode => <section key={mode} data-surface={mode}>
        {input.groups.map((group, index) => <div key={index} data-roll-case={index}>
          <PitchDiceGroup group={group} forceStatic={mode === 'replay'} role="status"/>
        </div>)}
      </section>)}
      <PitchDecisionOverlay decision={input.decision} diceMoment={input.moment} disabled={false} viewport={viewport}
        onAction={id => window.readabilityActions.push(id)}/>
    </div>
  </main>;
}
createRoot(document.getElementById('app')!).render(<Harness/>);
