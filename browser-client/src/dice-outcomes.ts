export type DiceOutcome = 'armor' | 'stun' | 'ko' | 'casualty' | 'bh' | 'mng' | 'ni' | 'stat' | 'dead';

export const diceOutcomes: Record<DiceOutcome, { label: string; color: string; casualty: boolean }> = {
  armor: { label: 'Armor broken', color: '#ffe17b', casualty: false },
  stun: { label: 'Stunned', color: '#ffe17b', casualty: false },
  ko: { label: 'Knocked out', color: '#ffe17b', casualty: false },
  casualty: { label: 'Casualty', color: '#ffe17b', casualty: false },
  bh: { label: 'Badly hurt', color: '#b2dfaa', casualty: true },
  mng: { label: 'Miss next game', color: '#f2cd78', casualty: true },
  ni: { label: 'Niggling injury', color: '#eba86c', casualty: true },
  stat: { label: 'Stat reduction', color: '#e6a5b3', casualty: true },
  dead: { label: 'Dead', color: '#ee9295', casualty: true },
};

function state(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value & 0xff : null;
}

/** Classify the native result/name, never recalculate an injury from its dice. */
export function casualtyOutcome(injury: unknown, serious: unknown, apothecary = false): DiceOutcome | undefined {
  const name = typeof serious === 'string' ? serious : '';
  if (state(injury) === 8 || /\(RIP\)/i.test(name)) return 'dead';
  if (/\(NI\)/i.test(name)) return 'ni';
  if (statInjury(name)) return 'stat';
  if (/\(MNG\)/i.test(name)) return 'mng';
  if (state(injury) === 6 || apothecary && state(injury) === 9) return 'bh';
  return undefined;
}

export function injuryOutcome(injury: unknown): DiceOutcome | undefined {
  const base = state(injury);
  return base === 4 ? 'stun' : base === 5 ? 'ko' : base !== null && [6, 7, 8].includes(base) ? 'casualty' : undefined;
}

export function statInjury(value: unknown): boolean {
  return typeof value === 'string' && /\(-(?:1\s*)?(?:MA|ST|AG|AV|PA)\)/i.test(value);
}
