export type ComputerPolicyMemory = {
  version: 1; turnKey: string; actions: number; mistakeUsed: boolean;
  plan: null | { playerId: string; kind: 'move' | 'blitz' | 'foul' | 'pass' | 'handOff' | 'secureBall';
    targetPlayerId: string | null; target: { x: number; y: number } };
};

export type ComputerPolicyContext = {
  opponentId: 'coach-bugman-random' | 'coach-bogruk-weak'; policyVersion: 'random-v1' | 'bogruk-v1'; seed: number;
  policyState: ComputerPolicyMemory | null; progress: { turnKey: string; stalledTurns: number };
  attackDirection: 1 | -1; movement: { normalRemaining: number; remaining: number } | null;
};

function shape(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid computer context');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key)))
    throw Error('Unexpected computer fields');
  return result;
}

function text(value: unknown, maximum: number): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > maximum || /[\r\n]/.test(value))
    throw Error('Invalid computer text');
}

function integer(value: unknown, maximum: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum)
    throw Error('Invalid computer number');
}

export function decodeComputerPolicyMemory(value: unknown): ComputerPolicyMemory {
  const memory = shape(value, ['version', 'turnKey', 'actions', 'mistakeUsed', 'plan']);
  if (memory.version !== 1 || typeof memory.mistakeUsed !== 'boolean') throw Error('Invalid computer memory');
  text(memory.turnKey, 100); integer(memory.actions, 256);
  if (memory.plan !== null) {
    const plan = shape(memory.plan, ['playerId', 'kind', 'targetPlayerId', 'target']);
    text(plan.playerId, 200);
    if (!['move', 'blitz', 'foul', 'pass', 'handOff', 'secureBall'].includes(plan.kind as string)) throw Error('Invalid computer plan');
    if (plan.targetPlayerId !== null) text(plan.targetPlayerId, 200);
    const target = shape(plan.target, ['x', 'y']); integer(target.x, 25); integer(target.y, 14);
  }
  return memory as ComputerPolicyMemory;
}

export function decodeComputerPolicyContext(value: unknown): ComputerPolicyContext {
  const context = shape(value, ['opponentId', 'policyVersion', 'seed', 'policyState', 'progress', 'attackDirection', 'movement']);
  if (!(context.opponentId === 'coach-bugman-random' && context.policyVersion === 'random-v1'
    || context.opponentId === 'coach-bogruk-weak' && context.policyVersion === 'bogruk-v1')) throw Error('Unsupported computer policy');
  integer(context.seed, 0xffffffff);
  if (context.policyState !== null) {
    if (context.opponentId !== 'coach-bogruk-weak') throw Error('Unexpected random policy memory');
    decodeComputerPolicyMemory(context.policyState);
  }
  const progress = shape(context.progress, ['turnKey', 'stalledTurns']);
  text(progress.turnKey, 100); integer(progress.stalledTurns, 255);
  if (context.attackDirection !== 1 && context.attackDirection !== -1) throw Error('Invalid attacking direction');
  if (context.movement !== null) {
    const movement = shape(context.movement, ['normalRemaining', 'remaining']);
    integer(movement.normalRemaining, 20); integer(movement.remaining, 20);
    if ((movement.normalRemaining as number) > (movement.remaining as number)) throw Error('Invalid movement budget');
  }
  return context as ComputerPolicyContext;
}
