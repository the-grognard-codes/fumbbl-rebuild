import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { playbackBeats } from './pitch-playback.ts';
import { recordDice } from './dice-presentation.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

const responseKinds = new Set(['blockDie', 'reroll', 'skill', 'push', 'followUp', 'apothecary', 'argueTheCall', 'interception']);

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
  const diceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diceRevision = useRef(view.revision);
  latest.current = view;
  const cancel = () => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    if (diceTimer.current) clearTimeout(diceTimer.current);
    timer.current = null; diceTimer.current = null; running.current = false; waiting.current = false;
  };
  useEffect(() => () => cancel(), []);
  useLayoutEffect(() => {
    const previous = received.current;
    received.current = view;
    // Reconnect, a different match, backward seek and nonadjacent replay seeks
    // establish a snapshot. No stale timer may write over that snapshot.
    if (!enabled || previous.matchId !== view.matchId || view.revision < previous.revision
      || mode === 'replay' && Math.abs(view.revision - previous.revision) > 1) {
      cancel(); completed.current = view.revision;
      presented.current = view; setPitchView(view); setDiceMoment(null); setActive(false);
      return;
    }
    if (view.revision > diceRevision.current) {
      if (diceTimer.current) clearTimeout(diceTimer.current);
      diceTimer.current = null; setDiceMoment(null);
    }
    if (completed.current < view.revision && (view.prompt || view.actions.some(action => responseKinds.has(action.kind)))) {
      // Responses use the current authoritative board, even when an older
      // movement sequence is still being presented. Old timers cannot hide it.
      cancel(); completed.current = view.revision; presented.current = view;
      setPitchView(view); setActive(false);
      const finalRecord = records[view.revision];
      const dice = finalRecord?.revision === view.revision ? recordDice(finalRecord).at(-1) : null;
      diceRevision.current = view.revision;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      setDiceMoment(dice ? { ...dice, rollKey: !reduced && dice.selected === null ? `${view.revision}:response` : undefined } : null);
      // A coach may pause before choosing a reroll or skill. Keep the revealed
      // result with that prompt until an accepted revision resolves it.
      const pendingRoll = view.actions.some(action => action.kind === 'reroll' || action.kind === 'skill');
      if (dice && !pendingRoll) diceTimer.current = setTimeout(() => { diceTimer.current = null; setDiceMoment(null); }, 440);
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
        setPitchView(view); setDiceMoment(null); setActive(false);
        return;
      }
      setActive(true);
      if (!waiting.current) {
        waiting.current = true;
        timer.current = setTimeout(() => {
          waiting.current = false; timer.current = null; completed.current = latest.current.revision;
          presented.current = latest.current; setPitchView(latest.current); setDiceMoment(null); setActive(false);
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
          if (diceTimer.current) clearTimeout(diceTimer.current);
          diceRevision.current = record.revision;
          setDiceMoment({ ...beat.dice, rollKey: !reduced && beat.dice.selected === null ? `${record.revision}:${index}` : undefined });
          diceTimer.current = setTimeout(() => { diceTimer.current = null; setDiceMoment(null); }, 440);
          continue;
        }
        const move = beat.move, current = presented.current;
        const player = current.players.find(item => item.id === move.playerId);
        if (!player || player.x === move.x && player.y === move.y) continue;
        const next = { ...current, players: current.players.map(item => item.id === move.playerId ? { ...item, x: move.x, y: move.y } : item) };
        presented.current = next; setPitchView(next);
        // Separate tasks retain discrete states under React batching. Reduced
        // motion never interpolates or spins, but still exposes each square.
        timer.current = setTimeout(() => advance(index + 1), reduced ? 16 : 190 / safeSpeed);
        return;
      }
      finish();
    };
    advance(0);
  }, [view, records, enabled, tick, speed, mode]);
  return { pitchView, playbackActive: active, diceMoment };
}
