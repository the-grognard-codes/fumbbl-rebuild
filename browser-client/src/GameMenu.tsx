import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { MatchEventLog } from './MatchEventLog.tsx';
import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { matchTeamName } from './match-team-name.ts';
import { useThreatPreferences } from './use-threat-preferences.ts';
import { stripeSkillControls, type ThreatPreferences } from './threat-preferences.ts';
import { useSkillMarkerPreferences } from './use-skill-marker-preferences.ts';
import { useLimitedActionTags } from './use-limited-action-tags.ts';
import { AutomaticSkillUse } from './AutomaticSkillUse.tsx';
import type { SkillUseControls } from './skill-use-preferences.ts';

type Tab = 'Game Options' | 'Game Settings' | 'Skills & Traits' | 'Interface' | 'Key Bindings' | 'Game Log';

export function GameMenu({ view, connected, pending, mutate, records, logLoading, logUnavailable, interfaceControls, replay = false, skillUseControls }: {
  view: SetupState; connected: boolean; pending: boolean; mutate: (operation: string, fields?: Record<string, unknown>) => void;
  records: TranscriptRecord[]; logLoading: boolean; logUnavailable: boolean;
  interfaceControls?: ReactNode; replay?: boolean;
  skillUseControls?: SkillUseControls;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('Game Options');
  const [confirmConcede, setConfirmConcede] = useState(false);
  const { preferences, change } = useThreatPreferences();
  const { preferences: skillMarkers, change: changeSkillMarkers } = useSkillMarkerPreferences();
  const { visible: showLimitedActions, change: changeLimitedActions } = useLimitedActionTags();
  const neutral = replay || view.callerRole === 'spectator';
  const skillControl = (name: 'showOwn' | 'showOpponent' | 'showBase' | 'showAcquired' | 'showTraits' | 'showBigGuyNegatraits', label: string) =>
    <label><input type="checkbox" checked={skillMarkers[name]} onChange={event => changeSkillMarkers(name, event.target.checked)}/>{label}</label>;
  const threatControl = (name: keyof ThreatPreferences, label: string) =>
    <label key={name}><input type="checkbox" checked={preferences[name]} onChange={event => change(name, event.target.checked)}/>{label}</label>;
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); setConfirmConcede(false); opener.current?.focus(); };
  useEffect(() => { if (open) dialog.current?.querySelector<HTMLButtonElement>('header button')?.focus(); }, [open]);
  useEffect(() => { if (view.phase === 'FULL_TIME') setConfirmConcede(false); }, [view.phase]);
  useEffect(() => {
    if (open && tab === 'Skills & Traits' && !neutral && connected) skillUseControls?.load();
  }, [open, tab, neutral, connected]);
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
        const buttons = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') ?? [])];
        if (!buttons.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <header><h2>Game Menu</h2><button type="button" aria-label="Close Game Menu" onClick={close}>×</button></header>
        <nav role="tablist" aria-label="Game Menu tabs">{(['Game Options', 'Game Settings', 'Skills & Traits', 'Interface', 'Key Bindings', 'Game Log'] as Tab[]).map(item =>
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</nav>
        <div role="tabpanel" className="game-menu-content">
          {tab === 'Skills & Traits' && <>{!neutral && skillUseControls && <AutomaticSkillUse controls={skillUseControls} connected={connected}/>}
          <section className="threat-settings"><h3>Skill Markers</h3>
            <h4>Show Player Skills</h4>
            <div role="group" aria-label="Skill marker teams">
              {skillControl('showOwn', neutral ? 'Home team' : 'Own team')}
              {skillControl('showOpponent', neutral ? 'Away team' : 'Opponent')}
            </div>
            <div role="group" aria-label="Skill marker origins">
              {skillControl('showBase', 'Show player base skills')}
              {skillControl('showAcquired', 'Show player acquired skills')}
            </div>
            <div role="group" aria-label="Skill marker traits">
              <label><input type="checkbox" checked={skillMarkers.showTraits} onChange={event => changeSkillMarkers('showTraits', event.target.checked)}/>Show traits</label>
              <label><input type="checkbox" checked={skillMarkers.showBigGuyNegatraits} onChange={event => changeSkillMarkers('showBigGuyNegatraits', event.target.checked)}/>Show Big Guy negatraits and Secret Weapon</label>
            </div>
            <label>Presentation <select aria-label="Skill marker presentation" value={skillMarkers.style}
              onChange={event => changeSkillMarkers('style', event.target.value === 'illustrated' ? 'illustrated' : 'text')}>
              <option value="text">Text</option><option value="illustrated">Illustrated</option>
            </select></label>
            <label className="skill-marker-size">Marker size <input aria-label="Skill marker size" type="range" min="0" max="2" step="1"
              aria-valuetext={skillMarkers.size} value={['small', 'medium', 'large'].indexOf(skillMarkers.size)}
              onChange={event => changeSkillMarkers('size', (['small', 'medium', 'large'] as const)[Number(event.target.value)])}/>
              <output>{skillMarkers.size === 'small' ? 'Small' : skillMarkers.size === 'large' ? 'Large' : 'Medium'}</output>
            </label>
            <p>The Big Guy toggle controls Bone Head, Really Stupid, Always Hungry, Animal Savagery, Unchannelled Fury, and Secret Weapon. It does not hide Loner.</p>
          </section></>}
          {tab === 'Game Settings' && <section className="threat-settings"><h3>Opposing player threats</h3>
            <p>Show threats when selecting an unfinished friendly player during your turn or Charge!.</p>
            <div role="group" aria-label="Threat markings">
              {threatControl('enabled', 'Show opposing player threats')}
              {threatControl('zoneColors', 'Tackle-zone colors')}
              {threatControl('tackle', 'Tackle warnings')}
              {threatControl('otherSkills', 'Other-skill markings')}
            </div>
            <div role="group" aria-label="Movement skills">{stripeSkillControls.map(([name, label]) => threatControl(name, label))}</div>
            <p>Colors show overlapping zones: green 1, yellow 2, orange 3, red 4+. Skill markings show skill presence.</p>
          </section>}
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
          {tab === 'Interface' && <section><h3>Pitch and interface</h3><div className="threat-settings"><div role="group" aria-label="Gameplay helpers"><label><input type="checkbox" checked={showLimitedActions} onChange={event => changeLimitedActions(event.target.checked)}/>Show limited action tags</label></div></div>{interfaceControls}<p>Background opacity preserves readable text, icons and borders. Event log text has three size controls.</p></section>}
          {tab === 'Key Bindings' && <section><h3>Keyboard controls</h3><p>Arrow keys: navigate the pitch. Enter on the pitch: choose a square. Space: confirm a valid proposal or the warning about unactivated players. Backspace: end your team's turn. Right-click: undo a waypoint. Enter outside controls: chat. Escape: close chat or this menu.</p><p>Tab navigates players and commands. Debug offers numeric setup placement controls.</p></section>}
        </div>
      </div>
    </div>}
  </>;
}
