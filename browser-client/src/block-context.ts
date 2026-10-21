import type { SetupPlayer, SetupState, SetupAction } from './setup-protocol.ts';
import type { MovementPlan } from './movement-protocol.ts';

export type BlockPoint = { x: number; y: number };
export type BlockAssist = BlockPoint & { playerId: string };
export type BlockHighlight = { playerId: string; targetPlayerId: string; from: BlockPoint; to: BlockPoint;
  offensiveAssists: BlockAssist[]; defensiveAssists: BlockAssist[] };
export type BlockContext = { version: 1; activeTargetPlayerId: string; blocks: BlockHighlight[] };

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid block context');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== keys.length || keys.some(key => !Object.hasOwn(item, key))) throw Error('Unexpected block context fields');
  return item;
}
function playerId(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 100) throw Error('Invalid block participant');
  return value;
}
function point(value: unknown): BlockPoint {
  const square = object(value, ['x', 'y']);
  if (!Number.isInteger(square.x) || !Number.isInteger(square.y) || (square.x as number) < 0 || (square.x as number) > 25
    || (square.y as number) < 0 || (square.y as number) > 14) throw Error('Invalid block square');
  return { x: square.x as number, y: square.y as number };
}
const adjacent = (a: BlockPoint, b: BlockPoint) => Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y)) === 1;

export function decodeBlockHighlight(value: unknown, players?: SetupPlayer[]): BlockHighlight {
  const input = object(value, ['playerId','targetPlayerId','from','to','offensiveAssists','defensiveAssists']);
  const attacker = playerId(input.playerId), target = playerId(input.targetPlayerId), from = point(input.from), to = point(input.to);
  if (attacker === target || !adjacent(from, to)) throw Error('Invalid block participants');
  const known = players && new Map(players.map(player => [player.id, player.role]));
  if (known && (!known.has(attacker) || !known.has(target) || known.get(attacker) === known.get(target))) throw Error('Unknown block participants');
  const seen = new Set([attacker, target]);
  const assists = (value: unknown, supported: string, destination: BlockPoint): BlockAssist[] => {
    if (!Array.isArray(value) || value.length > 8) throw Error('Invalid block assists');
    return value.map(entry => {
      const assist = object(entry, ['playerId','x','y']), id = playerId(assist.playerId), square = point({x:assist.x,y:assist.y});
      if (seen.has(id) || !adjacent(square, destination) || known && (!known.has(id) || known.get(id) !== known.get(supported)))
        throw Error('Invalid block contributor');
      seen.add(id); return { playerId: id, ...square };
    });
  };
  return { playerId: attacker, targetPlayerId: target, from, to,
    offensiveAssists: assists(input.offensiveAssists, attacker, to), defensiveAssists: assists(input.defensiveAssists, target, from) };
}

export function decodeBlockContext(value: unknown, players?: SetupPlayer[]): BlockContext {
  const input = object(value, ['version','activeTargetPlayerId','blocks']);
  if (input.version !== 1 || !Array.isArray(input.blocks) || !input.blocks.length || input.blocks.length > 2) throw Error('Invalid block context');
  const blocks = input.blocks.map(block => decodeBlockHighlight(block, players));
  const active = playerId(input.activeTargetPlayerId);
  if (new Set(blocks.map(block => block.targetPlayerId)).size !== blocks.length || !blocks.some(block => block.targetPlayerId === active)
    || blocks.some(block => block.playerId !== blocks[0].playerId)) throw Error('Invalid active block');
  return { version: 1, activeTargetPlayerId: active, blocks };
}

/** Private proposals require an explicit current selection and authoritative forecast. */
export function proposedBlockContext(view: SetupState, player: string, target: string, action: SetupAction | undefined,
  plan: MovementPlan | null): BlockContext | null {
  if (view.phase !== 'PLAY' || view.callerRole === 'spectator' || view.actor !== view.callerRole) return null;
  if (plan?.kind === 'blitz' && plan.route.revision === view.revision && plan.route.actor === view.callerRole
    && plan.route.playerId === player && plan.targetPlayerId === target && plan.blockHighlight
    && plan.blockHighlight.playerId === player && plan.blockHighlight.targetPlayerId === target) {
    const end = plan.route.steps.at(-1) ?? plan.route.from;
    if (end.x !== plan.blockHighlight.from.x || end.y !== plan.blockHighlight.from.y) return null;
    return { version: 1, activeTargetPlayerId: target, blocks: [plan.blockHighlight] };
  }
  if (!action || action.actor !== view.callerRole || action.sourcePlayerId !== player) return null;
  if (action.kind === 'multiBlock') {
    const group = view.blockPreview?.multiple?.find(option => option.actionId === action.id)?.context;
    return group ? { ...group, activeTargetPlayerId: group.blocks.some(block => block.targetPlayerId === target) ? target : group.activeTargetPlayerId } : null;
  }
  if (!target || !['selectBlock','block','blitzTarget'].includes(action.kind)) return null;
  if (action.kind !== 'selectBlock' && (!action.target || !('playerId' in action.target) || action.target.playerId !== target)) return null;
  const highlight = view.blockPreview?.rolls.find(roll => roll.playerId === player && roll.targetPlayerId === target)?.highlight;
  return highlight ? { version: 1, activeTargetPlayerId: target, blocks: [highlight] } : null;
}

/** Coordinate clearing is presentation state, never a second assist calculation. */
export function currentBlockContext(view: SetupState, context: BlockContext | null = view.blockContext ?? null): BlockContext | null {
  if (!context || view.phase !== 'PLAY') return null;
  const blocks = context.blocks.filter(block => {
    const target = view.players.find(player => player.id === block.targetPlayerId);
    return target?.x === block.to.x && target.y === block.to.y;
  });
  if (!blocks.length) return null;
  return { ...context, blocks, activeTargetPlayerId: blocks.some(block => block.targetPlayerId === context.activeTargetPlayerId)
    ? context.activeTargetPlayerId : blocks[0].targetPlayerId };
}
