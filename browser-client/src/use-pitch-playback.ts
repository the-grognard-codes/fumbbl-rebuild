import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { playbackBeats } from './pitch-playback.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

/** Late joins start at the current board. Only revisions received while mounted are played. */
export function usePitchPlayback(view: SetupState, records: TranscriptRecord[], enabled: boolean) {
  const [pitchView, setPitchView] = useState(view);
  const [active, setActive] = useState(false);
  const [diceMoment, setDiceMoment] = useState<DiceMoment | null>(null);
  const [tick, setTick] = useState(0);
  const presented = useRef(view);
  const latest = useRef(view);
  const completed = useRef(view.revision);
  const running = useRef(false);
  const waiting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = view;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useLayoutEffect(() => {
    if (!enabled) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null; running.current = false; waiting.current = false; completed.current = view.revision;
      presented.current = view; setPitchView(view); setDiceMoment(null); setActive(false);
      return;
    }
    if (running.current) return;
    if (completed.current >= view.revision) {
      presented.current = view; setPitchView(view); setDiceMoment(null); setActive(false);
      return;
    }
    setActive(true);
    const record = records[completed.current + 1];
    if (!record || record.revision !== completed.current + 1) {
      if (!waiting.current) {
        waiting.current = true;
        timer.current = setTimeout(() => {
          // A legacy or temporarily unavailable transcript cannot hold an authoritative board forever.
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
    running.current = true;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const delay = reduced ? 110 : 190;
    const finish = () => {
      const final = record.revision === latest.current.revision ? latest.current : {
        ...record.state, callerRole: latest.current.callerRole, actions: [], prompt: null
      } as SetupState;
      presented.current = final; setPitchView(final); setDiceMoment(null); completed.current = record.revision;
      running.current = false; timer.current = null;
      setActive(completed.current < latest.current.revision);
      setTick(value => value + 1);
    };
    const advance = (index: number) => {
      if (index >= beats.length) { finish(); return; }
      const beat = beats[index];
      if (beat.kind === 'dice') {
        setDiceMoment(beat.dice);
        timer.current = setTimeout(() => advance(index + 1), reduced ? 500 : 750);
        return;
      }
      setDiceMoment(null);
      const move = beat.move;
      const current = presented.current;
      const player = current.players.find(item => item.id === move.playerId);
      if (player && (player.x !== move.x || player.y !== move.y)) {
        const next = { ...current, players: current.players.map(item => item.id === move.playerId ? { ...item, x: move.x, y: move.y } : item) };
        presented.current = next; setPitchView(next);
      }
      timer.current = setTimeout(() => advance(index + 1), delay);
    };
    if (beats.length) advance(0);
    else finish();
  }, [view, records, enabled, tick]);
  return { pitchView, playbackActive: active, diceMoment };
}
