export type ThreatPreferences = {
  enabled: boolean; zoneColors: boolean; tackle: boolean; otherSkills: boolean;
  prehensileTail: boolean; divingTackle: boolean; tentacles: boolean; shadowing: boolean;
};
export const defaultThreatPreferences: Readonly<ThreatPreferences> = Object.freeze({
  enabled: true, zoneColors: true, tackle: true, otherSkills: true,
  prehensileTail: true, divingTackle: true, tentacles: true, shadowing: true,
});
export const stripeSkillControls = [
  ['prehensileTail', 'Prehensile Tail'], ['divingTackle', 'Diving Tackle'],
  ['tentacles', 'Tentacles'], ['shadowing', 'Shadowing'],
] as const;
const key = 'ffb.match.threat.preferences';
const changed = 'ffb-match-threat-preferences-changed';
let sessionPreferences: ThreatPreferences | null = null;

export function readThreatPreferences(): ThreatPreferences {
  if (sessionPreferences) return { ...sessionPreferences };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...defaultThreatPreferences };
    const item = saved as Record<string, unknown>;
    return Object.fromEntries(Object.entries(defaultThreatPreferences).map(([name, fallback]) =>
      [name, typeof item[name] === 'boolean' ? item[name] : fallback])) as ThreatPreferences;
  } catch { return { ...defaultThreatPreferences }; }
}

export function saveThreatPreferences(preferences: ThreatPreferences) {
  try { localStorage.setItem(key, JSON.stringify(preferences)); sessionPreferences = null; }
  catch { sessionPreferences = { ...preferences }; }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(changed));
}

export function subscribeThreatPreferences(listener: (preferences: ThreatPreferences) => void) {
  const update = () => listener(readThreatPreferences());
  const storage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    try { if (event.storageArea !== localStorage) return; } catch { return; }
    sessionPreferences = null; update();
  };
  window.addEventListener(changed, update);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(changed, update); window.removeEventListener('storage', storage); };
}
