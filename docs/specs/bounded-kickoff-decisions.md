# Bound kick-off decisions

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/553
Companion: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/554
Base: `33d95b7c6`; branch: `codex/553-bounded-kickoff`.

## Abstract

Stop computer kick-off loops and bound accepted decisions before they can produce
unlimited history. The server enforces the limits for every coach.

## Objective

Finish Solid Defence, Quick Snap and Charge within explicit decision bounds,
including after reconnect or recovery with no carried computer plan.

## Context / Existing Behavior

The soak observed roughly 1,000 Solid Defence placements without confirmation.
The policy's stopping condition depended on a previous plan, and the native step
neither counted nor capped Solid Defence edits.

## Parallel implementation boundary

The soak exposed a causal chain, not an implementation dependency: repeated
placements generated excessive history, and oversized history exhausted the heap.
Fixing either defect is useful without the other.

- #553 owns computer kick-off choices, `KickoffActions`, `KickoffPresentation`,
  `StepApplyKickoffResult`, and the accepted-decision guard.
- #554 owns decoded storage budgets, append admission, recovery loading,
  activation/quarantine and restart handling. It should avoid changing kick-off
  mechanics or computer policy.
- `SetupSession` is shared: #553 runs its guard in command acceptance before `recordEvent`; #554 is expected
  to touch artifact accounting and admission. Keep these edits localized and
  coordinate any move of the event-recording boundary.
- Both branches may add a changelog entry. That is a small merge conflict.
- #554 can explicitly hand per-event snapshot/delta redesign to #548, as its issue
  permits. If it instead changes event representation itself, coordinate that
  slice with `DecisionLimit`, which reads period keys from recorded snapshots;
  preserve equivalent durable decision counting before removing those fields. The
  session incrementally processes appended events and rebuilds its count once
  after restore, without adding another stored format.
- #555/#556's staged placements are a separate coordination concern: a placement
  that no longer records an event must still count toward the decision guard.
  Do not remove the native placement cap when staging is introduced.

No significant #553/#554 dependency prevents separate threads, worktrees and
branches. This branch leaves #554's budgets and stored envelopes alone.

## In Scope / Functional Requirements

Solid Defence keeps the existing D3+3 Open-player selection and final setup
restrictions. Its policy moves only from an odd row to the adjacent higher even
row, into an empty square in the same setup zone and column. Each offered player
can qualify once; the policy then confirms within `selected + 1` movement-stage
decisions, even if every response has null policy memory.

Each kick-off-event stage permits at most **50 adjustments**, for human and
computer coaches alike. The one named constant is
`KickoffAdjustmentBudget.KICKOFF_ADJUSTMENT_LIMIT`. This is the maintainer's
technical safety net from [ADR 0008 as amended in #560](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/560),
not a BB2025 rule. Every accepted selection toggle in Solid Defence, Quick Snap
or Charge spends one adjustment. Every accepted Solid Defence placement or swap,
Quick Snap movement or High Kick movement spends one adjustment in its movement
stage. A swap counts once. Reserve moves in the legacy placement path also count.
Selection confirmation starts a fresh movement-stage allowance; Charge movement
continues to use its ordinary native rules, not this editing allowance.

The counter lives on the native kick-off step until #556 moves it into the staging
layer. Its optional `kickoffAdjustments` native field survives checkpoint restore;
older checkpoints without it start with zero adjustments. Offers and accepted selection toggles resolve the same current-or-stacked
`KickoffAdjustmentBudget` through `KickoffBudgetLookup`. The interface contains
only ruleset-neutral operations, including `completedParticipants()`. The BB2025
step implements event-specific progress: displaced selected players for Solid
Defence, the native moved-player count for Quick Snap, and completed High Kick
movement. Typed selected-participant, allowance and redeployment-mode accessors
also come from the resolved step, including underneath an interruption; projections
never serialize the native step to read them. The main view's action list, actor
and period projection reuse the same resolved budget.

Adjustment 50 is accepted. At the ceiling, only confirm, decline or end remains;
adjustment 51 is rejected with `INVALID_OPTION`, with no new state, event, request
history or revision. It never ends the stage. If the final Solid Defence edit
leaves illegal positions, the board reverts to the stage's valid base positions
and confirmation remains possible. `completed` counts selected players currently
displaced from those positions, including players displaced by a swap, rather
than editing commands. Historical zero-count progress stays compatible until a
new placement.

Solid Defence offers placements only for the native step's selected players,
including when a restored checkpoint retains active flags on unselected players.
Swaps target selected players only. Every offered placement changes positions;
stale requests for unselected movers or swap targets are not offered and fail
normal action validation.

Quick Snap already permits one adjacent move per selected player and ends when
none remain active. Charge's native movement/activation limits remain authoritative;
Bogruk also ends an activation when its authoritative movement budget has
decreased, without requiring a remembered plan.

A separate emergency limit fires **on accepted decision 1,024**, before its result
is recorded; decision 1,023 does not fire it. It ends the native turn or kick-off. It counts recorded snapshots across selection/movement and
reacting coaches, and therefore survives recovery without a new storage format.
It resets on a new turn, drive or kick-off event; a transition action belongs to
the period it ended, rather than spending the new period's allowance. The guard
runs in command acceptance before `recordEvent`, which only records state and
outcomes. Forced exits use native kick-off
or end-selection cleanup and log `DECISION_LIMIT matchId=<public ID> limit=1024`.
The ordinary movement bounds are much smaller; this limit catches pathological
selection or command loops, including clients other than the computer coach.

The guard and recorded public views use the same `periodView()` projection for
phase, half, drive, turn numbers and kick-off progress (including the Charge
fallback). `recordEvent` updates the session-owned `DecisionLimit` as it appends
each snapshot. Recovery explicitly rebuilds this derived counter once after
installing the durable history; no cache infers changes from array identity or
size. All period-entering actions, including an initial ACTION entry, are excluded
from the new period's allowance; there is no first-index exception.
Repeated queries and exact retries do not spend decisions. Decision 1,024 remains
the emergency boundary. The separate reroll-choice loop is tracked in
[#561](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/561); keep #553
open until the remaining seeded-match and soak criteria are met.

## Out of Scope

Artifact sizing, quarantine, heap analysis and restart admission belong to #554.
Staged non-durable placements belong to #555/#556. Other computer playing-quality
changes, merges, deployment and soak execution are excluded by the resume handoff.

## Constraints

Use BB2025 mechanics, native authoritative commands and existing recovery formats.
Keep private plans out of public transcripts. Preserve existing browser wire
shapes, platform support and unrelated changes. The user authorized committing,
pushing and opening a PR for review on 2026-11-15; merge and deployment remain
separate actions.

## Acceptance Criteria

- Confirm from the five-selected/no-memory capture within six decisions, moving
  each selected player at most once.
- Accept adjustment 50 and reject 51 without mutation for five selected Solid
  Defence players. Stop selection toggles at 50, reset at movement, preserve the
  ceiling across native restore, and keep confirm/decline/end available.
- Retain one move per selected Quick Snap player and bounded Charge activation.
- End pathological turn/event loops with a public-match-ID `DECISION_LIMIT` warning.
- Pass the affected policy, browser and server checks and record soak coverage.

## Rules review

The [BB2025 kick-off table transcription](https://bloodbowlbase.ru/bb2025/core_rules/the_game_of_blood_bowl/#kick-off-event-table)
describes Solid Defence as selecting up to D3+3 Open players to set up again under
the usual restrictions. It does not prescribe a count for intermediate UI edits.
Quick Snap gives each selected player one square; Charge uses bounded player
activations. The flat 50-adjustment allowance is the maintainer's application
safety net, not a limit derived from these rules.
The existing repository contract in [kick-off selection](bb2025-kickoff-selection.md)
continues to allow swaps and temporarily invalid formations before confirmation.

## Validation

- Node regression reproducing the captured five-selected/no-memory loop.
- Computer-player suite, including transport/reconnect behavior.
- Native server/policy tests for all three kick-off events and decision-limit exits.
- Native repeated-placement, illegal-formation and checkpoint-counter tests.
- Existing computer memory acceptance, exact-retry and recovery tests.
- Full `mvn clean install`, once on resume (one retry only after a fix).
- Browser suite/build only if client code changes; none changed on resume.
- Seeded engine runs reporting maximum accepted decisions in each turn and
  kick-off event, including any emergency guard activations. Soak execution is
  outside the resume authorization.

See [the outcome](bounded-kickoff-decisions-outcome.md) for results and remaining gaps.

## Completion Notes

The outcome records reproduction, self-review, checks and gaps. Publish the scoped
branch as a PR for review under the user's subsequent authorization. Keep the
remaining soak criterion visible and leave issue closure, merge and deployment
for a later decision.
