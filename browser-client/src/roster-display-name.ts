/** Roster identifiers stay stable on the wire; their public labels start with a capital. */
export function rosterDisplayName(rosterId?: string): string {
  return rosterId ? rosterId.charAt(0).toUpperCase() + rosterId.slice(1) : 'Unknown roster';
}
