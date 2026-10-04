# Moles Under the Pitch

This context covers teams that players create and select for matches, the pitch on which matches are presented, and the records of those matches.

## Language

**MUTP**:
The shorthand for Moles Under the Pitch, the project and its public site.

**Team catalog**:
The versioned set of roster choices and constraints available for creating a team and entering a match.

**Team draft**:
An unfinished selection of players and resources that has not yet been accepted as a saved team.

**Saved team**:
A validated team owned by one account and available for that account to select when creating or joining a match.
_Avoid_: Exported team, local roster

**Match team**:
A frozen copy of a saved team selected for one match, including its team and player names. Changes to the saved team do not change this copy.

**Jersey number**:
The number displayed for a player within a team, unique among that team's players.

**Pitch**:
The 26-by-15 playing surface, including both end zones and the wide and central zones. Its squares have the same identities from either coach's viewpoint.
_Avoid_: Game board (when naming the playing surface)

**Coach view**:
A coach's view of the pitch from their own end toward the opposing half. Opposing coaches see the same match from opposite ends.

**Top-down view**:
A view of the pitch directly from above, used to inspect crowded positions while retaining the same square and player identities.

**Match checkpoint**:
The durable state from which an unfinished match can resume at its last accepted decision.

**Match transcript**:
The ordered, durable record of accepted decisions, revealed outcomes, board checkpoints, and chat for one match.

**Match replay**:
A read-only view reconstructed from stored transcript records and board checkpoints after a match finishes.
