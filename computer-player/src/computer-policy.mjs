import { chooseDecision } from './policy.mjs';
import { chooseBogrukDecision } from './bogruk-policy.mjs';
export { isComputerGameOperation } from './computer-operations.mjs';

export function chooseComputerDecision(state, context = {}) {
  if (state.computer?.opponentId === 'coach-bogruk-weak') {
    if (state.computer.policyVersion !== 'bogruk-v1') throw Error('Unsupported Bogruk policy version');
    return chooseBogrukDecision(state, context);
  }
  return { decision: chooseDecision(state, context.random ?? Math.random, context.actionsThisTurn ?? 0, context.setupVariant ?? 0),
    reason: 'Choose a random offered action.', nextPolicyState: null };
}
