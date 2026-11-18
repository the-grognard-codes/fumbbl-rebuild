import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { playbackBeats, failedRerollGate, withConfirmedBallChanges, withConfirmedMove, withBlockContext, withConfirmedPlayerChanges } from './pitch-playback.ts';
import { blockFaceLabel, diceRollGroups, offeredBlockDice, isOfferedPartialReroll } from './dice-presentation.ts';
import { MultipleBlockDiceReveals } from './multiple-block-dice.ts';
import { DiceStream } from './dice-stream.ts';
import { provisionalMoves, remainingConfirmedBeats, movementBeatMillis } from './provisional-movement.ts';
import { BALL_STEP_MS, PITCH_DICE_ROLL_MS, DICE_GROUP_INTERVAL_MS, DICE_EXIT_MS, ANNOUNCEMENT_GAP_MS, ANNOUNCEMENT_CHAIN_GAP_MS, playbackRate } from './presentation-timing.ts';
import type { ConfirmedMove, PlaybackBeat } from './pitch-playback.ts';
import type { RoutePreview } from './route-protocol.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { announcementDuration } from './match-announcements.ts';
import type { MatchAnnouncement } from './match-announcements.ts';
import type { MatchSplashProps } from './MatchSplash.tsx';
import { useAnnouncementPreferences } from './use-announcement-preferences.ts';

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
  const announcementRate = useRef(1);
  const [announcementShadeHeld, setAnnouncementShadeHeld] = useState(false);
  const shadeHeld = useRef(false);
  const holdShade = (held: boolean) => {
    shadeHeld.current = held;
    setAnnouncementShadeHeld(held);
  };
  const [announcementFading, setAnnouncementFading] = useState(false);
  const announcementPreferences = useAnnouncementPreferences();
  const hiddenAnnouncements = useRef(announcementPreferences.hiddenAnnouncements);
  hiddenAnnouncements.current = announcementPreferences.hiddenAnnouncements;
  const pendingAnnouncement = useRef<{ closing: boolean; chained: boolean; deferredResponseRevision: number | null;
    advance: () => void; resume?: () => void; skipGap?: () => void; settledView?: SetupState } | null>(null);
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcementTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcementFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const currentSpeed = useRef(speed); currentSpeed.current = speed;
  latest.current = view;
  const clearDice = () => { pinnedDice.current = false; diceStream.current!.clear(); };
  const fadeShade = (card: MatchAnnouncement | null) => {
    holdShade(false);
    setAnnouncement(card);
    setAnnouncementFading(true);
    if (announcementFadeTimer.current) clearTimeout(announcementFadeTimer.current);
    announcementFadeTimer.current = setTimeout(() => {
      announcementFadeTimer.current = null;
      setAnnouncement(null);
      setAnnouncementFading(false);
    }, DICE_EXIT_MS / announcementRate.current);
  };
  const releaseHeldShade = () => {
    if (shadeHeld.current) fadeShade(null);
  };
  // Only the actual playback queue can decide whether its next visible beat is a splash.
  const waitForAnnouncementExit = (chained: boolean, resume: () => void) => {
    const pending = pendingAnnouncement.current;
    if (!pending?.closing) return false;
    pending.chained = chained;
    pending.resume = resume;
    holdShade(chained);
    setAnnouncementExiting(true);
    return true;
  };
  const cancel = () => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    pendingBeat.current = null;
    pendingAnnouncement.current = null; setAnnouncement(null);
    announcementExitComplete.current = null;
    setAnnouncementExiting(false);
    holdShade(false);
    setAnnouncementFading(false);
    if (announcementTimer.current) clearTimeout(announcementTimer.current);
    announcementTimer.current = null;
    if (announcementTransitionTimer.current) clearTimeout(announcementTransitionTimer.current);
    announcementTransitionTimer.current = null;
    if (announcementFadeTimer.current) clearTimeout(announcementFadeTimer.current);
    announcementFadeTimer.current = null;
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
    const requiresResponse = !!view.prompt || !!view.reaction || view.actions.some(action => responseKinds.has(action.kind));
    const playbackView = pendingAnnouncement.current?.settledView ?? presented.current;
    const deferScoringResponse = view.drive > playbackView.drive
      || view.homeScore > playbackView.homeScore || view.awayScore > playbackView.awayScore;
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
      diceStream.current!.enqueue({ ...dice, revision: view.revision }, sequenceKey(view), pinnedDice.current, true, rate);
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
    if (mode === 'live' && requiresResponse && pendingAnnouncement.current && !deferScoringResponse
      && pendingAnnouncement.current.deferredResponseRevision !== view.revision) {
      const wasShaded = !!announcement || shadeHeld.current;
      snapshot();
      if (wasShaded) fadeShade(announcement);
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
    const nextRecord = records[completed.current + 1];
    const retainRoll = !!nextRecord && failedRerollGate(nextRecord, records);
    if (view.revision > diceRevision.current && pinnedDice.current && !retainRoll) {
      pinnedDice.current = false; diceStream.current!.release();
    }
    if (completed.current >= view.revision) {
      releaseHeldShade();
      multipleReveals.current.update(view);
      presented.current = view; setPitchView(view); setActive(false);
      setSynchronizing(false);
      if (mode === 'live' && requiresResponse && responseDiceKey.current !== responseKey) restoreResponse();
      return;
    }
    const record = records[completed.current + 1];
    if (!record || record.revision !== completed.current + 1) {
      if (waitForAnnouncementExit(false, () => {
        running.current = false;
        setTick(value => value + 1);
      })) {
        // Keep this boundary in the queue until its exit and gap finish.
        running.current = true;
        return;
      }
      // A missing transcript cannot postpone a newly offered mandatory response.
      if (!deferScoringResponse && (view.prompt || view.actions.some(action => responseKinds.has(action.kind)) || view.phase === 'FULL_TIME')) {
        const wasShaded = shadeHeld.current;
        snapshot();
        if (wasShaded) fadeShade(null);
        return;
      }
      releaseHeldShade();
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
    let beats = playbackBeats(record, playbackView.ball, inheritedGate);
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
      if (record.revision === latest.current.revision && waitForAnnouncementExit(false, finish)) return;
      const final = record.revision === latest.current.revision ? latest.current : {
        ...record.state, callerRole: latest.current.callerRole, actions: [], prompt: null
      } as SetupState;
      const pending = pendingAnnouncement.current;
      // Advance the queue cursor to find a chained card. Publish the settled
      // board only when the outgoing card and its gap have finished.
      if (pending?.closing) pending.settledView = final;
      else { presented.current = final; setPitchView(final); }
      completed.current = record.revision;
      running.current = false; timer.current = null;
      setActive(!!pending?.closing || completed.current < latest.current.revision);
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
      const rate = playbackRate(currentSpeed.current, mode);
      for (; index < beats.length; index += 1) {
        const beat = beats[index];
        const resume = () => advance(index);
        if (beat.kind === 'announcement') {
          const response = mode === 'live' && (!!latest.current.prompt || !!latest.current.reaction
            || latest.current.actions.some(action => responseKinds.has(action.kind)));
          if (response && !deferScoringResponse || announced.current.has(beat.announcement.id)) continue;
          if (hiddenAnnouncements.current.includes(beat.announcement.kind)) {
            announced.current.add(beat.announcement.id);
            continue;
          }
          if (waitForAnnouncementExit(true, resume)) return;
          announced.current.add(beat.announcement.id);
          clearDice(); setMoveMillis(0);
          if (beat.announcement.kind === 'touchdown') {
            // Reveal the score with its announcement, retaining the pitch and
            // drive presentation until the remaining beats have completed.
            presented.current = { ...presented.current, homeScore: record.state.homeScore, awayScore: record.state.awayScore };
            setPitchView(presented.current);
          }
          const next = beats[index + 1];
          // A displayed Changing Weather card already includes this exact weather fact.
          // If kickoff splashes are hidden, the weather card can still play on its own.
          const pairedWeather = next?.kind === 'announcement'
            && next.announcement.id === beat.announcement.kickoffWeather?.pairedEventId;
          if (pairedWeather) announced.current.add(next.announcement.id);
          const nextIndex = index + (pairedWeather ? 2 : 1);
          // Revealing the score changes presented.current. Remember the already
          // deferred prompt so a refresh cannot mistake it for a new choice.
          if (announcementFadeTimer.current) clearTimeout(announcementFadeTimer.current);
          announcementFadeTimer.current = null;
          pendingAnnouncement.current = { closing: false, chained: false,
            deferredResponseRevision: deferScoringResponse ? view.revision : null,
            advance: () => advance(nextIndex) };
          presentationRevision.current = record.revision;
          setAnnouncementFading(false);
          announcementRate.current = rate;
          setAnnouncement(beat.announcement);
          return;
        }
        if (beat.kind === 'dice') {
          if (!multipleReveals.current.allows(beat.dice, record.state)) continue;
          if (waitForAnnouncementExit(false, resume)) return;
          releaseHeldShade();
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
        const current = pendingAnnouncement.current?.settledView ?? presented.current;
        const next = viewAfterBeat(current, beat);
        if (next === current) continue;
        if (waitForAnnouncementExit(false, resume)) return;
        releaseHeldShade();
        // Start the next delay only after React commits this square. Separate
        // timer tasks alone can still be batched, especially in reduced motion.
        const delay = beat.kind === 'block' || beat.kind === 'player' ? 16 : beat.kind === 'ball' ? BALL_STEP_MS / rate
          : movementBeatMillis(currentSpeed.current, mode, reduced);
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
  const dismissAnnouncement = () => {
    const pending = pendingAnnouncement.current;
    if (!pending || pending.closing) return;
    pending.closing = true;
    if (announcementTimer.current) clearTimeout(announcementTimer.current);
    announcementTimer.current = null;
    pending.advance();
  };
  useEffect(() => {
    if (announcement && announcementPreferences.hiddenAnnouncements.includes(announcement.kind)) dismissAnnouncement();
  }, [announcement, announcementPreferences.hiddenAnnouncements]);
  // Start the fade timer after its visual state commits. Keep the queue active
  // through the clear interval, and retain pending state so recovery/choices
  // can cancel both phases without a stale callback advancing the old queue.
  useLayoutEffect(() => {
    const pending = pendingAnnouncement.current;
    if (!announcementExiting || !pending) return;
    const rate = announcementRate.current;
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
        if (pending.settledView) {
          presented.current = pending.settledView;
          setPitchView(pending.settledView);
        }
        pending.resume?.();
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
  }, [announcementExiting]);
  useLayoutEffect(() => {
    if (!announcement || announcementExiting || announcementPreferences.holdAnnouncements) return;
    const rate = announcementRate.current;
    const timeout = setTimeout(dismissAnnouncement, announcementDuration(announcement, rate) - DICE_EXIT_MS / rate);
    announcementTimer.current = timeout;
    return () => { clearTimeout(timeout); };
  }, [announcement, announcementExiting, announcementPreferences.holdAnnouncements]);
  const beginProvisional = (route: RoutePreview) => {
    if (!enabled || mode !== 'live' || running.current || waiting.current || provisional.current) return;
    const moves = provisionalMoves(latest.current, route);
    if (!moves.length) return;
    provisional.current = { base: latest.current, moves, shown: [] };
    setTick(value => value + 1);
  };
  const splash: MatchSplashProps | undefined = announcement || announcementShadeHeld || announcementFading ? {
    announcement, exiting: announcementExiting || announcementFading, rate: announcementRate.current, shadeHeld: announcementShadeHeld,
    fading: announcementFading, hold: announcementPreferences.holdAnnouncements,
    onDismiss: dismissAnnouncement, onExited: () => announcementExitComplete.current?.(),
    onSkipGap: !announcement && announcementShadeHeld ? pendingAnnouncement.current?.skipGap : undefined,
  } : undefined;
  return { pitchView, presentationRevision: active ? Math.max(pitchView.revision, presentationRevision.current, diceMoment?.revision ?? -1) : pitchView.revision, provisionalActive: !!provisional.current, playbackActive: active, diceMoment, synchronizing, movementDuration: moveMillis, beginProvisional,
    splash, announcement: announcementFading ? null : announcement, announcementExiting,
    diceSnapshot: pitchView.revision === snapshotRevision.current };
}
