import type { Reaction } from './setup-protocol.ts';

export type ReactionAnchor = { expiresAt: number; remainingMs: number; startedAt: number };

/** Server timestamps establish the remaining time; local wall-clock changes cannot extend it. */
export function reactionAnchor(reaction: Reaction, now: number, previous?: ReactionAnchor): ReactionAnchor {
  const reported = Math.max(0, Math.min(reaction.allowanceMs ?? 30_000, reaction.expiresAt - reaction.serverNow));
  const remainingMs = previous?.expiresAt === reaction.expiresAt
    ? Math.min(reported, Math.max(0, previous.remainingMs - Math.max(0, now - previous.startedAt))) : reported;
  return { expiresAt: reaction.expiresAt, remainingMs, startedAt: now };
}

export function reactionSeconds(anchor: ReactionAnchor, now: number): number {
  return Math.ceil(reactionRemainingMs(anchor, now) / 1000);
}

export function reactionRemainingMs(anchor: ReactionAnchor, now: number): number {
  return Math.max(0, anchor.remainingMs - Math.max(0, now - anchor.startedAt));
}
