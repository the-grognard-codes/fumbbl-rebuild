import type { SetupState } from './setup-protocol.ts';

export function matchTeamName(state: Pick<SetupState, 'homeTeamName' | 'awayTeamName'>, role: 'home' | 'away'): string {
  return (role === 'home' ? state.homeTeamName : state.awayTeamName) || (role === 'home' ? 'Home' : 'Away');
}
