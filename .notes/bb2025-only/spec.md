# Refactor: BB2025-only rules engine

Tracked slices: [#421 engine](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/421) and [#422 integration](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/422). Slice 422 depends on 421 for final validation.

## Abstract
MUTP supports BB2025 only. Remove code that exists solely for earlier editions, keeping current BB2025 gameplay unchanged.

## Objective
Produce an auditable removal manifest, prune unsupported implementations and edition dispatch, and verify the surviving BB2025 product from new match creation through replay and recovery.

## Context / Existing Behavior
The browser product selects BB2025, but the Java engine still contains older-edition implementations, reflection annotations, defaults, resources and tooling. Some shared implementations are required by BB2025 and must be retained or moved rather than deleted.

## In Scope
- All tracked active source, build scripts, diagnostics, tools, tests, fixtures, canonical assets and maintained documentation.
- Delete earlier-edition implementations and obsolete selection/compatibility machinery; simplify abstractions that exist only for those editions.
- Preserve needed BB2025 implementations and domain boundaries, reorganizing shared packages where appropriate.
- Inventory source paths, decisions, dependencies and validation evidence.

## Out of Scope
- Changes to BB2025 rules, gameplay, or visible presentation.
- Rewriting historical changelogs, outcome/design records, archives or Git history.
- Compatibility with existing saves, replays or recovery artifacts from any prior build. The owner explicitly waived this during development; this does not authorize deleting stored data.
- Speculative support for a future edition, unrelated cleanup, deployment or publication.

## Functional Requirements
- Inventory all earlier-edition-specific code and references before removal.
- Remove unsupported runtime implementations, identifiers, defaults, dispatch and active supporting resources.
- Retain code required for BB2025, preserving its game behavior and stable domain concepts.
- Reject unsupported ruleset input rather than silently interpreting it as BB2025.
- Keep new BB2025 games, replay and recovery working together in the resulting build.

## Acceptance Criteria
- No earlier-edition implementation or reference remains in active product source, tools, fixtures or maintained documentation; the audit manifest and preserved historical records explicitly record their historical purpose.
- A manifest explains removals and retained/moved dependencies.
- Relevant regression tests protect BB2025 registration and behavior; full required checks pass or concrete unresolved blockers are documented.
- Dev-local starts successfully and remains available for manual validation.

## Constraints
- Work on `refactor/bb2025-only`, based on `e356636ba0abb75b68d55fe704a6a256c12d4d02`.
- Preserve unrelated working-tree changes; the tree was clean at branch creation.
- Follow existing repository conventions. Preserve themes and UI behavior.
- Do not stage, commit, push, open a PR, merge or deploy without separate authorization.

## Implementation Guidance
Use two dependent slices: engine inventory/pruning and integration guardrails/surface cleanup. Establish the BB2025 registry and test baseline before deleting ruleset code. Review reflective registration, default options, serializers and generated fixtures explicitly; filenames alone do not establish that code is unused.

## Validation
- Focused Java registration, catalog and game-flow checks before the full pinned Java reactor and game-service builds/tests.
- Browser unit/build and complete local browser validation, including live play, replay and recovery journeys.
- Repository scan with explicit historical exemptions and a check preventing unsupported runtime registrations.
- Independent standards/spec review, then standard dev-local startup and readiness checks.

## Completion Notes
Record exact checks, debugging outcomes and remaining limits in `outcome.md`. Leave the implementation uncommitted and the dev-local instance ready for the owner.
