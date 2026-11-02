# Feature: Preview and confirm interception candidate selection

## Abstract
Allow coaches to inspect eligible interceptors before committing a choice.

## Objective
Allow coaches to inspect eligible interceptors before committing a choice.

## Context / Existing Behavior
See local design mirror .notes/legacy-decision-prompts/design.md and Browser V2 match-decision.ts. Owner completed design review on 2026-11-02.

## In Scope
Rectangular candidate list with reroll-source-like visual styling. Clicking name selects locally and draws line/dot; allow changing candidates until Confirm. Explicit Decline. No new server choice semantics; submit only server-offered candidate on confirmation.

## Out of Scope
Unrelated gameplay, UI and rules changes; commits, pushes, PRs and deployment.

## Functional Requirements
Rectangular candidate list with reroll-source-like visual styling. Clicking name selects locally and draws line/dot; allow changing candidates until Confirm. Explicit Decline. No new server choice semantics; submit only server-offered candidate on confirmation.

## Acceptance Criteria
Confirm requires an eligible selection; switching never submits. Pending prompt permits pan/zoom/inspection. Stale/recovered candidates are handled safely; no duplicate submission. Both layouts mocked before owner selection.

## Constraints
Use existing checkout branch feature/legacy-decision-prompts; preserve unrelated changes and MUTP theme. Support Android, Windows and Linux browser environments. No commit/push without explicit authorization.

## Implementation Guidance
Blocked by mockup approval and shared rectangular prompt implementation.

## Validation
Focused selection/confirm/decline, stale state and recovery tests; live-play/replay browser checks, required unit/browser/game-server builds.

## Completion Notes
Owner requires a pause once mockups are available. Record exact checks, review findings and remaining gaps. Investigate failed checks rather than claiming completion.


## Tracking
Blocked by: #414 (owner visual approval), #416 (shared prompt infrastructure). Mockups demonstrate candidate preview and explicit confirmation; production work remains deferred.
