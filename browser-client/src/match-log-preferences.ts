export type MatchLogPreferences = { debug: boolean; movement: boolean; rollModifiers: boolean };
export const defaultMatchLogPreferences: MatchLogPreferences = { debug: false, movement: false, rollModifiers: true };
const key = 'ffb.match.log.preferences';
export function readMatchLogPreferences(): MatchLogPreferences {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved !== 'object') return { ...defaultMatchLogPreferences };
    const item = saved as Record<string, unknown>;
    return Object.fromEntries(Object.entries(defaultMatchLogPreferences).map(([name, fallback]) =>
      [name, typeof item[name] === 'boolean' ? item[name] : fallback])) as MatchLogPreferences;
  } catch { return { ...defaultMatchLogPreferences }; }
}
export function saveMatchLogPreferences(preferences: MatchLogPreferences) {
  try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Keep this browser session's choices. */ }
}
