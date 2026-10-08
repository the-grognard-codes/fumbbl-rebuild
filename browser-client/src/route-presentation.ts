import type { RouteStep } from './route-protocol.ts';

/** Colors describe this entered square's native checks, independently of previous route risk. */
export function routeSquarePresentation(step: RouteStep): { color: string; band: string; labels: string[]; description: string } {
  const labels = [...(step.dodge ? [`D ${step.dodge}+`] : []), ...(step.rush ? [`R ${step.rush}+`] : [])];
  const penalty = step.dodgeModifier;
  const band = step.dodge ? penalty === undefined ? 'unknown' : penalty >= 0 ? 'dodge-zero'
    : penalty === -1 ? 'dodge-one' : penalty === -2 ? 'dodge-two' : 'dodge-three' : step.rush ? 'rush' : 'clear';
  const colors: Record<string, string> = { clear: '#74d6e126', rush: '#4b8fbd4d', unknown: '#b4a87726',
    'dodge-zero': '#e0bd3c4d', 'dodge-one': '#df843b4d', 'dodge-two': '#be453b4d', 'dodge-three': '#6529324d' };
  const checks = [...(step.dodge ? [`Dodge ${step.dodge}+${penalty === undefined ? '; modifier unavailable'
    : `; net modifier ${penalty > 0 ? '+' : ''}${penalty}`}`] : []), ...(step.rush ? [`Rush ${step.rush}+`] : [])];
  return { color: colors[band], band, labels, description: checks.join(' · ') || 'No dodge or rush roll' };
}
