import { playerArtCatalog } from './generated-player-art.ts';
import type { SetupPlayer } from './setup-protocol.ts';

export type PlayerFacing = 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west';
type Point = { x: number; y: number };
type Bounds = Point & { width: number; height: number };
type ImageRecord = { file: string; width: number; height: number; bounds: Bounds };
type BodyRecord = ImageRecord & { bodyAnchor: Point; footAnchor: Point; groundAnchor: Point };
type PositionRecord = { sizeClass: string; portrait: ImageRecord; poses: Record<string, BodyRecord> };
type RosterRecord = { version: string; rosterId: string; positions: Record<string, PositionRecord> };

const catalog = playerArtCatalog as unknown as Record<string, RosterRecord>;
const facings: PlayerFacing[] = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
// A native falling player remains upright until push destinations and follow-up resolve the knockdown.
const standingStates = new Set(['standing', 'is standing', 'moving', 'is moving', 'distracted', 'is distracted', 'is being blocked', 'is exhausted', 'is about to fall down']);
const proneStates = new Set(['prone', 'is prone', 'was hit while on the ground']);
const stunnedStates = new Set(['stunned', 'has been stunned']);

function positionFor(player: SetupPlayer): { roster: RosterRecord; position: PositionRecord } | null {
  if (!player.art) return null;
  if (!Object.hasOwn(catalog, player.art.rosterId)) return null;
  const roster = catalog[player.art.rosterId];
  if (!Object.hasOwn(roster.positions, player.art.positionId)) return null;
  const position = roster?.positions[player.art.positionId];
  return roster && position ? { roster, position } : null;
}

function assetUrl(roster: RosterRecord, file: string): string {
  const configuredBase = import.meta.env?.BASE_URL ?? '/';
  const base = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
  return `${base}assets/game/teams/${roster.rosterId}/poses/${roster.version}/${file}`;
}

/** Portraits remain available for reserve, KO, casualty, and sent-off cards. */
export function resolvePlayerPortrait(player: SetupPlayer): string | null {
  const art = positionFor(player);
  return art ? assetUrl(art.roster, art.position.portrait.file) : null;
}

export function resolvePlayerArt(player: SetupPlayer, options: { end: 'home' | 'away'; facing?: PlayerFacing; setupPerspective?: boolean; topDown?: boolean }): {
  body: BodyRecord & { url: string; mirror: boolean; pose: string };
  portraitUrl: string;
} | null {
  const art = positionFor(player);
  if (!art || player.x === null || player.y === null || player.offPitch && player.offPitch !== 'pitch') return null;
  const state = player.state.toLowerCase().trim();
  let pose: string;
  let mirror = false;
  if (proneStates.has(state)) pose = 'prone';
  else if (stunnedStates.has(state)) pose = 'stunned';
  else if (standingStates.has(state)) {
    const facing = options.setupPerspective || options.topDown || !options.facing ? (player.role === 'home' ? 'north' : 'south') : options.facing;
    const index = facings.indexOf(facing);
    if (index < 0) return null;
    const screenFacing = facings[(index + (options.end === 'away' ? 4 : 0)) % facings.length];
    const choice: Record<PlayerFacing, [string, boolean]> = {
      north: ['back', false], 'north-east': ['back45', false], east: ['side', false],
      'south-east': ['front45', false], south: ['front', false], 'south-west': ['front45', true],
      west: ['side', true], 'north-west': ['back45', true],
    };
    [pose, mirror] = choice[screenFacing];
  } else return null;
  const selected = art.position.poses[pose];
  if (!selected) return null;
  const bounds = mirror ? { ...selected.bounds, x: selected.width - selected.bounds.x - selected.bounds.width } : selected.bounds;
  const footAnchor = mirror ? { ...selected.footAnchor, x: selected.width - selected.footAnchor.x } : selected.footAnchor;
  const bodyAnchor = mirror ? { ...selected.bodyAnchor, x: selected.width - selected.bodyAnchor.x } : selected.bodyAnchor;
  const groundAnchor = mirror ? { ...selected.groundAnchor, x: selected.width - selected.groundAnchor.x } : selected.groundAnchor;
  return {
    body: { ...selected, bounds, bodyAnchor, footAnchor, groundAnchor, url: assetUrl(art.roster, selected.file), mirror, pose },
    portraitUrl: assetUrl(art.roster, art.position.portrait.file),
  };
}

/** The body and its ground shadow share one reviewed placement contract. */
export function playerArtPlacement(body: BodyRecord & { pose: string }, topDown: boolean): {
  anchor: Point; shadowAnchor: Point; mode: 'ground' | 'body-center' | 'feet';
} {
  if (body.pose === 'prone' || body.pose === 'stunned')
    return { anchor: body.groundAnchor, shadowAnchor: body.groundAnchor, mode: 'ground' };
  return { anchor: topDown ? body.bodyAnchor : body.footAnchor, shadowAnchor: body.footAnchor,
    mode: topDown ? 'body-center' : 'feet' };
}
