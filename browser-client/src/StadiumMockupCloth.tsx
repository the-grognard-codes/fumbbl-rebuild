import { useStadiumMockupColors } from './use-stadium-mockup-colors.ts';

import { teamColorIds, type TeamColors } from './team-colors.ts';
import type { PitchProjection } from './pitch-projection.ts';
import { registerJigsaw } from './stadium-jigsaw.ts';

export function mockupColorPair(preset: string, random: number): { home: TeamColors; away: TeamColors } {
  const kit = (primary: string, secondary: string): TeamColors => ({ version: 1, primary, secondary });
  switch (preset) {
    case 'identical': return { home: kit('navy', 'navy'), away: kit('navy', 'navy') };
    case 'white / black': return { home: kit('white', 'black'), away: kit('black', 'white') };
    case 'yellow / purple': return { home: kit('lemon', 'violet'), away: kit('violet', 'lemon') };
    case 'similar blues': return { home: kit('navy', 'sky'), away: kit('sky', 'navy') };
    case 'random': return { home: kit(teamColorIds[random % 16], teamColorIds[(random + 7) % 16]), away: kit(teamColorIds[(random + 3) % 16], teamColorIds[(random + 11) % 16]) };
    default: return { home: kit('navy', 'gold'), away: kit('brown', 'orange') };
  }
}

const crops = {
  banner: { x: 65, y: 35, width: 325, height: 625 },
  pennant: { x: 480, y: 205, width: 330, height: 295 },
  awning: { x: 900, y: 225, width: 600, height: 300 },
  awningTop: { x: 1580, y: 235, width: 550, height: 265 },
};

export function StadiumMockupCloth({ camera, preset, random, onError }: { camera: PitchProjection; preset: string; random: number; onError: () => void }) {
  const colors = mockupColorPair(preset, random);
  const sources = useStadiumMockupColors('cloth-v1', colors.home, colors.away, onError);
  if (!sources) return null;
  return <div className="mockup-cloth" aria-hidden="true" data-cloth-ready="true">
    {([-2.2, 17.2] as const).flatMap(y => [3, 9, 15, 21, 27].flatMap(x => {
      const visitor = y < 0 && x >= 13, top = camera.mode === 'top-down';
      return (['banner', 'pennant'] as const).map(role => {
        const crop = crops[role], width = role === 'banner' ? .75 : .8, height = width * crop.height / crop.width;
        const origin = { x: x + (role === 'pennant' ? 1.5 : 0), y, z: role === 'banner' ? .15 : 1.5 };
        const registration = registerJigsaw([{ x: crop.x, y: crop.y }, { x: crop.x + crop.width, y: crop.y }, { x: crop.x + crop.width, y: crop.y + crop.height }, { x: crop.x, y: crop.y + crop.height }],
          [{ x: 0, y: height }, { x: width, y: height }, { x: width, y: 0 }, { x: 0, y: 0 }]);
        const surface = camera.registeredSurfaceImage(2172, 724, registration, origin, { x: 1, y: 0, z: 0 }, top ? { x: 0, y: .18, z: 0 } : { x: 0, y: 0, z: 1 }, { x0: 0, y0: 0, x1: width, y1: height });
        if (!surface) return null;
        return <div key={`${x}-${y}-${role}`} className="stadium-surface" data-cloth-team={visitor ? 'away' : 'home'} data-cloth-role={role} style={{ width: surface.width, height: surface.height, transform: surface.transform, clipPath: surface.clipPath }}>
          <svg width={surface.width} height={surface.height} viewBox={`${surface.left} ${surface.top} ${surface.width} ${surface.height}`}><image className={role === 'pennant' ? 'mockup-pennant' : undefined} href={sources[visitor ? 'away' : 'home']} width="2172" height="724" style={{ transformOrigin: `${crop.x}px ${crop.y + crop.height / 2}px`, animationDelay: `${-x * .137}s` }}/></svg>
        </div>;
      });
    }))}
    {([-1.15, 16.15] as const).flatMap(y => [5, 11, 20].map(x => {
      const top = camera.mode === 'top-down', crop = crops[top ? 'awningTop' : 'awning'];
      const width = 1.6, height = width * crop.height / crop.width, sign = camera.end === 'home' ? 1 : -1;
      const origin = top ? { x: x - width / 2, y: y - height / 2, z: .85 } : { x, y: y - sign * width / 2, z: .65 };
      const registration = registerJigsaw([{ x: crop.x, y: crop.y }, { x: crop.x + crop.width, y: crop.y }, { x: crop.x + crop.width, y: crop.y + crop.height }, { x: crop.x, y: crop.y + crop.height }],
        [{ x: 0, y: height }, { x: width, y: height }, { x: width, y: 0 }, { x: 0, y: 0 }]);
      const surface = camera.registeredSurfaceImage(2172, 724, registration, origin, top ? { x: 1, y: 0, z: 0 } : { x: 0, y: sign, z: 0 },
        top ? { x: 0, y: 1, z: 0 } : { x: sign * Math.sin(camera.elevation * Math.PI / 180), y: 0, z: Math.cos(camera.elevation * Math.PI / 180) }, { x0: 0, y0: 0, x1: width, y1: height });
      if (!surface) return null;
      return <div key={`awning-${x}-${y}`} className="stadium-surface" data-cloth-role="awning" style={{ width: surface.width, height: surface.height, transform: surface.transform, clipPath: surface.clipPath }}>
        <svg width={surface.width} height={surface.height} viewBox={`${surface.left} ${surface.top} ${surface.width} ${surface.height}`}><image href={sources[y < 0 && x >= 13 ? 'away' : 'home']} width="2172" height="724"/></svg>
      </div>;
    }))}
  </div>;
}
