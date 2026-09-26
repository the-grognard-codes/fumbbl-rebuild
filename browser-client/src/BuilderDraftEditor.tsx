import { useState } from 'react';

import { canPurchaseSkill } from './team-protocol';
import type { Catalog, DraftPlayer, Position, TeamDraft, Validation } from './team-protocol';

const spriteFiles: Record<string, string> = {
  ogre: '01-ogre-man.png',
  blitzer: '02-blitzer-man.png',
  catcher: '05-catcher-man.png',
  thrower: '06-thrower-man.png',
  lineman: '08-lineman-man.png',
  halfling: '14-halfling-man.png'
};
const positionOrder = ['ogre', 'blitzer', 'catcher', 'thrower', 'lineman', 'halfling'];
const money = (value: number) => `${value.toLocaleString('en-US')} GP`;

function sprite(positionId: string) {
  const file = spriteFiles[positionId];
  return file ? `/assets/team-sprites/humans/${file}` : null;
}

function nextAvailable(values: number[], maximum: number) {
  return Array.from({ length: maximum }, (_, index) => index + 1).find(value => !values.includes(value));
}

export function BuilderDraftEditor({ catalog, draft, update, editable, validate, validation }: {
  catalog: Catalog;
  draft: TeamDraft;
  update: (draft: TeamDraft) => void;
  editable: boolean;
  validate: () => void;
  validation: Validation | null;
}) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const positions = [...catalog.positions].sort((a, b) => positionOrder.indexOf(a.id) - positionOrder.indexOf(b.id));
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
      playerName: `${position.name} ${Number(counts.get(position.id) ?? 0) + 1}`,
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
    <section className="builder-controls panel" aria-label="Team Options">
      <label>Team Name <input aria-label="Team name" maxLength={50} placeholder="The Moles" autoComplete="off" disabled={!editable} value={draft.teamName} onChange={event => update({ ...draft, teamName: event.target.value.normalize('NFC') })} /></label>
      <label>Team <select aria-label="Team" value={catalog.rosterId} disabled><option value={catalog.rosterId}>{catalog.name}</option></select></label>
      <label>Creation mode <select aria-label="Creation mode" value={catalog.presetId} disabled><option value={catalog.presetId}>Match-ready · {money(catalog.budget)}</option></select></label>
      <button className="button secondary" type="button" aria-expanded={detailsVisible} onClick={() => setDetailsVisible(value => !value)}>{detailsVisible ? 'Hide' : 'Show'} Team Details</button>
    </section>

    {detailsVisible && <section className="panel team-details" aria-label="Team details">
      <h2>{catalog.name} Team Details</h2>
      <p><strong>Team Re-rolls:</strong> {money(catalog.resources.find(resource => resource.id === 'rerolls')?.cost ?? 0)} · <strong>Special Rule:</strong> {catalog.specialRule}</p>
      <table><thead><tr><th>Position</th><th>Max</th><th>Cost</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th className="starting-skills">Starting Skills &amp; Traits</th><th className="skill-access-heading">Skill Access</th></tr></thead>
        <tbody>{positions.map(position => <tr key={position.id}><th><span className="position-title">{position.name}</span><span className="position-tags">({position.role}, {position.race})</span></th><td>{position.maximum}</td><td className="cost">{money(position.cost)}</td><td>{position.ma}</td><td>{position.st}</td><td>{position.ag}+</td><td>{position.pa}+</td><td>{position.av}+</td><td className="skills-list">{position.baseSkills.map(skill => skillNames.get(skill.id) ?? skill.id).join(', ') || '—'}</td><td className="skill-access"><mark className="primary-access">{position.primary}</mark><mark className="secondary-access">{position.secondary}</mark></td></tr>)}</tbody>
      </table>
    </section>}

    <div className="builder-grid">
      <section className="panel recruitment"><h2>Recruit Players</h2><div className="position-list">{positions.map(position => {
        const count = counts.get(position.id) ?? 0;
        const image = sprite(position.id);
        return <article className="position" key={position.id}>
          {image && <img className="sprite" src={image} alt="" />}
          <h3>{position.name}</h3><p>{count} / {position.maximum} · {money(position.cost)}</p>
          <button type="button" disabled={!editable || count >= position.maximum || draft.players.length >= catalog.maxPlayers} onClick={() => addPlayer(position)}>Add {position.name}</button>
        </article>;
      })}</div></section>
      <aside className="panel value-panel"><h2>Roster Value</h2><dl>
        <dt>Players</dt><dd>{money(playerTotal)}</dd>
        <dt>Purchased skill points</dt><dd>{purchasedSkillPoints} / {catalog.skillPoints}</dd>
        <dt>Sideline staff</dt><dd>{money(sideline)}</dd>
        <dt>Team re-rolls</dt><dd>{money(rerolls)}</dd>
        <dt>Dedicated fans</dt><dd>{money(fans)}</dd>
        <dt>Total team value</dt><dd><strong>{money(total)}</strong></dd>
      </dl><p className="treasury">Remaining treasury: {money(catalog.budget - total)}</p>
        <p className="builder-hint">Roster values are estimates until server validation.</p>
        <p role="status">{validation ? validation.valid ? 'Server validation passed.' : 'Server validation found changes to make.' : 'Validate on the server before saving.'}</p>
      </aside>
    </div>

    <section className="panel roster-panel"><div className="section-heading"><div><h2>Editable Roster</h2><p>Jersey numbers must be unique from 1–99. Use the order controls to arrange your team.</p></div><button type="button" disabled={!editable} onClick={validate}>Validate Roster</button></div>
      <div className="roster" aria-live="polite">{orderedPlayers.length ? orderedPlayers.map((player, index) => {
        const position = catalog.positions.find(item => item.id === player.positionId);
        const eligibleSkills = catalog.skills.filter(skill => position && canPurchaseSkill(skill, position, draft.captainId === player.id));
        const image = sprite(player.positionId);
        return <article className="roster-row" key={player.id}>
          {image && <img src={image} alt="" />}
          <div className="position-name">{position?.name ?? player.positionId}<div className="skills">{position?.baseSkills.map(skill => skillNames.get(skill.id) ?? skill.id).join(', ') || 'No starting skills'}</div></div>
          <label>Name<input aria-label={`Name for slot ${player.slot}`} maxLength={30} disabled={!editable} value={player.playerName} onChange={event => changePlayer(player.id, { playerName: event.target.value.normalize('NFC') })} /></label>
          <label>Number<input aria-label={`Jersey for slot ${player.slot}`} type="number" min="1" max="99" disabled={!editable} value={player.jerseyNumber} onChange={event => changePlayer(player.id, { jerseyNumber: event.target.valueAsNumber })} /></label>
          <label>Team Captain<select aria-label={`Captain for slot ${player.slot}`} disabled={!editable || !position?.canCaptain} value={draft.captainId === player.id ? 'yes' : ''} onChange={event => update({ ...draft, captainId: event.target.value === 'yes' ? player.id : null })}><option value="">No</option><option value="yes">Yes</option></select></label>
          <div className="row-buttons"><button type="button" aria-label={`Move slot ${player.slot} up`} disabled={!editable || index === 0} onClick={() => movePlayer(index, -1)}>↑</button><button type="button" aria-label={`Move slot ${player.slot} down`} disabled={!editable || index === orderedPlayers.length - 1} onClick={() => movePlayer(index, 1)}>↓</button><button type="button" aria-label={`Remove slot ${player.slot}`} disabled={!editable} onClick={() => update({ ...draft, captainId: draft.captainId === player.id ? null : draft.captainId, players: draft.players.filter(item => item.id !== player.id) })}>×</button></div>
          <label className="roster-skill">Purchased skill<select aria-label={`Skill for slot ${player.slot}`} disabled={!editable} value={player.skillIds[0] ?? ''} onChange={event => changePlayer(player.id, { skillIds: event.target.value ? [event.target.value] : [] })}><option value="">No purchased skill</option>{eligibleSkills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}{skill.elite ? ' (Elite)' : ''}</option>)}</select></label>
        </article>;
      }) : <p>No players recruited yet.</p>}</div>
    </section>

    <section className="panel resources"><h2>Sideline And Resources</h2><div id="resource-list">{catalog.resources.map(resource => {
      const value = draft.resources[resource.id];
      return <article className="resource" key={resource.id}><h3>{resource.name}</h3><p>{money(resource.cost)} each · max {resource.maximum}</p><div className="resource-controls"><button type="button" aria-label={`Subtract ${resource.name}`} disabled={!editable || value === 0} onClick={() => update({ ...draft, resources: { ...draft.resources, [resource.id]: value - 1 } })}>−</button><output aria-label={resource.name}>{value}</output><button type="button" aria-label={`Add ${resource.name}`} disabled={!editable || value >= resource.maximum} onClick={() => update({ ...draft, resources: { ...draft.resources, [resource.id]: value + 1 } })}>+</button></div></article>;
    })}</div></section>
  </>;
}
