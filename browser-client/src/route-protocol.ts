import { parseUniqueJson } from './saved-team-protocol.ts';

export type RoutePoint = { x: number; y: number };
export type MovementCheck = { name: 'Pickup' | 'Jump' | 'Ball scatter' | 'Diving Tackle' | 'Tentacles' | 'Shadowing' | 'Steady Footing'; target: number | null; condition: 'entry' | 'possible' | 'fall' };
export type RouteStep = RoutePoint & { dodge: number; rush: number; dodgeModifier?: number; reactions: string[]; checks?: MovementCheck[] };
export type RoutePreview = { routeVersion: 1 | 2 | 3; playerId: string; from: RoutePoint; remaining: number;
  steps: RouteStep[]; revision: number; actor: 'home' | 'away' };
export type RoutePreviewResponse = { version: 2; type: 'routePreview'; requestId: string;
  code: 'ACCEPTED'; matchId: string; route: RoutePreview };

function shape(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid route object');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== fields.length || fields.some(field => !Object.hasOwn(item, field))) throw Error('Unexpected route fields');
  return item;
}
function integer(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw Error('Invalid route number');
  return value as number;
}
function point(value: unknown): RoutePoint {
  const item = shape(value, ['x', 'y']);
  return { x: integer(item.x, 0, 25), y: integer(item.y, 0, 14) };
}

export function decodeRoutePreview(json: string): RoutePreviewResponse {
  if (json.length > 16384) throw Error('Route response too large');
  const response = shape(parseUniqueJson(json), ['version', 'type', 'requestId', 'code', 'matchId', 'route']);
  if (response.version !== 2 || response.type !== 'routePreview' || response.code !== 'ACCEPTED'
    || typeof response.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(response.requestId)
    || typeof response.matchId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(response.matchId))
    throw Error('Invalid route response');
  const route = shape(response.route, ['routeVersion', 'playerId', 'from', 'remaining', 'steps', 'revision', 'actor']);
  if (![1, 2, 3].includes(route.routeVersion as number) || typeof route.playerId !== 'string' || !route.playerId || route.playerId.length > 200
    || !['home', 'away'].includes(route.actor as string) || !Array.isArray(route.steps)
    || route.steps.length < 1 || route.steps.length > 20) throw Error('Invalid route preview');
  const from = point(route.from);
  const remaining = integer(route.remaining, 0, 20);
  const revision = integer(route.revision, 0, 8192);
  const steps = route.steps.map(value => decodeRouteStep(value, route.routeVersion as 1 | 2 | 3));
  if (steps.some(step => step.checks?.some(check => check.name === 'Jump'))) throw Error('Jump route unavailable');
  if (steps.length > remaining) throw Error('Route exceeds remaining movement');
  let previous = from;
  for (const step of steps) {
    if (Math.max(Math.abs(step.x - previous.x), Math.abs(step.y - previous.y)) !== 1) throw Error('Nonadjacent route step');
    previous = step;
  }
  return { ...response, route: { routeVersion: route.routeVersion, playerId: route.playerId, from, remaining,
    steps, revision, actor: route.actor } } as RoutePreviewResponse;
}

export function decodeRouteStep(value: unknown, version: 1 | 2 | 3 = 2): RouteStep {
    const item = shape(value, version === 3 ? ['x', 'y', 'dodge', 'rush', 'dodgeModifier', 'reactions', 'checks'] : version === 2
      ? ['x', 'y', 'dodge', 'rush', 'dodgeModifier', 'reactions'] : ['x', 'y', 'dodge', 'rush', 'reactions']);
    if (!Array.isArray(item.reactions) || item.reactions.length > 3
      || item.reactions.some(label => !['Diving Tackle', 'Tentacles', 'Shadowing'].includes(label)))
      throw Error('Invalid route reactions');
    const checks = version === 3 ? decodeMovementChecks(item.checks) : undefined;
    if (checks) {
      const reactions = checks.filter(check => check.condition === 'possible').map(check => check.name).sort();
      if (JSON.stringify(reactions) !== JSON.stringify([...item.reactions as string[]].sort())) throw Error('Inconsistent movement reactions');
      if (checks.some(check => check.name === 'Pickup') && checks.some(check => check.name === 'Ball scatter')) throw Error('Conflicting ball contact');
      if (checks.some(check => check.name === 'Jump') && (item.dodge !== 0 || item.dodgeModifier !== 0)) throw Error('Conflicting jump check');
      if (checks.some(check => check.name === 'Steady Footing') && !item.dodge && !item.rush && !checks.some(check => check.name === 'Jump')) throw Error('Unavailable fall check');
    }
    return { x: integer(item.x, 0, 25), y: integer(item.y, 0, 14), dodge: integer(item.dodge, 0, version >= 2 ? 6 : 64),
      rush: integer(item.rush, 0, version >= 2 ? 6 : 64),
      ...(version >= 2 ? { dodgeModifier: integer(item.dodgeModifier, -64, 64) } : {}), reactions: item.reactions as string[], ...(checks ? { checks } : {}) };
}

export function decodeMovementChecks(value: unknown): MovementCheck[] {
  if (!Array.isArray(value) || value.length > 7) throw Error('Invalid movement checks');
  const names = new Set<string>();
  return value.map(input => {
    const check = shape(input, ['name', 'target', 'condition']);
    if (typeof check.name !== 'string' || names.has(check.name)) throw Error('Duplicate movement check');
    names.add(check.name);
    if (['Pickup', 'Jump'].includes(check.name)) {
      if (check.condition !== 'entry') throw Error('Invalid entry check');
      integer(check.target, 2, 6);
    } else if (check.name === 'Steady Footing') {
      if (check.condition !== 'fall' || check.target !== 6) throw Error('Invalid fall check');
    } else if (check.name === 'Ball scatter') {
      if (check.condition !== 'entry' || check.target !== null) throw Error('Invalid ball contact');
    } else if (['Diving Tackle', 'Tentacles', 'Shadowing'].includes(check.name)) {
      if (check.condition !== 'possible' || check.target !== null) throw Error('Invalid reaction check');
    } else throw Error('Unknown movement check');
    return check as MovementCheck;
  });
}
