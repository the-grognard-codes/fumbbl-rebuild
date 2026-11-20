import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { playbackBeats, failedRerollGate, withConfirmedBallChanges, withConfirmedMove, withBlockContext, withConfirmedPlayerChanges } from './pitch-playback.ts';
import { blockFaceLabel, diceRollGroups, offeredBlockDice, isOfferedPartialReroll } from './dice-presentation.ts';
import { MultipleBlockDiceReveals } from './multiple-block-dice.ts';
import { DiceStream } from './dice-stream.ts';
import { provisionalMoves, remainingConfirmedBeats, movementBeatMillis } from './provisional-movement.ts';
import { BALL_STEP_MS, PITCH_DICE_ROLL_MS, DICE_GROUP_INTERVAL_MS, DICE_EXIT_MS, ANNOUNCEMENT_GAP_MS, ANNOUNCEMENT_CHAIN_GAP_MS, LIVE_CATCHUP_THRESHOLD, LIVE_CATCHUP_RATE, playbackRate } from './presentation-timing.ts';
import type { ConfirmedMove, PlaybackBeat } from './pitch-playback.ts';
import type { RoutePreview } from './route-protocol.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { announcementReadingDuration } from './match-announcements.ts';
import type { MatchAnnouncement } from './match-announcements.ts';
import type { MatchSplashProps } from './MatchSplash.tsx';
import { useAnnouncementPreferences } from './use-announcement-preferences.ts';

type QueuedAnnouncement = {
  card: MatchAnnouncement;
  score: Pick<SetupState, 'homeScore' | 'awayScore'>;
  chained: boolean;
};

const responseKinds = new Set(['blockDie', 'rerollDie', 'proTestReroll', 'reroll', 'skill', 'kickSkill', 'pileDriver', 'push', 'followUp', 'apothecary', 'argueTheCall', 'bribe', 'interception', 'reactiveSkill', 'reactiveSquare', 'reactionMove', 'reactionEnd']);

function sequenceKey(view: SetupState): string {
  return [view.matchId, view.half, view.actor, view.turn, view.turnMode, view.activePlayerId].join(':');
}

function viewAfterBeat(view: SetupState, beat: Exclude<PlaybackBeat, { kind: 'dice' | 'announcement' }>): SetupState {
  if (beat.kind === 'block') return withBlockContext(view, beat.context);
  if (beat.kind === 'player') return withConfirmedPlayerChanges(view, beat.playerId, beat.changes);
  const moved = beat.kind === 'move' ? withConfirmedMove(view, beat.move) : view;
  return beat.ballChanges ? withConfirmedBallChanges(moved, beat.ballChanges) : moved;
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
  const [announcement, setAnnouncement] = useState<MatchAnnouncement | null>(null);
  const [announcementExiting, setAnnouncementExiting] = useState(false);
  const [announcementRate, setAnnouncementRate] = useState(1);
  const [announcementShadeHeld, setAnnouncementShadeHeld] = useState(false);
  const [announcementFading, setAnnouncementFading] = useState(false);
  const announcementPreferences = useAnnouncementPreferences();
  const hiddenAnnouncements = useRef(announcementPreferences.hiddenAnnouncements);
  hiddenAnnouncements.current = announcementPreferences.hiddenAnnouncements;
  const announcementQueue = useRef<QueuedAnnouncement[]>([]);
  const canChainAnnouncement = useRef(false);
  const pendingAnnouncement = useRef<{ closing: boolean; chained: boolean; skipGap?: () => void } | null>(null);
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcementTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcementExitComplete = useRef<(() => void) | null>(null);
  const announced = useRef(new Set<string>());
  const presented = useRef(view), received = useRef(view), latest = useRef(view);
  // Observation only: the revision whose first beat is being committed can be
  // newer than the fully presented board revision during an ordered route.
  const presentationRevision = useRef(view.revision);
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
  const currentRate = useRef(playbackRate(speed, mode));
  currentRate.current = playbackRate(speed, mode);
  const catchingUp = useRef(false);
  const nativeRate = () => mode === 'live' && catchingUp.current ? LIVE_CATCHUP_RATE : currentRate.current;
  latest.current = view;
  const clearDice = () => { pinnedDice.current = false; diceStream.current!.clear(); };
  const cancel = () => {
    catchingUp.current = false;
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    pendingBeat.current = null;
    announcementQueue.current = [];
    canChainAnnouncement.current = false;
    pendingAnnouncement.current = null; setAnnouncement(null);
    announcementExitComplete.current = null;
    setAnnouncementExiting(false);
    setAnnouncementShadeHeld(false);
    setAnnouncementFading(false);
    if (announcementTimer.current) clearTimeout(announcementTimer.current);
    announcementTimer.current = null;
    if (announcementTransitionTimer.current) clearTimeout(announcementTransitionTimer.current);
    announcementTransitionTimer.current = null;
    provisional.current = null;
    clearDice();
    timer.current = null; running.current = false; waiting.current = false;
  };
  // The preference can change while cards wait behind an active splash.
  const nextVisibleAnnouncement = useCallback(() => {
    const queue = announcementQueue.current;
    while (queue.length && hiddenAnnouncements.current.includes(queue[0].card.kind)) queue.shift();
    return queue[0];
  }, []);
  const startNextAnnouncement = (shadeHeld = false) => {
    const next = nextVisibleAnnouncement();
    setAnnouncementShadeHeld(shadeHeld && !!next?.chained);
    if (!next) {
      canChainAnnouncement.current = false;
      if (shadeHeld) setAnnouncementFading(true);
      setTick(value => value + 1);
      return;
    }
    announcementQueue.current.shift();
    if (next.card.kind === 'touchdown') {
      const current = presented.current;
      const scored = { ...current, ...next.score };
      // Keep a native beat's commit boundary when the score changes in the same render.
      if (pendingBeat.current?.view === current) pendingBeat.current.view = scored;
      presented.current = scored;
      setPitchView(scored);
    }
    pendingAnnouncement.current = { closing: false, chained: false };
    setAnnouncementFading(false);
    setAnnouncementRate(currentRate.current);
    setAnnouncement(next.card);
  };
  const scoreBeforeQueuedTouchdown = (next: SetupState): SetupState =>
    announcementQueue.current.some(queued => queued.card.kind === 'touchdown')
      ? { ...next, homeScore: presented.current.homeScore, awayScore: presented.current.awayScore } : next;
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
    // Keep catch-up through the tail, even after the backlog drops below the entry threshold.
    if (mode !== 'live' || completed.current >= view.revision) catchingUp.current = false;
    else if (view.revision - completed.current >= LIVE_CATCHUP_THRESHOLD) catchingUp.current = true;
    const requiresResponse = !!view.prompt || !!view.reaction || view.actions.some(action => responseKinds.has(action.kind));
    const deferScoringResponse = view.drive > presented.current.drive
      || view.homeScore > presented.current.homeScore || view.awayScore > presented.current.awayScore;
    const responseKey = `${view.matchId}:${view.revision}`;
    const responseDice = () => {
      const finalRecord = records[view.revision];
      const report = finalRecord?.revision === view.revision ? playbackBeats(finalRecord)
        .filter(beat => beat.kind === 'dice').map(beat => beat.dice)
        .filter(moment => multipleReveals.current.allows(moment, finalRecord.state)).at(-1) : null;
      const offered = mode === 'live' ? offeredBlockDice(view) : null;
      return (view.activePlayerAction === 'multipleBlock' && offered && !isOfferedPartialReroll(report, offered) ? offered : report) ?? offered;
    };
    const restoreResponse = () => {
      const dice = responseDice();
      responseDiceKey.current = dice ? responseKey : null;
      diceRevision.current = view.revision;
      if (!dice) return;
      multipleReveals.current.remember(dice, view);
      pinnedDice.current = view.actions.some(action => ['blockDie', 'reroll', 'skill', 'kickSkill'].includes(action.kind));
      // Recovery restores the result, never an old roll animation or backlog.
      diceStream.current!.enqueue({ ...dice, revision: view.revision }, sequenceKey(view), pinnedDice.current, true, nativeRate());
    };
    const snapshot = () => {
      presentationRevision.current = view.revision;
      snapshotRevision.current = view.revision;
      multipleReveals.current.reset();
      multipleReveals.current.update(view);
      cancel(); completed.current = view.revision;
      announced.current.clear();
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
      const delay = movementBeatMillis(1, reduced);
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
    const nextRecord = records[completed.current + 1];
    const retainRoll = !!nextRecord && failedRerollGate(nextRecord, records);
    if (view.revision > diceRevision.current && pinnedDice.current && !retainRoll) {
      pinnedDice.current = false; diceStream.current!.release();
    }
    if (completed.current >= view.revision) {
      multipleReveals.current.update(view);
      const visible = scoreBeforeQueuedTouchdown(view);
      presented.current = visible; setPitchView(visible); setActive(false);
      setSynchronizing(false);
      if (mode === 'live' && requiresResponse && responseDiceKey.current !== responseKey) restoreResponse();
      return;
    }
    const record = records[completed.current + 1];
    if (!record || record.revision !== completed.current + 1) {
      // Missing history can postpone a choice, but cannot interrupt an earlier splash.
      if (pendingAnnouncement.current) {
        setActive(true);
        setSynchronizing(true);
        return;
      }
      // A missing transcript cannot postpone a newly offered mandatory response.
      if (!deferScoringResponse && (view.prompt || view.actions.some(action => responseKinds.has(action.kind)) || view.phase === 'FULL_TIME')) {
        snapshot();
        return;
      }
      canChainAnnouncement.current = false;
      setActive(true);
      setSynchronizing(true);
      // A future drive decision cannot stand in for its missing scoring
      // movement/announcement. Resume when the transcript arrives, or recover
      // through the normal reconnect/log-unavailable snapshot path.
      if (deferScoringResponse) return;
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
    const inheritedGate = failedRerollGate({ ...record, native: [] }, records);
    let beats = playbackBeats(record, presented.current.ball, inheritedGate);
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
    if (offered && !retainRoll && !beats.some(beat => beat.kind === 'dice' && isOfferedPartialReroll(beat.dice, offered))
      && (latest.current.activePlayerAction === 'multipleBlock' || !beats.some(beat => beat.kind === 'dice'
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
      const visible = scoreBeforeQueuedTouchdown(final);
      presented.current = visible; setPitchView(visible);
      completed.current = record.revision;
      running.current = false; timer.current = null;
      setActive(completed.current < latest.current.revision);
      setMoveMillis(0);
      setTick(value => value + 1);
    };
    const presentDice = (dice: DiceMoment, index: number, rate: number) => {
      multipleReveals.current.remember(dice, record.state);
      diceRevision.current = record.revision;
      const response = mode === 'live' && record.revision === latest.current.revision
        && (latest.current.prompt || latest.current.actions.some(action => responseKinds.has(action.kind)));
      const finalResponseRoll = response && index === finalDiceIndex;
      const keep = !!finalResponseRoll && latest.current.actions.some(action => ['blockDie', 'reroll', 'skill', 'kickSkill'].includes(action.kind));
      if (finalResponseRoll) {
        responseDiceKey.current = `${latest.current.matchId}:${record.revision}`;
        pinnedDice.current = keep;
      }
      diceStream.current!.enqueue({ ...dice, revision: record.revision, rollDuration: PITCH_DICE_ROLL_MS / rate,
        rollKey: !reduced && dice.selected === null ? `${record.revision}:${index}` : undefined },
        sequenceKey(record.state), keep, false, rate, reduced, retainRoll);
    };
    const advance = (index: number) => {
      if (generation.current !== token) return;
      const rate = nativeRate();
      for (; index < beats.length; index += 1) {
        const beat = beats[index];
        if (beat.kind === 'announcement') {
          if (announced.current.has(beat.announcement.id)) continue;
          announced.current.add(beat.announcement.id);
          if (hiddenAnnouncements.current.includes(beat.announcement.kind)) continue;
          const next = beats[index + 1];
          // A displayed Changing Weather card already includes this exact weather fact.
          // If kickoff splashes are hidden, the weather card can still play on its own.
          const pairedWeather = next?.kind === 'announcement'
            && next.announcement.id === beat.announcement.kickoffWeather?.pairedEventId;
          if (pairedWeather) announced.current.add(next.announcement.id);
          presentationRevision.current = record.revision;
          announcementQueue.current.push({
            card: beat.announcement, chained: canChainAnnouncement.current,
            score: { homeScore: record.state.homeScore, awayScore: record.state.awayScore },
          });
          canChainAnnouncement.current = true;
          if (!pendingAnnouncement.current) startNextAnnouncement();
          continue;
        }
        if (beat.kind === 'dice') {
          if (!multipleReveals.current.allows(beat.dice, record.state)) continue;
          canChainAnnouncement.current = false;
          presentDice(beat.dice, index, rate);
          // Successful movement checks accompany their native square update;
          // dice lifetime must not add a stop to the player's movement.
          if (beat.dice.continuous) continue;
          setMoveMillis(0);
          const nextIndex = index + 1;
          pendingBeat.current = { view: presented.current, delay: DICE_GROUP_INTERVAL_MS / rate,
            advance: () => advance(nextIndex) };
          return;
        }
        const current = presented.current;
        const next = viewAfterBeat(current, beat);
        if (next === current) continue;
        canChainAnnouncement.current = false;
        // Start the next delay only after React commits this square. Separate
        // timer tasks alone can still be batched, especially in reduced motion.
        const delay = beat.kind === 'block' || beat.kind === 'player' ? 16 : beat.kind === 'ball' ? BALL_STEP_MS / rate
          : movementBeatMillis(rate, reduced);
        setMoveMillis(reduced || beat.kind === 'block' ? 0 : delay);
        const nextIndex = index + 1;
        pendingBeat.current = { view: next, delay, advance: () => advance(nextIndex) };
        presentationRevision.current = record.revision;
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
  const dismissAnnouncement = useCallback(() => {
    const pending = pendingAnnouncement.current;
    if (!pending) return;
    if (pending.closing) {
      pending.skipGap?.();
      return;
    }
    pending.closing = true;
    pending.chained = nextVisibleAnnouncement()?.chained ?? false;
    if (announcementTimer.current) clearTimeout(announcementTimer.current);
    announcementTimer.current = null;
    setAnnouncementShadeHeld(pending.chained);
    setAnnouncementExiting(true);
  }, [nextVisibleAnnouncement]);
  useEffect(() => {
    if (announcement && announcementPreferences.hiddenAnnouncements.includes(announcement.kind)) dismissAnnouncement();
  }, [announcement, announcementPreferences.hiddenAnnouncements, dismissAnnouncement]);
  useLayoutEffect(() => {
    if (!announcementFading) return;
    const timeout = setTimeout(() => {
      setAnnouncement(null);
      setAnnouncementFading(false);
    }, DICE_EXIT_MS / announcementRate);
    return () => clearTimeout(timeout);
  }, [announcement, announcementFading, announcementRate]);
  // Start the fade timer after its visual state commits. Keep the queue active
  // through the clear interval. Snapshot recovery cancels both phases.
  useLayoutEffect(() => {
    const pending = pendingAnnouncement.current;
    if (!announcementExiting || !pending) return;
    const rate = announcementRate;
    const complete = () => {
      if (pendingAnnouncement.current !== pending) return;
      announcementExitComplete.current = null;
      if (announcementTransitionTimer.current) clearTimeout(announcementTransitionTimer.current);
      setAnnouncement(null);
      const resume = () => {
        if (pendingAnnouncement.current !== pending) return;
        if (announcementTransitionTimer.current) clearTimeout(announcementTransitionTimer.current);
        announcementTransitionTimer.current = null;
        pendingAnnouncement.current = null;
        setAnnouncementExiting(false);
        startNextAnnouncement(pending.chained);
      };
      if (pending.chained) pending.skipGap = resume;
      announcementTransitionTimer.current = setTimeout(resume, (pending.chained ? ANNOUNCEMENT_CHAIN_GAP_MS : ANNOUNCEMENT_GAP_MS) / rate);
    };
    announcementExitComplete.current = complete;
    announcementTransitionTimer.current = setTimeout(complete, DICE_EXIT_MS / rate);
    return () => {
      announcementExitComplete.current = null;
      if (announcementTransitionTimer.current) clearTimeout(announcementTransitionTimer.current);
      announcementTransitionTimer.current = null;
    };
  }, [announcementExiting, announcementRate]);
  useLayoutEffect(() => {
    if (!announcement || announcementExiting || announcementPreferences.holdAnnouncements) return;
    const rate = announcementRate;
    const timeout = setTimeout(dismissAnnouncement, announcementReadingDuration(announcement, rate));
    announcementTimer.current = timeout;
    return () => { clearTimeout(timeout); };
  }, [announcement, announcementExiting, announcementPreferences.holdAnnouncements, announcementRate, dismissAnnouncement]);
  const beginProvisional = (route: RoutePreview) => {
    if (!enabled || mode !== 'live' || running.current || waiting.current || provisional.current
      || pendingAnnouncement.current || announcementFading) return;
    const moves = provisionalMoves(latest.current, route);
    if (!moves.length) return;
    provisional.current = { base: latest.current, moves, shown: [] };
    setTick(value => value + 1);
  };
  const splash: MatchSplashProps | undefined = announcement || announcementShadeHeld || announcementFading ? {
    announcement, exiting: announcementExiting || announcementFading, rate: announcementRate, shadeHeld: announcementShadeHeld,
    fading: announcementFading, hold: announcementPreferences.holdAnnouncements,
    onDismiss: dismissAnnouncement, onExited: () => announcementExitComplete.current?.(),
    onSkipGap: !announcement && announcementShadeHeld && announcementExiting ? dismissAnnouncement : undefined,
  } : undefined;
  const playbackActive = active || !!pendingAnnouncement.current || announcementFading;
  return { pitchView, presentationRevision: playbackActive ? Math.max(pitchView.revision, presentationRevision.current, diceMoment?.revision ?? -1) : pitchView.revision, provisionalActive: !!provisional.current, playbackActive, diceMoment, synchronizing, movementDuration: moveMillis, beginProvisional,
    splash, announcement, announcementExiting, changeHoldAnnouncements: announcementPreferences.changeHoldAnnouncements,
    diceSnapshot: pitchView.revision === snapshotRevision.current };
}
