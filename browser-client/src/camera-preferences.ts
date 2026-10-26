import type { PitchEnd } from './pitch-projection.ts';

export type CameraAngle = 30 | 40 | 50 | 90;
export type CameraPreferences = { angle: CameraAngle; end: PitchEnd; overheadEnd: PitchEnd };
export const cameraPreferenceKey = (matchId: string, role: string) => `ffb.match.camera.${encodeURIComponent(matchId)}.${role}`;

export function defaultCameraPreferences(role: string): CameraPreferences {
  const end = role === 'away' ? 'away' : 'home';
  return { angle: 40, end, overheadEnd: end };
}

export function readCameraPreferences(key: string, role: string): CameraPreferences {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (saved && typeof saved === 'object') {
      const item = saved as Record<string, unknown>;
      if ([30, 40, 50, 90].includes(Number(item.angle)) && typeof item.angle === 'number'
        && (item.end === 'home' || item.end === 'away') && (item.overheadEnd === 'home' || item.overheadEnd === 'away'))
        return { angle: item.angle as CameraAngle, end: item.end, overheadEnd: item.overheadEnd };
    }
  } catch { /* Storage can be unavailable; camera controls still work in memory. */ }
  return defaultCameraPreferences(role);
}

export function saveCameraPreferences(key: string, preferences: CameraPreferences) {
  try { sessionStorage.setItem(key, JSON.stringify(preferences)); }
  catch { /* Recovery persistence is best effort when browser storage is blocked. */ }
}

export function cycleCameraAngle(current: CameraPreferences): CameraPreferences {
  const angle = ({ 30: 40, 40: 50, 50: 90, 90: 30 } as const)[current.angle];
  return { ...current, angle, overheadEnd: angle === 90 ? current.end : current.overheadEnd };
}

export function flipCameraEnd(current: CameraPreferences): CameraPreferences {
  return { ...current, end: current.end === 'home' ? 'away' : 'home' };
}

export function effectiveCameraEnd(current: CameraPreferences): PitchEnd {
  return current.angle === 90 ? current.overheadEnd : current.end;
}
