import { useEffect, useState } from 'react';

export const hudOpacityKey = 'ffb.match.hud.background-opacity';
export function storedHudOpacity(value: string | null): number {
  if (value === null || !/^\d{1,3}$/.test(value)) return 30;
  const percent = Number(value);
  return percent <= 100 ? percent : 30;
}
export function useHudOpacity() {
  const [opacity, setOpacity] = useState(() => {
    try { return storedHudOpacity(localStorage.getItem(hudOpacityKey)); } catch { return 30; }
  });
  useEffect(() => {
    document.documentElement.style.setProperty('--support-panel-opacity', `${opacity}%`);
  }, [opacity]);
  const changeOpacity = (percent: number) => {
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) return;
    setOpacity(percent);
    try { localStorage.setItem(hudOpacityKey, String(percent)); } catch { /* Retain the preference in memory. */ }
  };
  return { opacity, changeOpacity };
}
