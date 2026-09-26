# Team builder contract

Status: accepted by the owner on 2026-09-24. Records the Candidate 03 architecture review discussion. This is a design contract, not an implementation status report.

The [implementation slices](specs/team-builder/README.md) turn this contract into bounded deliverables.

## Product flow

1. A player signs in before using `/teambuilder`. The builder loads the selected Human or Orc roster from the versioned BB2025 exhibition catalog. Both use the 1,150,000-gold preset. The page offers only content that the server can accept for a match.
2. The player composes a team draft. Browser calculations may provide immediate guidance, but the server evaluates the draft against its catalog. Editing a validated draft clears that validation result. Only a server-validated team can be saved.
3. Saving creates or updates an account-owned saved team. The server assigns its ID and owner from the authenticated account, recomputes legality, and records a document version. An incomplete or invalid draft never appears as a selectable saved team.
4. Play lists the signed-in account's saved teams by name, roster and eligibility. Another account cannot load, edit, delete or select them. The owner can select the same saved team for multiple exhibition matches.
5. On both match creation and join, the server checks the caller's ownership, expected saved-team version, current catalog compatibility and legality again. It then freezes an independent match team. Later saved-team edits or deletion do not change an existing match.

## Team data and visibility

- A team draft contains the selected ruleset, catalog and preset versions; team name; player IDs, roster slots, unique jersey numbers from 1 to 99, player names, positions and purchased skills; captain choice; and resources. Slots from 1 to 16 represent roster order and are distinct from jersey numbers.
- The server owns costs, eligibility, base skills, calculated totals, acceptance and account ownership. Client-supplied totals or owner fields cannot authorize a save or match.
- The saved team has a stable ID and an optimistic document version. An owner may edit it; a stale update is rejected without replacing the stored version. The owner may delete it after confirmation. Deletion removes it from future selection while existing match teams remain frozen.
- The match team includes the chosen team and player names, jersey numbers and resolved roster facts. Opponents and permitted spectators may see these match facts. Account identifiers, login provider details and ownership metadata are not public match labels.
- Saved teams using a retired catalog remain visible to their owner but cannot enter a new match until an explicit migration and server revalidation. Existing matches retain their frozen catalog and team facts.

## Module seams

- The Java catalog and validation module is the sole authority for BB2025 team legality. Draft evaluation, save, and create/join are separate checks through the same rules implementation.
- The browser builder module owns draft interaction, display, provisional feedback and communication with the server. It does not carry an independent BB2025 rules table. `/teambuilder` uses the existing React browser application rather than the standalone script's local rules and storage.
- Account ownership uses the server's internal account ID. Distinct login identities are linked only through an explicit account-linking process; matching email addresses do not merge teams.
- The old browser draft and JSON export format require no compatibility path. Account save/load is the first product contract; JSON import/export is deferred. Freeform rosters, progression and additional rosters become match-ready only after the server supports and versions them.

## Contract checks for implementation

- A signed-in player can build, validate, save, reload and select a Human or Orc team by its name. The Play list shows only that account's teams and does not enable retired catalogs.
- An invalid draft cannot be saved. A changed or stale saved team cannot be frozen from an old validation result; create and join each revalidate independently.
- A different account cannot load, modify, delete or select the team, including by guessing its ID. Separate login identities are not merged by email.
- An existing match keeps its named roster and resolved catalog after the source team is edited, deleted or made unavailable for new matches. Opponent and spectator views show approved match names and roster facts without account details.
