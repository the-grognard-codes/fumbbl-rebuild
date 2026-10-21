import { skillUseCases } from './skill-use-preferences.ts';
import type { SkillUseControls } from './skill-use-preferences.ts';
import './automatic-skill-use.css';

export function AutomaticSkillUse({ controls, connected }: { controls: SkillUseControls; connected: boolean }) {
  return <section className="automatic-skill-use" aria-label="Automatic Skill Use">
    <h3>Automatic Skill Use</h3>
    <p>Applies to all your players across matches and devices. Changes affect the next eligible decision; open decisions stay unchanged.</p>
    <p>Always Use accepts eligible skill use, including limited-use allowances. Grab still needs a push square. Pick-me-up attempts recovery for every eligible teammate.</p>
    {controls.error && <p role="alert">{controls.error}</p>}
    {controls.pending && <p role="status">Waiting for server confirmation…</p>}
    {controls.saved && !controls.pending && <p role="status">Preferences saved.</p>}
    <button type="button" disabled={!connected || controls.pending} onClick={controls.load}>Reload skill use preferences</button>
    <div className="automatic-skill-use-list">{skillUseCases.map(([key, label]) => <fieldset key={key} disabled={!connected || controls.pending || !controls.preferences}>
      <legend>{label}</legend>
      {(['always-use', 'always-ask'] as const).map(mode => <label key={mode}>
        <input type="radio" name={`skill-use-${key}`} value={mode} checked={controls.preferences?.[key] === mode}
          onChange={() => controls.update(key, mode)}/>{mode === 'always-use' ? 'Always Use' : 'Always Ask'}
      </label>)}
    </fieldset>)}</div>
  </section>;
}
