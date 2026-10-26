/** Synthetic public projection: no retained match or coach data. */
export function solidDefenceState(matchId: string) {
  const players = Array.from({ length: 6 }, (_, index) => ({
    id: `00000000-0000-0000-0000-${String(index + 10).padStart(12, '0')}`,
    name: `Selected Defence Player ${index + 1}`, slot: index + 1, role: 'home',
    x: null, y: null, state: 'reserve', art: null, number: index + 1,
    position: 'Lineman', ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: [], offPitch: 'reserve'
  }));
  return {
    projectionVersion: 4, matchId, revision: 35, callerRole: 'home', phase: 'PLAY', actor: 'home', prompt: null,
    players, weather: 'NICE', homeRerolls: 2, awayRerolls: 2, turn: 0, turnMode: 'SOLID_DEFENCE', ball: null,
    activePlayerId: null, half: 1, homeTurn: 0, awayTurn: 0, homeScore: 0, awayScore: 0, drive: 1,
    homeTeamName: 'Home', awayTeamName: 'Away',
    homeResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 },
    awayResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 },
    kickoff: { version: 1, event: 'SOLID_DEFENCE', actor: 'home', stage: 'movement', allowed: 6, completed: 0, selected: 6 },
    actions: players.flatMap(player => Array.from({ length: 195 }, (_, square) => ({
      id: `event-${player.id}-${square % 13}-${Math.floor(square / 13)}`,
      label: `Redeploy ${player.name} to square ${square % 13}, ${Math.floor(square / 13)}`,
      actor: 'home', kind: 'kickoffMove', target: { x: square % 13, y: Math.floor(square / 13) }, sourcePlayerId: player.id
    })))
  };
}
