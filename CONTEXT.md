# Moles Under the Pitch

This context covers teams that players create and select for matches, and the records of those matches.

## Language

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

**Match checkpoint**:
The durable state from which an unfinished match can resume at its last accepted decision.

**Match transcript**:
The ordered, durable record of accepted decisions, revealed outcomes, board checkpoints, and chat for one match.

**Match replay**:
A read-only view reconstructed from stored transcript records and board checkpoints after a match finishes.
