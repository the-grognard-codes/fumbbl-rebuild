import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { playbackBeats, withConfirmedBallChanges, withConfirmedMove } from './pitch-playback.ts';
import { recordDice } from './dice-presentation.ts';
import { DiceStream } from './dice-stream.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

const responseKinds = new Set(['blockDie', 'rerollDie', 'proTestReroll', 'reroll', 'skill', 'kickSkill', 'push', 'followUp', 'apothecary', 'argueTheCall', 'interception', 'reactiveSkill', 'reactiveSquare', 'reactionMove', 'reactionEnd']);

function sequenceKey(view: SetupState): string {
  return [view.matchId, view.half, view.actor, view.turn, view.turnMode, view.activePlayerId].join(':');
}

/** Movement is ordered. Decorative dice never hold the authoritative decision queue. */
export function usePitchPlayback(view: SetupState, records: TranscriptRecord[], enabled: boolean, speed = 1,
  mode: 'live' | 'replay' = 'live') {
  const [pitchView, setPitchView] = useState(view);
  const [active, setActive] = useState(false);
  const [diceMoment, setDiceMoment] = useState<DiceMoment | null>(null);
  const [tick, setTick] = useState(0);
  const presented = useRef(view), received = useRef(view), latest = useRef(view);
  const completed = useRef(view.revision), generation = useRef(0);
  const running = useRef(false), waiting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBeat = useRef<{ view: SetupState; advance: () => void; delay: number } | null>(null);
  const diceStream = useRef<DiceStream | null>(null);
  if (!diceStream.current) diceStream.current = new DiceStream(setDiceMoment);
  const diceRevision = useRef(view.revision);
  const pinnedDice = useRef(false);
  const responseDiceKey = useRef<string | null>(null);
  const snapshotRevision = useRef(view.revision);
  latest.current = view;
  const clearDice = () => { pinnedDice.current = false; diceStream.current!.clear(); };
  const cancel = () => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    pendingBeat.current = null;
    clearDice();
    timer.current = null; running.current = false; waiting.current = false;
  };
  useEffect(() => () => cancel(), []);
  useLayoutEffect(() => {
    const previous = received.current;
    received.current = view;
    // Reconnect, a different match, backward seek and nonadjacent replay seeks
    // establish a snapshot. No stale timer may write over that snapshot.
    if (!enabled || previous.matchId !== view.matchId || view.revision < previous.revision
      || mode === 'replay' && Math.abs(view.revision - previous.revision) > 1) {
      snapshotRevision.current = view.revision;
      cancel(); completed.current = view.revision;
      responseDiceKey.current = null;
      presented.current = view; setPitchView(view); clearDice(); setActive(false);
      return;
    }
    // A resolved response releases its pinned roll. Ordinary groups keep their
    // individual lifetimes across newer revisions of the same action.
    if (view.revision > diceRevision.current && pinnedDice.current) clearDice();
    const responseKey = `${view.matchId}:${view.revision}`;
    const finalRecord = records[view.revision];
    const responseDice = finalRecord?.revision === view.revision ? recordDice(finalRecord).at(-1) : null;
    if ((view.prompt || view.actions.some(action => responseKinds.has(action.kind)))
      && (completed.current < view.revision || responseDice && responseDiceKey.current !== responseKey)) {
      // Responses use the current authoritative board, even when an older
      // movement sequence is still being presented. Old timers cannot hide it.
      cancel(); completed.current = view.revision; presented.current = view;
      setPitchView(view); setActive(false);
      // A current snapshot may arrive before its transcript, including after
      // reconnect. Restore that result once without replaying it on every render.
      const dice = responseDice;
      responseDiceKey.current = dice ? responseKey : null;
      diceRevision.current = view.revision;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      // A coach may pause before choosing a reroll or skill. Keep the revealed
      // result with that prompt until an accepted revision resolves it.
      const pendingRoll = view.actions.some(action => ['blockDie', 'reroll', 'skill', 'kickSkill'].includes(action.kind));
      // Restoring a snapshot exposes its result without replaying an old numeric roll.
      pinnedDice.current = pendingRoll;
      if (dice) diceStream.current!.enqueue({ ...dice, revision: view.revision, rollKey: !reduced && dice.selected === null
        && view.revision > snapshotRevision.current ? `${view.revision}:response` : undefined },
        sequenceKey(view), pendingRoll, view.revision <= snapshotRevision.current);
      else clearDice();
      return;
    }
    if (running.current) return;
    if (completed.current >= view.revision) {
      presented.current = view; setPitchView(view); setActive(false);
      return;
    }
    const record = records[completed.current + 1];
    if (!record || record.revision !== completed.current + 1) {
      // A missing transcript cannot postpone a newly offered mandatory response.
      if (view.prompt || view.actions.some(action => responseKinds.has(action.kind)) || view.phase === 'FULL_TIME') {
        cancel(); completed.current = view.revision; presented.current = view;
        setPitchView(view); clearDice(); setActive(false);
        return;
      }
      setActive(true);
      if (!waiting.current) {
        waiting.current = true;
        timer.current = setTimeout(() => {
          waiting.current = false; timer.current = null; completed.current = latest.current.revision;
          presented.current = latest.current; setPitchView(latest.current); clearDice(); setActive(false);
          setTick(value => value + 1);
        }, 1000);
      }
      return;
    }
    if (waiting.current && timer.current) clearTimeout(timer.current);
    waiting.current = false; timer.current = null;
    const beats = playbackBeats(record);
    const token = generation.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
    running.current = true; setActive(true);
    const finish = () => {
      if (generation.current !== token) return;
      const final = record.revision === latest.current.revision ? latest.current : {
        ...record.state, callerRole: latest.current.callerRole, actions: [], prompt: null
      } as SetupState;
      presented.current = final; setPitchView(final); completed.current = record.revision;
      running.current = false; timer.current = null;
      setActive(completed.current < latest.current.revision);
      setTick(value => value + 1);
    };
    const advance = (index: number) => {
      if (generation.current !== token) return;
      for (; index < beats.length; index += 1) {
        const beat = beats[index];
        if (beat.kind === 'dice') {
          diceRevision.current = record.revision;
          diceStream.current!.enqueue({ ...beat.dice, revision: record.revision, rollKey: !reduced && beat.dice.selected === null ? `${record.revision}:${index}` : undefined },
            sequenceKey(record.state));
          continue;
        }
        const current = presented.current;
        const moved = beat.kind === 'move' ? withConfirmedMove(current, beat.move) : current;
        const next = beat.ballChanges ? withConfirmedBallChanges(moved, beat.ballChanges) : moved;
        if (next === current) continue;
        // Start the next delay only after React commits this square. Separate
        // timer tasks alone can still be batched, especially in reduced motion.
        pendingBeat.current = { view: next, advance: () => advance(index + 1), delay: reduced ? 16 : 190 / safeSpeed };
        presented.current = next; setPitchView(next);
        return;
      }
      finish();
    };
    advance(0);
  }, [view, records, enabled, tick, speed, mode]);
  useLayoutEffect(() => {
    const pending = pendingBeat.current;
    if (!pending || pending.view !== pitchView) return;
    pendingBeat.current = null;
    timer.current = setTimeout(pending.advance, pending.delay);
  }, [pitchView]);
  return { pitchView, playbackActive: active, diceMoment,
    diceSnapshot: pitchView.revision === snapshotRevision.current };
}
