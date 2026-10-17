import { useEffect, useState } from 'react';
import type { Reaction } from './setup-protocol.ts';
import { reactionAnchor, reactionSeconds } from './reaction-clock.ts';
import type { ReactionAnchor } from './reaction-clock.ts';

// Retain anchors across dialog remounts and reconnects within the current tab.
const anchors = new Map<string, ReactionAnchor>();

export function ReactionCountdown({ reaction, matchId }: { reaction: Reaction; matchId: string }) {
  const key = `${matchId}:${reaction.id}:${reaction.expiresAt}`;
  let anchor = anchors.get(key);
  if (!anchor) {
    anchor = reactionAnchor(reaction, performance.now()); anchors.set(key, anchor);
    if (anchors.size > 64) anchors.delete(anchors.keys().next().value!);
  }
  const [seconds, setSeconds] = useState(() => reactionSeconds(anchor, performance.now()));
  useEffect(() => {
    const next = reactionAnchor(reaction, performance.now(), anchors.get(key));
    anchors.set(key, next);
    const tick = () => setSeconds(reactionSeconds(next, performance.now()));
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [key, reaction.serverNow]);
  return <p className="reaction-countdown" role="timer" aria-label="Reaction time remaining" aria-live="off">
    {seconds > 0 ? `${seconds}s remaining` : '0s - Awaiting server'}
  </p>;
}
