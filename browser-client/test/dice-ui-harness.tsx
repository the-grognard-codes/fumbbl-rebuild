import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LivePitch } from '../src/LivePitch.tsx';
import { matchDecision } from '../src/match-decision.ts';
import { reportedDice } from '../src/dice-presentation.ts';
import { MatchDecisionDialog } from '../src/MatchDecisionDialog.tsx';
import { decodeSetupStateValue, type SetupState } from '../src/setup-protocol.ts';

type Input = { view: SetupState; report?: Record<string, unknown>; disabled?: boolean; readOnly?: boolean; replay?: boolean };
declare global {
  interface Window { diceInput: Input; publishDice: (input: Input) => void; diceActions: string[] }
}
function Harness() {
  const [input, setInput] = useState(window.diceInput);
  window.publishDice = setInput;
  const view = decodeSetupStateValue(input.view, input.view.callerRole === 'spectator');
  const decision = input.readOnly ? null : matchDecision(view, view.actions);
  return <main className="play-runtime"><LivePitch view={view} selectedId="actor" actions={view.actions}
    diceMoment={input.report ? reportedDice(input.report) : null}
    decision={decision && ['blockDie', 'reroll', 'skill'].includes(decision.kind) ? decision : null} decisionDisabled={input.disabled ?? false}
    readOnly={input.readOnly ?? false} playback={input.replay ?? false}
    onDecisionAction={id => { window.diceActions.push(id); setInput({ ...input, disabled: true }); }}
    onSelectPlayer={() => {}} onSquare={() => {}}/>
    {decision?.kind === 'followUp' && <MatchDecisionDialog decision={decision} disabled={input.disabled ?? false}
      activeX={view.players.find(player => player.id === view.activePlayerId)?.x ?? null}
      onChoice={id => { window.diceActions.push(id); setInput({ ...input, disabled: true }); }}
      onAction={id => { window.diceActions.push(id); setInput({ ...input, disabled: true }); }}/>}</main>;
}
createRoot(document.getElementById('app')!).render(<Harness/>);
