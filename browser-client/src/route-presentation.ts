import type { MovementCheck, RouteStep } from './route-protocol.ts';

/** Colors describe this entered square's native checks, independently of previous route risk. */
export function routeSquarePresentation(step: RouteStep): { color: string; band: string; labels: string[]; badges: { code: string; name: string; description: string }[]; description: string } {
  const labels = [...(step.dodge ? [`D ${step.dodge}+`] : []), ...(step.rush ? [`R ${step.rush}+`] : [])];
  const penalty = step.dodgeModifier;
  const band = step.dodge ? penalty === undefined ? 'unknown' : penalty >= 0 ? 'dodge-zero'
    : penalty === -1 ? 'dodge-one' : penalty === -2 ? 'dodge-two' : 'dodge-three' : step.rush ? 'rush' : 'clear';
  const colors: Record<string, string> = { clear: '#74d6e126', rush: '#4b8fbd4d', unknown: '#b4a87726',
    'dodge-zero': '#e0bd3c4d', 'dodge-one': '#df843b4d', 'dodge-two': '#be453b4d', 'dodge-three': '#6529324d' };
  const checks = [...(step.dodge ? [`Dodge ${step.dodge}+${penalty === undefined ? '; modifier unavailable'
    : `; net modifier ${penalty > 0 ? '+' : ''}${penalty}`}`] : []), ...(step.rush ? [`Rush ${step.rush}+`] : [])];
  const additional: MovementCheck[] = step.checks ?? step.reactions.map(name => ({ name: name as MovementCheck['name'], target: null, condition: 'possible' }));
  const codes = { Pickup: 'P', Jump: 'J', 'Ball scatter': 'B', 'Diving Tackle': 'DT', Tentacles: 'T', Shadowing: 'S', 'Steady Footing': 'SF' };
  const badges = additional.map(check => ({ name: check.name,
    code: `${codes[check.name]}${check.target === null ? '' : `${check.target}+`}${check.condition === 'possible' ? '?' : check.condition === 'fall' ? '*' : ''}`,
    description: `${check.condition === 'possible' ? 'Possible ' : ''}${check.name}${check.target === null ? '' : ` ${check.target}+`}${check.condition === 'fall' ? ' if the player falls' : ''}` }));
  return { color: colors[band], band, labels, badges, description: [...checks, ...badges.map(badge => badge.description)].join(' · ') || 'No entry checks' };
}
