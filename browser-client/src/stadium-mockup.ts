import { PitchProjection } from './pitch-projection.ts';
import { jigsawDepth } from './stadium-jigsaw.ts';
import { stadiumPresentation } from './stadium-presentation.ts';
import type { SetupPlayer } from './setup-protocol.ts';
import { mockupArchitecture } from './stadium-mockup-architecture.ts';
import { mockupSideCrowds } from './stadium-mockup-crowd.ts';

export const TURF_DETAIL = { calm: .18, balanced: .38, textured: .65 } as const;
export const VISITOR_SECTION = 'north-away';
export function mockupModules(camera: PitchProjection, visitor: 'orc' | 'human') {
  const profiles = stadiumPresentation({ homeTeamArt: { rosterId: 'human', league: 'Old World Classic' },
    awayTeamArt: { rosterId: visitor, league: 'Badlands Brawl' } });
  return [...mockupArchitecture(camera, profiles.venue), ...mockupSideCrowds(camera, profiles.home, profiles.away)]
    .sort((a, b) => jigsawDepth(b, camera) - jigsawDepth(a, camera));
}

/** Synthetic legal-size kickoff formation; uses the real pose catalog. */
export const MOCKUP_PLAYERS: SetupPlayer[] = (['home', 'away'] as const).flatMap(role =>
  [[12, 6], [12, 7], [12, 8], [10, 2], [10, 4], [10, 10], [10, 12], [7, 5], [7, 9], [4, 6], [4, 8]]
    .map(([x, y], index) => ({ id: `${role}-${index}`, name: `${role} ${index + 1}`, slot: index + 1,
      number: index + 1, role, x: role === 'home' ? x : 25 - x, y, state: 'standing',
      art: { rosterId: role === 'home' ? 'human' : 'orc', positionId: 'blitzer' } })));
