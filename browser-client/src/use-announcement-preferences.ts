import { useEffect, useState } from 'react';
import type { MatchAnnouncementEvent } from './match-announcements.ts';

const key = 'ffb.match.announcements.hold';
const hiddenKey = 'ffb.match.announcements.hidden';
const changed = 'ffb-match-announcements-changed';
export const announcementOptions: { kind: MatchAnnouncementEvent['kind']; label: string }[] = [
  { kind: 'touchdown', label: 'Touchdowns' }, { kind: 'turnover', label: 'Turnovers' },
  { kind: 'turnStart', label: 'Start of turn' }, { kind: 'kickoff', label: 'Kick-off events' },
  { kind: 'weather', label: 'Weather' }, { kind: 'halfTime', label: 'Half-time' }, { kind: 'fullTime', label: 'Full time' }
];
let sessionValue: boolean | undefined;
let sessionHidden: string[] | undefined;
function read(): boolean {
  if (sessionValue !== undefined) return sessionValue;
  try { return localStorage.getItem(key) === 'true'; } catch { return false; }
}
function readHidden(): string[] {
  if (sessionHidden) return sessionHidden;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(hiddenKey) ?? '[]');
    return Array.isArray(saved) ? announcementOptions.filter(option => saved.includes(option.kind)).map(option => option.kind) : [];
  } catch { return []; }
}
export function useAnnouncementPreferences() {
  const [holdAnnouncements, setHold] = useState(read);
  const [hiddenAnnouncements, setHidden] = useState(readHidden);
  useEffect(() => {
    const update = () => { setHold(read()); setHidden(readHidden()); };
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === hiddenKey || event.key === null) { sessionValue = undefined; sessionHidden = undefined; update(); }
    };
    window.addEventListener(changed, update); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(changed, update); window.removeEventListener('storage', storage); };
  }, []);
  const changeHoldAnnouncements = (hold: boolean) => {
    sessionValue = hold;
    try { localStorage.setItem(key, String(hold)); } catch { /* Keep the preference for this session. */ }
    window.dispatchEvent(new Event(changed));
  };
  const changeAnnouncementVisible = (kind: MatchAnnouncementEvent['kind'], visible: boolean) => {
    sessionHidden = readHidden().filter(value => value !== kind);
    if (!visible) sessionHidden.push(kind);
    try { localStorage.setItem(hiddenKey, JSON.stringify(sessionHidden)); } catch { /* Keep the preference for this session. */ }
    window.dispatchEvent(new Event(changed));
  };
  return { holdAnnouncements, changeHoldAnnouncements, hiddenAnnouncements, changeAnnouncementVisible };
}
