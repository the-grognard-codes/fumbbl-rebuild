import type { SetupState } from './setup-protocol.ts';
import { PITCH_LENGTH, PITCH_WIDTH, type Point, type PitchProjection } from './pitch-projection.ts';
import { projectRangeEdges, projectWarning } from './movement-range-presentation.ts';
import { stripeSkillControls, type ThreatPreferences } from './threat-preferences.ts';

export type ThreatSquare = Point & { count: number; tackle: boolean; striped: boolean };
// One composite fill per square. The source image has no recoverable alpha;
// use the requested 50% cap as the visual-review starting point for all bands.
export const threatColors = ['#1d662d', '#e5cd32', '#eb8c24', '#d53737'] as const;
export const threatOpacity = .5;
const keyOf = (point: Point) => `${point.x},${point.y}`;
const inPitch = (point: Point) => point.x >= 0 && point.x < PITCH_LENGTH && point.y >= 0 && point.y < PITCH_WIDTH;

/** Native state owns activation/zone eligibility; the browser only composes markings. */
export function threatSquares(view: SetupState, selectedId: string, preferences: ThreatPreferences): ThreatSquare[] {
  const selected = view.players.find(player => player.id === selectedId);
  const charge = view.turnMode === 'BLITZ' || view.kickoff?.event === 'CHARGE' && view.kickoff.actor === view.callerRole;
  if (!preferences.enabled || !view.threats || view.phase !== 'PLAY' || view.callerRole === 'spectator'
    || view.actor !== view.callerRole || view.turnMode !== 'REGULAR' && !charge
    || !selected || selected.role !== view.callerRole || selected.x === null || selected.y === null
    || !view.threats.eligiblePlayerIds.includes(selectedId)) return [];
  const occupied = new Set(view.players.filter(player => player.x !== null && player.y !== null).map(player => keyOf({ x: player.x!, y: player.y! })));
  const sources = new Set(view.threats.zonePlayerIds);
  const squares = new Map<string, ThreatSquare>();
  for (const player of view.players) {
    if (player.role === selected.role || player.x === null || player.y === null || !sources.has(player.id)) continue;
    const tackle = preferences.tackle && !!player.skills?.includes('Tackle');
    const striped = preferences.otherSkills && stripeSkillControls.some(([control, skill]) => preferences[control] && player.skills?.includes(skill));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const point = { x: player.x + dx, y: player.y + dy }, key = keyOf(point);
      if (!inPitch(point) || occupied.has(key)) continue;
      const square = squares.get(key) ?? { ...point, count: 0, tackle: false, striped: false };
      square.count++; square.tackle ||= tackle; square.striped ||= striped; squares.set(key, square);
    }
  }
  return [...squares.values()].filter(square => preferences.zoneColors || square.tackle || square.striped);
}

/** Clip a unit square to x+y between two bounds, producing disjoint diagonal bands. */
function band(low: number, high: number): Point[] {
  let polygon: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  for (const [bound, above] of [[low, true], [high, false]] as const) {
    const output: Point[] = [];
    for (let index = 0; index < polygon.length; index++) {
      const a = polygon[index], b = polygon[(index + 1) % polygon.length];
      const aSum = a.x + a.y, bSum = b.x + b.y;
      const aInside = above ? aSum >= bound : aSum <= bound, bInside = above ? bSum >= bound : bSum <= bound;
      if (aInside) output.push(a);
      if (aInside !== bInside) {
        const fraction = (bound - aSum) / (bSum - aSum);
        output.push({ x: a.x + fraction * (b.x - a.x), y: a.y + fraction * (b.y - a.y) });
      }
    }
    polygon = output;
  }
  return polygon;
}

export function projectThreatSquare(square: ThreatSquare, camera: PitchProjection, zoneColors: boolean, sharesRush: boolean) {
  const offset = (point: Point) => ({ x: square.x + point.x, y: square.y + point.y });
  const fills = !zoneColors ? [] : !square.striped ? [camera.square(square, 0, true)]
    : Array.from({ length: 8 }, (_, index) => camera.polygon(band(index / 4 + .035, (index + 1) / 4).map(offset), true));
  const hatches = !square.striped || zoneColors ? [] : projectRangeEdges(Array.from({ length: 8 }, (_, index) => {
    const sum = index / 4 + .125;
    return { from: offset({ x: Math.max(0, sum - 1), y: Math.min(1, sum) }),
      to: offset({ x: Math.min(1, sum), y: Math.max(0, sum - 1) }), key: String(index) };
  }), camera);
  const centeredWarning = square.tackle ? projectWarning(square, camera) : null;
  const paired = sharesRush && centeredWarning;
  const warningOffset = .18;
  return { fills: fills.filter(polygon => polygon.length >= 3), hatches,
    warning: paired ? projectWarning(square, camera, warningOffset) : centeredWarning,
    rushWarning: paired ? projectWarning(square, camera, -warningOffset) : null,
    separator: paired ? { center: centeredWarning.center, size: centeredWarning.size * 1.5 } : null,
    color: threatColors[Math.min(square.count, 4) - 1] };
}
