export type SkillMarkerPreferences = {
  showOwn: boolean; showOpponent: boolean; showBase: boolean; showAcquired: boolean;
  showTraits: boolean; showBigGuyNegatraits: boolean;
  style: 'text' | 'illustrated'; size: 'small' | 'medium' | 'large';
};

export const defaultSkillMarkerPreferences: Readonly<SkillMarkerPreferences> = Object.freeze({
  showOwn: true, showOpponent: true, showBase: false, showAcquired: true,
  showTraits: true, showBigGuyNegatraits: true, style: 'text', size: 'medium',
});
const key = 'ffb.match.skill-marker.preferences';
const changed = 'ffb-match-skill-marker-preferences-changed';
let sessionPreferences: SkillMarkerPreferences | null = null;

export function readSkillMarkerPreferences(): SkillMarkerPreferences {
  if (sessionPreferences) return { ...sessionPreferences };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...defaultSkillMarkerPreferences };
    const item = saved as Record<string, unknown>;
    const result = { ...defaultSkillMarkerPreferences };
    for (const name of ['showOwn', 'showOpponent', 'showBase', 'showAcquired', 'showTraits', 'showBigGuyNegatraits'] as const)
      if (typeof item[name] === 'boolean') result[name] = item[name];
    if (item.style === 'text' || item.style === 'illustrated') result.style = item.style;
    if (item.size === 'small' || item.size === 'medium' || item.size === 'large') result.size = item.size;
    return result;
  } catch { return { ...defaultSkillMarkerPreferences }; }
}

export function saveSkillMarkerPreferences(preferences: SkillMarkerPreferences) {
  try { localStorage.setItem(key, JSON.stringify(preferences)); sessionPreferences = null; }
  catch { sessionPreferences = { ...preferences }; }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(changed));
}

export function subscribeSkillMarkerPreferences(listener: (preferences: SkillMarkerPreferences) => void) {
  const update = () => listener(readSkillMarkerPreferences());
  const storage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    try { if (event.storageArea !== localStorage) return; } catch { return; }
    sessionPreferences = null; update();
  };
  window.addEventListener(changed, update);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(changed, update); window.removeEventListener('storage', storage); };
}
