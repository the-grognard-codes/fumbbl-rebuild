import type { PitchProjection, Point } from './pitch-projection.ts';
import type { BallState } from './setup-protocol.ts';

// Original 32-pixel artwork. Every corner (including its outline) fits within
// a 15.6-pixel radius, so rotation always leaves a margin inside the square.
const ringSegment = 'M17 2H21V3H23V4H24V5H26V6H27V8H28V9H29V11H30V15H29V14H28V11H27V9H26V8H25V7H24V6H23V5H21V4H18V3H17Z';
const inwardArrow = 'M16 11H15V10H14V9H13V7H19V9H18V10H17V11Z';
const quarters = [0, 90, 180, 270];

/** Ground-plane highlight; native possession alone decides whether to draw a football. */
export function BallMarker({ ball, state, camera }: { ball: Point; state?: BallState; camera: PitchProjection }) {
  const center = camera.project({ x: ball.x + .5, y: ball.y + .5 });
  if (!center || state?.inPlay === false || camera.square(ball, 0, true).length < 3) return null;
  // Keep the reference ball-to-square proportion at every zoom and pitch depth.
  // Pixel-size clamps made the football dominate its marker when zoomed out.
  const ballScale = center.pixelsPerSquare / 75;
  // Rotate inside the ground plane, before applying the camera homography.
  // A screen-space rotation would turn the foreshortened ellipse off the turf.
  const groundTransform = camera.planeImageTransform([[1 / 32, 0, ball.x], [0, 1 / 32, ball.y], [0, 0, 1]]);
  return <div className="live-ball-marker" data-ball-x={ball.x} data-ball-y={ball.y}
    aria-hidden="true" style={{ left: center.x, top: center.y }}>
    <svg className="live-ball-highlight" width="32" height="32" viewBox="0 0 32 32"
      style={{ left: -center.x, top: -center.y, transform: groundTransform }}>
      <g className="live-ball-outer">
        {quarters.map(degrees => <path key={degrees} className="live-ball-ring" d={ringSegment} transform={`rotate(${degrees} 16 16)`}/>)}
      </g>
      <g className="live-ball-inner">
        {quarters.map(degrees => <path key={degrees} className="live-ball-arrow" d={inwardArrow} transform={`rotate(${degrees} 16 16)`}/>)}
      </g>
    </svg>
    {state?.carrierPlayerId === null && <>
      <span className="live-ball-shadow" style={{ left: -10 * ballScale, top: 6 * ballScale, width: 14 * ballScale, height: 5 * ballScale }}/>
      <img className="live-ball-football" src={`${import.meta.env.BASE_URL}assets/game/ui/ball-v1.svg`}
        alt="" draggable={false} style={{ left: -8 * ballScale, top: -10 * ballScale, width: 16 * ballScale, height: 20 * ballScale }}/>
    </>}
  </div>;
}
