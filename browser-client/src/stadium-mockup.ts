import { PITCH_LENGTH, PITCH_WIDTH, PitchProjection, type PerspectiveElevation, type PitchEnd } from './pitch-projection.ts';
import type { SetupPlayer } from './setup-protocol.ts';
import type { TeamColors } from './team-colors.ts';

export const STILL_LAYOUT = {
  width: 1024, height: 1536, pixelsPerSquare: 32,
  pitch: { x: 272, y: 352, width: 480, height: 832 },
} as const;
export const ANGLED_HEIGHT = 576;
export const CONCEPT_HEIGHT = STILL_LAYOUT.width * 971 / 1619;
export const MOCKUP_PLAYER_WIDTH_IN_SQUARES = 1.08;
export type MockupAngle = PerspectiveElevation | 90;
export type Visitor = 'orc' | 'human';
export type PitchPreset = 'calm' | 'balanced';
export type MockupPlayer = SetupPlayer & { role: PitchEnd; x: number; y: number; art: NonNullable<SetupPlayer['art']> };

/** A fixed art viewport gives integer 16/32/64px squares at 50/100/200%. */
export function mockupCamera(end: PitchEnd, zoom = 1, focus = PITCH_LENGTH / 2, transverseFocus = PITCH_WIDTH / 2, angle: MockupAngle = 90) {
  const options = { width: STILL_LAYOUT.width, height: angle === 90 ? 320 : ANGLED_HEIGHT, end, focus, transverseFocus,
    mode: angle === 90 ? 'top-down' as const : 'perspective' as const,
    perspectiveElevation: angle === 90 ? 40 as const : angle };
  const base = new PitchProjection(options);
  return new PitchProjection({ ...options, zoom: angle === 90 ? STILL_LAYOUT.pixelsPerSquare / base.scale * zoom : zoom });
}

/** The upright painting tracks the centre of the world grid from either end. */
export function mockupPaintingFrame(camera: PitchProjection) {
  if (camera.mode !== 'top-down') return null;
  const center = camera.project({ x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 });
  if (!center) return null;
  const scale = center.pixelsPerSquare / STILL_LAYOUT.pixelsPerSquare;
  return {
    left: center.x - STILL_LAYOUT.width / 2 * scale,
    top: center.y - STILL_LAYOUT.height / 2 * scale,
    scale,
  };
}

/** Synthetic eleven-a-side kickoff using positions from the production catalogue. */
export function mockupPlayers(visitor: Visitor): MockupPlayer[] {
  return (['home', 'away'] as const).flatMap(role =>
    [[12, 6], [12, 7], [12, 8], [10, 2], [10, 4], [10, 10], [10, 12], [7, 5], [7, 9], [4, 6], [4, 8]]
      .map(([x, y], index) => {
        const rosterId = role === 'home' ? 'human' : visitor;
        return { id: `${role}-${index}`, name: `${role} ${index + 1}`, slot: index + 1,
          number: index + 1, role, x: role === 'home' ? x : PITCH_LENGTH - 1 - x, y, state: 'standing',
          art: { rosterId, positionId: rosterId === 'orc' ? 'orc-blitzer' : 'blitzer' } };
      }));
}

/** Shared kit presets for player and stadium cloth. */
export const MOCKUP_COLOR_PRESETS = ['defaults', 'identical', 'white / black', 'yellow / purple', 'similar blues'] as const;
export type MockupColorPreset = typeof MOCKUP_COLOR_PRESETS[number];
export function mockupColorPair(preset: MockupColorPreset, visitor: Visitor = 'orc'): Record<PitchEnd, TeamColors> {
  const kit = (primary: string, secondary: string): TeamColors => ({ version: 1, primary, secondary });
  switch (preset) {
    case 'identical': return { home: kit('navy', 'navy'), away: kit('navy', 'navy') };
    case 'white / black': return { home: kit('white', 'black'), away: kit('black', 'white') };
    case 'yellow / purple': return { home: kit('lemon', 'violet'), away: kit('violet', 'lemon') };
    case 'similar blues': return { home: kit('navy', 'sky'), away: kit('sky', 'navy') };
    default: return { home: kit('navy', 'gold'), away: kit(visitor === 'orc' ? 'red' : 'sky', 'gold') };
  }
}
