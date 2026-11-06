// Bridge used by ComputerCoachNativeDecisionTest; stdin is a native public view.
import { readFileSync } from 'node:fs';
import { chooseComputerDecision } from '../src/computer-policy.mjs';

const { state, randomCoach, draw } = JSON.parse(readFileSync(0, 'utf8'));
if (randomCoach) state.computer = { ...state.computer, opponentId: 'coach-bugman-random', policyVersion: 'random-v1' };
process.stdout.write(JSON.stringify(chooseComputerDecision(state, { random: () => draw, recklessness: false })));
