import { useLayoutEffect, useRef, useState } from 'react';
import { BlockMark, PipMark } from './DiceFace.tsx';
import { blockFaceLabel } from './dice-presentation.ts';
import { numericSolids } from './die-geometry.ts';
import type { DieKind } from './die-geometry.ts';
import './block-dice.css';

const blockFaces = ['SKULL', 'BOTH DOWN', 'PUSHBACK', 'PUSHBACK', 'POW/PUSH', 'POW'];
const rollDuration = 310;
const resultAngles: Record<string, [number, number, number]> = {
  SKULL: [0, 0, 0], 'BOTH DOWN': [0, -90, 0], PUSHBACK: [0, 180, 0], 'POW/PUSH': [-90, 0, 0], POW: [90, 0, 0]
};
const numericAngles: Record<string, [number, number, number]> = {
  '1': [0, 0, 0], '2': [0, -90, 0], '6': [0, 180, 0], '5': [0, 90, 0], '3': [-90, 0, 0], '4': [90, 0, 0]
};

export type PolygonDieProps = {
  kind: DieKind;
  face?: string; potential?: boolean; awaiting?: boolean; selected?: boolean; uphill?: boolean; chosenBy?: 'home' | 'away'; rollKey?: string; index?: number;
};

/** One motion lifecycle for all physical dice. Only native results choose the resting face. */
export function PolygonDie({ kind, face, potential = false, awaiting = false, selected = false, uphill = false, chosenBy, rollKey, index = 0 }: PolygonDieProps) {
  const solid = kind === 'd8' || kind === 'd16' ? numericSolids[kind] : null;
  const faces = kind === 'block' ? blockFaces : ['1', '2', '6', '5', '3', '4'];
  const valid = potential || awaiting || (solid ? solid.some(side => side.value === face) : faces.includes(face ?? ''));
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
    const angles = (kind === 'block' ? resultAngles : numericAngles)[face ?? ''] ?? [0, 0, 0];
    const result = solid?.find(side => side.value === face)?.landing
      ?? `matrix3d(${Array.from(new DOMMatrix().rotate(...angles).toFloat64Array()).join(',')})`;
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
  }, [motion, rollKey, index, face, kind]);
  const resultSide = potential || awaiting ? -1 : faces.indexOf(face ?? '');
  const name = kind === 'block' ? 'Block die' : kind.toUpperCase();
  return <span className={`match-die polygon-die ${kind === 'block' ? 'block-die' : 'numeric-die'} ${kind} ${phase}${selected ? ' selected' : ''}${selected && chosenBy ? ` ${chosenBy}-selected` : ''}${selected && uphill ? ' uphill-selected' : ''}`}
    data-face={potential || awaiting ? undefined : face} data-die-kind={kind} hidden={!valid}
    role="img" aria-label={awaiting ? `${name}; awaiting native result` : potential ? `Potential ${name.toLowerCase()}; outcome not yet rolled`
      : `Ivory and cyan die: ${kind === 'block' ? blockFaceLabel(face!) : `${name} ${face}`}`}>
    <span ref={hover} className="block-die-hover"><span ref={cube} className={`block-die-cube polygon-die-body${solid ? ' polyhedron' : ''}`} aria-hidden="true">
      {solid ? solid.map(side => <span className="polyhedron-face" key={side.value} style={{ transform: side.transform }}
        data-numeric-face={side.value} data-result={side.value === face ? 'true' : undefined}>
        <svg viewBox="-26 -26 52 52"><polygon points={side.points}/><text x="0" y="1" dominantBaseline="middle" textAnchor="middle">{side.value}</text></svg>
      </span>) : faces.map((mark, side) => <span className={`block-die-side side-${side}`} data-block-face={kind === 'block' ? mark : undefined}
        data-numeric-face={kind === 'd6' ? mark : undefined}
        data-result={side === resultSide ? 'true' : undefined} key={side}>
        <svg viewBox="-3 -3 22 22">{kind === 'block' ? <BlockMark face={mark}/> : <PipMark face={mark}/>}</svg>
      </span>)}
    </span></span>
  </span>;
}
