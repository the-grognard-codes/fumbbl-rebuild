import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { PitchProjection, type Point } from './pitch-projection.ts';

/** Track physical hover independently of selection, keyboard focus and game intents. */
export function usePitchHover(scene: RefObject<HTMLDivElement | null>, camera: PitchProjection, enabled: boolean) {
  const pointer = useRef<Point | null>(null);
  const [square, setSquare] = useState<Point | null>(null);
  const clear = useCallback(() => { pointer.current = null; setSquare(null); }, []);
  const refresh = useRef(() => {});
  refresh.current = () => {
    const element = scene.current, position = pointer.current;
    let next: Point | null = null;
    if (enabled && element && position) {
      const hit = element.ownerDocument.elementFromPoint(position.x, position.y);
      // Only the ground and player selection surfaces count. DOM overlays can
      // cover the pitch, including overlays outside this component's subtree.
      const ground = hit === element || hit?.closest('[data-pitch-ground]')?.parentElement === element;
      const player = hit?.closest('.live-marker')?.parentElement === element;
      if (ground || player) {
        const local = camera.fromClient(position, element.getBoundingClientRect());
        next = local && camera.cellAt(local);
      }
    }
    setSquare(previous => previous?.x === next?.x && previous?.y === next?.y ? previous : next);
  };
  // Reproject after camera, game mode or recovery changes without requiring
  // another mouse movement. Retain the physical location while suppressed.
  useLayoutEffect(() => { refresh.current(); });
  useEffect(() => {
    const document = scene.current!.ownerDocument, window = document.defaultView!;
    let frame = 0;
    const animations = new Set<Animation>();
    const schedule = () => {
      if (!frame && pointer.current) frame = window.requestAnimationFrame(() => {
        frame = 0; refresh.current();
        for (const animation of animations) if (animation.playState !== 'running') animations.delete(animation);
        if (animations.size) schedule();
      });
    };
    const animate = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      for (const animation of event.target.getAnimations()) {
        // Recheck sliding/resizing panels during their transition. Infinite
        // decorative effects must not turn hover into a permanent render loop.
        if (animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime))
          animations.add(animation);
      }
      schedule();
    };
    const move = (event: PointerEvent) => {
      if ((event.pointerType !== 'mouse' && event.pointerType !== 'pen') || event.buttons || event.pressure) {
        clear(); return;
      }
      pointer.current = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) clear(); else schedule(); };
    const visibility = () => { if (document.hidden) clear(); };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', move, true);
    document.addEventListener('pointerdown', clear, true);
    document.addEventListener('pointercancel', clear, true);
    document.addEventListener('pointerout', leave, true);
    document.addEventListener('pointerover', schedule, true);
    document.addEventListener('dragstart', clear, true);
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('transitionrun', animate, true);
    document.addEventListener('animationstart', animate, true);
    window.addEventListener('blur', clear);
    window.addEventListener('resize', schedule);
    // Panels can open, close or resize beneath a stationary pointer without
    // rerendering LivePitch. Coalesce their DOM changes into one hit test.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open'] });
    return () => {
      observer.disconnect(); window.cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', move, true);
      document.removeEventListener('pointerdown', clear, true);
      document.removeEventListener('pointercancel', clear, true);
      document.removeEventListener('pointerout', leave, true);
      document.removeEventListener('pointerover', schedule, true);
      document.removeEventListener('dragstart', clear, true);
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('transitionrun', animate, true);
      document.removeEventListener('animationstart', animate, true);
      window.removeEventListener('blur', clear);
      window.removeEventListener('resize', schedule);
    };
  }, [scene, clear]);
  return { square, clear };
}
