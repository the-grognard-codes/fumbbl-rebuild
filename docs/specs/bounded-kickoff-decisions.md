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
- `SetupSession` is shared: #553 adds its guard at `recordEvent`; #554 is expected
  to touch artifact accounting and admission. Keep these edits localized and
  coordinate any move of the event-recording boundary.
- Both branches may add a changelog entry. That is a small merge conflict.
- #554 can explicitly hand per-event snapshot/delta redesign to #548, as its issue
  permits. If it instead changes event representation itself, coordinate that
  slice with `DecisionLimit`, which reads period keys from recorded snapshots;
  preserve equivalent durable decision counting before removing those fields.
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

The server permits `2 * selected` placement commands: one redeployment and one
correction per participant (at most 12). This is an operational editing allowance,
not an additional BB2025 entitlement. Repeated edits and swaps spend it. At the
bound, only confirmation remains. An illegal final edit restores the selected
players' original valid formation; a direct native placement beyond the bound
ends the event. `completed` counts selected players currently displaced from
their original squares, including players displaced by a swap, rather than edit
commands. Legacy checkpoints with zero native placement count retain their old
zero completion projection until a new placement.

Quick Snap already permits one adjacent move per selected player and ends when
none remain active. Charge's native movement/activation limits remain authoritative;
Bogruk also ends an activation when its authoritative movement budget has
decreased, without requiring a remembered plan.

A separate emergency limit ends a turn or kick-off after 1,024 accepted action or
selection decisions. It counts recorded snapshots across selection/movement and
reacting coaches, and therefore survives recovery without a new storage format.
It resets on a new turn, drive or kick-off event. Forced exits use native kick-off
or end-selection cleanup and log `DECISION_LIMIT matchId=<public ID> limit=1024`.
The ordinary movement bounds are much smaller; this limit catches pathological
selection or command loops, including clients other than the computer coach.

## Out of Scope

Artifact sizing, quarantine, heap analysis and restart admission belong to #554.
Staged non-durable placements belong to #555/#556. Other computer playing-quality
changes and publishing are excluded.

## Constraints

Use BB2025 mechanics, native authoritative commands and existing recovery formats.
Keep private plans out of public transcripts. Preserve existing browser wire
shapes, platform support and unrelated changes. The user authorized committing,
pushing and opening a PR for review on 2026-11-15; merge and deployment remain
separate actions.

## Acceptance Criteria

- Confirm from the five-selected/no-memory capture within six decisions, moving
  each selected player at most once.
- Stop offering Solid Defence placements at the stated allowance; leave a legal
  confirmation path and retain the allowance across native checkpoint restore.
- Retain one move per selected Quick Snap player and bounded Charge activation.
- End pathological turn/event loops with a public-match-ID `DECISION_LIMIT` warning.
- Pass the affected policy, browser and server checks and record soak coverage.

## Rules review

The [BB2025 kick-off table transcription](https://bloodbowlbase.ru/bb2025/core_rules/the_game_of_blood_bowl/#kick-off-event-table)
describes Solid Defence as selecting up to D3+3 Open players to set up again under
the usual restrictions. It does not prescribe a count for intermediate UI edits.
Quick Snap gives each selected player one square; Charge uses bounded player
activations. The placement correction allowance above is an application safeguard.
The existing repository contract in [kick-off selection](bb2025-kickoff-selection.md)
continues to allow swaps and temporarily invalid formations before confirmation.

## Validation

- Node regression reproducing the captured five-selected/no-memory loop.
- Computer-player suite, including transport/reconnect behavior.
- Native server/policy tests for all three kick-off events and decision-limit exits.
- Native repeated-placement, illegal-formation and checkpoint-counter tests.
- Existing computer memory acceptance, exact-retry and recovery tests.
- Browser unit suite and production build; full `mvn clean install`.
- Isolated computer-versus-computer engine run; later three-hour soak rerun.

See [the outcome](bounded-kickoff-decisions-outcome.md) for results and remaining gaps.

## Completion Notes

The outcome records reproduction, self-review, checks and gaps. Publish the scoped
branch as a PR for review under the user's subsequent authorization. Keep the
remaining soak criterion visible and leave issue closure, merge and deployment
for a later decision.
