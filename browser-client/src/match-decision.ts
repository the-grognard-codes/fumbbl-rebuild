import type { SetupAction, SetupState } from './setup-protocol.ts';

export type MatchDecision = { title: string; key: string; options: { id: string; label: string; kind: 'choice' | 'action'; face?: string }[] };

const promptTitles: Record<string, string> = {
  blockDie: 'Choose a block die', reroll: 'Use a re-roll?', skill: 'Use a skill?',
  apothecary: 'Apothecary decision', argueTheCall: 'Argue the call?',
  interception: 'Choose an interceptor', followUp: 'Follow up?', push: 'Choose a push square'
};
const promptOrder = ['blockDie', 'reroll', 'skill', 'apothecary', 'argueTheCall', 'interception', 'followUp', 'push'];

/** Only server-offered choices belonging to the signed-in coach enter a decision dialog. */
export function matchDecision(view: SetupState, actions: SetupAction[]): MatchDecision | null {
  if (view.callerRole === 'spectator') return null;
  const ownActions = actions.filter(action => action.actor === view.callerRole);
  if (view.prompt?.actor === view.callerRole) return {
    title: view.prompt.kind === 'coin' ? 'Call the coin toss' : 'Choose to receive or kick',
    key: view.prompt.id,
    options: view.prompt.options.map(option => ({ id: option, label: option[0].toUpperCase() + option.slice(1), kind: 'choice' }))
  };
  const kind = promptOrder.find(candidate => ownActions.some(action => action.kind === candidate));
  if (!kind) return null;
  const choices = ownActions.filter(action => action.kind === kind || kind === 'blockDie' && action.kind === 'reroll');
  return { title: promptTitles[kind], key: `${view.revision}:${kind}`,
    options: choices.map(action => {
      const face = action.kind === 'blockDie' ? /^Choose (SKULL|BOTH DOWN|PUSHBACK|POW\/PUSH|POW) \(die \d+\)$/.exec(action.label)?.[1] : undefined;
      return { id: action.id, label: action.label, kind: 'action', face };
    }) };
}
