/** Approved BB2025 use cases only. Stable account keys match the server policy. */
export const skillUseCases = [
  ['catch', 'Catch — catch reroll', 'always-use'],
  ['dodge-movement', 'Dodge — movement reroll', 'always-use'],
  ['dodge-block', 'Dodge — block Stumble protection', 'always-use'],
  ['sure-feet', 'Sure Feet — Rush reroll', 'always-use'],
  ['fend', 'Fend — prevent follow-up', 'always-ask'],
  ['steady-footing', 'Steady Footing — avoid falling over', 'always-use'],
  ['strip-ball', 'Strip Ball — make a pushed carrier drop the ball', 'always-use'],
  ['sure-hands', 'Sure Hands — pickup reroll', 'always-use'],
  ['tackle-movement', 'Tackle — prevent the Dodge movement reroll', 'always-use'],
  ['tackle-block', 'Tackle — prevent Dodge block protection', 'always-use'],
  ['taunt', 'Taunt — require follow-up', 'always-ask'],
  ['wrestle-attacker', 'Wrestle — as attacker', 'always-ask'],
  ['wrestle-defender', 'Wrestle — as defender', 'always-ask'],
  ['pass-ball', 'Pass — ball pass reroll', 'always-use'],
  ['pass-bomb', 'Pass — bomb throw reroll', 'always-use'],
  ['grab', 'Grab — expanded push destinations', 'always-use'],
  ['stand-firm', 'Stand Firm — decline a push', 'always-ask'],
  ['pick-me-up', 'Pick-me-up — recovery attempts', 'always-ask'],
] as const;
export type SkillUseCase = typeof skillUseCases[number][0];
export type SkillUseMode = 'always-use' | 'always-ask';
export type SkillUsePreferences = Record<SkillUseCase, SkillUseMode>;
export type SkillUseControls = {
  preferences: SkillUsePreferences | null; pending: boolean; error: string; saved: boolean;
  load: () => void; update: (useCase: SkillUseCase, mode: SkillUseMode) => void;
};

export function decodeSkillUsePreferences(value: unknown): SkillUsePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== skillUseCases.length) throw Error('Invalid skill use preferences');
  for (const [key] of skillUseCases) {
    if (!Object.hasOwn(value, key) || !['always-use', 'always-ask'].includes((value as Record<string, string>)[key]))
      throw Error('Invalid skill use preference');
  }
  return { ...value } as SkillUsePreferences;
}
