import { useEffect, useState } from 'react';
import type { PitchProjection, Point } from './pitch-projection.ts';
import type { BallState } from './setup-protocol.ts';

// Smooth quarter arcs and inward triangles retain the rotating marker's shape.
const ringSegment = 'M17.22 2.05A14 14 0 0 1 29.95 14.78L27.95 14.95A12 12 0 0 0 17.05 4.05Z';
const inwardArrow = 'M13 7H19L16 11Z';
const quarters = [0, 90, 180, 270];

/** Ground-plane highlight; native possession alone decides whether to draw a football. */
export function BallMarker({ ball, state, camera, variant, allowOffPitch = false }: { ball: Point; state?: BallState; camera: PitchProjection; variant?: 'kick'; allowOffPitch?: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const center = camera.project({ x: ball.x + .5, y: ball.y + .5 });
  const footprint = allowOffPitch ? camera.polygon([{ x: ball.x, y: ball.y }, { x: ball.x + 1, y: ball.y },
    { x: ball.x + 1, y: ball.y + 1 }, { x: ball.x, y: ball.y + 1 }], true) : camera.square(ball, 0, true);
  if (!center || state?.inPlay === false || footprint.length < 3) return null;
  // Keep the reference ball-to-square proportion at every zoom and pitch depth.
  // Pixel-size clamps made the football dominate its marker when zoomed out.
  const ballScale = center.pixelsPerSquare / 75;
  // The artwork's bottom tip is (8, 19), nine pixels below its rotation center.
  // Offset the rotated football so that tip sits at the marker's ground anchor.
  const ballRotation = 18;
  const radians = ballRotation * Math.PI / 180;
  const ballLeft = (-8 + 9 * Math.sin(radians)) * ballScale;
  const ballTop = (-10 - 9 * Math.cos(radians)) * ballScale;
  // Rotate inside the ground plane, before applying the camera homography.
  // A screen-space rotation would turn the foreshortened ellipse off the turf.
  const groundTransform = camera.planeImageTransform([[1 / 32, 0, ball.x], [0, 1 / 32, ball.y], [0, 0, 1]]);
  return <div className={`live-ball-marker${variant === 'kick' ? ' live-ball-kick-preview' : ''}`} data-ball-x={ball.x} data-ball-y={ball.y}
    aria-hidden="true" style={{ left: center.x, top: center.y }}>
    <svg className="live-ball-highlight" width="32" height="32" viewBox="0 0 32 32"
      style={{ left: -center.x, top: -center.y, transform: groundTransform }}>
      <g className="live-ball-outer">
        {!reducedMotion && <animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="24s" repeatCount="indefinite" calcMode="linear"/>}
        {quarters.map(degrees => <path key={degrees} className="live-ball-ring" d={ringSegment} transform={`rotate(${degrees} 16 16)`}/>)}
      </g>
      <g className="live-ball-inner">
        {!reducedMotion && <animateTransform attributeName="transform" type="rotate" from="0 16 16" to="-360 16 16" dur="18s" repeatCount="indefinite" calcMode="linear"/>}
        {quarters.map(degrees => <path key={degrees} className="live-ball-arrow" d={inwardArrow} transform={`rotate(${degrees} 16 16)`}/>)}
      </g>
    </svg>
    {variant === 'kick' && <span className="live-kick-label">K</span>}
    {state?.carrierPlayerId === null && <>
      <span className="live-ball-shadow" style={{ left: -7 * ballScale, top: -2 * ballScale, width: 14 * ballScale, height: 5 * ballScale }}/>
      <img className="live-ball-football" src={`${import.meta.env.BASE_URL}assets/game/ui/ball-v1.svg`}
        alt="" draggable={false} style={{ left: ballLeft, top: ballTop, width: 16 * ballScale, height: 20 * ballScale, transform: `rotate(${ballRotation}deg)` }}/>
    </>}
  </div>;
}
