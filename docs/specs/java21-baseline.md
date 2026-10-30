# Feature: Java 21 baseline throughout the repository

## Abstract
Remove older-Java requirements from current Java source builds, tooling and
supported runtimes without changing game mechanics or browser behavior.

## Objective
Use Java 21 as the minimum supported Java version. Pin and validate Temurin
21.0.11+10 for reproducibility; newer JDKs are not promised compatible until tested.

## Context / Existing Behavior
Shared modules target Java 8, the server and game service already target Java 21,
and bootstrap/CI still provision an older JDK. Legacy runtime documentation predates
current durable recovery. Decisions confirmed with the owner on 2026-10-30:
baseline and necessary compatibility fixes only; preserve historical references;
include retirement with recovery checks; allow compatible older third-party
bytecode; minimum 21 with pinned/tested 21. Optional source refactors are deferred
to [#383](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/383).

## In Scope
- Java 21 release compilation and minimum-JDK enforcement for project Java modules.
- A single current Java 21 bootstrap/build toolchain, CI and container build path.
- Current setup, runtime and agent documentation.
- Retire older-Java tooling/configurations while preserving compatibility rejection,
  persisted data and historical evidence. Verify recovery on Java 21 using isolated
  fixtures; document any remaining operational retirement prerequisite.

## Out of Scope
- Optional language modernization, unrelated library upgrades or rules changes.
- Removal of truthful historical references or compatible third-party bytecode.
- Stopping live services, deleting retained data, publishing, merging or deployment.

## Functional Requirements
- Bootstrap, build and CI need no older JDK. Current tooling rejects JDKs below 21.
- Project classes compile for Java 21; Mockito 5 is the single reactor default.
- Current Windows/Linux setup provisions only the supported JDK.
- Current runtime instructions describe Java 21 and fail-closed recovery behavior.
- Preserve game state, replay, protocol, ruleset and persisted-format contracts.

## Acceptance Criteria
- Clean reactor compilation, tests and packaging succeed with the pinned JDK.
- Browser unit tests and both browser builds succeed; game-service verification passes.
- Tooling checks cover bootstrap, incompatible-JDK rejection, environment restoration
  and build failure propagation. Project-produced classes have Java 21 class versions.
- Focused startup/protocol and replay/recovery tests pass; record exact checks and
  integration/environment limitations in the outcome report.
- No current toolchain or build path provisions an older JDK. Archived evidence stays
  readable and clearly distinct from supported instructions.

## Constraints
Work on `chore/java21-baseline`. Preserve unrelated changes and existing match data.
The initial implementation handoff excluded committing and pushing. After accepting
local review on 2026-10-30, the owner authorized staging all changes, committing,
opening a PR, waiting for validation CI, merging to main and removing the working
branch locally/remotely. Deployment remains separate. Keep browser use on supported
Android/Windows/Linux platforms.

## Implementation Guidance
Unify bootstrap and compatibility launchers around the target manifest. Keep source
changes limited to actual migration needs. Audit default-charset tools as a possible
compatibility seam; avoid changing file semantics without evidence.

## Validation
Run tooling integration checks and focused server runtime/recovery tests first.
Then run the full reactor verify, standalone game-service verify, browser unit tests,
browser diagnostic/product builds and affected script checks. Validate class versions
and packaged startup behavior. Use isolated synthetic recovery fixtures; no live game
mutation or process termination. Record tests that require an unavailable environment.

## Completion Notes
Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/384

Implemented, verified locally and accepted by the owner for CI-gated publication.
See the [outcome report](java21-baseline-outcome.md) for exact checks, opt-in skips,
fixture corrections and operational retirement limits. Historical source/evidence
and existing data remain preserved; no hosted cutover was performed.
