import type { CSSProperties, ReactNode } from 'react';
import { DiceOutcomeGraphic } from './DiceOutcomeGraphic.tsx';
import { diceOutcomes } from './dice-outcomes.ts';
import type { DiceMoment } from './dice-presentation.ts';
import { PolygonDie } from './PolygonDie.tsx';
import { blockFaceLabel } from './dice-presentation.ts';
import { PITCH_DICE_ROLL_MS } from './presentation-timing.ts';
import './pitch-dice-effects.css';

export function PitchDiceEffects({ children, exiting = false, isStatic = false, rate = 1 }: {
  children: ReactNode; exiting?: boolean; isStatic?: boolean; rate?: number;
}) {
  return <div className={`pitch-dice-lifetime${exiting ? ' exiting' : ''}${isStatic ? ' static-dice' : ''}`}
    style={{ '--dice-rate': rate } as CSSProperties} aria-hidden={exiting ? true : undefined} inert={exiting}>
    <div className="pitch-dice-arrival">{children}</div>
    {exiting && !isStatic && <div className="pitch-dice-evaporation" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map(wisp => <i key={wisp} style={{ '--wisp': wisp } as CSSProperties}/>)}</div>}
  </div>;
}

export function PitchDiceGroup({ group, caption = false, role, forceStatic = false }: {
  group: DiceMoment; caption?: boolean; role?: 'status'; forceStatic?: boolean;
}) {
  const outcome = group.outcome && diceOutcomes[group.outcome];
  return <PitchDiceEffects exiting={group.exiting} isStatic={forceStatic || group.static} rate={group.rate}>
    <div className="pitch-roll-group" data-outcome={group.outcome} data-casualty-type={!!outcome?.casualty}
      style={{ '--effect-accent': outcome?.color, '--outcome-delay': `${group.rollDuration ?? PITCH_DICE_ROLL_MS}ms` } as CSSProperties}>
      {caption && <span className="pitch-roll-caption">{group.label}</span>}
      <div className="pitch-roll-result">
        <div className="pitch-decision-roll" role={role} aria-label={`${group.label}: ${group.faces.join(', ')}`}>
          {group.faces.map((face, index) => <span key={index} title={group.rolls?.[index]?.label ?? group.label}>
            <PolygonDie kind={group.rolls?.[index]?.kind ?? (blockFaceLabel(face) ? 'block' : 'd6')} face={face}
              selected={group.selected === index} index={index} rollKey={forceStatic || group.static ? undefined : group.rolls?.[index]?.rollKey ?? group.rollKey}
              rollDuration={group.rollDuration ?? PITCH_DICE_ROLL_MS}/>
          </span>)}
        </div>
        {group.outcome && <span className="pitch-dice-outcome"><DiceOutcomeGraphic kind={group.outcome}/></span>}
      </div>
    </div>
  </PitchDiceEffects>;
}
