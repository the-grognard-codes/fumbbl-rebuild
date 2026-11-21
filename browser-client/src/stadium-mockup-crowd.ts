import type { PitchProjection } from './pitch-projection.ts';
import { JIGSAW_PIECES, crowdOutline, registerJigsaw, type JigsawModule } from './stadium-jigsaw.ts';
import type { StadiumProfile } from './stadium-presentation.ts';

/** Whole authored banks split only into camera-facing scan bands, never stretched heads. */
export function mockupSideCrowds(camera: PitchProjection, home: StadiumProfile, away: StadiumProfile): JigsawModule[] {
  const modules: JigsawModule[] = [];
  for (const piece of JIGSAW_PIECES.filter(piece => !piece.id.endsWith('-bank'))) {
    const visitor = piece.id === 'north-away', profile = visitor ? away : home;
    const orc = profile.id === 'badlands-brawl', top = camera.mode === 'top-down';
    const left = piece.id.includes('north') === (camera.end === 'home');
    const corner = piece.id.endsWith('-corner');
    const crop = { x: top ? left ? 818 : 1180 : left ? 96 : 456, y: corner ? 380 : 8, width: 260, height: corner ? 267.2 : 1002 };
    const art = { file: `../mockup/${orc ? 'orc-sides-v1' : 'human-sides-v2'}.png`, width: 1536, height: 1024 };
    const b = piece.bounds, source = [{ x: crop.x, y: crop.y }, { x: crop.x + crop.width, y: crop.y }, { x: crop.x + crop.width, y: crop.y + crop.height }, { x: crop.x, y: crop.y + crop.height }];
    if (top) {
      const target = [{ x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }, { x: b.x0, y: b.y0 }];
      modules.push({ jigsaw: true, id: piece.id, piece: piece.id, role: 'crowd', profile, team: visitor ? 'away' : 'home', edge: piece.edge,
        art, origin: { x: 0, y: 0, z: 1.9 }, across: { x: 1, y: 0, z: 0 }, down: { x: 0, y: 1, z: 0 }, bounds: b,
        registration: registerJigsaw(source, camera.end === 'home' ? target : [target[2], target[3], target[0], target[1]]), sectionBounds: b, outline: crowdOutline(piece) });
      continue;
    }
    const rows = corner ? 8 : 30, span = b.x1 - b.x0;
    for (let row = 0; row < rows; row++) {
      const sourceRow = camera.end === 'home' ? rows - row - 1 : row;
      const y0 = crop.y + sourceRow * crop.height / rows, y1 = crop.y + (sourceRow + 1) * crop.height / rows;
      const height = (y1 - y0 + 12) * 4 / crop.width;
      const target = [{ x: b.y0, y: height }, { x: b.y1, y: height }, { x: b.y1, y: 0 }, { x: b.y0, y: 0 }];
      if (camera.end === 'away') for (const point of target) point.x = b.y0 + b.y1 - point.x;
      const x = b.x0 + (row + .5) * span / rows;
      const reach = corner ? Math.sqrt(Math.max(0, 16 - (x - (piece.id.startsWith('home') ? -2 : 28)) ** 2)) : 4;
      modules.push({ jigsaw: true, id: `${piece.id}-row-${row}`, piece: piece.id, role: 'crowd', profile, team: visitor ? 'away' : 'home', edge: piece.edge, art,
        origin: { x, y: 0, z: 1.9 }, across: { x: 0, y: 1, z: 0 },
        down: { x: (camera.end === 'home' ? 1 : -1) * Math.sin(camera.elevation * Math.PI / 180), y: 0, z: Math.cos(camera.elevation * Math.PI / 180) },
        bounds: { x0: corner && piece.id.includes('north') ? -2 - reach : b.y0, y0: 0, x1: corner && piece.id.includes('south') ? 17 + reach : b.y1, y1: height }, sectionBounds: b,
        registration: registerJigsaw([{ x: crop.x, y: y0 - 6 }, { x: crop.x + crop.width, y: y0 - 6 }, { x: crop.x + crop.width, y: y1 + 6 }, { x: crop.x, y: y1 + 6 }], target),
        gesture: piece.id === 'north-home' && camera.end === 'home' ? { file: '../mockup/human-sides-gesture-v1.png', zone: { x: 100, y: 890, width: 250, height: 120 } } : undefined });
    }
  }
  for (const edge of ['home', 'away'] as const) {
    const near = edge === camera.end, top = camera.mode === 'top-down';
    const crop = { x: 8, y: top ? 500 : near ? 250 : 4, width: 2156, height: 216 };
    const source = [{ x: crop.x, y: crop.y }, { x: crop.x + crop.width, y: crop.y }, { x: crop.x + crop.width, y: crop.y + crop.height }, { x: crop.x, y: crop.y + crop.height }];
    const width = 19, height = crop.height * width / crop.width, sign = camera.end === 'home' ? 1 : -1;
    for (let tier = 0; tier < 2; tier++) {
      const x = edge === 'home' ? -2.6 - tier * 1.7 : 28.6 + tier * 1.7;
      modules.push({ jigsaw: true, id: `${edge}-bank-${tier}`, piece: `${edge}-bank`, role: 'crowd', profile: home, team: 'home', edge,
        art: { file: '../mockup/human-ends-indexed-v2.png', width: 2172, height: 724 },
        origin: top ? { x: x - height / 2, y: -2, z: 1.9 } : { x, y: camera.end === 'home' ? -2 : 17, z: 1.9 + tier * .18 },
        across: top ? { x: 0, y: 1, z: 0 } : { x: 0, y: sign, z: 0 },
        down: top ? { x: 1, y: 0, z: 0 } : { x: sign * Math.sin(camera.elevation * Math.PI / 180), y: 0, z: Math.cos(camera.elevation * Math.PI / 180) },
        bounds: { x0: 0, y0: 0, x1: width, y1: height },
        registration: registerJigsaw(source, [{ x: 0, y: height }, { x: width, y: height }, { x: width, y: 0 }, { x: 0, y: 0 }]) });
    }
  }
  return modules;
}
