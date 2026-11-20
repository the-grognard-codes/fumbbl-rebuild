# ADR request: staged placements are presentation-only until confirmed

Status: ADR accepted on 2026-11-15; implementation pending in #556.
Source: [issue #555](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/555) and the maintainer's decisions in conversation with the reviewer on 2026-11-15 (recorded below).
Reviewed: 2026-11-15 against `main` at `33d95b7c6`.
Template: [ADR request and decision template](../agents/adr-template.md).
Draft: [ADR 0008](../adr/0008-staged-placements.md).
Implementation: [issue #556](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/556).

## Maintainer acceptance

On 2026-11-15 the maintainer reviewed draft PR [#557](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/557) in conversation with the reviewer, and accepted ADR 0008 as drafted: "Draft looks perfect, accepted." All three open decisions were resolved beforehand (below). With acceptance, the glossary and architecture-map invariant drafts were applied, and #556 was unblocked.

## Amendment 2026-11-15: adjustment limit

The review of PR [#558](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/558) (#553) found two problems:
- **Not a rule.** Its cap of `2 × selected` placement edits was not a BB2025 rule, and could stop a human coach mid-arrangement.
- **Conflict with ADR 0008.** At the cap, the PR ended the event, which conflicted with ADR 0008's "rejected with `INVALID_OPTION`".

The maintainer decided:
- **Limit:** "Make the limit of adjustments 50". It is a flat technical safety net per kick-off-event stage, not a rules limit.
- **At the limit** ("I agree with the fallback process"):
  - adjustments are no longer offered
  - an adjustment sent anyway is rejected with `INVALID_OPTION` and never ends the stage
  - if the positions are illegal at the limit, the board reverts to the stage's base positions, and confirm is offered

ADR 0008's Limits section was amended accordingly.

## Objective

Decide that placement-style actions are **staged**:
- they are applied to the in-memory board and broadcast live to opponents and spectators
- they are never checkpointed, snapshotted or transcribed

Only the confirming action is durable. Narrow the "one durable boundary per action" invariant to match.

## Context and evidence

- **Every accepted command takes the durable path today.** Each accepted native command increments `revision`, appends a full-state `eventsJson` entry (about 16–20 KB), appends a transcript record, and writes a recovery checkpoint inside the 2,000 ms request budget ([ADR 0006](../adr/0006-single-engine-worker.md)). Placements are no exception.
- **Soak cost (2026-11-15):** a looping computer coach (#553) made about 1,000 Solid Defence placements. That produced a 46.8 MB decoded match, which exhausted the 768 MiB heap and left the server in a restart loop (#554; [soak review](gameplay-soak-review.md) findings 8–9).
- **Confirms already carry the final result.**
  - Solid Defence confirm: `ClientCommandEndTurn(TurnMode.SOLID_DEFENCE, coordinates(...))`
  - Setup confirm: `checkSetup`
  - Kick-off selection confirm: `ClientCommandPlayerChoice` with the chosen players
- **Placements carry no rules meaning:** they roll no dice, reveal no hidden information, and offer the opponent no decision.
- **Clock:** the match clock (`TURN_ALLOWANCE_MS` 120 s, `RESERVE_ALLOWANCE_MS` 600 s in `SetupSession`) is accounting only today. Nothing happens when it runs out.
- **Default setup:** `deployDefaultSetup` deploys the coach's first saved formation for the role when a setup step begins, or a hard-coded fallback. That deployment is part of the triggering durable mutation.
- **Default templates:** `TeamFormations.defaults` provides 5-4-2 and 7-2-2 Offense, and Chevron and Anchor Defense, only for rosters of at least 11.

## Maintainer decisions (2026-11-15)

| Topic | Decision |
| --- | --- |
| Staged set | Manual setup placements (including swaps and moves to reserves), Solid Defence placements, Quick Snap moves, the High Kick placement. "I believe that is all of them we need to reclassify." Charge is excluded. |
| Live delivery | Staged updates are **best effort**. No onerous retry or checking logic. |
| Durability | The confirm is the only durable action. A restore behaves as if the staged placements never happened and starts fresh. |
| Disconnect | Applies no durable decision. |
| Clock expiry | Must apply a decision. Apply the latest in-memory positions if legal. Otherwise revert to the coach's first stored formation for the role. If none exists, use a fallback template: Chevron Defense or 5-4-2 Offense. (The maintainer first wrote "7-4-2 offense" and corrected it to 5-4-2.) The templates must also handle teams with fewer than 11 available players. If every fallback fails, move players until three are on the Line of Scrimmage, then confirm. Rule: "Should a team only be able to field three or fewer players, then they must be deployed in the Centre Field directly adjacent to the Line of Scrimmage." There is no forced concession. |
| Clock scope | Clock enforcement is out of scope for this ADR. Conceptually, the clock becomes a toggle that can be enforced later. This ADR defines only what expiry does to a staged stage when enforcement is on. |
| Request idempotence | Staged request IDs are deduplicated in memory only. |
| Replay | Replays capture only the final confirmed state. Interim placements are not preserved. |
| Compatibility | Still in build: all old matches will be cleared, and no backwards compatibility is expected. |

## Scope and deliverables

- The [proposed ADR 0008](../adr/0008-staged-placements.md), including the action classification (derived from code), the classification rule for future actions, and drafts of the glossary and invariant changes.
- **Excluded:**
  - implementation (#556)
  - the computer-coach loop fix (#553)
  - storage limits (#554)
  - per-event snapshots for non-staged actions (#548)

## Required decision content

Covered in ADR 0008:
- **What is staged:** the staged set and the rule for classifying future actions.
- **Live delivery:** the message shape, ordering, and the best-effort reconnect behaviour.
- **Durability:** what a confirm records and what a restore does.
- **Disconnect and expiry:** the disconnect rule, the clock-expiry sequence, and the fallback.
- **Retries:** request idempotence.
- **Replay:** what a replay shows.
- **Limits and budget:** rules bounds and the worker budget.
- **Format:** retiring the old format.

## Open decisions

1. **Offense fallback template:** resolved 2026-11-15 as 5-4-2 Offense.
2. **Enforcing the clock:** resolved 2026-11-15. Out of scope; the clock becomes an enforceable toggle later, and the ADR covers only staged-stage expiry under that toggle.
3. **Too few players:** resolved 2026-11-15. No forced concession. A team with three or fewer players deploys all of them in the Centre Field adjacent to the Line of Scrimmage. As a last resort, players are moved until three are on the Line of Scrimmage, then confirmed.

No open decisions remain. The draft is ready for maintainer review.

## Acceptance criteria

### Draft ready for maintainer review
- ADR 0008 is drafted as `proposed`, with code-cited classification and every decision above.
- The amendments to ADRs 0002 and 0004 and the retirement of the old format are explicit.
- The `CONTEXT.md` and architecture-map drafts are included.

### Accepted
- The maintainer's approval is recorded with a date.
- The glossary and architecture-map invariants are updated.
- #556 is unblocked.

## Validation and handoff

- **Documentation only:** check the links and that each cited symbol exists at the reviewed revision.
- **Branch and PR:** branch `claude/555-staged-placements-adr`. Any PR says `Part of #555`, and the ADR is not marked accepted without maintainer approval.
