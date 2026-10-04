import { useEffect, useRef, useState } from 'react';

import { MatchEventLog } from './MatchEventLog.tsx';
import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { matchTeamName } from './match-team-name.ts';

type Tab = 'Game Options' | 'Interface' | 'Key Bindings' | 'Game Log';

export function GameMenu({ view, connected, pending, mutate, records, logLoading, logUnavailable }: {
  view: SetupState; connected: boolean; pending: boolean; mutate: (operation: string, fields?: Record<string, unknown>) => void;
  records: TranscriptRecord[]; logLoading: boolean; logUnavailable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('Game Options');
  const [confirmConcede, setConfirmConcede] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); setConfirmConcede(false); opener.current?.focus(); };
  useEffect(() => { if (open) dialog.current?.querySelector<HTMLButtonElement>('header button')?.focus(); }, [open]);
  useEffect(() => { if (view.phase === 'FULL_TIME') setConfirmConcede(false); }, [view.phase]);
  const saved = view.saveResume;
  const canAct = connected && !pending && view.callerRole !== 'spectator' && view.phase !== 'FULL_TIME';
  return <>
    <button ref={opener} type="button" className="game-menu-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      Game Menu{saved?.status === 'SAVE_PENDING' || saved?.status === 'RESUME_PENDING' ? ' · Request pending' : ''}
    </button>
    {open && <div className="game-menu-shade" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialog} className="game-menu-dialog" role="dialog" aria-modal="true" aria-label="Game Menu" onKeyDown={event => {
        if (event.key === 'Escape') { close(); return; }
        if (event.key !== 'Tab') return;
        const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        if (!buttons.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <header><h2>Game Menu</h2><button type="button" aria-label="Close Game Menu" onClick={close}>×</button></header>
        <nav role="tablist" aria-label="Game Menu tabs">{(['Game Options', 'Interface', 'Key Bindings', 'Game Log'] as Tab[]).map(item =>
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</nav>
        <div role="tabpanel" className="game-menu-content">
          {tab === 'Game Options' && <>
            <section><h3>Request Match Pause</h3>
              {!saved && <p>Pause is unavailable for this match.</p>}
              {saved?.status === 'ACTIVE' && <><p>Both coaches must agree before play pauses.</p><button type="button" disabled={!canAct} onClick={() => mutate('saveRequest')}>Request Match Pause</button></>}
              {saved?.status === 'SAVE_PENDING' && <><p>Requested by {matchTeamName(view, saved.proposer!)}. Expires {new Date(saved.expiresAt!).toLocaleString()}.</p>
                {saved.proposer === view.callerRole ? <button type="button" disabled={!canAct} onClick={() => mutate('saveCancel', { proposalId: saved.proposalId })}>Cancel request</button> :
                  <><button type="button" disabled={!canAct} onClick={() => mutate('saveAccept', { proposalId: saved.proposalId })}>Accept pause</button>
                    <button type="button" disabled={!canAct} onClick={() => mutate('saveReject', { proposalId: saved.proposalId })}>Reject pause</button></>}</>}
              {saved?.status === 'SUSPENDED' && <><p>This match is paused.</p><button type="button" disabled={!canAct} onClick={() => mutate('resumeRequest')}>Request resume</button></>}
              {saved?.status === 'RESUME_PENDING' && <><p>Resume requested by {matchTeamName(view, saved.proposer!)}. Expires {new Date(saved.expiresAt!).toLocaleString()}.</p>
                {saved.proposer === view.callerRole ? <button type="button" disabled={!canAct} onClick={() => mutate('resumeCancel', { proposalId: saved.proposalId })}>Cancel request</button> :
                  <><button type="button" disabled={!canAct} onClick={() => mutate('resumeAccept', { proposalId: saved.proposalId })}>Accept resume</button>
                    <button type="button" disabled={!canAct} onClick={() => mutate('resumeReject', { proposalId: saved.proposalId })}>Reject resume</button></>}</>}
              {saved?.status === 'ABANDONED' && <p>This match can no longer be resumed.</p>}
            </section>
            <section><h3>Concede</h3><p>End the match now. Your opponent will be declared the winner.</p>
              {!confirmConcede ? <button type="button" disabled={!canAct || saved?.status === 'SUSPENDED' || saved?.status === 'RESUME_PENDING'} onClick={() => setConfirmConcede(true)}>Concede match</button> :
                <div className="game-menu-confirm"><p>Concede this match? This cannot be undone.</p>
                  <button type="button" disabled={!canAct || saved?.status === 'SUSPENDED' || saved?.status === 'RESUME_PENDING'} onClick={() => { mutate('concede'); setConfirmConcede(false); }}>Confirm concession</button>
                  <button type="button" onClick={() => setConfirmConcede(false)}>Keep playing</button></div>}
            </section>
          </>}
          {tab === 'Game Log' && <MatchEventLog records={records} loading={logLoading} unavailable={logUnavailable}/>}
        </div>
      </div>
    </div>}
  </>;
}
