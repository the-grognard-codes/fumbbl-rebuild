import type { SetupPlayer } from './setup-protocol.ts';

const legacySubtypes: Record<string, readonly [string, string]> = {
  'human:lineman': ['Human', 'Lineman'],
  'human:halfling': ['Halfling', 'Lineman'],
  'human:catcher': ['Human', 'Catcher'],
  'human:thrower': ['Human', 'Thrower'],
  'human:blitzer': ['Human', 'Blitzer'],
  'human:ogre': ['Ogre', 'Big Guy'],
  'orc:orc-lineman': ['Orc', 'Lineman'],
  'orc:goblin-lineman': ['Goblin', 'Lineman'],
  'orc:orc-thrower': ['Orc', 'Thrower'],
  'orc:orc-blitzer': ['Orc', 'Blitzer'],
  'orc:big-un-blocker': ['Orc', 'Blocker'],
  'orc:troll': ['Troll', 'Big Guy']
};

export function playerCardSubtypes(player: SetupPlayer): string | null {
  const fallback = player.art && legacySubtypes[`${player.art.rosterId}:${player.art.positionId}`];
  const race = player.positionRace ?? fallback?.[0];
  const role = player.positionRole ?? fallback?.[1];
  return race && role ? `${race}, ${role}` : null;
}

const legacyStatuses: Record<string, string> = {
  'standing': 'Standing', 'moving': 'Moving', 'prone': 'Prone',
  'stunned': 'Stunned', 'distracted': 'Distracted', 'knocked out': 'Knocked Out',
  'seriously injured': 'Seriously Injured',
  'is standing': 'Standing', 'is moving': 'Moving', 'is prone': 'Prone',
  'has been stunned': 'Stunned', 'has been knocked out': 'Knocked Out',
  'has been badly hurt': 'Badly Hurt', 'has been seriously injured': 'Seriously Injured',
  'has been killed': 'Killed', 'is in reserve': 'Reserve',
  'is missing the game': 'Missing', 'is about to fall down': 'Falling Down',
  'is being blocked': 'Blocked', 'is banned from the game': 'Sent Off',
  'is exhausted': 'Exhausted', 'is being dragged': 'Being Dragged',
  'has been picked up': 'Picked Up', 'was hit while on the ground': 'Hit on the Ground',
  'can not be set up': 'Cannot Be Set Up', 'is in the air': 'In the Air',
  'is unknown': 'Unknown'
};

export function playerCardStatus(player: SetupPlayer): string {
  if (player.status) return player.status;
  if (/distract|confus|hypnotiz/i.test(player.state)) return 'Distracted';
  return legacyStatuses[player.state.toLowerCase()] ?? player.state;
}
