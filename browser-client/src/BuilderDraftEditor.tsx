import { TeamColorArtProvider } from './TeamColorArtProvider.tsx';
import { defaultTeamColors } from './team-colors.ts';
import { TeamColorPicker, BuilderPortrait } from './TeamColorPicker.tsx';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { randomPlayerName } from './player-names';

import { canPurchaseSkill } from './team-protocol';
import type { Catalog, DraftPlayer, Position, TeamDraft } from './team-protocol';

const positionOrder = ['ogre', 'blitzer', 'catcher', 'thrower', 'lineman', 'halfling'];
const orcPositionOrder = ['troll', 'orc-blitzer', 'big-un-blocker', 'orc-thrower', 'orc-lineman', 'goblin-lineman'];
const money = (value: number) => `${value.toLocaleString('en-US')} GP`;

function nextAvailable(values: number[], maximum: number) {
  return Array.from({ length: maximum }, (_, index) => index + 1).find(value => !values.includes(value));
}

function BuilderDraftEditorContent({ catalog, draft, update, editable, completion, validationContent, tools, selectRoster }: {
  catalog: Catalog;
  draft: TeamDraft;
  update: (draft: TeamDraft) => void;
  editable: boolean;
  completion: ReactNode;
  validationContent: ReactNode;
  tools: ReactNode;
  selectRoster: (rosterId: string) => void;
}) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const order = catalog.rosterId === 'orc' ? orcPositionOrder : positionOrder;
  const positions = [...catalog.positions].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const skillNames = new Map(catalog.skills.map(skill => [skill.id, skill.name]));
  const counts = new Map(catalog.positions.map(position => [position.id, draft.players.filter(player => player.positionId === position.id).length]));
  const playerTotal = draft.players.reduce((sum, player) => sum + (catalog.positions.find(position => position.id === player.positionId)?.cost ?? 0), 0);
  const purchasedSkillPoints = draft.players.reduce((sum, player) => {
    const position = catalog.positions.find(item => item.id === player.positionId);
    return sum + player.skillIds.reduce((points, id) => {
      const skill = catalog.skills.find(item => item.id === id);
      return points + (skill && position ? position.primary.includes(skill.category) ? 1 : 2 : 0);
    }, 0);
  }, 0);
  const resourceCost = (id: string) => (catalog.resources.find(resource => resource.id === id)?.cost ?? 0) * (draft.resources[id as keyof TeamDraft['resources']] ?? 0);
  const sideline = resourceCost('assistantCoaches') + resourceCost('cheerleaders') + resourceCost('apothecary');
  const rerolls = resourceCost('rerolls');
  const fans = resourceCost('dedicatedFans');
  const total = playerTotal + sideline + rerolls + fans;
  const orderedPlayers = [...draft.players].sort((a, b) => a.slot - b.slot);

  function changePlayer(id: string, change: Partial<DraftPlayer>) {
    update({ ...draft, players: draft.players.map(player => player.id === id ? { ...player, ...change } : player) });
  }

  function addPlayer(position: Position) {
    const slot = nextAvailable(draft.players.map(player => player.slot), catalog.maxPlayers);
    const jerseyNumber = nextAvailable(draft.players.map(player => player.jerseyNumber), 99);
    if (!editable || slot === undefined || jerseyNumber === undefined || (counts.get(position.id) ?? 0) >= position.maximum) return;
    const player: DraftPlayer = {
      id: crypto.randomUUID(), slot, jerseyNumber,
      playerName: randomPlayerName(catalog.rosterId, position.id, draft.players.map(player => player.playerName)),
      positionId: position.id, skillIds: []
    };
    update({ ...draft, players: [...draft.players, player] });
  }

  function movePlayer(index: number, direction: -1 | 1) {
    const other = orderedPlayers[index + direction];
    if (!other) return;
    const current = orderedPlayers[index];
    update({ ...draft, players: draft.players.map(player => player.id === current.id ? { ...player, slot: other.slot }
      : player.id === other.id ? { ...player, slot: current.slot } : player) });
  }

  return <>
    <section className="builder-controls" aria-label="Team Options">
      <label>Team Name <input id="builder-team-name" aria-label="Team name" maxLength={50} placeholder="The Moles" autoComplete="off" disabled={!editable} value={draft.teamName} onChange={event => update({ ...draft, teamName: event.target.value.normalize('NFC') })} /></label>
      <label>Team <select id="builder-team-roster" aria-label="Team" value={catalog.rosterId} disabled={!editable} onChange={event => selectRoster(event.target.value)}><option value="human">Human</option><option value="orc">Orc</option></select></label>
      <p className="builder-budget">Match-ready<br/><strong>{money(catalog.budget)} budget</strong></p>
    </section>

    <section className="workbench-status" aria-label="Budget and saving">
      <div className="workbench-totals" aria-label="Roster value">
        <span>Players {draft.players.length}/{catalog.maxPlayers}</span>
        <span>Purchased skill points {purchasedSkillPoints} / {catalog.skillPoints}</span>
        <span>Total team value: {money(total)}</span>
        <strong className={total > catalog.budget ? 'treasury over-budget' : 'treasury'}>Remaining treasury: {money(catalog.budget - total)}</strong>
      </div>
      {completion}
    </section>
    {validationContent}

    <div className="builder-options">
      <details className="builder-kit-options">
        <summary id="builder-kit-toggle"><BuilderPortrait rosterId={catalog.rosterId} positionId={catalog.rosterId === 'orc' ? 'orc-lineman' : 'lineman'}/><span>Customize kit</span></summary>
        <TeamColorPicker rosterId={draft.rosterId} colors={draft.colors} disabled={!editable} onChange={colors => update({ ...draft, colors })}/>
      </details>
      <button className="button secondary" type="button" aria-expanded={detailsVisible} onClick={() => setDetailsVisible(value => !value)}>{detailsVisible ? 'Hide' : 'Show'} Team Details</button>
      {tools}
    </div>

    {detailsVisible && <section className="panel team-details" aria-label="Team details">
      <h2>{catalog.name} Team Details</h2>
      <p><strong>Team Re-rolls:</strong> {money(catalog.resources.find(resource => resource.id === 'rerolls')?.cost ?? 0)} · <strong>Special Rule:</strong> {catalog.specialRule}</p>
      <table><thead><tr><th>Position</th><th>Max</th><th>Cost</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th className="starting-skills">Starting Skills &amp; Traits</th><th className="skill-access-heading">Skill Access</th></tr></thead>
        <tbody>{positions.map(position => <tr key={position.id}><th><span className="position-title">{position.name}</span><span className="position-tags">({position.role}, {position.race})</span></th><td>{position.maximum}</td><td className="cost">{money(position.cost)}</td><td>{position.ma}</td><td>{position.st}</td><td>{position.ag}+</td><td>{position.pa}+</td><td>{position.av}+</td><td className="skills-list">{position.baseSkills.map(skill => skillNames.get(skill.id) ?? skill.id).join(', ') || '—'}</td><td className="skill-access"><mark className="primary-access">{position.primary}</mark><mark className="secondary-access">{position.secondary}</mark></td></tr>)}</tbody>
      </table>
    </section>}

    <div className="builder-workbench">
      <aside className="builder-purchases panel" aria-label="Recruitment and resources">
      <section className="recruitment"><h2>Recruit Players</h2><div className="position-list">{positions.map(position => {
        const count = counts.get(position.id) ?? 0;

        return <article className="position" key={position.id}>
          <BuilderPortrait rosterId={catalog.rosterId} positionId={position.id}/>
          <div><h3>{position.name}</h3><p>{count} / {position.maximum} · {money(position.cost)}</p></div>
          <button type="button" className="button secondary" aria-label={`Add ${position.name}`} disabled={!editable || count >= position.maximum || draft.players.length >= catalog.maxPlayers} onClick={() => addPlayer(position)}>Add</button>
        </article>;
      })}</div></section>
      <section id="builder-resources" tabIndex={-1} className="resources" aria-label="Sideline and resources"><h2>Sideline And Resources</h2><div id="resource-list">{catalog.resources.map(resource => {
        const value = draft.resources[resource.id];
        return <article className="resource" key={resource.id}><div><h3>{resource.name}</h3><p>{money(resource.cost)} each · max {resource.maximum}</p></div><div className="resource-controls"><button type="button" aria-label={`Subtract ${resource.name}`} disabled={!editable || value === 0} onClick={() => update({ ...draft, resources: { ...draft.resources, [resource.id]: value - 1 } })}><span className="resource-sign" aria-hidden="true" /></button><output id={`builder-resource-${resource.id}`} tabIndex={-1} aria-label={resource.name}>{value}</output><button type="button" aria-label={`Add ${resource.name}`} disabled={!editable || value >= resource.maximum} onClick={() => update({ ...draft, resources: { ...draft.resources, [resource.id]: value + 1 } })}><span className="resource-sign resource-sign-plus" aria-hidden="true" /></button></div></article>;
      })}</div></section>
      <details className="value-breakdown"><summary>Spending breakdown</summary><dl>
        <dt>Players</dt><dd>{money(playerTotal)}</dd><dt>Sideline staff</dt><dd>{money(sideline)}</dd><dt>Team re-rolls</dt><dd>{money(rerolls)}</dd><dt>Dedicated fans</dt><dd>{money(fans)}</dd>
      </dl></details>
      </aside>

    <section id="builder-roster" tabIndex={-1} className="panel roster-panel"><div className="section-heading"><div><h2>Editable Roster</h2><p>Unique numbers 1–99. Open player options for captain and purchased skills.</p></div></div>
      <div className="roster" aria-live="polite">{orderedPlayers.length ? orderedPlayers.map((player, index) => {
        const position = catalog.positions.find(item => item.id === player.positionId);
        const eligibleSkills = catalog.skills.filter(skill => position && canPurchaseSkill(skill, position, draft.captainId === player.id));

        return <article id={`builder-player-${player.slot}`} tabIndex={-1} className="roster-row" key={player.id}>
          <BuilderPortrait rosterId={catalog.rosterId} positionId={player.positionId}/>
          <label className="roster-player-name"><span className="field-caption">Name</span><input id={`builder-player-${player.slot}-name`} aria-label={`Name for slot ${player.slot}`} maxLength={30} disabled={!editable} value={player.playerName} onChange={event => changePlayer(player.id, { playerName: event.target.value.normalize('NFC') })}/><span className="position-name">{position?.name ?? player.positionId}</span></label>
          <label className="roster-jersey">#<input id={`builder-player-${player.slot}-jersey`} aria-label={`Jersey for slot ${player.slot}`} type="number" min="1" max="99" disabled={!editable} value={player.jerseyNumber} onChange={event => changePlayer(player.id, { jerseyNumber: event.target.valueAsNumber })}/></label>
          <div className="row-buttons"><button type="button" aria-label={`Move slot ${player.slot} up`} disabled={!editable || index === 0} onClick={() => movePlayer(index, -1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg></button><button type="button" aria-label={`Move slot ${player.slot} down`} disabled={!editable || index === orderedPlayers.length - 1} onClick={() => movePlayer(index, 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg></button><button type="button" aria-label={`Remove slot ${player.slot}`} disabled={!editable} onClick={() => update({ ...draft, captainId: draft.captainId === player.id ? null : draft.captainId, players: draft.players.filter(item => item.id !== player.id) })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
          <details className="roster-player-options"><summary aria-label={`Options for slot ${player.slot}`}>{draft.captainId === player.id ? 'Captain · ' : ''}{player.skillIds.length ? skillNames.get(player.skillIds[0]) : 'Player options'}</summary><div className="player-options-fields">
            <label>Team Captain<select id={`builder-player-${player.slot}-captain`} aria-label={`Captain for slot ${player.slot}`} disabled={!editable || !position?.canCaptain} value={draft.captainId === player.id ? 'yes' : ''} onChange={event => update({ ...draft, captainId: event.target.value === 'yes' ? player.id : null })}><option value="">No</option><option value="yes">Yes</option></select></label>
            <label className="roster-skill">Purchased skill<select id={`builder-player-${player.slot}-skill`} aria-label={`Skill for slot ${player.slot}`} disabled={!editable} value={player.skillIds[0] ?? ''} onChange={event => changePlayer(player.id, { skillIds: event.target.value ? [event.target.value] : [] })}><option value="">No purchased skill</option>{eligibleSkills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}{skill.elite ? ' (Elite)' : ''}</option>)}</select></label>
            <p className="skills">Starting skills: {position?.baseSkills.map(skill => skillNames.get(skill.id) ?? skill.id).join(', ') || 'None'}</p>
          </div></details>
        </article>;
      }) : <p>No players recruited yet.</p>}</div>
    </section>

    </div>
  </>;
}

export function BuilderDraftEditor(props: Parameters<typeof BuilderDraftEditorContent>[0]) {
  return <TeamColorArtProvider home={{ rosterId: props.draft.rosterId, league: null, colors: props.draft.colors ?? defaultTeamColors(props.draft.rosterId) }}><BuilderDraftEditorContent {...props}/></TeamColorArtProvider>;
}
