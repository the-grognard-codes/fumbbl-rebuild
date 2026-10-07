import type { SetupState } from './setup-protocol.ts';

export type CurrentGameStep = { title: string; instruction: string; progress?: string };
/** Broadcast only drive setup and kickoff instructions from the accepted public state. */
export function currentGameStep(view: SetupState): CurrentGameStep | null {
  if (view.phase === 'FULL_TIME' || view.saveResume?.status === 'SUSPENDED' || view.saveResume?.status === 'RESUME_PENDING'
    || view.prompt || view.actions.some(action => ['followUp', 'blockDie', 'reroll', 'skill', 'push', 'apothecary', 'interception', 'argueTheCall'].includes(action.kind)))
    return null;
  const kickoff = view.kickoff;
  const event = kickoff?.event ?? (view.turnMode === 'BLITZ' ? 'CHARGE' : view.turnMode);
  const allowance = kickoff ? 'up to ' + kickoff.allowed + ' open players' : 'open players';
  const progress = kickoff ? kickoff.event === 'QUICK_SNAP' && kickoff.stage === 'movement'
    ? kickoff.completed + ' moved · maximum ' + kickoff.allowed + ' · ' + Math.max(0, kickoff.allowed - kickoff.completed) + ' remaining'
    : kickoff.selected + ' selected · maximum ' + kickoff.allowed : undefined;
  const actor = event === 'TOUCHBACK'
    ? view.actions.find(action => action.kind === 'touchback')?.actor ?? (view.actor === 'home' ? 'away' : 'home')
    : kickoff?.actor ?? view.actor;
  const waiting = view.callerRole !== actor ? ' Waiting for the ' + actor + ' coach.' : '';
  if (event === 'QUICK_SNAP') return { title: 'Quick Snap!',
    instruction: 'Receiving team to select ' + allowance + ', each may move one square.' + waiting, progress };
  if (event === 'CHARGE') return { title: 'Charge!', instruction: (kickoff?.stage === 'movement' || view.turnMode === 'BLITZ'
    ? 'Selected players may perform a move action.'
    : 'Kicking team to select ' + allowance + ', each may perform a move action.')
    + ' Up to one player may perform a Blitz, Throw teammate, and/or Kick Teammate.' + waiting, progress };
  if (event === 'HIGH_KICK') return { title: 'High Kick!',
    instruction: 'Select one open player, that player may be redeployed to the ball’s square.' + waiting };
  if (event === 'SOLID_DEFENCE') return { title: 'Solid Defence!',
    instruction: (kickoff?.stage === 'movement' ? 'Redeploy the selected players, then confirm their setup.'
      : 'Kicking team to select ' + allowance + ' to redeploy, then confirm their setup.') + waiting, progress };
  if (event === 'TOUCHBACK') return { title: 'Touchback!', instruction: 'Receiving coach: assign the ball to an eligible player.' + waiting };
  if (view.phase === 'SETUP') return { title: 'Team setup', instruction: 'Set up the ' + view.actor + ' team, then confirm.' + waiting };
  if (view.phase === 'READY_FOR_KICKOFF' || view.actions.some(action => action.kind === 'kickoff'))
    return { title: 'Kickoff!', instruction: 'Kicking coach: select the kick location on the pitch, then confirm.' + waiting };
  return null;
}
