/** Pictograms follow the server's BB2025 injury names, never roll or resolve injuries. */
const injuryNames = new Set([
  'knocked-out', 'badly-hurt', 'smashed-knee', 'dead', 'seriously-hurt', 'serious-injury',
  'head-injury', 'broken-arm', 'dislocated-shoulder', 'dislocated-hip'
]);

export function injuryIcon(label: string): string | undefined {
  if (/^Use (?:Apothecary|Wandering Apothecary|Plague Doctor)$/.test(label)) return 'injury:apothecary';
  const name = label.replace(/^Use (?:Apothecary|Wandering Apothecary|Plague Doctor): /, '')
    .replace(/^(?:Accept|Keep|Choose) /, '').replace(/\s*\(.*\)$/, '')
    .toLowerCase().replace(/\s+/g, '-');
  return injuryNames.has(name) ? `injury:${name}` : undefined;
}
