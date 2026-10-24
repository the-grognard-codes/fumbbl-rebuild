const key = 'ffb.match.limited-action-tags';
const changed = 'ffb-match-limited-action-tags-changed';
let sessionValue: boolean | null = null;
export function readLimitedActionTags(): boolean {
  if (sessionValue !== null) return sessionValue;
  try { return localStorage.getItem(key) !== 'false'; } catch { return true; }
}
export function saveLimitedActionTags(value: boolean) {
  try { localStorage.setItem(key, String(value)); sessionValue = null; }
  catch { sessionValue = value; }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(changed));
}
export function subscribeLimitedActionTags(listener: (value: boolean) => void) {
  const update = () => listener(readLimitedActionTags());
  const storage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    try { if (event.storageArea !== localStorage) return; } catch { return; }
    sessionValue = null; update();
  };
  window.addEventListener(changed, update); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(changed, update); window.removeEventListener('storage', storage); };
}
