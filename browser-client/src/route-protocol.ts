import { parseUniqueJson } from './saved-team-protocol.ts';

export type RoutePoint = { x: number; y: number };
export type RouteStep = RoutePoint & { dodge: number; rush: number; dodgeModifier?: number; reactions: string[] };
export type RoutePreview = { routeVersion: 1 | 2; playerId: string; from: RoutePoint; remaining: number;
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
  if (json.length > 8192) throw Error('Route response too large');
  const response = shape(parseUniqueJson(json), ['version', 'type', 'requestId', 'code', 'matchId', 'route']);
  if (response.version !== 2 || response.type !== 'routePreview' || response.code !== 'ACCEPTED'
    || typeof response.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(response.requestId)
    || typeof response.matchId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(response.matchId))
    throw Error('Invalid route response');
  const route = shape(response.route, ['routeVersion', 'playerId', 'from', 'remaining', 'steps', 'revision', 'actor']);
  if (![1, 2].includes(route.routeVersion as number) || typeof route.playerId !== 'string' || !route.playerId || route.playerId.length > 200
    || !['home', 'away'].includes(route.actor as string) || !Array.isArray(route.steps)
    || route.steps.length < 1 || route.steps.length > 20) throw Error('Invalid route preview');
  const from = point(route.from);
  const remaining = integer(route.remaining, 0, 20);
  const revision = integer(route.revision, 0, 8192);
  const steps = route.steps.map(value => decodeRouteStep(value, route.routeVersion as 1 | 2));
  if (steps.length > remaining) throw Error('Route exceeds remaining movement');
  let previous = from;
  for (const step of steps) {
    if (Math.max(Math.abs(step.x - previous.x), Math.abs(step.y - previous.y)) !== 1) throw Error('Nonadjacent route step');
    previous = step;
  }
  return { ...response, route: { routeVersion: route.routeVersion, playerId: route.playerId, from, remaining,
    steps, revision, actor: route.actor } } as RoutePreviewResponse;
}

export function decodeRouteStep(value: unknown, version: 1 | 2 = 2): RouteStep {
    const item = shape(value, version === 2
      ? ['x', 'y', 'dodge', 'rush', 'dodgeModifier', 'reactions'] : ['x', 'y', 'dodge', 'rush', 'reactions']);
    if (!Array.isArray(item.reactions) || item.reactions.length > 3
      || item.reactions.some(label => !['Diving Tackle', 'Tentacles', 'Shadowing'].includes(label)))
      throw Error('Invalid route reactions');
    return { x: integer(item.x, 0, 25), y: integer(item.y, 0, 14), dodge: integer(item.dodge, 0, version === 2 ? 6 : 64),
      rush: integer(item.rush, 0, version === 2 ? 6 : 64),
      ...(version === 2 ? { dodgeModifier: integer(item.dodgeModifier, -64, 64) } : {}), reactions: item.reactions as string[] };
}
