# Block and assist visibility outcome

Implemented the [approved design](block-assist-visibility.md) on
`feature/block-assist-visibility`, originally based on main
`926dc8ea9e1e245161f86b198d0bf0c5bd128c6b` and now rebased onto
`f10f348200bd45f4e813e701c5547f951bbcce55` (20 October 2026). The user approved
manual testing and authorized committing all changes, opening a PR, merging after
CI, and removing the working branches. GitHub tracks delivery status. Existing
mockups and unrelated working-tree content were preserved. Deployment is outside
this authorization.

## Delivered scope

| Slice | Result |
| --- | --- |
| [#318](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/318) | Native contributor identities and coordinates, private forecasts, shared committed contexts, transcript playback and durable recovery. |
| [#319](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/319) | Approved C2 SVG markers, pitch layering, glow chasers, reduced motion and target inspection. |
| [#320](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/320) | Native/browser regression coverage, refreshed projections, user-facing change-list entry, reviews and this report. |
| [#321](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/321) | User-approved native Multiple Block prompt adapter and regression tests, required to complete the agreed browser flow. |

The native adapter exposes existing server-offered commands, including targeted
rerolls and the opponent's uphill die selection. Assist eligibility continues to
come from the existing native algorithm. No game rules or sequence changes were
introduced. Desktop rendering and replacing special attacks remain outside scope.

## Acceptance evidence

| Requirement | Implemented behavior and evidence |
| --- | --- |
| Explicit proposal | Acting-coach-only selected target; no hover disclosure. Selection, cancellation and stale revisions covered by browser unit/UI checks. |
| Remote blitz | Forecast starts at the projected attack square; native contributor calculation uses projected occupancy. Native tests cover queued activation, interrupted movement and recovery. |
| Shared resolution | Both coaches and spectators receive committed attacker/target context, including uphill selection. Native ordinary/blitz/uphill fixtures drive the production browser UI tests. |
| Lifetime | Refresh before rolling, freeze each rolled target, remove on target movement, cancellation or completion. Retained dice cannot restore cleared markers. Native and browser regression assertions cover these transitions. |
| Repeated blocks | Frenzy gets a fresh context. Multiple Block retains both target arrows and shows only the inspected/current target's assists; mixed chooser handoff and independent target removal are covered. |
| Replay/recovery | Replay carries committed contexts only; seek/reconnect clears stale markers. Checkpoint restoration preserves frozen state and exact public projections. |
| Approved artwork | Compact ivory block arrow and impact burst; gold hollow circle and cyan hollow diamond origins reduced by 25%; shaft meets a diamond vertex. Flush joins, defensive terminal bar and empty origin interiors have geometry assertions. |
| Layers/animation | Assists render above tackle-zone threats and below player sprites/shadows; block target renders in front. Split origin chasers converge into the shaft; impact chasers converge and brighten. Static/reduced-motion, both cameras and 390px width were checked. |
| Existing UI style | Uses existing pitch rendering, themes and UI scaffolding; no typography or theme changes. A change-list feature entry documents the visible improvement. |

Production visual evidence is in
[the screenshot directory](../../.notes/art-preview/block-assists/production-regression/),
with [offensive](../../.notes/art-preview/block-assists/production-offense.jpg) and
[defensive](../../.notes/art-preview/block-assists/production-defense.jpg) close views.
The local production-component review route is
`http://127.0.0.1:5182/test/block-visibility.html` while its dev server is running.
The approved mockups remain beside these images.

## Review

The subsequent rebase and integration checks against optional skill-use
preferences are recorded in the [rebase review](../../.notes/block-assist-visibility/rebase-review.md).
The validation counts below describe the original implementation handoff.

Self-review and independent browser/native reviews found and fixed lifecycle,
privacy, Multiple Block handoff, grouped target-label and test-harness timing
issues. Recovery JSON ordering was normalized to preserve existing exact-view
assertions. See the [review record](../../.notes/block-assist-visibility/implementation-review.md).
No actionable review findings remain.

## Validation performed

Used the repository's Temurin JDK 21.0.11+10, Maven 3.9.9, `mockito5` profile,
local Maven settings/repository, and Node 26.12.0. Native runs required host
execution because sandboxed ClassGraph discovery could not resolve workspace
paths. That startup failure did not run scenarios; the identical selectors passed
with host execution.

| Check | Result / evidence |
| --- | --- |
| Full `tools/target-build.ps1 verify -JavaHome .tools/jdk-21.0.11+10` | 939 cases: common 175, server 484, client-logic 23, native state tests 257. Initially six assertion failures and nine opt-in skips. All six failures were subsequently corrected and their selectors passed; see below. [Initial log](../../.notes/block-assist-visibility/maven-verify.log). |
| Final focused native checks | **59 passed**, zero failures/errors/skips across the affected selectors listed below. Final server JAR/ZIP and state-test reactor packaging succeeded. [Feature/recovery log](../../.notes/block-assist-visibility/native-final-focused.log), [final fixture verify log](../../.notes/block-assist-visibility/native-fixtures-final.log). |
| Browser units: `node --experimental-strip-types --test test/*.test.ts` | **350 passed**, zero failures/skips. Includes native fixture decoding and marker geometry. [Log](../../.notes/block-assist-visibility/browser-unit.log). |
| Browser interaction scripts | **All nine passed:** `block-visibility-ui.mjs`, `playback-ui.mjs`, `reconnect-ui.mjs`, `follow-up-ui.mjs`, `push-choice-ui.mjs`, `reroll-choices-ui.mjs` (56 cases), `movement-flow-ui.mjs`, `dice-ui.mjs`, `push-artwork-ui.mjs`. Each ran using Node 26 and the repository Playwright harness; logs are in `.notes/block-assist-visibility/`. |
| Browser builds | `tsc --noEmit`, `vite build` (843 modules), and `vite build --config vite.play.config.ts` (133 modules) passed. Standard build retains the existing chunk-size advisory. [Standard log](../../.notes/block-assist-visibility/browser-build-default.log), [Play log](../../.notes/block-assist-visibility/browser-build.log). |
| Assets/inventory | Browser asset synchronization check passed for 430 assets; browser-suite manifest loaded successfully with the new suite registered. [Asset log](../../.notes/block-assist-visibility/assets-check.log). |
| Workspace hygiene | `git diff --check` passed; no staged changes. |

Final native selectors and counts:

- `BlockVisibilityTest` 8; `BlockHighlightJsonTest` 2;
  `SetupSessionMovementTest` 23; `MultipleBlockActionsTest` 2;
  `FollowUpActionsTest` 1.
- `RecoveryScenariosTest` 7.
- `CoreTurnActionsTest` 13; `DiceProjectionTest` 1;
  `PushbackArtworkTest` 1; `RerollChoicesTest` 1.

The focused Maven command used `-pl ffb-statetest -am`,
`-Dtest=<selectors above>`, `-Dsurefire.failIfNoSpecifiedTests=false`, and `verify`,
with the same pinned toolchain, settings and profile as the full run. The final
four fixture classes were rerun separately after their goldens were refreshed.

The six initial failures were five expected projection-golden differences and
one recovery JSON ordering difference. The five refreshed fixtures were audited
to limit differences to block metadata and private-preview visibility; players,
actions and dice were unchanged. Synthetic native test states now forward the
presentation observer just as live states do. A full clean verification was not
repeated after these corrections; the affected 59 tests were rerun instead.

## Remaining verification limits

Nine pre-existing opt-in checks were skipped by their normal environment gates:

- `Marker6SchemaTest.verifiesOptInMarkerSixMariaDbTargetReadOnly`.
- `V2PreparationJdbcTest.createsJoinsRetriesReleasesAndExpiresInvitationsOnIsolatedMarker6Target`.
- `R5CompletedFixtureGeneratorTest.createsCurrentCompletedFixtureWithoutChangingPausedFixture`.
- `R5RestoredContinuationTest.reconcilesRetainedRequestThenContinuesPausedDecisionForBothMembers`.
- `RecoveryApplicationTest.isolatedJdbcRetentionSerializesLastSlotAndPreservesExistingCheckpoint`
  and `isolatedJdbcLifecyclePressure`.
- `RecoveryArtifactInspectionTest.retainedArtifactHasNativeAndDecisionParityInAnotherJvm`.
- `V2RuntimeIntegrationTest.twoAccountsAndViewerShareNativeStateAndRecoverWithoutReexecuting`
  and `uncertainTerminalCommitPublishesOneFinalFrameAfterExactRetry`.

Non-opt-in recovery pressure tests did run, including 34 native lifetimes,
1,360 accepted actions and 34 restores. Visual checks used Windows Chrome and a
390px responsive viewport; physical mobile devices and other operating systems
were not exercised. Release data cleanup and compatibility with old saved games
were not part of this work. User visual approval is complete.

## Manual review and delivery preparation

After rebasing, the complete local startup browser validation passed (four
interaction shards and hosted journeys; 339.1 seconds). The review database
required the schema-8 migration already delivered by #322. It was backed up,
upgraded with the documented isolated bootstrap, and checked for unchanged
account/team/match/recovery record counts. Manual review then succeeded with one
healthy server/database/proxy/Hosting/computer-player stack and a passing live
proxy/auth-gate reconnect check. The stack was stopped at the user's delivery
request. The local database backup remains ignored under `.tools/backups/`.

## Environment retrospective

The workflow-required retrospective used the local `retro` and
`writing-for-agents` skills. Suggested follow-ups, in priority order:

1. Replace the stale Java 8/generic Maven instructions in repository steering
   with a pointer to the existing pinned target-build workflow. This session
   required JDK 21 and the configured Maven profile/settings.
2. Make local browser validation select or verify Node 26 before launch. The
   package already declares Node 26 and CI already validates builds; the host
   default was Node 24, so this is a local launch gap rather than missing CI.
3. Reuse the new native fixture observer helper and browser render-publication
   acknowledgement for future injected-state/interactive fixtures. Both prevent
   tests from bypassing production lifecycle timing.

These are recommendations only; no global instructions, credentials or
environment policy were changed.
