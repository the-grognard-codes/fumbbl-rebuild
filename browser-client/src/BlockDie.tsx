import { useLayoutEffect, useRef, useState } from 'react';
import { BlockMark } from './DiceFace.tsx';
import { blockFaceLabel } from './dice-presentation.ts';
import './block-dice.css';

const faces = ['SKULL', 'BOTH DOWN', 'PUSHBACK', 'PUSHBACK', 'POW/PUSH', 'POW'];
const rollDuration = 310;
const resultAngles: Record<string, [number, number, number]> = {
  SKULL: [0, 0, 0], 'BOTH DOWN': [0, -90, 0], PUSHBACK: [0, 180, 0], 'POW/PUSH': [-90, 0, 0], POW: [90, 0, 0]
};

/** Decorative motion only. The resting face always comes from a native roll. */
export function BlockDie({ face, potential = false, awaiting = false, selected = false, rollKey, index = 0 }: {
  face?: string; potential?: boolean; awaiting?: boolean; selected?: boolean; rollKey?: string; index?: number;
}) {
  const cube = useRef<HTMLSpanElement>(null), hover = useRef<HTMLSpanElement>(null);
  const [completed, setCompleted] = useState<string | undefined>();
  const phase = awaiting ? 'awaiting' : potential ? 'potential'
    : !selected && rollKey !== undefined && completed !== rollKey ? 'rolling' : 'settled';
  // Waiting for the native result continues the existing preview animation.
  const motion = phase === 'awaiting' ? 'potential' : phase;
  useLayoutEffect(() => {
    const body = cube.current!, lift = hover.current!;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations: Animation[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const angles = resultAngles[face ?? ''] ?? [0, 0, 0];
    const result = `matrix3d(${Array.from(new DOMMatrix().rotate(...angles).toFloat64Array()).join(',')})`;
    const pose = () => `matrix3d(${Array.from(new DOMMatrix(getComputedStyle(body).transform).toFloat64Array()).join(',')})`;
    const freeze = () => {
      // Save the rendered pose before cancellation, so the next phase starts
      // on precisely the same cube rather than jumping to a preset angle.
      body.style.transform = getComputedStyle(body).transform;
      lift.style.transform = getComputedStyle(lift).transform;
      animations.forEach(animation => animation.cancel());
    };
    const rest = () => { body.style.transform = result; lift.style.transform = 'none'; };
    const start = () => {
      if (preference.matches || motion === 'settled') {
        if (motion === 'potential') body.style.transform = 'rotateX(-22deg) rotateY(30deg)';
        else rest();
        if (motion === 'rolling') setCompleted(rollKey);
        return;
      }
      if (motion === 'potential') {
        animations.push(body.animate([
          { transform: 'rotateX(-22deg) rotateY(30deg) rotateZ(0deg)' },
          { transform: 'rotateX(338deg) rotateY(390deg) rotateZ(360deg)' }
        ], { duration: 16000, iterations: Infinity, easing: 'linear', delay: index * -3700,
          direction: index % 2 ? 'reverse' : 'normal' }));
        animations.push(lift.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)', offset: .5 },
          { transform: 'translateY(0)' }], { duration: 4000, iterations: Infinity, easing: 'ease-in-out', delay: index * -1200 }));
      } else {
        const from = pose(), direction = index % 2 ? -1 : 1;
        const axis: [number, number, number] = index % 2 ? [.55, 1, -.15] : [1, .55, .15];
        const opposite: [number, number, number] = [axis[0], -axis[1], -axis[2]];
        const halfTurn = 180 * direction;
        // Blend two opposing half-turns within the same angular budget. Undo
        // their final orientation in the base so the native face still lands head-on.
        const landing = new DOMMatrix(result).rotateAxisAngle(...opposite, -halfTurn)
          .rotateAxisAngle(...axis, -halfTurn);
        const landingPose = `matrix3d(${Array.from(landing.toFloat64Array()).join(',')})`;
        const easing = 'cubic-bezier(.25,.25,.45,1)';
        animations.push(body.animate([
          { transform: `${from} rotate3d(${axis.join(',')},0deg) rotate3d(${opposite.join(',')},0deg)` },
          { transform: `${landingPose} rotate3d(${axis.join(',')},${halfTurn}deg) rotate3d(${opposite.join(',')},${halfTurn}deg)` }
        ], { duration: rollDuration, easing, fill: 'both' }));
        animations.push(lift.animate([{ transform: getComputedStyle(lift).transform }, { transform: 'translateY(0)' }],
          { duration: rollDuration, easing, fill: 'both' }));
        timer = setTimeout(() => setCompleted(rollKey), rollDuration);
      }
    };
    start();
    const reduce = () => {
      if (timer) clearTimeout(timer);
      freeze(); animations.length = 0;
      start();
    };
    preference.addEventListener('change', reduce);
    return () => { if (timer) clearTimeout(timer); freeze(); preference.removeEventListener('change', reduce); };
  }, [motion, rollKey, index, face]);
  const resultSide = potential || awaiting ? -1 : faces.indexOf(face ?? '');
  return <span className={`match-die block-die ${phase}${selected ? ' selected' : ''}`} data-face={potential || awaiting ? undefined : face}
    role="img" aria-label={awaiting ? 'Block die; awaiting native result' : potential ? 'Potential block die; outcome not yet rolled' : `Ivory and cyan die: ${blockFaceLabel(face!)}`}>
    <span ref={hover} className="block-die-hover"><span ref={cube} className="block-die-cube" aria-hidden="true">
      {faces.map((mark, side) => <span className={`block-die-side side-${side}`} data-block-face={mark}
        data-result={side === resultSide ? 'true' : undefined} key={side}>
        <svg viewBox="-3 -3 22 22"><BlockMark face={mark}/></svg>
      </span>)}
    </span></span>
  </span>;
}
