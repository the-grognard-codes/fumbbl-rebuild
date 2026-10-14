/** Pictograms follow the server's ruleset-specific injury names, never roll or resolve injuries. */
const injuryNames = new Set([
  'knocked-out', 'badly-hurt', 'broken-ribs', 'groin-strain', 'gouged-eye', 'broken-jaw',
  'fractured-arm', 'fractured-leg', 'smashed-hand', 'pinched-nerve', 'damaged-back',
  'smashed-knee', 'smashed-hip', 'smashed-ankle', 'serious-concussion', 'fractured-skull',
  'broken-neck', 'smashed-collar-bone', 'dead', 'poisoned', 'seriously-hurt', 'serious-injury',
  'head-injury', 'broken-arm', 'neck-injury', 'dislocated-shoulder', 'dislocated-hip'
]);

export function injuryIcon(label: string): string | undefined {
  if (/^Use (?:Apothecary|Wandering Apothecary|Plague Doctor)$/.test(label)) return 'injury:apothecary';
  const name = label.replace(/^Use (?:Apothecary|Wandering Apothecary|Plague Doctor): /, '')
    .replace(/^(?:Accept|Keep|Choose) /, '').replace(/\s*\(.*\)$/, '')
    .toLowerCase().replace(/\s+/g, '-');
  return injuryNames.has(name) ? `injury:${name}` : undefined;
}
