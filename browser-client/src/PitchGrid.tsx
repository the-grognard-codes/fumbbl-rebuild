import { memo } from 'react';
import { PitchProjection, PITCH_LENGTH, PITCH_WIDTH } from './pitch-projection.ts';
import { passingSquare } from './passing-presentation.ts';
import type { SetupState } from './setup-protocol.ts';

const cells = Array.from({ length: PITCH_LENGTH * PITCH_WIDTH }, (_, index) => ({
  x: Math.floor(index / PITCH_WIDTH), y: index % PITCH_WIDTH,
}));
const unit = 48;
const width = PITCH_WIDTH * unit, height = PITCH_LENGTH * unit;

const GridCells = memo(function GridCells({ passing }: { passing: SetupState['passing'] }) {
  return <>{cells.map(square => {
    const guidance = passing && passingSquare(passing, square.x, square.y);
    return <polygon key={`${square.x},${square.y}`} data-cell-x={square.x} data-cell-y={square.y}
      points={`${square.y * unit},${square.x * unit} ${square.y * unit},${(square.x + 1) * unit} ${(square.y + 1) * unit},${(square.x + 1) * unit} ${(square.y + 1) * unit},${square.x * unit}`}
      data-pass-range={guidance?.code}
      fill={guidance?.color ?? (square.x === 0 ? '#37669166' : square.x === 25 ? '#874a2d66' : (square.x + square.y) % 2 ? '#18392222' : '#b1c46a0b')}
      stroke="#21371e" strokeOpacity=".5" vectorEffect="non-scaling-stroke">{guidance && <title>{guidance.description}</title>}</polygon>;
  })}</>;
});

/** Keep all canonical cells in a ground plane, using the scenery's exact lens.
 * Camera travel changes one clipped homography, not 390 polygons and JSX nodes. */
export function PitchGrid({ camera, passing }: { camera: PitchProjection; passing: SetupState['passing'] }) {
  const surface = camera.surfaceImage(width, height,
    { x: 0, y: 0, z: 0 }, { x: 0, y: 1 / unit, z: 0 }, { x: 1 / unit, y: 0, z: 0 }, false);
  if (!surface) return null;
  const transform = camera.planeImageTransform([[0, 1 / unit, 0], [1 / unit, 0, 0], [0, 0, 1]]);
  const clipPath = `polygon(${surface.sourcePolygon.map(point => `${point.x / width * 100}% ${point.y / height * 100}%`).join(',')})`;
  return <div className="live-pitch-grid" style={{ width, height, transform, clipPath }} aria-hidden="true">
    <svg data-pitch-ground="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <GridCells passing={passing}/>
    </svg>
  </div>;
}
