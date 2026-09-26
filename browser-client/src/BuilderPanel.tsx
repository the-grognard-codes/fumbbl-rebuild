import { useEffect, useRef, useState } from 'react';

import { BuilderDraftEditor } from './BuilderDraftEditor';
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
  const [eligibility, setEligibility] = useState('CURRENT');
  const [teams, setTeams] = useState<SavedTeamSummary[]>([]);
  const client = useRef<V2Client | null>(null);
  const catalogRef = useRef<Catalog | null>(null);
  catalogRef.current = catalog;
  const draftRef = useRef<TeamDraft | null>(null);
  draftRef.current = draft;
  const pendingValidations = useRef(new Map<string, string>());
  const operations = useRef(new Map<string, string>());
  const catalogSelections = useRef(new Map<string, TeamDraft | null>());

  useEffect(() => {
    const connection = new V2Client({ ...options, storage: sessionStorage, onChange: (message: V2Message) => {
      if (message.type === 'status') setStatus(message.code === 'CONNECTING' ? 'Connecting' : 'Disconnected');
      if (message.type === 'authentication') { setStatus('Connected'); setError(''); }
      if (message.type === 'catalog') {
        try {
          const result = decodeTeam(JSON.stringify({ ...message, version: 1 }));
          if (result.type === 'catalog') {
            const selected = catalogSelections.current.has(message.requestId);
            const requestedDraft = catalogSelections.current.get(message.requestId);
            catalogSelections.current.delete(message.requestId);
            if (selected) {
              setCatalog(result); setDraft(requestedDraft ?? emptyDraft(result));
            } else if (!draftRef.current || draftRef.current.rosterId === result.rosterId) {
              setCatalog(result); setDraft(previous => previous ?? emptyDraft(result));
            }
          }
        } catch { setError('The server catalog could not be read.'); }
      }
      if (message.type === 'teamValidation') {
        try {
          const result = decodeTeam(JSON.stringify({ ...message, version: 1 }));
          const submitted = pendingValidations.current.get(message.requestId);
          if (result.type === 'teamValidation' && submitted && submitted === JSON.stringify(draftRef.current)) {
            setValidation(result); setValidatedDraft(submitted);
          }
        } catch { setError('The server validation could not be read.'); }
        pendingValidations.current.delete(message.requestId);
      }
      if (message.type === 'savedTeam') {
        const operation = operations.current.get(message.requestId) ?? '';
        operations.current.delete(message.requestId);
        if (message.code === 'OK') {
          if (Array.isArray(message.teams)) setTeams(message.teams);
          if (message.document) {
            const document = message.document as SavedDocument;
            setSaved(document); setEligibility(message.versionStatus ?? 'CURRENT');
            if (document.formatVersion === 3 && document.draft.rosterId !== catalogRef.current?.rosterId) {
              const id = connection.request('catalog', { rosterId: document.draft.rosterId });
              catalogSelections.current.set(id, document.draft); setDraft(null);
            } else setDraft(document.formatVersion === 3 ? document.draft : null);
            setValidation(null); setValidatedDraft(null);
          } else if (operation === 'delete') {
            setSaved(null); setDraft(null); setValidation(null); setValidatedDraft(null);
          }
          if (operation === 'create' || operation === 'update' || operation === 'delete') connection.request('savedTeam', { operation: 'list' });
        } else if (message.code === 'SAVE_OUTCOME_UNKNOWN' || message.code === 'DELETE_OUTCOME_UNKNOWN') {
          setError('The server may have applied this change. Reconnect and repeat the retained request, then refresh your teams.');
        } else setError(String(message.code).replaceAll('_', ' '));
      }
      if (message.type === 'error' && message.code) setError(String(message.code).replaceAll('_', ' '));
      redraw(value => value + 1);
    } });
    client.current = connection; connection.connect();
    return () => { client.current = null; connection.disconnect(); };
  }, [options]);

  const connected = status === 'Connected';
  const busy = !connected || !!client.current?.pending;
  const editable = !!catalog && !!draft && catalog.rosterId === draft.rosterId && eligibility === 'CURRENT';
  const saveable = editable && validation?.valid && validatedDraft === JSON.stringify(draft) && !busy;
  function run(action: () => void) {
    try { setError(''); action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Request could not be sent.'); }
  }
  function requestSaved(operation: string, fields: Record<string, unknown> = {}, mutation = false) {
    const id = client.current!.request('savedTeam', { operation, ...fields }, mutation);
    operations.current.set(id, operation);
  }
  function update(next: TeamDraft) { draftRef.current = next; setDraft(next); setValidation(null); setValidatedDraft(null); }
  function selectRoster(rosterId: string) {
    if (!catalog || rosterId === catalog.rosterId || !['human', 'orc'].includes(rosterId)) return;
    if ((saved || draft?.players.length || draft?.teamName) && !window.confirm('Start a new team with this roster? Unsaved edits will be discarded.')) return;
    run(() => {
      const id = client.current!.request('catalog', { rosterId });
      catalogSelections.current.set(id, null);
      setSaved(null); setEligibility('CURRENT'); setDraft(null); setValidation(null); setValidatedDraft(null);
    });
  }
  function validate() {
    if (!draft) return;
    run(() => { const id = client.current!.request('validateTeam', { draft }); pendingValidations.current.set(id, JSON.stringify(draft)); });
  }
  function save() {
    if (!draft || !saveable) return;
    run(() => requestSaved(saved ? 'update' : 'create', saved
      ? { teamId: saved.teamId, expectedDocumentVersion: saved.documentVersion, draft } : { draft }, true));
  }
  function remove() {
    if (!saved || !window.confirm(`Delete ${saved.draft.teamName}? Existing matches keep their frozen roster.`)) return;
    run(() => requestSaved('delete', { teamId: saved.teamId, expectedDocumentVersion: saved.documentVersion }, true));
  }

  return <main className="builder-shell">
    <div className="builder-heading"><div><p className="kicker">BB2025 · Roster Workshop</p><h1>Build Your Team</h1><p>Recruit from the server catalog, validate your roster, and save it to your account for Play.</p></div></div>
    <p className="builder-connection" role="status">{status}</p>{error && <p className="builder-error" role="alert">{error}</p>}
    {!connected && <button type="button" onClick={() => client.current?.connect()}>Reconnect</button>}
    {client.current?.pending && <p className="builder-error">A change needs confirmation. Reconnect with the same account and <button type="button" onClick={() => run(() => client.current?.retry())}>repeat the retained request</button>.</p>}
    {catalog && draft && <BuilderDraftEditor catalog={catalog} draft={draft} update={update} editable={editable && !busy} validate={validate} validation={validation} selectRoster={selectRoster} />}
    {validation && <div className="panel validation-errors"><TeamValidationView result={validation} /></div>}
    <section className="builder-actions panel" aria-label="Save team"><div>
      <button type="button" disabled={!saveable} onClick={save}>{saved ? 'Save changes' : 'Save team'}</button>
      {saved && <button type="button" className="button secondary" disabled={busy} onClick={remove}>Delete team</button>}
    </div><p>{saved ? `Saved team ${saved.draft.teamName || saved.teamId} · version ${saved.documentVersion} · ${eligibility}` : 'Server validation is required before saving.'}</p></section>
    {eligibility !== 'CURRENT' && <p className="builder-error" role="alert">This saved team cannot enter a new match until its catalog is explicitly migrated and validated.</p>}
    <section className="panel saved-teams-panel" aria-label="Your saved teams"><div className="section-heading"><div><h2>Your Teams</h2><p>Only teams owned by this account are shown here.</p></div><div className="roster-actions">
      <button type="button" className="button secondary" disabled={!connected} onClick={() => run(() => requestSaved('list'))}>Refresh teams</button>
      <button type="button" disabled={!catalog || busy} onClick={() => { setSaved(null); setEligibility('CURRENT'); setDraft(emptyDraft(catalog!)); setValidation(null); setValidatedDraft(null); }}>New team</button>
    </div></div>
      {teams.length ? <ul>{teams.map(team => <li key={team.teamId}>
        <strong>{team.teamName || 'Unnamed older team'}</strong> · {team.rosterId || 'Unknown roster'} · version {team.documentVersion}
        {team.eligibility !== 'CURRENT' && <span> · Unavailable: {team.eligibility}</span>}
        <button type="button" className="button secondary" disabled={busy} onClick={() => run(() => requestSaved('load', { teamId: team.teamId }))}>Load</button>
      </li>)}</ul> : <p>No saved teams yet.</p>}
      <p><a href="/play">Choose a saved team in Play</a></p>
    </section>
  </main>;
}
