// Resource IDs and injury labels come from CorePromptActions, including revision prefixes.
export function resourceDecision(actions, accept, random = null) {
  const injuries = actions.filter(action => action.kind === 'apothecary' && /(?:^|:)injury:(old|new)$/.test(action.id));
  if (injuries.length) return [...injuries].sort((a, b) => injuryHarm(a.label) - injuryHarm(b.label)
    || Number(b.id.endsWith('injury:old')) - Number(a.id.endsWith('injury:old')))[0];
  const resources = actions.filter(action => ['apothecary', 'bribe', 'argueTheCall'].includes(action.kind));
  if (!resources.length) return null;
  const decline = resources.find(action => /(?:apothecary|apothecaries|bribe|argue):no$/.test(action.id));
  const uses = resources.filter(action => action !== decline);
  if (!uses.length) return decline;
  if (decline && !accept()) return decline;
  return random ? uses[Math.min(uses.length - 1, Math.max(0, Math.floor(random() * uses.length)))] : uses[0];
}

function injuryHarm(label) {
  if (/dead|killed|RIP/i.test(label)) return 6;
  if (/-1\s*(AV|MA|PA|AG|ST)/i.test(label)) return 5;
  if (/niggling|\bNI\b/i.test(label)) return 4;
  if (/MNG|miss next game|seriously hurt|serious injury/i.test(label)) return 3;
  if (/badly hurt/i.test(label)) return 2;
  if (/knocked out/i.test(label)) return 1;
  return 0;
}
