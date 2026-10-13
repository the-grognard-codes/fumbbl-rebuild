import type { DriveTrackerPresentation } from './setup-protocol.ts';

export type DrivePhaseRow = { id: string; label: string; past: boolean; current: boolean; event?: boolean };
const phases = [
  ['KICKING_SETUP', 'Kicking team setup.'],
  ['RECEIVING_SETUP', 'Receiving team setup.'],
  ['KICK_TARGET', 'Choose kick target.'],
  ['KICKOFF', 'Kick off event.'],
  ['RECEIVING_PLAY', 'Receiving player acts.'],
] as const;
const events = { HIGH_KICK: 'High Kick', SOLID_DEFENCE: 'Solid Defense', QUICK_SNAP: 'Quick Snap', CHARGE: 'Charge!' };

/** All progress comes from the accepted projection, including completed automatic checks. */
export function drivePhaseRows(tracker: DriveTrackerPresentation | undefined): DrivePhaseRow[] {
  if (!tracker) return [];
  const rows: DrivePhaseRow[] = [];
  if (tracker.secretWeapons) rows.push({ id: 'SECRET_WEAPONS', label: 'Send off secret weapons.', past: true, current: false });
  if (tracker.knockouts) rows.push({ id: 'KNOCKOUTS', label: "Wake up KO's", past: true, current: false });
  const current = phases.findIndex(([phase]) => phase === tracker.phase);
  for (const [index, [id, label]] of phases.entries()) {
    const eventActive = id === 'KICKOFF' && tracker.event !== null && !tracker.eventComplete;
    rows.push({ id, label, past: index < current || eventActive, current: index === current && !eventActive });
    if (id === 'KICKOFF' && tracker.event) rows.push({ id: tracker.event, label: events[tracker.event], event: true,
      past: tracker.eventComplete, current: !tracker.eventComplete });
  }
  return rows;
}
