import type { DecisionOption, MatchDecision } from './match-decision.ts';

/** Keep exact offered IDs, including older combined reroll checkpoints. */
export function skillPromptOptions(decision: MatchDecision): { choices: DecisionOption[]; decline?: DecisionOption; preferred?: DecisionOption; timeoutDefault?: DecisionOption } {
  const options = decision.options.flatMap(option => option.choices ?? [option]);
  const decline = options.find(option => /(?:^|:)(?:skill:false|kick-skill:false|reroll:none)$/.test(option.id)
    || /^(?:Decline(?:\s|$)|Do not re-roll\b|Keep the roll\b|No$)/i.test(option.label));
  const preferred = options.find(option => ['dodge', 'sure-feet', 'sure-hands', 'pass', 'catch'].includes(option.icon ?? ''));
  const choices = options.filter(option => option !== decline
    && !(preferred && (option.icon === 'resource' || option.icon === 'pro')));
  // ReactiveDecision.decline uses these native continuations for timed optional prompts.
  // Untimed choices and unrecognized actions must not imply an automatic answer.
  const timeoutDefault = decision.reaction && decline
    && /(?:^|:)(?:reaction-decline|skill:false|reroll:none)$/.test(decline.id) ? decline : undefined;
  return { choices, decline, preferred, timeoutDefault };
}
