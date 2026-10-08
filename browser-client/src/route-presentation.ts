import type { RouteStep } from './route-protocol.ts';

/** Colors describe this entered square's native checks, independently of previous route risk. */
export function routeSquarePresentation(step: RouteStep): { color: string; band: string; labels: string[]; description: string } {
  const labels = [...(step.dodge ? [`D ${step.dodge}+`] : []), ...(step.rush ? [`R ${step.rush}+`] : [])];
  const penalty = step.dodgeModifier;
  const band = step.dodge ? penalty === undefined ? 'unknown' : penalty >= 0 ? 'dodge-zero'
    : penalty === -1 ? 'dodge-one' : penalty === -2 ? 'dodge-two' : 'dodge-three' : step.rush ? 'rush' : 'clear';
  const colors: Record<string, string> = { clear: '#93c6e8', rush: '#4b8fbd', unknown: '#b4a877',
    'dodge-zero': '#e0bd3c', 'dodge-one': '#df843b', 'dodge-two': '#be453b', 'dodge-three': '#652932' };
  const checks = [...(step.dodge ? [`Dodge ${step.dodge}+${penalty === undefined ? '; modifier unavailable'
    : `; net modifier ${penalty > 0 ? '+' : ''}${penalty}`}`] : []), ...(step.rush ? [`Rush ${step.rush}+`] : [])];
  return { color: colors[band], band, labels, description: checks.join(' · ') || 'No dodge or rush roll' };
}
