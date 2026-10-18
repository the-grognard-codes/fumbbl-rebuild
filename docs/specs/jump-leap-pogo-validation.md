# Jump, Leap and Pogo acceptance evidence

Feature: [agreed requirements](jump-leap-pogo-planning.md), [issue #297](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/297).

## Behavior and review

- Explicit jump waypoints cost two movement squares. Walking pathfinding never silently inserts a jump.
- Native BB2025 legality, agility modifiers, skill decisions and Rush execution remain authoritative.
- Empty starting-square previews are read-only and BB2025-only. Older rulesets retain their existing native Jump control.
- Pending-route checkpoints preserve jump identity across rerolls and recovery. Existing walking routes and checkpoints remain readable.
- Standards review found no documented-rule violations. Spec review identified two issues, both fixed and rechecked: preserving other rulesets' controls, and cancelling Jump with Escape while its button has focus.
- The existing versioned `Jump` check enum identifies a jump step in route version 4; the explicit waypoint flag binds the coach's request to that step. This avoids adding a second conflicting step discriminator.

## Mechanics audit

Native regression tests cover ordinary obstacles, Leap, Pogo, Prehensile Tail, Diving Tackle, Tentacles, omission of Shadowing, multiple explicit jumps, failure/reroll continuation, and two Rush rolls on one jump. The audit found that the shared jump-modifier helper looked up Prehensile Tail using the active player instead of the supplied context player. This was reported before correcting it; existing active-player resolution stays equivalent.

The [official Third Season FAQ dated May 2026](https://assets.warhammer-community.com/eng_20-05_blood_bowl_faq_errata-gytvlserev-ngihd3chox.pdf) supports multiple jumps and jump modifiers below 1. The May 2025 FAQ belongs to the preceding rules edition and is not used as BB2025 authority. [NAF recommendations](https://www.thenaf.net/naf-recommendations-and-clarifications-for-bb2025/) are optional interpretations, not automatically adopted rules.

The full BB2025 rulebook was unavailable for independent verification of every skill's wording. Skill-interaction evidence here establishes consistency with the existing BB2025 engine; it does not claim a complete independent rulebook audit.

## Local validation

Run from the repository root unless a browser-client working directory is specified.

- Native focused regression: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 test -JavaHome .tools/jdk-21.0.11+10 -Module ffb-server -Test JumpPlanningTest,RoutePlannerTest,SetupSessionMovementTest,MovementWaypointRegressionTest` — 48 tests passed, zero skipped. The final `-Test JumpPlanningTest` rerun passed 9 tests after adding multiple-jump and exhausted-activation assertions (49 distinct native regressions in total).
- Browser unit tests, from `browser-client`: `npm.cmd test` — 314 passed, zero skipped.
- Production browser build, from `browser-client`: `npm.cmd run build:play` — type checking and bundling passed.
- Validation tooling: `node --experimental-strip-types --test tools/test/validation.test.mjs` — 15 passed, zero skipped.
- New browser journey, from `browser-client`: `node test/jump-planning-ui.mjs` — desktop and tablet touch checks cover adjacent controls, read-only planning, target/color/Rush guidance, curved route, automatic mode exit, Escape, right-click undo and explicit commit.
- Existing browser interaction checks include movement, passing, threat markings, menu placement, confirmation, playback, teammate and reroll behavior. Controlled mock servers now answer the new read-only starting-square request with a matching empty forecast; the action-menu test waits for React to render a changed role before asserting hidden controls.

Interaction commands: `node tools/validation/browser-suites.mjs --family interaction --shard 4` covered the first eight registered journeys. After correcting the action-menu render wait, `node test/player-action-menu-ui.mjs`, `node test/playback-ui.mjs`, `node test/teammate-ui.mjs`, `node test/manual-reroll-ui.mjs` and `node test/route-check-ui.mjs` passed from `browser-client`, completing all 13 journeys. `node test/smart-pitch-ui.mjs` and `node test/pass-ranges-ui.mjs` also passed separately. The final Jump journey was rerun after the final UI adjustment.

Generated visual evidence: `browser-client/test-output/jump/desktop-jump-mode.png` and `browser-client/test-output/jump/tablet-jump-mode.png`. These are local ignored test artifacts, recreated by the journey above.

Full Maven verification: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 verify -JavaHome .tools/jdk-21.0.11+10` — all eight reactor modules succeeded in 16m58s; 887 tests reported, 878 passed, zero failures/errors, nine existing environment-dependent skips. The final eligibility guard and expanded jump cases were verified by the focused native runs above after this full run began.

Skipped existing opt-in checks: `Marker6SchemaTest` (1), `V2PreparationJdbcTest` (1), `R5CompletedFixtureGeneratorTest` (1), `R5RestoredContinuationTest` (1), `RecoveryApplicationTest` (2), `RecoveryArtifactInspectionTest` (1), `V2RuntimeIntegrationTest` (2). Their required external database/runtime evidence was not configured for this local run.

## Integration with current main

PR #296 (player skill markers) and its archived design/artwork reached main during this implementation. Integration preserves both features; the only textual conflict was the change list, resolved by retaining both entries.

- Integrated browser unit suite: 329 passed; production `build:play` and the 15 tooling tests passed.
- Integrated native selector: `-Module ffb-statetest -Test JumpPlanningTest,RoutePlannerTest,SetupSessionMovementTest,MovementWaypointRegressionTest,SkillMarkerProjectionTest,RecipientProjectionTest,SetupSessionTest` with the same target-build command — 73 passed, zero skipped.
- Both `jump-planning-ui.mjs` and `skill-markers-ui.mjs` passed. The marker test's controlled snapshot publisher now uses the existing harness convention of `flushSync`, so replay/filter assertions inspect the requested render rather than the preceding frame. No marker product behavior changed.
- Independent read-only integration review found no actionable interaction regressions in pitch targeting, replay, marker overlays or checkpoint compatibility.

## Compatibility

Client and server should be released together for route version 4. An older server cannot consume newly committed jump checkpoints. There is no database schema migration; unconfirmed drafts remain local. No deployment is part of this change.
