import type { SetupAction, SetupState } from './setup-protocol.ts';
import { pitchPushChoices } from './push-choice.ts';
import { injuryIcon } from './injury-presentation.ts';
import type { DieKind } from './die-geometry.ts';
import type { PresentedRoll } from './dice-presentation.ts';

export type DecisionOption = { id: string; label: string; kind: 'choice' | 'action'; face?: string; dieKind?: DieKind; icon?: string; playerName?: string; choices?: DecisionOption[] };
export type MatchDecision = { title: string; key: string; kind: string; options: DecisionOption[];
  playerName?: string; instruction?: string;
  originalFaces?: string[]; originalRolls?: PresentedRoll[]; originalLabel?: string; uphill?: boolean;
  proTest?: { face: string; successful: boolean; rollKey?: string } };

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
  kickSkill: 'Use the Kick skill?', blockDie: 'Choose a block die', rerollDie: 'Choose a die to reroll', proTestReroll: 'Reroll the Pro test?', reroll: 'Use a re-roll?', skill: 'Use a skill?',
  apothecary: 'Apothecary decision', argueTheCall: 'Argue the call?',
  interception: 'Choose an interceptor', followUp: 'Follow up?', push: 'Choose a push square'
};
const promptOrder = ['kickSkill', 'rerollDie', 'proTestReroll', 'blockDie', 'reroll', 'skill', 'apothecary', 'argueTheCall', 'interception', 'followUp', 'push'];

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
  const rollKinds = ['blockDie', 'rerollDie', 'proTestReroll', 'reroll', 'skill'];
  const choices = ownActions.filter(action => action.kind === kind || rollKinds.includes(kind) && rollKinds.includes(action.kind));
  const multipleInjuries = kind === 'apothecary' && choices.some(action => /(?:^|:)apothecaries:/.test(action.id));
  const options: DecisionOption[] = choices.map(action => {
      const face = action.kind === 'blockDie' || action.kind === 'rerollDie' ? /^(?:Choose|Reroll) (SKULL|BOTH DOWN|PUSHBACK|POW\/PUSH|POW) \(die \d+\)$/.exec(action.label)?.[1] : undefined;
      const label = kind === 'followUp' ? /^Do not follow up$/i.test(action.label) ? 'No' : /^Follow up$/i.test(action.label) ? 'Yes' : action.label : action.label;
      const option: DecisionOption = { id: action.id, label, kind: 'action', face, ...(face ? { dieKind: 'block' as const } : {}), icon: kind === 'apothecary' ? injuryIcon(label) : rollKinds.includes(kind) ? decisionIcon(label) : undefined };
      if (multipleInjuries && action.target && 'playerId' in action.target) {
        const playerId = action.target.playerId;
        option.playerName = view.players.find(player => player.id === playerId)?.name;
      }
      return option;
    });
  const grouped: DecisionOption[] = [];
  for (const option of options) {
    // Resource alternatives retain their native accounting choices; only skill
    // variants share a single source icon and a local, explicit choice list.
    const existing = kind !== 'apothecary' && option.icon && option.icon !== 'resource' ? grouped.find(item => item.icon === option.icon) : undefined;
    if (existing) {
      existing.choices ??= [{ ...existing }]; existing.choices.push(option);
      const name = skillNames.find(name => decisionIcon(`Use ${name}`) === existing.icon);
      existing.label = name ? `Use ${name}` : existing.label.replace(/ on dice? .*/, '');
    } else grouped.push({ ...option });
  }
  if (kind === 'apothecary') {
    const choosingInjury = choices.some(action => /(?:^|:)injury:(?:old|new)$/.test(action.id));
    const target = choices.find(action => action.target && 'playerId' in action.target)?.target;
    return { title: choosingInjury ? 'Choose Apothecary Result' : 'Use Apothecary?',
      key: `${view.revision}:${kind}`, kind, options: grouped,
      playerName: !multipleInjuries && target && 'playerId' in target ? view.players.find(player => player.id === target.playerId)?.name : undefined,
      instruction: choosingInjury ? 'Choose the injury to apply. The apothecary has been spent.'
        : multipleInjuries ? 'Choose a player to treat, or accept all injuries to preserve your available staff.'
        : 'Accept the injury to save your apothecary, or use an available apothecary.' };
  }
  return { title: promptTitles[kind], key: `${view.revision}:${kind}`, kind, options: grouped };
}
