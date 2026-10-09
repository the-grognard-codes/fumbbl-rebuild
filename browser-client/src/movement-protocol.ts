import { parseUniqueJson } from './saved-team-protocol.ts';
import { decodeRoutePreviewValue, decodeRouteStep } from './route-protocol.ts';
import type { RoutePoint, RoutePreview, RouteStep } from './route-protocol.ts';

export type MovementRange = { rangeVersion: 1; playerId: string; from: RoutePoint; remaining: number;
  steps: RouteStep[]; revision: number };
export type MovementRequest = { playerId: string; kind: 'move' | 'blitz'; targetPlayerId: string | null; waypoints: RoutePoint[] };
export type MovementPlan = { planVersion: 1; kind: MovementRequest['kind']; targetPlayerId: string | null;
  waypoints: RoutePoint[]; route: RoutePreview };
export type MovementRangeResponse = { version: 2; type: 'movementRange'; requestId: string;
  code: 'ACCEPTED'; matchId: string; range: MovementRange };
export type MovementPreviewResponse = { version: 2; type: 'movementPreview'; requestId: string;
  code: 'ACCEPTED'; matchId: string; plan: MovementPlan };

function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid movement object');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== fields.length || fields.some(key => !Object.hasOwn(item, key))) throw Error('Unexpected movement fields');
  return item;
}
function integer(value: unknown, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) throw Error('Invalid movement number');
  return value as number;
}
function playerId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 200) throw Error('Invalid movement player');
  return value;
}
function point(value: unknown): RoutePoint {
  const item = object(value, ['x', 'y']);
  return { x: integer(item.x, 25), y: integer(item.y, 14) };
}
function envelope(json: string, type: string, field: string): Record<string, unknown> {
  if (json.length > 131072) throw Error('Movement response too large');
  const value = object(parseUniqueJson(json), ['version', 'type', 'requestId', 'code', 'matchId', field]);
  if (value.version !== 2 || value.type !== type || value.code !== 'ACCEPTED'
    || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.requestId)
    || typeof value.matchId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.matchId))
    throw Error('Invalid movement response');
  return value;
}

export function decodeMovementRange(json: string): MovementRangeResponse {
  const response = envelope(json, 'movementRange', 'range');
  const value = object(response.range, ['rangeVersion', 'playerId', 'from', 'remaining', 'steps', 'revision']);
  if (value.rangeVersion !== 1 || !Array.isArray(value.steps) || value.steps.length > 389) throw Error('Invalid movement range');
  const from = point(value.from), remaining = integer(value.remaining, 20);
  const steps = value.steps.map(step => decodeRouteStep(step, 3));
  const squares = new Set<string>();
  for (const step of steps) {
    const distance = Math.max(Math.abs(step.x - from.x), Math.abs(step.y - from.y));
    const key = `${step.x},${step.y}`;
    if (!distance || distance > remaining || squares.has(key)) throw Error('Invalid reachable square');
    squares.add(key);
  }
  return { ...response, range: { rangeVersion: 1, playerId: playerId(value.playerId), from, remaining,
    steps, revision: integer(value.revision, 8192) } } as MovementRangeResponse;
}

export function decodeMovementPreview(json: string): MovementPreviewResponse {
  const response = envelope(json, 'movementPreview', 'plan');
  const value = object(response.plan, ['planVersion', 'kind', 'targetPlayerId', 'waypoints', 'route']);
  if (value.planVersion !== 1 || !['move', 'blitz'].includes(value.kind as string)
    || !Array.isArray(value.waypoints) || value.waypoints.length > 20) throw Error('Invalid movement plan');
  const kind = value.kind as MovementRequest['kind'];
  const targetPlayerId = kind === 'blitz' ? playerId(value.targetPlayerId) : null;
  if (kind === 'move' && value.targetPlayerId !== null) throw Error('Unexpected movement target');
  const route = decodeRoutePreviewValue(value.route, kind === 'blitz');
  if (route.routeVersion !== 3 || targetPlayerId === route.playerId) throw Error('Invalid movement plan route');
  const waypoints = value.waypoints.map(point);
  const end = route.steps.at(-1) ?? route.from, last = waypoints.at(-1);
  if (route.steps.length > 0 && !last || last && (last.x !== end.x || last.y !== end.y)) throw Error('Invalid movement endpoint');
  if (kind === 'move' && !waypoints.length) throw Error('Missing movement destination');
  let cursor = 0;
  for (const waypoint of waypoints) {
    while (cursor < route.steps.length && (route.steps[cursor].x !== waypoint.x || route.steps[cursor].y !== waypoint.y)) cursor++;
    if (cursor === route.steps.length) throw Error('Waypoint absent from movement path');
    cursor++;
  }
  return { ...response, plan: { planVersion: 1, kind, targetPlayerId, waypoints, route } } as MovementPreviewResponse;
}
