import type { SetupAction, SetupState } from './setup-protocol.ts';
import type { ActionGlyphKind } from './ActionGlyph.tsx';

const definitions: { key: string; label: string; icon: ActionGlyphKind; kinds: string[] }[] = [
  { key: 'move', label: 'Move', icon: 'move', kinds: ['select', 'stand', 'move'] },
  { key: 'block', label: 'Block', icon: 'block', kinds: ['selectBlock', 'block'] },
  { key: 'blitz', label: 'Blitz', icon: 'blitz', kinds: ['blitz', 'blitzTarget'] },
  { key: 'foul', label: 'Foul', icon: 'foul', kinds: ['declareFoul', 'foul'] },
  { key: 'handOff', label: 'Hand Off', icon: 'handOff', kinds: ['declareHandOff', 'handOff'] },
  { key: 'pass', label: 'Pass', icon: 'pass', kinds: ['declarePass', 'pass', 'normalPassMode'] },
  { key: 'hailMaryPass', label: 'Hail Mary Pass', icon: 'hailMaryPass', kinds: ['declareHailMaryPass', 'hailMaryPassMode'] },
  { key: 'chainsaw', label: 'Chainsaw', icon: 'chainsaw', kinds: ['declareChainsaw', 'blockChainsaw', 'foulChainsaw'] },
  { key: 'stab', label: 'Stab', icon: 'stab', kinds: ['declareStab', 'blockStab'] },
  { key: 'vomit', label: 'Projectile Vomit', icon: 'vomit', kinds: ['declareProjectileVomit', 'blockProjectileVomit'] },
  { key: 'fire', label: 'Breathe Fire', icon: 'fire', kinds: ['declareBreatheFire', 'blockBreatheFire'] },
  { key: 'chomp', label: 'Chomp', icon: 'chomp', kinds: ['declareChomp', 'blockChomp'] },
  { key: 'gaze', label: 'Hypnotic Gaze', icon: 'gaze', kinds: ['declareGaze', 'gaze'] },
  { key: 'bomb', label: 'Throw Bomb', icon: 'bomb', kinds: ['declareBomb', 'bomb', 'normalBombMode'] },
  { key: 'hailMaryBomb', label: 'Hail Mary Bomb', icon: 'hailMaryBomb', kinds: ['declareHailMaryBomb', 'hailMaryBombMode'] },
  { key: 'throwMate', label: 'Throw Teammate', icon: 'throwMate', kinds: ['declareThrowTeamMate', 'liftTeamMate', 'throwTeamMate'] },
  { key: 'kickMate', label: 'Kick Teammate', icon: 'kickMate', kinds: ['declareKickTeamMate', 'kickMate', 'kickMateTo'] },
  { key: 'multipleBlock', label: 'Multiple Block', icon: 'multipleBlock', kinds: ['declareMultipleBlock', 'multiBlock'] },
  { key: 'secure', label: 'Secure the Ball', icon: 'secure', kinds: ['secureBall'] },
  { key: 'punt', label: 'Punt', icon: 'punt', kinds: ['declarePunt', 'punt', 'puntNow'] },
  { key: 'jump', label: 'Jump', icon: 'jump', kinds: ['jumpMode'] },
  { key: 'recover', label: 'Recover', icon: 'recover', kinds: ['declareRecover'] },
  { key: 'forgo', label: 'Forgo Activation', icon: 'forgo', kinds: ['forgo'] },
  { key: 'end', label: 'End Activation', icon: 'end', kinds: ['endAction'] },
];

export type PlayerMenuItem = { key: string; label: string; icon: ActionGlyphKind; spent: boolean; actions: SetupAction[]; kinds: string[] };

const nativeActions: Record<string, string[]> = {
  move: ['move', 'standUp'], block: ['block'], blitz: ['blitz', 'blitzMove', 'blitzSelect', 'standUpBlitz'],
  foul: ['foul', 'foulMove'], handOff: ['handOver', 'handOverMove'], pass: ['pass', 'passMove'], hailMaryPass: ['hailMaryPass'],
  chainsaw: ['chainsaw'], stab: ['stab'], vomit: ['projectileVomit'], fire: ['breatheFire'], chomp: ['chomp'],
  gaze: ['gaze', 'gazeMove', 'gazeSelect'], bomb: ['throwBomb'], hailMaryBomb: ['hailMaryBomb'],
  throwMate: ['throwTeamMate', 'throwTeamMateMove'], kickMate: ['kickTeamMate', 'kickTeamMateMove'],
  multipleBlock: ['multipleBlock'], secure: ['secureTheBall'], punt: ['punt', 'puntMove'],
  recover: ['removeConfusion'], forgo: ['forgo'],
};

export function activeMenuAction(view: SetupState, playerId: string): string | null {
  if (view.activePlayerId !== playerId || !view.activePlayerAction) return null;
  return Object.keys(nativeActions).find(key => nativeActions[key].includes(view.activePlayerAction!))
    ?? `declare${view.activePlayerAction[0].toUpperCase()}${view.activePlayerAction.slice(1)}`;
}

/** Display eligibility never grants permission to execute a command. */
export function playerActionMenu(view: SetupState, playerId: string): PlayerMenuItem[] {
  const player = view.players.find(player => player.id === playerId);
  if (!player || player.role !== view.callerRole || player.x === null || view.phase !== 'PLAY') return [];
  const actions = view.actions.filter(action => action.actor === view.callerRole && action.sourcePlayerId === playerId);
  const declarations = view.playerActionMenu?.filter(item => item.playerId === playerId) ?? [];
  const entries = definitions.flatMap(definition => {
    const offered = actions.filter(action => definition.kinds.includes(action.kind));
    const metadata = declarations.filter(item => definition.kinds.includes(item.kind));
    if (!offered.length && !metadata.length) return [];
    const mode = offered.filter(action => action.kind.endsWith('Mode'));
    return [{ ...definition, actions: mode.length ? mode : offered, spent: !mode.length && metadata.some(item => item.spent) }];
  });
  // Native star declarations share one reusable icon, but retain their names and commands.
  const knownKinds = new Set(definitions.flatMap(definition => definition.kinds));
  const extraKinds = new Set([...declarations.map(item => item.kind),
    ...actions.filter(action => action.kind.startsWith('declare')).map(action => action.kind)]);
  for (const kind of extraKinds) {
    if (knownKinds.has(kind)) continue;
    const offered = actions.filter(action => action.kind === kind);
    entries.push({ key: kind, label: offered[0]?.label ?? kind.replace(/^declare/, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
      icon: 'star', actions: offered, kinds: [kind], spent: declarations.some(item => item.kind === kind && item.spent) });
  }
  const endIndex = entries.findIndex(entry => entry.key === 'end');
  if (endIndex >= 0) entries.push(...entries.splice(endIndex, 1));
  return entries;
}

export function endTurnNeedsConfirmation(actions: SetupAction[]): boolean {
  return actions.some(action => !!action.sourcePlayerId && (['select', 'stand', 'selectBlock', 'blitz', 'forgo'].includes(action.kind)
    || action.kind.startsWith('declare')));
}

export function isEndTurnShortcut(event: Pick<KeyboardEvent, 'key' | 'repeat' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): boolean {
  return event.key === 'Backspace' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}
