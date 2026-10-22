import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { playbackBeats, withConfirmedBallChanges, withConfirmedMove, withBlockContext } from './pitch-playback.ts';
import { offeredBlockDice, recordDice } from './dice-presentation.ts';
import { DiceStream } from './dice-stream.ts';
import { provisionalMoves, remainingConfirmedBeats, movementBeatMillis } from './provisional-movement.ts';
import type { ConfirmedMove } from './pitch-playback.ts';
import type { RoutePreview } from './route-protocol.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

const responseKinds = new Set(['blockDie', 'rerollDie', 'proTestReroll', 'reroll', 'skill', 'kickSkill', 'push', 'followUp', 'apothecary', 'argueTheCall', 'interception', 'reactiveSkill', 'reactiveSquare', 'reactionMove', 'reactionEnd']);

function sequenceKey(view: SetupState): string {
  return [view.matchId, view.half, view.actor, view.turn, view.turnMode, view.activePlayerId].join(':');
}

/** Movement is ordered. Decorative dice never hold the authoritative decision queue. */
export function usePitchPlayback(view: SetupState, records: TranscriptRecord[], enabled: boolean, speed = 1,
  mode: 'live' | 'replay' = 'live', requestPending: string | null = null) {
  const [pitchView, setPitchView] = useState(view);
  const [active, setActive] = useState(false);
  const [diceMoment, setDiceMoment] = useState<DiceMoment | null>(null);
  const [tick, setTick] = useState(0);
  const [moveMillis, setMoveMillis] = useState(0);
  const [synchronizing, setSynchronizing] = useState(false);
  const presented = useRef(view), received = useRef(view), latest = useRef(view);
  const completed = useRef(view.revision), generation = useRef(0);
  const running = useRef(false), waiting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBeat = useRef<{ view: SetupState; advance: () => void; delay: number; committed?: () => void } | null>(null);
  const provisional = useRef<{ base: SetupState; moves: ConfirmedMove[]; shown: ConfirmedMove[] } | null>(null);
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
    provisional.current = null;
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
      setMoveMillis(0); setSynchronizing(false);
      return;
    }
    const prediction = provisional.current;
    if (prediction && view.revision === prediction.base.revision) {
      if (!requestPending) {
        cancel(); presented.current = view; setPitchView(view); setActive(false); setMoveMillis(0);
        return;
      }
      if (running.current || prediction.shown.length >= prediction.moves.length) return;
      const move = prediction.moves[prediction.shown.length];
      const next = withConfirmedMove(presented.current, move);
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const delay = movementBeatMillis(prediction.moves.length, 1, 'live', reduced);
      running.current = true; setActive(true); setMoveMillis(reduced ? 0 : delay);
      const token = generation.current;
      pendingBeat.current = { view: next, delay, committed: () => prediction.shown.push(move), advance: () => {
        if (generation.current !== token) return;
        running.current = false; timer.current = null; setTick(value => value + 1);
      } };
      presented.current = next; setPitchView(next);
      return;
    }
    // A resolved response releases its pinned roll. Ordinary groups keep their
    // individual lifetimes across newer revisions of the same action.
    if (view.revision > diceRevision.current && pinnedDice.current) clearDice();
    const responseKey = `${view.matchId}:${view.revision}`;
    const finalRecord = records[view.revision];
    const responseDice = (finalRecord?.revision === view.revision ? recordDice(finalRecord).at(-1) : null)
      ?? (mode === 'live' ? offeredBlockDice(view) : null);
    const requiresResponse = !!view.prompt || view.actions.some(action => responseKinds.has(action.kind));
    const nextRecord = records[completed.current + 1];
    const precedingMoves = nextRecord?.revision === completed.current + 1
      && playbackBeats(nextRecord).some(beat => beat.kind === 'move');
    if (requiresResponse && !running.current && !precedingMoves
      && (completed.current < view.revision || responseDice && responseDiceKey.current !== responseKey)) {
      // Responses use the current authoritative board, even when an older
      // movement sequence is still being presented. Old timers cannot hide it.
      cancel(); completed.current = view.revision; presented.current = view;
      setPitchView(view); setActive(false);
      setMoveMillis(0); setSynchronizing(false);
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
      setSynchronizing(false);
      return;
    }
    const record = records[completed.current + 1];
    if (!record || record.revision !== completed.current + 1) {
      // A missing transcript cannot postpone a newly offered mandatory response.
      if (view.prompt || view.actions.some(action => responseKinds.has(action.kind)) || view.phase === 'FULL_TIME') {
        cancel(); completed.current = view.revision; presented.current = view;
        setPitchView(view); clearDice(); setActive(false);
        setMoveMillis(0); setSynchronizing(false);
        return;
      }
      setActive(true);
      setSynchronizing(true);
      if (!waiting.current) {
        waiting.current = true;
        timer.current = setTimeout(() => {
          waiting.current = false; timer.current = null; completed.current = latest.current.revision;
          presented.current = latest.current; setPitchView(latest.current); clearDice(); setActive(false);
          provisional.current = null; setMoveMillis(0); setSynchronizing(false);
          setTick(value => value + 1);
        }, 1000);
      }
      return;
    }
    if (waiting.current && timer.current) clearTimeout(timer.current);
    waiting.current = false; timer.current = null;
    setSynchronizing(false);
    let beats = playbackBeats(record);
    if (prediction) {
      const remaining = remainingConfirmedBeats(beats, prediction.shown);
      provisional.current = null;
      if (remaining === null) {
        // Divergence is recovery, never a fabricated path or a second submission.
        cancel(); completed.current = view.revision; presented.current = view;
        setPitchView(view); setActive(false); setMoveMillis(0);
        return;
      }
      beats = remaining;
    }
    const token = generation.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const moveCount = beats.filter(beat => beat.kind === 'move').length;
    const queuedMoves = mode === 'live' ? records.slice(record.revision + 1, view.revision + 1)
      .reduce((count, queued) => count + playbackBeats(queued).filter(beat => beat.kind === 'move').length, 0) : 0;
    const finalDiceIndex = beats.reduce((last, beat, index) => beat.kind === 'dice' ? index : last, -1);
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
    const presentDice = (index: number) => {
      const beat = beats[index];
      if (beat.kind === 'dice') {
        diceRevision.current = record.revision;
        const response = mode === 'live' && record.revision === latest.current.revision
          && (latest.current.prompt || latest.current.actions.some(action => responseKinds.has(action.kind)));
        const finalResponseRoll = response && index === finalDiceIndex;
        const keep = !!finalResponseRoll && latest.current.actions.some(action => ['blockDie', 'reroll', 'skill', 'kickSkill'].includes(action.kind));
        if (finalResponseRoll) {
          responseDiceKey.current = `${latest.current.matchId}:${record.revision}`;
          pinnedDice.current = keep;
        }
        diceStream.current!.enqueue({ ...beat.dice, revision: record.revision, rollKey: !reduced && beat.dice.selected === null ? `${record.revision}:${index}` : undefined },
          sequenceKey(record.state), keep);
      }
    };
    const advance = (index: number) => {
      if (generation.current !== token) return;
      for (; index < beats.length; index += 1) {
        const beat = beats[index];
        if (beat.kind === 'dice') { presentDice(index); continue; }
        const current = presented.current;
        const moved = beat.kind === 'move' ? withConfirmedMove(current, beat.move) : current;
        const next = beat.kind === 'block' ? withBlockContext(current, beat.context)
          : beat.ballChanges ? withConfirmedBallChanges(moved, beat.ballChanges) : moved;
        if (next === current) continue;
        // Start the next delay only after React commits this square. Separate
        // timer tasks alone can still be batched, especially in reduced motion.
        const response = mode === 'live' && (latest.current.prompt || latest.current.actions.some(action => responseKinds.has(action.kind)));
        const delay = beat.kind === 'block' || reduced ? 16 : response
          ? Math.max(16, 120 / Math.max(1, moveCount)) : movementBeatMillis(moveCount + queuedMoves, speed, mode, reduced);
        setMoveMillis(reduced ? 0 : delay);
        let nextIndex = index + 1;
        pendingBeat.current = { view: next, delay, advance: () => advance(nextIndex), committed: () => {
          if (generation.current !== token || mode !== 'live' || beat.kind !== 'move') return;
          // The authoritative square has committed. Reveal its following rolls
          // while the sprite travels, retaining the full animation interval
          // before another board change or completion can reset its duration.
          while (nextIndex < beats.length) {
            const following = beats[nextIndex];
            if (following.kind === 'dice') presentDice(nextIndex++);
            else if (following.kind === 'block' && withBlockContext(presented.current, following.context) === presented.current) nextIndex++;
            else break;
          }
        } };
        presented.current = next; setPitchView(next);
        return;
      }
      finish();
    };
    advance(0);
  }, [view, records, enabled, tick, speed, mode, requestPending]);
  useLayoutEffect(() => {
    const pending = pendingBeat.current;
    if (!pending || pending.view !== pitchView) return;
    pendingBeat.current = null;
    pending.committed?.();
    timer.current = setTimeout(pending.advance, pending.delay);
  }, [pitchView]);
  const beginProvisional = (route: RoutePreview) => {
    if (!enabled || mode !== 'live' || running.current || waiting.current || provisional.current) return;
    const moves = provisionalMoves(latest.current, route);
    if (!moves.length) return;
    provisional.current = { base: latest.current, moves, shown: [] };
    setTick(value => value + 1);
  };
  return { pitchView, playbackActive: active, diceMoment, synchronizing, movementDuration: moveMillis, beginProvisional,
    diceSnapshot: pitchView.revision === snapshotRevision.current };
}
