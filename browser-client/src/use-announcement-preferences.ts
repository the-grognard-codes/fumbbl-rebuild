import { useEffect, useState } from 'react';

const key = 'ffb.match.announcements.hold';
const changed = 'ffb-match-announcements-changed';
let sessionValue: boolean | undefined;
function read(): boolean {
  if (sessionValue !== undefined) return sessionValue;
  try { return localStorage.getItem(key) === 'true'; } catch { return false; }
}

export function useAnnouncementPreferences() {
  const [holdAnnouncements, setHold] = useState(read);
  useEffect(() => {
    const update = () => setHold(read());
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) { sessionValue = undefined; update(); } };
    window.addEventListener(changed, update); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(changed, update); window.removeEventListener('storage', storage); };
  }, []);
  const changeHoldAnnouncements = (hold: boolean) => {
    sessionValue = hold;
    try { localStorage.setItem(key, String(hold)); } catch { /* Keep the preference for this session. */ }
    window.dispatchEvent(new Event(changed));
  };
  return { holdAnnouncements, changeHoldAnnouncements };
}
