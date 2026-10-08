export type MatchLogPreferences = { debug: boolean; movement: boolean; rollModifiers: boolean };
export const defaultMatchLogPreferences: MatchLogPreferences = { debug: false, movement: false, rollModifiers: true };
const key = 'ffb.match.log.preferences';
const changed = 'ffb-match-log-preferences-changed';
let sessionPreferences: MatchLogPreferences | null = null;
export function readMatchLogPreferences(): MatchLogPreferences {
  if (sessionPreferences) return { ...sessionPreferences };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved !== 'object') return { ...defaultMatchLogPreferences };
    const item = saved as Record<string, unknown>;
    return Object.fromEntries(Object.entries(defaultMatchLogPreferences).map(([name, fallback]) =>
      [name, typeof item[name] === 'boolean' ? item[name] : fallback])) as MatchLogPreferences;
  } catch { return { ...defaultMatchLogPreferences }; }
}
export function saveMatchLogPreferences(preferences: MatchLogPreferences) {
  try { localStorage.setItem(key, JSON.stringify(preferences)); sessionPreferences = null; }
  catch { sessionPreferences = { ...preferences }; }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(changed, { detail: { ...preferences } }));
}
export function subscribeMatchLogPreferences(listener: (preferences: MatchLogPreferences) => void) {
  const onChange = (event: Event) => listener((event as CustomEvent<MatchLogPreferences>).detail);
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      try {
        if (event.storageArea !== localStorage) return;
      } catch { return; }
      sessionPreferences = null;
      listener(readMatchLogPreferences());
    }
  };
  window.addEventListener(changed, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(changed, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
