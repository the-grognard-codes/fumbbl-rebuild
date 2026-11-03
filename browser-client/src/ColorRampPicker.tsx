import type { ProofRamp } from './sprite-proof-format.ts';

/** Native radio semantics keep each visible color grid keyboard and touch accessible. */
export function ColorRampPicker({ label, name, ramps, value, onChange }: {
  label: string; name: string; ramps: readonly ProofRamp[]; value: string; onChange: (id: string) => void;
}) {
  return <fieldset className="proof-color-picker"><legend>{label}</legend>
    <p className="proof-color-selection">Selected: <strong>{ramps.find(ramp => ramp.id === value)?.name}</strong></p>
    <div className="proof-color-grid">{ramps.map(ramp => <label key={ramp.id} className="proof-color-option">
      <input type="radio" name={name} aria-label={ramp.name} value={ramp.id} checked={ramp.id === value} onChange={() => onChange(ramp.id)}/>
      <span className="proof-color-swatch" style={{ background: ramp.colors[8] }} aria-hidden="true">
        {ramp.id === value && <span className="proof-color-check">✓</span>}
      </span><span>{ramp.name}</span>
    </label>)}</div>
  </fieldset>;
}
