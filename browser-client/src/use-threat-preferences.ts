import { useEffect, useState } from 'react';
import { readThreatPreferences, saveThreatPreferences, subscribeThreatPreferences, type ThreatPreferences } from './threat-preferences.ts';

export function useThreatPreferences() {
  const [preferences, setPreferences] = useState(readThreatPreferences);
  useEffect(() => subscribeThreatPreferences(setPreferences), []);
  const change = (name: keyof ThreatPreferences, enabled: boolean) =>
    saveThreatPreferences({ ...preferences, [name]: enabled });
  return { preferences, change };
}
