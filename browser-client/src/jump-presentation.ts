import type { RoutePoint, RouteStep } from './route-protocol.ts';
import type { PitchProjection } from './pitch-projection.ts';
import type { ThreatPreferences } from './threat-preferences.ts';
import { projectThreatSquare } from './threat-presentation.ts';
import { projectWarning } from './movement-range-presentation.ts';

/** Explicit jump guidance is independent of the ordinary threat master switch. */
export function projectJumpLanding(step: RouteStep, camera: PitchProjection, preferences: ThreatPreferences) {
  const penalty = Math.max(0, -(step.dodgeModifier ?? 0));
  const striped = preferences.otherSkills && (preferences.divingTackle && step.reactions.includes('Diving Tackle')
    || preferences.tentacles && step.reactions.includes('Tentacles')
    || preferences.prehensileTail && step.reactions.includes('Prehensile Tail'));
  const projected = projectThreatSquare({...step,count:Math.max(1,penalty),tackle:false,striped}, camera, penalty > 0, false);
  return {penalty, target:step.checks?.find(check => check.name === 'Jump')?.target,
    ...projected, outline:camera.square(step,.04,true),
    center:camera.project({x:step.x+.5,y:step.y+.5}), rush:step.rush ? projectWarning(step,camera) : null};
}

/** The arc rises in screen space; canonical endpoints stay identical in either coach view. */
export function movementRoutePath(route: RoutePoint[], camera: PitchProjection): string {
  let previous: {x:number;y:number} | null = null;
  return route.map(cell => {
    const point = camera.project({x:cell.x+.5,y:cell.y+.5});
    if (!point) {previous=null;return '';}
    const command = !previous ? `M${point.x},${point.y}` : cell.jump
      ? `Q${(previous.x+point.x)/2},${(previous.y+point.y)/2-Math.max(18,Math.hypot(point.x-previous.x,point.y-previous.y)*.45)} ${point.x},${point.y}`
      : `L${point.x},${point.y}`;
    previous=point;return command;
  }).join(' ');
}
