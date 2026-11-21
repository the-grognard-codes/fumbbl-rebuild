import type { PitchProjection, WorldPoint } from './pitch-projection.ts';
import { registerJigsaw, type JigsawModule } from './stadium-jigsaw.ts';
import type { StadiumProfile } from './stadium-presentation.ts';

const art = { file: '../mockup/architecture-v2.png', width: 1536, height: 1024 };
type Crop = { x: number; y: number; width: number; height: number };
export const MOCKUP_ARCHITECTURE_CROPS = {
  wall: { x: 28, y: 0, width: 1480, height: 310 },
  coping: { x: 28, y: 370, width: 1480, height: 120 },
  bench: { x: 650, y: 540, width: 385, height: 250 },
  benchTop: { x: 1105, y: 600, width: 360, height: 160 },
  barrel: { x: 45, y: 835, width: 235, height: 175 },
  barrelTop: { x: 350, y: 840, width: 240, height: 170 },
} as const;

function surface(id: string, profile: StadiumProfile, crop: Crop, origin: WorldPoint, across: WorldPoint, down: WorldPoint, width: number, height: number, role: JigsawModule['role'], edge: string): JigsawModule {
  return { jigsaw: true, id, profile, art, origin, across, down, role, edge,
    bounds: { x0: 0, y0: 0, x1: width, y1: height },
    registration: registerJigsaw([{ x: crop.x, y: crop.y }, { x: crop.x + crop.width, y: crop.y }, { x: crop.x + crop.width, y: crop.y + crop.height }, { x: crop.x, y: crop.y + crop.height }],
      [{ x: 0, y: height }, { x: width, y: height }, { x: width, y: 0 }, { x: 0, y: 0 }]) };
}

/** Static venue planes and independent props; no team identity in the source art. */
export function mockupArchitecture(camera: PitchProjection, profile: StadiumProfile): JigsawModule[] {
  const modules: JigsawModule[] = [];
  for (const edge of ['north', 'south', 'home', 'away']) {
    const side = edge === 'north' || edge === 'south', count = side ? 3 : 2;
    const total = side ? 30 : 19, span = total / count;
    for (let index = 0; index < count; index++) {
      const along = -2 + index * span;
      const origin = side ? { x: along, y: edge === 'north' ? -2.15 : 17.15, z: 0 } : { x: edge === 'home' ? -2.15 : 28.15, y: along, z: 0 };
      const across = side ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      if (camera.mode !== 'top-down') modules.push(surface(`new-wall-${edge}-${index}`, profile, MOCKUP_ARCHITECTURE_CROPS.wall, origin, across, { x: 0, y: 0, z: 1 }, span, 2.1, 'wall', edge));
      const rimOrigin = { ...origin, x: origin.x - (side ? 0 : .18), y: origin.y - (side ? .18 : 0), z: 1.65 };
      modules.push(surface(`new-rim-${edge}-${index}`, profile, MOCKUP_ARCHITECTURE_CROPS.coping, rimOrigin, across, side ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }, span, .36, 'wall-rim', edge));
    }
  }
  for (const [side, y] of [['north', -1.15], ['south', 16.15]] as const) for (const x of [5, 11, 20]) {
    for (const role of ['bench', 'barrel'] as const) {
      const top = camera.mode === 'top-down', crop = MOCKUP_ARCHITECTURE_CROPS[top ? role === 'bench' ? 'benchTop' : 'barrelTop' : role];
      const width = role === 'bench' ? 1.6 : .65, height = width * crop.height / crop.width;
      const anchor = { x: x + (role === 'barrel' ? 1.1 : 0), y, z: 0 };
      const sign = camera.end === 'home' ? 1 : -1;
      const origin = top ? { x: anchor.x - width / 2, y: anchor.y - height / 2, z: 0 } : { ...anchor, y: anchor.y - sign * width / 2 };
      modules.push(surface(`new-${role}-${side}-${x}`, profile, crop, origin,
        top ? { x: 1, y: 0, z: 0 } : { x: 0, y: sign, z: 0 },
        top ? { x: 0, y: 1, z: 0 } : { x: sign * Math.sin(camera.elevation * Math.PI / 180), y: 0, z: Math.cos(camera.elevation * Math.PI / 180) },
        width, height, 'sideline-gear', side));
    }
  }
  return modules;
}
