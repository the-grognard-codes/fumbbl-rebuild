import { useEffect, useState } from 'react';
import { readSkillMarkerPreferences, saveSkillMarkerPreferences, subscribeSkillMarkerPreferences, type SkillMarkerPreferences } from './skill-marker-preferences.ts';

export function useSkillMarkerPreferences() {
  const [preferences, setPreferences] = useState(readSkillMarkerPreferences);
  useEffect(() => subscribeSkillMarkerPreferences(setPreferences), []);
  const change = <K extends keyof SkillMarkerPreferences>(name: K, value: SkillMarkerPreferences[K]) =>
    saveSkillMarkerPreferences({ ...readSkillMarkerPreferences(), [name]: value });
  return { preferences, change };
}
