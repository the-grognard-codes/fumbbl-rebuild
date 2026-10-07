import type { SetupAction, SetupState } from './setup-protocol.ts';
import { pitchPushChoices } from './push-choice.ts';

export type MatchDecision = { title: string; key: string; kind: string; options: {
  id: string; label: string; kind: 'choice' | 'action'; face?: string; icon?: string
}[] };

// These names come from RerollPromptActions and ReRollSources. Automatic skill
// rerolls have no offered action and therefore never acquire a manual button.
const skillNames = ['Consummate Professional', 'Unstoppable Momentum', 'Monstrous Mouth', 'Mesmerising Dance',
  'Mesmerizing Dance', 'Thinking Man\'s Troll', 'Working in Tandem', 'Woodland Fury', 'Bounding Leap',
  'Bribery and Corruption', 'Pump up the Crowd', 'Star of the Show', 'Halfling Luck', 'Whirling Dervish',
  'Brilliant Coaching', 'Savage Blow', 'Blind Rage', 'Sure Hands', 'Sure Feet', 'The Ballista',
  'Lord of Chaos', 'Brawler', 'Hatred', 'Dodge', 'Catch', 'Pass', 'Swoop', 'Kick', 'Pro', 'Loner'];

export function decisionIcon(label: string): string | undefined {
  if (/^(?:Do not|Keep|Decline)\b/i.test(label)) return undefined;
  if (/^(?:Use|Try)\s+(?:team|mascot|brilliant coaching|pump up the crowd|star of the show)/i.test(label)) return 'resource';
  const skill = skillNames.find(name => new RegExp(`^Use ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\b|$)`, 'i').test(label));
  if (skill) return skill.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (/^Use\s+\S/.test(label)) return `custom:${label.slice(4)}`;
  return undefined;
}

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
    kind: view.prompt.kind,
    options: view.prompt.options.map(option => ({ id: option, label: option[0].toUpperCase() + option.slice(1), kind: 'choice' }))
  };
  const kind = promptOrder.find(candidate => ownActions.some(action => action.kind === candidate)
    && (candidate !== 'push' || !pitchPushChoices(view, ownActions).length));
  if (!kind) return null;
  const rollKinds = ['blockDie', 'reroll', 'skill'];
  const choices = ownActions.filter(action => action.kind === kind || rollKinds.includes(kind) && rollKinds.includes(action.kind));
  return { title: promptTitles[kind], key: `${view.revision}:${kind}`, kind,
    options: choices.map(action => {
      const face = action.kind === 'blockDie' ? /^Choose (SKULL|BOTH DOWN|PUSHBACK|POW\/PUSH|POW) \(die \d+\)$/.exec(action.label)?.[1] : undefined;
      const label = kind === 'followUp' ? /^Do not follow up$/i.test(action.label) ? 'No' : /^Follow up$/i.test(action.label) ? 'Yes' : action.label : action.label;
      return { id: action.id, label, kind: 'action', face, icon: rollKinds.includes(kind) ? decisionIcon(label) : undefined };
    }) };
}
