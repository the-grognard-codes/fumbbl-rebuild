import { useLayoutEffect, useRef, useState } from 'react';
import { DICE_EXIT_MS } from './presentation-timing.ts';

/** Keep a removed visual for evaporation; callers must discard all associated input. */
export function useDicePresence<T>(value: T | null, resetKey: string, isStatic: boolean, rate = 1) {
  const previous = useRef<{ value: T; key: string; isStatic: boolean } | null>(null);
  const [, refresh] = useState(0);
  const retained = value ?? (!isStatic && previous.current?.key === resetKey && !previous.current.isStatic
    ? previous.current.value : null);
  useLayoutEffect(() => {
    if (value !== null) { previous.current = { value, key: resetKey, isStatic }; return; }
    if (retained === null) { previous.current = null; return; }
    const timer = setTimeout(() => { previous.current = null; refresh(count => count + 1); }, DICE_EXIT_MS / rate);
    return () => clearTimeout(timer);
  }, [value, retained, resetKey, isStatic, rate]);
  return { value: retained, exiting: value === null && retained !== null };
}
