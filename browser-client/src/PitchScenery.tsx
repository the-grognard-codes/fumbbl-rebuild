import { useId } from 'react';
import { PitchProjection, type PlaneMatrix } from './pitch-projection.ts';

const WIDTH = 1672, HEIGHT = 941;
const url = `${import.meta.env.BASE_URL}assets/game/pitch/stadium-v1.png`;
// Source-pixel -> canonical ground registration of the approved 55-degree
// painting. Production camera projection remains exclusively in PitchProjection.
const registration: PlaneMatrix = [[0, -13.350726120762829, 22824.563196736133],
  [17.044276629673718, 4.301823272632846, -6422.851576615379],
  [0, 0.5735764363510462, 1043.4884914389131]];
const sourceWorld = (x: number, y: number) => {
  const divisor = registration[2][1] * y + registration[2][2];
  return { x: (registration[0][1] * y + registration[0][2]) / divisor,
    y: (registration[1][0] * x + registration[1][1] * y + registration[1][2]) / divisor };
};
const a = sourceWorld(0, 0).x, b = sourceWorld(0, HEIGHT).x, period = Math.abs(a - b) / 2;

/** Approved painting repeated along world space; HUD never enters this layer. */
export function PitchScenery({ camera, onError }: { camera: PitchProjection; onError: () => void }) {
  const prefix = useId().replace(/:/g, '');
  const top = camera.unproject({ x: camera.center.x, y: 0 }), bottom = camera.unproject({ x: camera.center.x, y: camera.height });
  if (!top || !bottom) return null;
  const lo = Math.min(top.x, bottom.x), hi = Math.max(top.x, bottom.x);
  const first = camera.end === 'home' ? a : 26 - a, last = camera.end === 'home' ? b : 26 - b;
  const offsets = Array.from({ length: 17 }, (_, index) => (index - 8) * period)
    .filter(offset => Math.max(first, last) + offset >= lo && Math.min(first, last) + offset <= hi)
    .sort((first, second) => camera.end === 'home' ? second - first : first - second);
  return <div className="pitch-stadium-world" aria-hidden="true">{offsets.map((offset, index) => {
    // Preserve upright painted spectators at either end, as in the approved study.
    const end = camera.end === 'home' ? 1 : -1;
    const xOrigin = camera.end === 'home' ? offset : 26 + offset;
    const yOrigin = camera.end === 'home' ? 0 : 15;
    const matrix = registration.map((row, i) => i < 2 ? row.map((value, j) => end * value + (i === 0 ? xOrigin : yOrigin) * registration[2][j]) : [...row]);
    return <div key={offset} className="pitch-stadium-plate" data-world-offset={offset}
      style={{ width: WIDTH, height: HEIGHT, transform: camera.planeImageTransform(matrix) }}>
      <div className="pitch-stadium-strip">{[-1, 0, 1].map(side => side === 0
        ? <img key={side} src={url} alt="" onError={onError} style={{ left: WIDTH, transform: end === -1 ? 'scaleX(-1)' : undefined }}/>
        : <svg key={side} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ left: (side + 1) * WIDTH }}>
          <defs><pattern id={`${prefix}-crowd-${index}-${side}`} patternUnits="userSpaceOnUse" width="128" height="84">
            <svg width="128" height="84" viewBox="0 0 180 118" preserveAspectRatio="none"><image href={url} width={WIDTH} height={HEIGHT}/></svg>
          </pattern></defs><rect width={WIDTH} height={HEIGHT} fill={`url(#${prefix}-crowd-${index}-${side})`}/>
        </svg>)}</div>
    </div>;
  })}</div>;
}
