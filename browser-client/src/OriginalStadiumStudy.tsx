// Restore the first stadium painting in the development study, without new artwork.
import { useId } from 'react';
import { PitchProjection, type PlaneMatrix } from './pitch-projection.ts';

const WIDTH = 1672, HEIGHT = 941;
const url = `${import.meta.env.BASE_URL}assets/game/pitch/stadium-v1.png`;
// Original source registration, recovered from e8cb1fb7c. The game lens owns projection.
const registration: PlaneMatrix = [[0, -13.350726120762829, 22824.563196736133],
  [17.044276629673718, 4.301823272632846, -6422.851576615379],
  [0, .5735764363510462, 1043.4884914389131]];
const sourceX = (y: number) => (registration[0][1] * y + registration[0][2]) /
  (registration[2][1] * y + registration[2][2]);
const period = Math.abs(sourceX(0) - sourceX(HEIGHT)) / 2;
// Match the original outer crowd extensions while keeping the full painting in the middle.
const stripRegistration = registration.map(row => [row[0], row[1], row[2] - row[0] * WIDTH]);

/** Baked perspective art: an appearance baseline, not interchangeable animated sections. */
export function OriginalStadiumStudy({ camera }: { camera: PitchProjection }) {
  const prefix = useId().replace(/:/g, '');
  // The old painting has no overhead view. The caller uses the existing overhead scenery.
  if (camera.mode === 'top-down') return null;
  const end = camera.end === 'home' ? 1 : -1;
  const offsets = Array.from({ length: 17 }, (_, i) => (i - 8) * period)
    .sort((a, b) => end * (b - a));
  return <div className="original-stadium-study" aria-hidden="true" data-original-stadium="stadium-v1">
    {offsets.map((offset, index) => {
      const id = `${prefix}-${index}`;
      const origin = { x: camera.end === 'home' ? offset : 26 + offset,
        y: camera.end === 'home' ? 0 : 15, z: 0 };
      // Clip in source space before CSS projection, including views whose top is above the horizon.
      const surface = camera.registeredSurfaceImage(WIDTH * 3, HEIGHT, stripRegistration, origin,
        { x: end, y: 0, z: 0 }, { x: 0, y: end, z: 0 },
        { x0: -100, y0: -100, x1: 100, y1: 100 });
      if (!surface) return null;
      return <div className="stadium-surface original-stadium-plate" key={offset} data-world-offset={offset}
        style={{ width: surface.width, height: surface.height, transform: surface.transform, clipPath: surface.clipPath }}>
        <svg width={surface.width} height={surface.height}
          viewBox={`${surface.left} ${surface.top} ${surface.width} ${surface.height}`}>
          <defs>
            <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2={HEIGHT} gradientUnits="userSpaceOnUse">
              <stop stopColor="white" stopOpacity="0"/><stop offset="12%" stopColor="white"/>
              <stop offset="85%" stopColor="white"/><stop offset="100%" stopColor="white" stopOpacity="0"/>
            </linearGradient>
            <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={WIDTH*3} height={HEIGHT}>
              <rect width={WIDTH*3} height={HEIGHT} fill={`url(#${id}-fade)`}/>
            </mask>
            <pattern id={`${id}-crowd`} patternUnits="userSpaceOnUse" width="128" height="84">
              <svg width="128" height="84" viewBox="0 0 180 118"><image href={url} width={WIDTH} height={HEIGHT}/></svg>
            </pattern>
          </defs>
          <g mask={`url(#${id}-mask)`}>
            <rect width={WIDTH} height={HEIGHT} fill={`url(#${id}-crowd)`}/>
            <rect x={WIDTH*2} width={WIDTH} height={HEIGHT} fill={`url(#${id}-crowd)`}/>
            <image href={url} x={WIDTH} width={WIDTH} height={HEIGHT}
              transform={end === -1 ? `translate(${WIDTH*3} 0) scale(-1 1)` : undefined}/>
          </g>
        </svg>
      </div>;
    })}
  </div>;
}
