# BB2025-only refactor outcome

Branch: `refactor/bb2025-only`, based on `e356636ba0abb75b68d55fe704a6a256c12d4d02`.
Issues: [#421 engine](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/421), [#422 integration](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/422).

## Result

Published in [PR #425](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/425),
merged on 2026-11-03 at 05:45:10 UTC as `f26ee8300f885b9fc79f4b581f09a0ae4006da4a`.
The latest kickoff feature from main was integrated before validation. The original
working branch was removed locally and remotely after its merged contents were
verified identical. Dev-local is stopped; database volumes were retained.

Final combined-state checks at `e63714e64ad4026eb5b4470fcf6dcce3d681b4c7`:
- Source audit: 3,083 active text files; passed.
- Focused Java registration, kickoff, placement and recovery: 43 passed, zero skips.
- Browser unit suite: 466 passed; TypeScript passed.
- Full local browser gate: all 72 registered suites passed in 660.6 seconds,
  reports `.tools/validation/local-browser-q7Isgh`, log `.tools/bb2025-merge-browser-full.log`.
- All enabled PR CI checks passed, including all four Java shards and aggregate
  verification, baseline, static/build, service/lifecycle tests, secret scan and
  CodeQL. Full-browser CI was skipped by policy; the full suite passed locally.

The earlier handoff notes below describe the pre-publication state and remain as
historical validation evidence. The completed-features tracker now records the
actual merged feature.

Publication handoff (2026-11-03): the owner approved staging all changes, committing,
opening a PR, waiting for successful validation CI, merging into main, removing
the local and remote working branch, recording the completed feature, and stopping
dev-local. This supersedes the earlier uncommitted handoff boundary below.

Implementation and validation are complete. Dev-local is running and ready for manual review. Changes are uncommitted. No staging, commit, push, PR, merge or deployment was performed.

The engine now accepts BB2025 only. Removed 553 unsupported Java implementations, nine obsolete generic report types, 87 unused legacy fixtures, 24 unused rule options, retired protocol identifiers and 17 retired injury icons. Relocated 230 implementations that BB2025 still needs. Current injury artwork is unchanged.

The [removal manifest](manifest.md) links every inventory and retention decision. Historical records remain intact. Existing saves/replays/recovery compatibility was explicitly waived; no stored database data was deleted.

Removed obsolete edition hierarchy/filtering and constrained Pass Block routing. Kept useful domain registration boundaries and BB2025's On The Ball movement rule. An original 632-entry registration snapshot protects the retained implementations, with nine explicit obsolete-report exclusions and one required Kick Team-Mate report addition. New tests cover duplicate registrations, rejected ruleset input, Kick Team-Mate decoding and retained normal pathfinding.

## Review

### Standards

One finding: new test import order. Fixed. No outstanding standards findings in the reviewed changes.

### Spec

The initial review identified leftover constrained Pass Block helpers; removed and tested. Follow-up review identified a second obsolete step alias after the enum constructor was simplified; corrected. The final review approved those fixes and identified no outstanding findings.

Review totals: Standards — one finding fixed; Spec — two findings fixed. No outstanding findings on either axis.

The source audit is wired into CI and checks active tracked/untracked text while preserving declared historical records. The 783-entry engine manifest was checked: all original paths are absent and every retained destination exists.

## Validation

| Check | Result / evidence |
| --- | --- |
| `./tools/target-build.ps1 install` (pinned JDK 21/Maven, clean full reactor) | Passed: 968 discovered, 956 passed, 12 opt-in skips, zero failures/errors; `.tools/bb2025-reactor-final2.log` |
| Pinned Maven `-f game-service/pom.xml clean verify` | Passed, 29 tests; `.tools/bb2025-game-service.log` |
| `npm test --prefix browser-client` | Passed, 464 tests, zero skips; `.tools/bb2025-browser-unit-final.log` |
| Browser production build | Passed; final `local-dev` Hosting artifact assembled successfully by the launcher |
| `node --test tools/test/validation.test.mjs` | Passed, 15 tests; `.tools/bb2025-validation-tools.log` |
| `node tools/validation/bb2025-source.mjs` | Passed, 3,082 active text files; negative injected-reference probe also passed |
| Focused injury/asset checks | 17 focused browser unit tests, apothecary UI test, all 11 retained SVG symbols identical, asset sync check (430 assets), visual gallery inspected |
| Team schema fixture check | Passed: one valid and ten invalid cases |
| `node browser-client/test/pass-workflow-ui.mjs` | Passed in isolation after a concurrent-gate timeout; `.tools/bb2025-pass-workflow.log` |
| `node tools/dev-local.mjs --start` with `FFB_BROWSER_TEST_WORKERS=2` | Passed: all 72 registered suites (61 interaction + 11 hosted), Docker build, service startup and proxy live check; `.tools/bb2025-dev-local-verified.log` |
| Linux Docker runtime build | Passed: common 17/17 and server 656/661 (same five opt-in database skips); no failures/errors |
| Live local proxy check | Passed, one test reaching the real Java auth boundary on connection/reconnect |
| Built JAR package inspection (`System.IO.Compression.ZipFile`) | Passed: no obsolete edition/shared-rule package entries in `ffb-common-3.4.0.jar` or `ffb-server-3.4.0.jar` |
| `git diff --check` | Passed |

The reactor's server suite has five opt-in database skips, not failures: `BrowserSchemaMariaDbTest`, the MariaDB case in `Marker6SchemaTest`, `SkillUsePreferenceSchemaIntegrationTest`, `RecoveryJournalMariaDbTest`, and `V2PreparationJdbcTest`. Their dedicated test databases were not configured. Seven state-test cases also require opt-in inputs: `R5CompletedFixtureGeneratorTest`, `R5RestoredContinuationTest`, the two isolated JDBC cases in `RecoveryApplicationTest`, `RecoveryArtifactInspectionTest`, and both `V2RuntimeIntegrationTest` cases. These require isolated databases, restored historical fixtures, or an externally supplied recovery artifact. The new-build in-memory/native replay, recovery and live-play checks remain included in ordinary server/state tests; production database compatibility is not claimed.

Browser reports are keyed to the base HEAD because the user requested uncommitted work; they validate the working tree used by the launcher, not a published commit. The final report directory is `.tools/validation/local-browser-Zd1gS9`.

## Debugging and limits

- The editor Java auto-builder overwrote Maven output during package moves. Paused editor auto-build temporarily and rebuilt clean. The exact original local editor setting was restored after successful Java validation.
- A reactor launched during a shared API edit saw main/test signature mismatch. The final authoritative build starts after mutation handoffs.
- Compilation found the second step alias and an unqualified retired Safe Throw switch case. Both were fixed; Interception retains its existing agility-based display calculation.
- The browser gate timed out at pass confirmation with both four and two workers. A minimized repeated probe captured two synthetic clicks with exactly the same timestamp (2358.699999988079), leaving the command count unchanged. The guard deliberately requires increasing timestamps. Giving the browser test a 50 ms click interval passed all 16 repeated stationary-pass cases. Only this test timing changed; product behavior and confirmation assertions were preserved. Diagnostic instrumentation was removed. Evidence: `.tools/bb2025-pass-probe-repeat2.log` and `.tools/bb2025-pass-probe-fixed.log`.

A later four-worker attempt had one pitch fixture-load timeout in the missing-texture scenario. The identical pitch suite passed in isolation with no source changes (`.tools/bb2025-pitch-isolated.log`); the complete gate was rerun with two workers.

The hybrid-input test also asserted immediately after a synthetic wheel event, before React removed the touch Cancel control. Added a wait for detachment before the unchanged zero-count assertion. The focused doubleclick suite passed (`.tools/bb2025-confirmation-isolated.log`); no product input behavior changed.

No claim is made that prior-build saved artifacts remain readable. Historical documentation and archives deliberately retain prior-edition references.

## Manual validation

Dev-local is running at <http://localhost:5000/play> and the page returned HTTP 200. Both `ffb-match-review-server-1` and `ffb-match-review-database-1` are running and healthy. Firebase ADC passed; the live proxy check reached the real Java authentication gate on both connection and reconnect; the computer-player daemon is running. Services are intentionally left running for the owner.

Create a new match to validate movement, passing/handoff, blocking, injury decisions, replay and save/recovery in this build. Existing saved artifacts are outside the compatibility guarantee.

Process observations are recorded in the [retrospective](retro.md).
