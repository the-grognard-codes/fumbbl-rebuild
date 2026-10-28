import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { playbackBeats, withConfirmedBallChanges, withConfirmedMove, withBlockContext } from './pitch-playback.ts';
import { blockFaceLabel, diceRollGroups, offeredBlockDice } from './dice-presentation.ts';
import { MultipleBlockDiceReveals } from './multiple-block-dice.ts';
import { DiceStream } from './dice-stream.ts';
import { provisionalMoves, remainingConfirmedBeats, movementBeatMillis } from './provisional-movement.ts';
import { BALL_STEP_MS, PITCH_DICE_ROLL_MS, DICE_GROUP_INTERVAL_MS, playbackRate } from './presentation-timing.ts';
import type { ConfirmedMove, PlaybackBeat } from './pitch-playback.ts';
import type { RoutePreview } from './route-protocol.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

const responseKinds = new Set(['blockDie', 'rerollDie', 'proTestReroll', 'reroll', 'skill', 'kickSkill', 'push', 'followUp', 'apothecary', 'argueTheCall', 'bribe', 'interception', 'reactiveSkill', 'reactiveSquare', 'reactionMove', 'reactionEnd']);

function sequenceKey(view: SetupState): string {
  return [view.matchId, view.half, view.actor, view.turn, view.turnMode, view.activePlayerId].join(':');
}

/** Present native events in order before exposing decisions; never delay server processing. */
export function usePitchPlayback(view: SetupState, records: TranscriptRecord[], enabled: boolean, speed = 1,
  mode: 'live' | 'replay' = 'live', requestPending: string | null = null, snapshotKey?: number) {
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
  const multipleReveals = useRef(new MultipleBlockDiceReveals());
  const recoveringVisibility = useRef(false);
  const receivedSnapshotKey = useRef(snapshotKey);
  const currentSpeed = useRef(speed); currentSpeed.current = speed;
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
  useEffect(() => {
    const recover = () => { recoveringVisibility.current = true; setTick(value => value + 1); };
    document.addEventListener('visibilitychange', recover);
    return () => document.removeEventListener('visibilitychange', recover);
  }, []);
  useLayoutEffect(() => {
    const previous = received.current;
    received.current = view;
    const seeking = snapshotKey !== undefined && snapshotKey !== receivedSnapshotKey.current;
    if (seeking) receivedSnapshotKey.current = snapshotKey;
    const rate = playbackRate(speed, mode);
    const requiresResponse = !!view.prompt || view.actions.some(action => responseKinds.has(action.kind));
    const responseKey = `${view.matchId}:${view.revision}`;
    const responseDice = () => {
      const finalRecord = records[view.revision];
      const report = finalRecord?.revision === view.revision ? playbackBeats(finalRecord)
        .filter(beat => beat.kind === 'dice').map(beat => beat.dice)
        .filter(moment => multipleReveals.current.allows(moment, finalRecord.state)).at(-1) : null;
      const offered = mode === 'live' ? offeredBlockDice(view) : null;
      return (view.activePlayerAction === 'multipleBlock' && offered ? offered : report) ?? offered;
    };
    const restoreResponse = () => {
      const dice = responseDice();
      responseDiceKey.current = dice ? responseKey : null;
      diceRevision.current = view.revision;
      if (!dice) return;
      multipleReveals.current.remember(dice, view);
      pinnedDice.current = view.actions.some(action => ['blockDie', 'reroll', 'skill', 'kickSkill'].includes(action.kind));
      // Recovery restores the result, never an old roll animation or backlog.
      diceStream.current!.enqueue({ ...dice, revision: view.revision }, sequenceKey(view), pinnedDice.current, true, rate);
    };
    const snapshot = () => {
      snapshotRevision.current = view.revision;
      multipleReveals.current.reset();
      multipleReveals.current.update(view);
      cancel(); completed.current = view.revision;
      responseDiceKey.current = null;
      presented.current = view; setPitchView(view); setActive(false);
      setMoveMillis(0); setSynchronizing(false);
      if (enabled && mode === 'live' && requiresResponse && !document.hidden) restoreResponse();
    };
    // Reconnect, a different match, backward seek and nonadjacent replay seeks
    // establish a snapshot. No stale timer may write over that snapshot.
    if (!enabled || document.hidden || recoveringVisibility.current || seeking || previous.matchId !== view.matchId || view.revision < previous.revision
      || mode === 'replay' && Math.abs(view.revision - previous.revision) > 1) {
      recoveringVisibility.current = false;
      snapshot();
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
      const delay = movementBeatMillis(1, 'live', reduced);
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
    if (running.current) return;
    if (view.revision > diceRevision.current && pinnedDice.current) {
      pinnedDice.current = false; diceStream.current!.release();
    }
    if (completed.current >= view.revision) {
      multipleReveals.current.update(view);
      presented.current = view; setPitchView(view); setActive(false);
      setSynchronizing(false);
      if (mode === 'live' && requiresResponse && responseDiceKey.current !== responseKey) restoreResponse();
      return;
    }
    const record = records[completed.current + 1];
    if (!record || record.revision !== completed.current + 1) {
      // A missing transcript cannot postpone a newly offered mandatory response.
      if (view.prompt || view.actions.some(action => responseKinds.has(action.kind)) || view.phase === 'FULL_TIME') {
        snapshot();
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
    multipleReveals.current.update(record.state);
    let beats = playbackBeats(record, presented.current.ball);
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
    // Some native decisions (notably Multiple Block) offer authoritative faces
    // before emitting a report. Present those faces once at the queue boundary.
    const offered = mode === 'live' && record.revision === latest.current.revision ? offeredBlockDice(latest.current) : null;
    if (offered && (latest.current.activePlayerAction === 'multipleBlock' || !beats.some(beat => beat.kind === 'dice'
      && beat.dice.selected === null && beat.dice.faces.some(face => blockFaceLabel(face))))) {
      beats.push({ kind: 'dice', dice: offered });
    }
    // Armour/injury/casualty in one report are separate logical rolls. Keep
    // simultaneous dice together while using the same queue as board events.
    beats = beats.flatMap<PlaybackBeat>(beat => beat.kind === 'dice'
      ? diceRollGroups(beat.dice).map(dice => ({ kind: 'dice' as const, dice })) : [beat]);
    const token = generation.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
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
      const rate = playbackRate(currentSpeed.current, mode);
      const beat = beats[index];
      if (beat.kind === 'dice') {
        if (!multipleReveals.current.allows(beat.dice, record.state)) return false;
        multipleReveals.current.remember(beat.dice, record.state);
        diceRevision.current = record.revision;
        const response = mode === 'live' && record.revision === latest.current.revision
          && (latest.current.prompt || latest.current.actions.some(action => responseKinds.has(action.kind)));
        const finalResponseRoll = response && index === finalDiceIndex;
        const keep = !!finalResponseRoll && latest.current.actions.some(action => ['blockDie', 'reroll', 'skill', 'kickSkill'].includes(action.kind));
        if (finalResponseRoll) {
          responseDiceKey.current = `${latest.current.matchId}:${record.revision}`;
          pinnedDice.current = keep;
        }
        diceStream.current!.enqueue({ ...beat.dice, revision: record.revision, rollDuration: PITCH_DICE_ROLL_MS / rate,
          rollKey: !reduced && beat.dice.selected === null ? `${record.revision}:${index}` : undefined },
          sequenceKey(record.state), keep, false, rate, reduced);
        return true;
      }
    };
    const advance = (index: number) => {
      if (generation.current !== token) return;
      const rate = playbackRate(currentSpeed.current, mode);
      for (; index < beats.length; index += 1) {
        const beat = beats[index];
        if (beat.kind === 'dice') {
          if (!presentDice(index)) continue;
          setMoveMillis(0);
          const nextIndex = index + 1;
          pendingBeat.current = { view: presented.current, delay: DICE_GROUP_INTERVAL_MS / rate,
            advance: () => advance(nextIndex) };
          return;
        }
        const current = presented.current;
        const moved = beat.kind === 'move' ? withConfirmedMove(current, beat.move) : current;
        const next = beat.kind === 'block' ? withBlockContext(current, beat.context)
          : beat.ballChanges ? withConfirmedBallChanges(moved, beat.ballChanges) : moved;
        if (next === current) continue;
        // Start the next delay only after React commits this square. Separate
        // timer tasks alone can still be batched, especially in reduced motion.
        const delay = beat.kind === 'block' ? 16 : beat.kind === 'ball' ? BALL_STEP_MS / rate
          : movementBeatMillis(currentSpeed.current, mode, reduced);
        setMoveMillis(reduced || beat.kind === 'block' ? 0 : delay);
        const nextIndex = index + 1;
        pendingBeat.current = { view: next, delay, advance: () => advance(nextIndex) };
        presented.current = next; setPitchView(next);
        return;
      }
      finish();
    };
    advance(0);
  }, [view, records, enabled, tick, speed, mode, requestPending, snapshotKey]);
  useLayoutEffect(() => {
    const pending = pendingBeat.current;
    if (!pending || pending.view !== pitchView) return;
    pendingBeat.current = null;
    pending.committed?.();
    timer.current = setTimeout(pending.advance, pending.delay);
  }, [pitchView, diceMoment]);
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
