import { useEffect, useState } from 'react';

const key = 'ffb.match.dice.preferences';
const changed = 'ffb-match-dice-preferences-changed';
type DicePreferences = { showIcons: boolean; showText: boolean };
const defaults: DicePreferences = { showIcons: true, showText: true };
let sessionValue: DicePreferences | undefined;

function read(): DicePreferences {
  if (sessionValue) return sessionValue;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    return { showIcons: typeof saved?.showIcons === 'boolean' ? saved.showIcons : true,
      showText: typeof saved?.showText === 'boolean' ? saved.showText : true };
  } catch { return defaults; }
}

/** Shared by live, replay, and menu instances, including browsers denying storage. */
export function useDicePreferences() {
  const [preferences, setPreferences] = useState(read);
  useEffect(() => {
    const update = () => setPreferences(read());
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) { sessionValue = undefined; update(); }
    };
    window.addEventListener(changed, update); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(changed, update); window.removeEventListener('storage', storage); };
  }, []);
  const change = (name: keyof DicePreferences, visible: boolean) => {
    sessionValue = { ...read(), [name]: visible };
    try { localStorage.setItem(key, JSON.stringify(sessionValue)); } catch { /* Keep session preferences. */ }
    window.dispatchEvent(new Event(changed));
  };
  return { preferences, change };
}
