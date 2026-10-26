import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cycleCameraAngle, flipCameraEnd } from './camera-preferences.ts';
import type { CameraPreferences } from './camera-preferences.ts';
import './camera-buttons.css';

export function CameraButtons({ preferences, onChange }: {
  preferences: CameraPreferences; onChange: (next: (current: CameraPreferences) => CameraPreferences) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const controls = element.current;
    const menu = controls?.closest('.coach-match, .hosted-result')?.querySelector('.game-menu-trigger');
    if (!controls || !menu) return;
    const matchMenuHeight = () => {
      const height = menu.getBoundingClientRect().height;
      if (height > 0) controls.style.setProperty('--camera-button-size', `${height}px`);
    };
    const observer = new ResizeObserver(matchMenuHeight);
    observer.observe(menu);
    matchMenuHeight();
    return () => observer.disconnect();
  }, []);
  const [notice, setNotice] = useState({ text: '', sequence: 0 });
  useEffect(() => {
    if (!notice.text) return;
    const timer = window.setTimeout(() => setNotice(current => ({ ...current, text: '' })), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const announce = (text: string) => setNotice(current => ({ text, sequence: current.sequence + 1 }));
  const perspective = `${preferences.end === 'home' ? 'Home' : 'Away'} perspective`;
  return <div ref={element} className="camera-buttons" role="group" aria-label="Camera perspective controls">
    <button type="button" className="camera-button camera-flip" aria-label={`Flip perspective: ${perspective}`}
      aria-pressed={preferences.end === 'away'} title={`${perspective}; flip viewing end`}
      onClick={() => {
        const next = flipCameraEnd(preferences);
        onChange(flipCameraEnd);
        announce(`${next.end === 'home' ? 'Home' : 'Away'} perspective${next.angle === 90 ? ' selected; applies in angled view' : ''}`);
      }}>
      <svg viewBox="0 0 32 32" aria-hidden="true" style={{ transform: preferences.end === 'away' ? 'scaleX(-1)' : undefined }}>
        <path d="M7 11a10 10 0 1 1-1 9M3 5v8h8"/>
        <path d="M13 12h6v10h-6zM13 17h6"/>
      </svg>
    </button>
    <button type="button" className="camera-button camera-angle" aria-label={`Cycle camera angle: ${preferences.angle === 90 ? 'Overhead view' : `${preferences.angle}°`}`}
      title={`Camera angle: ${preferences.angle === 90 ? 'Overhead view' : `${preferences.angle}°`}; cycle viewing angle`}
      onClick={() => {
        const next = cycleCameraAngle(preferences);
        onChange(cycleCameraAngle);
        announce(next.angle === 90 ? 'Overhead view' : `${next.angle}° camera angle`);
      }}>{preferences.angle}°</button>
    <span className="camera-notice" role="status" aria-label="Camera status" aria-live="polite" aria-atomic="true">
      <span key={notice.sequence}>{notice.text}</span>
    </span>
  </div>;
}
