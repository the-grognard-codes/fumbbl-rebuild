// Review-only clock adapter. The keyframes come from the real, unchanged PolygonDie.
import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react';
import { PolygonDie } from '../../src/PolygonDie.tsx';
import type { DieKind } from '../../src/die-geometry.ts';

export const ReviewClock = createContext({ elapsed: 0, reduced: false });

export function NativeReviewDie({ kind, face, index, offset }: { kind: DieKind; face: string; index: number; offset: number }) {
  const { elapsed, reduced } = useContext(ReviewClock);
  const host = useRef<HTMLSpanElement>(null);
  const copies = useRef<Animation[]>([]);
  const instance = useId();
  useLayoutEffect(() => {
    if (reduced) return;
    // Descendant layout effects have already started the original body/lift animations.
    // Copy their actual effects so its wall-clock completion timer cannot interrupt
    // paused/scrubbed review. No replacement trajectory, angles or easing are supplied.
    const originals = Array.from(host.current!.querySelectorAll('.block-die-cube,.block-die-hover'))
      .flatMap(element => element.getAnimations());
    copies.current = originals.map((original, slot) => {
      const effect = original.effect as KeyframeEffect;
      const copy = new Animation(new KeyframeEffect(effect.target, effect.getKeyframes(), effect.getTiming()), document.timeline);
      copy.id = `native-review-${instance}-${slot}`;
      copy.pause(); copy.currentTime = 0;
      return copy;
    });
    originals.forEach(animation => animation.cancel());
    return () => { copies.current.forEach(animation => animation.cancel()); copies.current = []; };
  }, [kind, face, index, reduced, instance]);
  useLayoutEffect(() => {
    copies.current.forEach(animation => {
      const duration = Number(animation.effect!.getTiming().duration);
      animation.currentTime = Math.max(0, Math.min(duration, elapsed - offset));
    });
  }, [elapsed, offset, reduced, kind, face, index]);
  return <span ref={host} className="native-review-die" data-native-instance={instance}>
    <PolygonDie key={`${kind}:${face}:${index}:${reduced}`} kind={kind} face={face} index={index}
      rollKey={reduced ? undefined : `native-${kind}-${face}-${index}`}/>
  </span>;
}
