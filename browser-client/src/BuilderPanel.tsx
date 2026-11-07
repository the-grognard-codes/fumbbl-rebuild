import { useEffect, useRef, useState } from 'react';

import { FormationManager } from './FormationManager.tsx';
import { starterFormations } from './team-formations.ts';
import { BuilderDraftEditor } from './BuilderDraftEditor';
import { builderValidationTarget } from './builder-validation.ts';
import { rosterDisplayName } from './roster-display-name';
import { TeamValidationView } from './team-validation-view';
import { decodeTeam, emptyDraft } from './team-protocol';
import type { Catalog, TeamDraft, Validation } from './team-protocol';
import type { SavedDocument, SavedTeamSummary } from './saved-team-protocol';
import { V2Client } from './v2-client';
import type { V2Message } from './v2-client';

type Options = { url: string; getToken: () => Promise<string> };

/** The public builder holds only unsaved input in memory; the account document lives on the server. */
export function BuilderPanel({ options }: { options: Options }) {
  const [, redraw] = useState(0);
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [draft, setDraft] = useState<TeamDraft | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [validatedDraft, setValidatedDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedDocument | null>(null);
  const [formationEditor, setFormationEditor] = useState(false);
  const [formationChanged, setFormationChanged] = useState(false);
  const [copyName, setCopyName] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [eligibility, setEligibility] = useState('CURRENT');
  const [teams, setTeams] = useState<SavedTeamSummary[]>([]);
  const client = useRef<V2Client | null>(null);
  const catalogRef = useRef<Catalog | null>(null);
  catalogRef.current = catalog;
  const draftRef = useRef<TeamDraft | null>(null);
  draftRef.current = draft;
  const cleanDraft = useRef<string | null>(null);
  const validationRequest = useRef<string | null>(null);
  const loadRequest = useRef<string | null>(null);
  const draftGeneration = useRef(0);
  const pendingLoads = useRef(new Map<string, number>());
  const teamsMenu = useRef<HTMLDetailsElement>(null);
  const pendingValidations = useRef(new Map<string, string>());
  const operations = useRef(new Map<string, string>());
  const catalogSelections = useRef(new Map<string, { draft: TeamDraft | null; generation: number }>());

  function replaceDraft(next: TeamDraft | null) {
    draftGeneration.current++; loadRequest.current = null;
    draftRef.current = next; cleanDraft.current = next ? JSON.stringify(next) : null;
    validationRequest.current = null; setValidating(false);
    setDraft(next); setValidation(null); setValidatedDraft(null);
  }

  useEffect(() => {
    const connection = new V2Client({ ...options, storage: sessionStorage, onChange: (message: V2Message) => {
      if (message.type === 'status') {
        setStatus(message.code === 'CONNECTING' ? 'Connecting' : 'Disconnected');
        validationRequest.current = null; pendingValidations.current.clear(); setValidating(false);
        loadRequest.current = null; pendingLoads.current.clear();
        if (catalogSelections.current.size && !draftRef.current) { setSaved(null); setCopyName(null); setEligibility('CURRENT'); }
        catalogSelections.current.clear();
      }
      if (message.type === 'authentication') { setStatus('Connected'); setError(''); }
      if (message.type === 'catalog') {
        try {
          const result = decodeTeam(JSON.stringify({ ...message, version: 1 }));
          if (result.type === 'catalog') {
            const selection = catalogSelections.current.get(message.requestId);
            catalogSelections.current.delete(message.requestId);
            if (selection) {
              if (selection.generation !== draftGeneration.current) return;
              setCatalog(result); replaceDraft(selection.draft ?? emptyDraft(result));
            } else if (!catalogSelections.current.size && (!draftRef.current || draftRef.current.rosterId === result.rosterId)) {
              setCatalog(result); if (!draftRef.current) replaceDraft(emptyDraft(result));
            }
          }
        } catch { setError('The server catalog could not be read.'); }
      }
      if (message.type === 'teamValidation') {
        try {
          const result = decodeTeam(JSON.stringify({ ...message, version: 1 }));
          const submitted = pendingValidations.current.get(message.requestId);
          if (result.type === 'teamValidation' && message.requestId === validationRequest.current && submitted && submitted === JSON.stringify(draftRef.current)) {
            setValidation(result); setValidatedDraft(submitted);
          }
        } catch { setError('The server validation could not be read.'); }
        pendingValidations.current.delete(message.requestId);
        if (message.requestId === validationRequest.current) { validationRequest.current = null; setValidating(false); }
      }
      if (message.type === 'savedTeam') {
        const operation = operations.current.get(message.requestId) ?? '';
        operations.current.delete(message.requestId);
        if (operation === 'load') {
          const generation = pendingLoads.current.get(message.requestId);
          pendingLoads.current.delete(message.requestId);
          if (message.requestId !== loadRequest.current) return;
          loadRequest.current = null;
          if (generation !== draftGeneration.current) { setError('Your draft changed while the team was loading. Load it again when you are ready.'); return; }
        }
        if (message.code === 'OK') {
          if (Array.isArray(message.teams) && (operation === 'list' || (operation === '' && !message.document))) setTeams(message.teams);
          if (message.document) {
            const document = message.document as SavedDocument;
            setFormationChanged(false); setSaved(document); setEligibility(message.versionStatus ?? 'CURRENT');
            setCopyName(null);
            if (document.formatVersion >= 3 && document.draft.rosterId !== catalogRef.current?.rosterId) {
              const id = connection.request('catalog', { rosterId: document.draft.rosterId });
              replaceDraft(null); catalogSelections.current.set(id, { draft: document.draft, generation: draftGeneration.current });
            } else replaceDraft(document.formatVersion >= 3 ? document.draft : null);
          } else if (operation === 'delete') {
            setSaved(null); setCopyName(null); replaceDraft(null);
          }
          if (operation === 'create' || operation === 'update' || operation === 'delete') connection.request('savedTeam', { operation: 'list' });
        } else if (message.code === 'SAVE_OUTCOME_UNKNOWN' || message.code === 'DELETE_OUTCOME_UNKNOWN') {
          setError('The server may have applied this change. Reconnect and repeat the retained request, then refresh your teams.');
        } else setError(message.code === 'TEAM_NAME_TAKEN' ? 'You already have a team with that name. Choose a different team name.' : String(message.code).replaceAll('_', ' '));
      }
      if (message.type === 'error' && message.code) { setError(String(message.code).replaceAll('_', ' ')); validationRequest.current = null; setValidating(false); }
      redraw(value => value + 1);
    } });
    client.current = connection; connection.connect();
    return () => { client.current = null; connection.disconnect(); };
  }, [options]);

  const connected = status === 'Connected';
  const busy = !connected || !!client.current?.pending;
  const editable = !!catalog && !!draft && catalog.rosterId === draft.rosterId && eligibility === 'CURRENT';
  const saveable = editable && validation?.valid && validatedDraft === JSON.stringify(draft) && !busy;
  const dirty = draft !== null && JSON.stringify(draft) !== cleanDraft.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function discardAllowed() { return !dirty || window.confirm('Discard unsaved changes to this team?'); }
  function newTeam() {
    if (!catalog || !discardAllowed()) return;
    setFormationChanged(false); setSaved(null); setCopyName(null); setEligibility('CURRENT'); replaceDraft(emptyDraft(catalog));
    if (teamsMenu.current) teamsMenu.current.open = false;
  }
  function loadTeam(teamId: string) {
    if (discardAllowed()) run(() => {
      const id = requestSaved('load', { teamId });
      draftGeneration.current++; loadRequest.current = id; pendingLoads.current.set(id, draftGeneration.current);
      if (teamsMenu.current) teamsMenu.current.open = false;
    });
  }
  function locateValidation(path: string, code?: string) {
    if (!draft) return;
    const element = document.getElementById(builderValidationTarget(path, draft, code)) ?? document.getElementById('builder-roster');
    for (let parent = element?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
    const focus = element?.matches(':disabled') ? element.closest('details')?.querySelector('summary') : element;
    focus?.scrollIntoView({ block: 'center' });
    if (focus instanceof HTMLElement) focus.focus({ preventScroll: true });
  }
  function run(action: () => void) {
    try { setError(''); action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Request could not be sent.'); }
  }
  function requestSaved(operation: string, fields: Record<string, unknown> = {}, mutation = false) {
    const id = client.current!.request('savedTeam', { operation, ...fields }, mutation);
    operations.current.set(id, operation);
    return id;
  }
  function update(next: TeamDraft) {
    if (next.formations === undefined && next.players.length >= 11) next = { ...next, formations: starterFormations(next.players) };
    draftGeneration.current++; draftRef.current = next; setDraft(next); setValidation(null); setValidatedDraft(null); validationRequest.current = null; setValidating(false); }
  function selectRoster(rosterId: string) {
    if (!catalog || rosterId === catalog.rosterId || !['human', 'orc'].includes(rosterId)) return;
    if ((saved || draft?.players.length || draft?.teamName) && !window.confirm('Start a new team with this roster? Unsaved edits will be discarded.')) return;
    run(() => {
      const id = client.current!.request('catalog', { rosterId });
      setFormationChanged(false); setSaved(null); setCopyName(null); setEligibility('CURRENT'); replaceDraft(null);
      catalogSelections.current.set(id, { draft: null, generation: draftGeneration.current });
    });
  }
  function validate() {
    if (!draft) return;
    run(() => { const id = client.current!.request('validateTeam', { draft }); pendingValidations.current.set(id, JSON.stringify(draft)); validationRequest.current = id; setValidating(true); setValidation(null); setValidatedDraft(null); });
  }
  function save() {
    if (!draft || !saveable) return;
    run(() => requestSaved(saved && copyName === null ? 'update' : 'create', saved && copyName === null
      ? { teamId: saved.teamId, expectedDocumentVersion: saved.documentVersion, draft } : { draft }, true));
  }
  function startCopy() {
    if (!draft || !saved) return;
    setCopyName(draft.teamName);
    let name: string, suffix = 1;
    do {
      const ending = suffix === 1 ? ' copy' : ` copy ${suffix}`;
      name = Array.from(draft.teamName).slice(0, 50 - ending.length).join('') + ending;
      suffix++;
    } while (teams.some(team => team.teamName?.trim().toLowerCase() === name.toLowerCase()));
    update({ ...draft, teamName: name });
  }
  function remove() {
    if (!saved || !window.confirm(`Delete ${saved.draft.teamName}? Existing matches keep their frozen roster.`)) return;
    run(() => requestSaved('delete', { teamId: saved.teamId, expectedDocumentVersion: saved.documentVersion }, true));
  }

  return <main className="builder-shell">
    <div className="builder-heading"><div><h1>Build Your Team</h1><p>Recruit your BB2025 roster, choose resources, then validate and save for Play.</p></div>
      <div className="builder-team-access" aria-label="Team selection">
        <button type="button" className="button secondary" disabled={!catalog || busy} onClick={newTeam}>New team</button>
        <details ref={teamsMenu} className="saved-teams-panel"><summary>Your teams ({teams.length})</summary>
          <div className="saved-teams-menu"><h2>Your Teams</h2><p>Teams saved to your account.</p>
            <button type="button" className="button secondary" disabled={!connected} onClick={() => run(() => requestSaved('list'))}>Refresh teams</button>
            {teams.length ? <ul>{teams.map(team => <li key={team.teamId}><div><strong>{team.teamName || 'Unnamed older team'}</strong> · {rosterDisplayName(team.rosterId)}{team.eligibility !== 'CURRENT' && <span> · Unavailable: {team.eligibility}</span>}</div><button type="button" className="button secondary" disabled={busy} onClick={() => loadTeam(team.teamId)}>Load</button></li>)}</ul> : <p>No saved teams yet.</p>}
            <p><a href="/play">Choose a saved team in Play</a></p>
          </div>
        </details>
      </div>
    </div>
    <p className="builder-connection" role="status">{status}</p>{error && <p className="builder-error" role="alert">{error}</p>}
    {!connected && <button type="button" onClick={() => client.current?.connect()}>Reconnect</button>}
    {client.current?.pending && <p className="builder-error">A change needs confirmation. Reconnect with the same account and <button type="button" onClick={() => run(() => client.current?.retry())}>repeat the retained request</button>.</p>}
    {catalog && draft && <BuilderDraftEditor catalog={catalog} draft={draft} update={update} editable={editable && !busy} selectRoster={selectRoster}
      tools={<button id="builder-formations" type="button" className="button secondary" disabled={!editable || busy} onClick={() => setFormationEditor(true)}>Manage formations</button>}
      validationContent={validation && <div id="builder-validation" tabIndex={-1} className={`workbench-validation ${validation.valid ? 'is-valid' : 'validation-errors'}`}><TeamValidationView result={validation} onLocate={locateValidation}/></div>}
      completion={<section className="builder-completion" aria-label="Save team"><div className="completion-buttons">
      <button type="button" aria-label={validating ? 'Validating roster…' : 'Validate Roster'} className={saveable ? 'button secondary' : 'button'} disabled={!editable || busy || validating} onClick={validate}><span className="completion-label-full">{validating ? 'Validating roster…' : 'Validate Roster'}</span><span className="completion-label-short" aria-hidden="true">{validating ? 'Checking…' : 'Validate'}</span></button>
      <button type="button" aria-label={copyName !== null ? 'Save new team' : saved ? 'Save changes' : 'Save team'} className={saveable ? 'button' : 'button secondary'} disabled={!saveable} onClick={save}><span className="completion-label-full">{copyName !== null ? 'Save new team' : saved ? 'Save changes' : 'Save team'}</span><span className="completion-label-short" aria-hidden="true">Save</span></button>
      {saved && copyName === null && <button type="button" className="button secondary" disabled={!editable || busy} onClick={startCopy}>Save as new</button>}
      {copyName !== null && <button type="button" className="button secondary" disabled={busy} onClick={() => { if (draft) update({ ...draft, teamName: copyName }); setCopyName(null); }}>Cancel copy</button>}
      {saved && copyName === null && <button type="button" className="button secondary" disabled={busy} onClick={remove}>Delete team</button>}
    </div><p role="status">{validating ? 'Checking your roster…' : copyName !== null ? 'Choose a unique team name and validate the roster to save a new team.' : dirty ? validation?.valid ? 'Roster validated. Save to keep these changes.' : 'Unsaved changes. Validate the roster before saving.' : saved ? `Saved team ${saved.draft.teamName || saved.teamId}` : 'Validate your roster before saving.'}{validation && !validation.valid && <> <a href="#builder-validation">Review {validation.messages.length} {validation.messages.length === 1 ? 'issue' : 'issues'}</a>.</>}</p>
      {formationChanged && <p className="formation-draft-status" role="status">Formation changes are in your draft. Validate and save the team to keep them.</p>}
      </section>}/>}
    {formationEditor && draft && <FormationManager draft={draft} close={() => setFormationEditor(false)} save={formations => { update({ ...draft, formations }); setFormationChanged(true); setFormationEditor(false); }} />}
    {eligibility !== 'CURRENT' && <p className="builder-error" role="alert">This saved team cannot enter a new match until its catalog is explicitly migrated and validated.</p>}
  </main>;
}
