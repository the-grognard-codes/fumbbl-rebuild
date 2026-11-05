import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { DiceOutcomeGraphic } from './DiceOutcomeGraphic.tsx';
import { diceOutcomes } from './dice-outcomes.ts';
import type { DiceMoment } from './dice-presentation.ts';
import { PolygonDie } from './PolygonDie.tsx';
import { blockFaceLabel, dieRollKey } from './dice-presentation.ts';
import { PITCH_DICE_ROLL_MS } from './presentation-timing.ts';
import { useDicePreferences } from './use-dice-preferences.ts';
import { nativeDirectionAngles } from './dice-direction-presentation.ts';
import './pitch-dice-effects.css';

const eventIcons = `${import.meta.env.BASE_URL}assets/game/ui/dice-events-v1/`;
const directions = new Set(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']);

/** Reveal presentation on the same deadline as the existing physical dice. */
function useResolved(group: DiceMoment, isStatic: boolean) {
  const motionKey = group.faces.map((_, index) => dieRollKey(group, index) ?? '').join('|');
  const rolling = !isStatic && motionKey.replaceAll('|', '') !== '';
  const [completed, setCompleted] = useState<string>();
  const duration = group.rollDuration ?? PITCH_DICE_ROLL_MS;
  useLayoutEffect(() => {
    if (!rolling) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => setCompleted(motionKey);
    if (preference.matches) { finish(); return; }
    const timer = setTimeout(finish, duration);
    const reduce = () => { if (preference.matches) finish(); };
    preference.addEventListener('change', reduce);
    return () => { clearTimeout(timer); preference.removeEventListener('change', reduce); };
  }, [motionKey, rolling, duration]);
  return !rolling || completed === motionKey;
}

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

export function PitchDiceGroup({ group, caption = false, role, forceStatic = false, directionAngles }: {
  group: DiceMoment; caption?: boolean; role?: 'status'; forceStatic?: boolean; directionAngles?: Record<string, number>;
}) {
  const { preferences } = useDicePreferences();
  const block = group.faces.length > 0 && group.faces.every(face => blockFaceLabel(face));
  const resolved = useResolved(group, forceStatic || !!group.static);
  const presentation = group.presentation ?? group.rolls?.[0]?.presentation;
  const name = presentation?.name ?? group.label;
  const text = `${name}${resolved && presentation?.result ? ` - ${presentation.result}` : ''}`;
  const outcome = group.outcome && diceOutcomes[group.outcome];
  return <PitchDiceEffects exiting={group.exiting} isStatic={forceStatic || group.static} rate={group.rate}>
    <div className="pitch-roll-group" data-outcome={group.outcome} data-casualty-type={!!outcome?.casualty}
      style={{ '--effect-accent': outcome?.color, '--outcome-delay': `${group.rollDuration ?? PITCH_DICE_ROLL_MS}ms` } as CSSProperties}>
      {(block ? caption : preferences.showText) && <span className="pitch-roll-caption">{block ? group.label : text}</span>}
      <div className="pitch-roll-result">
        {!block && preferences.showIcons && presentation?.icon && !group.outcome
          && <img className="pitch-dice-event-icon" src={`${eventIcons}${presentation.icon}.svg`} alt={name}/>}
        <div className="pitch-decision-roll" role={role} aria-label={`${block ? group.label : text}: ${group.faces.join(', ')}`}>
          {group.faces.map((face, index) => <span key={index} className="pitch-die-with-direction" title={block ? group.rolls?.[index]?.label ?? group.label : undefined}>
            <PolygonDie kind={group.rolls?.[index]?.kind ?? (blockFaceLabel(face) ? 'block' : 'd6')} face={face}
              selected={group.selected === index} index={index} rollKey={forceStatic || group.static ? undefined : dieRollKey(group, index)}
              rollDuration={group.rollDuration ?? PITCH_DICE_ROLL_MS}/>
            {!block && preferences.showIcons && resolved && group.rolls?.[index]?.kind === 'd8'
              && (group.rolls[index].direction || ['scatter', 'bounce', 'deviation', 'kick-direction'].includes(presentation?.icon ?? ''))
              && (directions.has(group.rolls[index].direction ?? '')
                ? <img className="pitch-dice-direction" src={`${eventIcons}direction-${group.rolls[index].direction}.svg`}
                  style={{ transform: `rotate(${(directionAngles?.[group.rolls[index].direction!] ?? nativeDirectionAngles[group.rolls[index].direction!]) - nativeDirectionAngles[group.rolls[index].direction!]}deg)` }}
                  alt={`${group.rolls[index].direction} direction`}/>
                : <svg className="pitch-dice-direction pitch-dice-direction-unknown" role="img" aria-label="Direction unavailable" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="6"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/>
                </svg>)}
          </span>)}
        </div>
        {group.outcome && <span className={`pitch-dice-outcome${!block && !preferences.showIcons ? ' dice-icons-hidden' : ''}`}
          aria-hidden={!block && !preferences.showIcons ? true : undefined}><DiceOutcomeGraphic kind={group.outcome}/></span>}
      </div>
    </div>
  </PitchDiceEffects>;
}
