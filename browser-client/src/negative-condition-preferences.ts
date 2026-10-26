const key = 'ffb.match.negative-condition-markers';
const changed = 'ffb-match-negative-condition-markers-changed';
let sessionValue: boolean | null = null;
export function readNegativeConditionMarkers(): boolean {
  if (sessionValue !== null) return sessionValue;
  try { return localStorage.getItem(key) !== 'false'; } catch { return true; }
}
export function saveNegativeConditionMarkers(value: boolean) {
  try { localStorage.setItem(key, String(value)); sessionValue = null; }
  catch { sessionValue = value; }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(changed));
}
export function subscribeNegativeConditionMarkers(listener: (value: boolean) => void) {
  const update = () => listener(readNegativeConditionMarkers());
  const storage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    try { if (event.storageArea !== localStorage) return; } catch { return; }
    sessionValue = null; update();
  };
  window.addEventListener(changed, update); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(changed, update); window.removeEventListener('storage', storage); };
}
