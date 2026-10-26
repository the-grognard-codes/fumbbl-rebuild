import { useEffect, useState } from 'react';
import { cameraPreferenceKey, readCameraPreferences, saveCameraPreferences } from './camera-preferences.ts';
import type { CameraPreferences } from './camera-preferences.ts';

export function useCameraPreferences(matchId: string, role: string) {
  const key = cameraPreferenceKey(matchId, role);
  const [stored, setStored] = useState(() => ({ key, value: readCameraPreferences(key, role) }));
  let value = stored.value;
  if (stored.key !== key) {
    value = readCameraPreferences(key, role);
    setStored({ key, value });
  }
  useEffect(() => saveCameraPreferences(key, value), [key, value]);
  const update = (next: (current: CameraPreferences) => CameraPreferences) => {
    setStored(current => ({ key, value: next(current.key === key ? current.value : readCameraPreferences(key, role)) }));
  };
  return { preferences: value, update };
}
