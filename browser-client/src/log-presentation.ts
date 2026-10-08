export type LogSquare = { x: number; y: number };
export type LogAction = { kind: string; label: string; playerId: string | null; target: LogSquare | { playerId: string } | null };
export type LogMovement = { commitRevision: number; playerId: string; from: LogSquare; to: LogSquare | null; complete: boolean };
export type LogPresentation = { version: 1; action: LogAction | null; movement: LogMovement | null };
export type LogRoll = { version: 1; base: number; target: number; modifier: number; square: LogSquare | null };
function object(value: unknown, fields: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid log presentation');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== fields.length || fields.some(field => !Object.hasOwn(item, field))) throw Error('Invalid log presentation fields');
  return item;
}
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
function square(value: unknown): LogSquare {
  const item = object(value, ['x', 'y']);
  if (!Number.isInteger(item.x) || Number(item.x) < 0 || Number(item.x) > 25 || !Number.isInteger(item.y) || Number(item.y) < 0 || Number(item.y) > 14)
    throw Error('Invalid log square');
  return { x: Number(item.x), y: Number(item.y) };
}
export function decodeLogPresentation(value: unknown, revision: number): LogPresentation {
  const item = object(value, ['version', 'action', 'movement']);
  if (item.version !== 1) throw Error('Unsupported log presentation');
  let action: LogAction | null = null, movement: LogMovement | null = null;
  if (item.action !== null) {
    const input = object(item.action, ['kind', 'label', 'playerId', 'target']);
    if (!id(input.kind) || typeof input.label !== 'string' || !input.label.length || input.label.length > 2000
      || input.playerId !== null && !id(input.playerId)) throw Error('Invalid log action');
    let target: LogAction['target'] = null;
    if (input.target !== null) {
      if (typeof input.target === 'object' && Object.hasOwn(input.target, 'playerId')) {
        const player = object(input.target, ['playerId']);
        if (!id(player.playerId)) throw Error('Invalid log target');
        target = { playerId: player.playerId };
      } else target = square(input.target);
    }
    action = { kind: input.kind, label: input.label, playerId: input.playerId as string | null, target };
  }
  if (item.movement !== null) {
    const input = object(item.movement, ['commitRevision', 'playerId', 'from', 'to', 'complete']);
    if (!Number.isInteger(input.commitRevision) || Number(input.commitRevision) < 0 || Number(input.commitRevision) >= revision
      || !id(input.playerId) || typeof input.complete !== 'boolean') throw Error('Invalid log movement');
    movement = { commitRevision: Number(input.commitRevision), playerId: input.playerId, from: square(input.from),
      to: input.to === null ? null : square(input.to), complete: input.complete };
  }
  return { version: 1, action, movement };
}

export function decodeLogRoll(value: unknown): LogRoll {
  const item = object(value, ['version', 'base', 'target', 'modifier', 'square']);
  if (item.version !== 1 || !Number.isInteger(item.base) || Number(item.base) < 1 || Number(item.base) > 30
    || !Number.isInteger(item.target) || Number(item.target) < 2 || Number(item.target) > 6
    || !Number.isInteger(item.modifier) || Math.abs(Number(item.modifier)) > 60) throw Error('Invalid native log roll');
  return { version: 1, base: Number(item.base), target: Number(item.target), modifier: Number(item.modifier),
    square: item.square === null ? null : square(item.square) };
}
