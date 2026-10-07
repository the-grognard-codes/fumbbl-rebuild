import { useId } from 'react';
import { PitchProjection, type PlaneMatrix } from './pitch-projection.ts';
import './pitch-scenery.css';

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
const raisedProjection = (camera: PitchProjection, x: number, y: number, rise = 0) => {
  const point = camera.project({ x, y });
  return point && { ...point, y: point.y - rise * point.pixelsPerSquare * Math.cos(camera.elevation * Math.PI / 180) };
};
const raisedPoint = (camera: PitchProjection, x: number, y: number, rise = 0) => {
  const point = raisedProjection(camera, x, y, rise);
  return point && `${point.x},${point.y}`;
};
const polygon = (camera: PitchProjection, x0: number, y0: number, x1: number, y1: number, rise = 0) =>
  [raisedPoint(camera, x0, y0, rise), raisedPoint(camera, x1, y0, rise),
    raisedPoint(camera, x1, y1, rise), raisedPoint(camera, x0, y1, rise)].filter(Boolean).join(' ');
const riser = (camera: PitchProjection, x0: number, y0: number, x1: number, y1: number, low: number, high: number) =>
  [raisedPoint(camera, x0, y0, low), raisedPoint(camera, x1, y1, low),
    raisedPoint(camera, x1, y1, high), raisedPoint(camera, x0, y0, high)].filter(Boolean).join(' ');

function StadiumStructure({ camera }: { camera: PitchProjection }) {
  return <svg className="pitch-stadium-structure" viewBox={`0 0 ${camera.width} ${camera.height}`}>
    {Array.from({ length: 4 }, (_, row) => <g key={row} data-stand-row={row + 1}>
      <polygon className="pitch-stadium-riser" points={riser(camera, -5, -row - 1, 31, -row - 1, row * .3, (row + 1) * .3)}/>
      <polygon className="pitch-stadium-riser" points={riser(camera, -5, 16 + row, 31, 16 + row, row * .3, (row + 1) * .3)}/>
      <polygon className="pitch-stadium-riser" points={riser(camera, -row - 1, -5, -row - 1, 20, row * .3, (row + 1) * .3)}/>
      <polygon className="pitch-stadium-riser" points={riser(camera, 27 + row, -5, 27 + row, 20, row * .3, (row + 1) * .3)}/>
      <polygon data-stand-edge="north" points={polygon(camera, -5, -row - 2, 31, -row - 1, (row + 1) * .3)} />
      <polygon data-stand-edge="south" points={polygon(camera, -5, 16 + row, 31, 17 + row, (row + 1) * .3)} />
      <polygon data-stand-edge="home" points={polygon(camera, -row - 2, -5, -row - 1, 20, (row + 1) * .3)} />
      <polygon data-stand-edge="away" points={polygon(camera, 27 + row, -5, 28 + row, 20, (row + 1) * .3)} />
      {Array.from({ length: 23 }, (_, step) => {
        const x = -4.5 + step * 1.5, rise = (row + 1) * .3;
        return <g key={`long-${step}`}>
          <polygon className="pitch-stadium-stone" points={polygon(camera, x, -row - 1.94, x + .75, -row - 1.72, rise)}/>
          <polygon className="pitch-stadium-stone" points={polygon(camera, x, 16.06 + row, x + .75, 16.28 + row, rise)}/>
        </g>;
      })}
      {Array.from({ length: 16 }, (_, step) => {
        const y = -4.4 + step * 1.5, rise = (row + 1) * .3;
        return <g key={`end-${step}`}>
          <polygon className="pitch-stadium-stone" points={polygon(camera, -row - 1.94, y, -row - 1.72, y + .75, rise)}/>
          <polygon className="pitch-stadium-stone" points={polygon(camera, 27.06 + row, y, 27.28 + row, y + .75, rise)}/>
        </g>;
      })}
    </g>)}
    {[[-1, 0, 27, 0], [-1, 15, 27, 16], [-1, 0, 0, 15], [26, 0, 27, 15]].map(([x0, y0, x1, y1], index) =>
      <polygon key={index} className="pitch-stadium-walkway" points={polygon(camera, x0, y0, x1, y1)}/>)}
  </svg>;
}

function StadiumCrowd({ camera }: { camera: PitchProjection }) {
  const prefix = useId().replace(/:/g, '');
  const seats: { key: string; x: number; y: number; row: number; team: 'home' | 'away' }[] = [];
  for (let row = 0; row < 4; row++) {
    for (let step = 0; step < 44; step++) {
      const x = -4.5 + step * .8;
      for (const y of [-row - 1.65, 16.35 + row]) seats.push({ key: `${row}-${step}-${y}`, x, y, row, team: x < 13 ? 'home' : 'away' });
    }
    for (let step = 0; step < 29; step++) {
      const y = -4.5 + step * .8;
      for (const [x, team] of [[-row - 1.65, 'home'], [27.35 + row, 'away']] as const)
        seats.push({ key: `${row}-${step}-${x}`, x, y, row, team });
    }
  }
  return <svg className="pitch-stadium-crowd" viewBox={`0 0 ${camera.width} ${camera.height}`}>
    <defs>
      {['dark', 'light'].map(variant => <g key={variant} id={`${prefix}-fan-${variant}`} className={`pitch-stadium-fan-art ${variant}`} shapeRendering="crispEdges">
        <rect className="fan-shadow" x="-7" y="-2" width="14" height="2"/>
        <rect className="fan-leg" x="-4" y="-5" width="3" height="5"/><rect className="fan-leg" x="1" y="-5" width="3" height="5"/>
        <rect className="fan-arm" x="-8" y="-11" width="3" height="7"/><rect className="fan-arm" x="5" y="-11" width="3" height="7"/>
        <rect className="fan-jersey" x="-5" y="-12" width="10" height="9"/>
        <rect className="fan-face" x="-3" y="-18" width="6" height="6"/>
        <rect className="fan-hair" x="-4" y="-20" width="8" height="3"/>
        <rect className="fan-eye" x="-2" y="-15" width="1" height="1"/><rect className="fan-eye" x="1" y="-15" width="1" height="1"/>
      </g>)}
    </defs>
    {seats.map((seat, index) => {
      const point = raisedProjection(camera, seat.x + .16, seat.y + .26, (seat.row + 1) * .3);
      return point && <use key={seat.key} className="pitch-stadium-fan" data-crowd-team={seat.team}
        href={`#${prefix}-fan-${index % 3 === 0 ? 'light' : 'dark'}`}
        transform={`translate(${point.x} ${point.y}) scale(${Math.max(.35, point.pixelsPerSquare / 44)})`}/>;
    })}
  </svg>;
}

/** Approved painting repeated along world space; HUD never enters this layer. */
export function PitchScenery({ camera, onError }: { camera: PitchProjection; onError: () => void }) {
  const top = camera.unproject({ x: camera.center.x, y: 0 }), bottom = camera.unproject({ x: camera.center.x, y: camera.height });
  if (!top || !bottom) return null;
  const lo = Math.min(top.x, bottom.x), hi = Math.max(top.x, bottom.x);
  const first = camera.end === 'home' ? a : 26 - a, last = camera.end === 'home' ? b : 26 - b;
  const offsets = Array.from({ length: 17 }, (_, index) => (index - 8) * period)
    .filter(offset => Math.max(first, last) + offset >= lo && Math.min(first, last) + offset <= hi)
    .sort((first, second) => camera.end === 'home' ? second - first : first - second);
  const footprint = camera.polygon([{ x: -1, y: -1 }, { x: 27, y: -1 }, { x: 27, y: 16 }, { x: -1, y: 16 }], true);
  const turfClip = footprint.length >= 3 ? `polygon(${footprint.map(point => `${point.x / camera.width * 100}% ${point.y / camera.height * 100}%`).join(', ')})` : 'inset(100%)';
  return <div className="pitch-stadium-world" aria-hidden="true"><div className="pitch-stadium-turf-world" style={{ clipPath: turfClip }}>
    {offsets.map(offset => {
    // Only the turf of the approved painting is used. Its baked spectators and
    // side-tile copies must never appear beneath replaceable team crowd art.
    const end = camera.end === 'home' ? 1 : -1;
    const xOrigin = camera.end === 'home' ? offset : 26 + offset;
    const yOrigin = camera.end === 'home' ? 0 : 15;
    const matrix = registration.map((row, i) => i < 2 ? row.map((value, j) => end * value + (i === 0 ? xOrigin : yOrigin) * registration[2][j]) : [...row]);
    return <div key={offset} className="pitch-stadium-plate" data-world-offset={offset}
      style={{ width: WIDTH, height: HEIGHT, transform: camera.planeImageTransform(matrix) }}>
      <img className="pitch-stadium-turf" src={url} alt="" onError={onError}
        style={{ transform: end === -1 ? 'scaleX(-1)' : undefined }}/>
    </div>;
  })}</div>
    <StadiumStructure camera={camera}/>
    <StadiumCrowd camera={camera}/>
  </div>;
}
