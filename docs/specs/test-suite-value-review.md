# Test suite value review

Reviewer: Claude, 2026-11-18. Scope: `ffb-statetest`, the largest
`ffb-server` scenario tests, and a size/shape pass over `browser-client/test`.
Not run: coverage, mutation testing, per-test timing. Findings are from reading
source and the CI wiring in `.github/workflows/maven-verify.yml` and
`tools/validation/native-shard.ps1`.

## Summary

The suite is healthy overall. No test is disabled (CI rejects `@Disabled`),
none references a retired ruleset, and test names describe behaviour rather
than implementation. There is no large block of dead tests to delete. The value
problems are narrower: some tests never run anywhere automated, some test code
is not a test, and a test seam for `SetupSession` is missing, so 52 test files
reach into its private fields by reflection.

## Tracking

| Finding | Issue |
| --- | --- |
| 1. MariaDB tests never run in CI | [#578](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/578) |
| 2. Tools disguised as tests | [#577](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/577) |
| 3. Reflection into `SetupSession` | Scope added to [#544](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/544#issuecomment-6986866886) |
| 4 and 5. Logging pins, `SetupSessionMovementTest` split | [#579](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/579) |

## Findings (most severe first)

### 1. Sixteen `ffb-server` MariaDB tests never run in CI (hard gap)

Files: for example
`ffb-server/src/test/java/com/fumbbl/ffb/server/match/RecoveryJournalMariaDbTest.java:31`,
`V2PreparationJdbcTest.java:35`, `JdbcAuthorizationMariaDbTest.java:34`,
`JdbcPublicationMariaDbTest.java:81`, `OperatingEnvelopeTest.java:74`,
`server/local/Marker6SchemaTest.java:88`,
`server/local/SkillUsePreferenceSchemaIntegrationTest.java:42`, and the other
`*MariaDbTest` classes.

Each one starts with `Assumptions.assumeTrue(url != null && password != null, ...)`.
No workflow sets these variables or starts a database, so every run reports
them as skipped and passes. Unlike `ffb-statetest`, `ffb-server` has no skip
allow-list (`tools/validation/native-shards.json` covers only native classes),
so nothing notices that these tests skip, or when a new one starts skipping.

Failure scenario: a schema or JDBC change breaks recovery-journal persistence
(ADR 0004) or the bounded-transcript admission (ADR 0002). Every H2/unit test
passes, CI is green, and the only tests that would catch it are skipped.

Suggested fix: split by purpose.
- Contract tests for stored formats and persistence (`RecoveryJournalMariaDbTest`,
  `V2PreparationJdbcTest`, `JdbcPublicationMariaDbTest`,
  `JdbcAuthorizationMariaDbTest`, `Marker6SchemaTest`,
  `SkillUsePreferenceSchemaIntegrationTest`, `JdbcLobbyReadMariaDbTest`,
  `BrowserSchemaMariaDbTest`): add a CI job with a `mariadb` service container
  that sets the variables, and give `ffb-server` the same skip allow-list check
  `native-shard.ps1` already enforces for `ffb-statetest`.
- Measurement and acceptance runs that need real DEV Firebase tokens or a sized
  environment (`FirebaseJdbcBudgetMariaDbTest`, `JdbcHealthyWorkerMariaDbTest`,
  `OperatingEnvelopeTest`, `HistoryScalingWorkloadTest`, the `JdbcBounds`/`JdbcPool`/
  `JdbcProbe`/`JdbcRecoveryBudget` set): keep them opt-in, but move them out of
  the default test source set (a Maven profile or a `@Tag("acceptance")`
  excluded by default) and document the command next to the spec they evidence.

`ProtocolIdLookupTest` and `BrowserV2RouteTest` also use assumptions, but only
to guard platform capabilities (allocation tracking, IPv6 loopback). They run
in CI; leave them.

### 2. Tools disguised as tests in `ffb-statetest` (hard defect, low cost)

- `ffb-statetest/src/test/java/com/fumbbl/ffb/test/R5CompletedFixtureGeneratorTest.java:47`:
  its own Javadoc calls it an "opt-in R5 evidence generator". It writes a new
  match into `jdbc:mariadb://127.0.0.1:23316/ffb_local` (line 50) when an
  environment confirmation is set.
- `RecoveryArtifactInspectionTest.java:29`: inspects a file named by
  `R2_RECOVERY_INSPECT`. With the variable unset it asserts nothing.
- `R5RestoredContinuationTest.java:48`: a continuation step for the restored R5
  fixture, gated on a confirmation variable.

These are on the CI skip allow-list, so CI is honest about them. But they are
procedures, not regression tests. They cost a shard slot and a manifest entry,
and they make a test run able to write to the local dev database if a
developer's shell happens to export the confirmation.

Failure scenario: a developer who exported the confirmation variable for an
earlier R5 run runs `mvn test`. A fixture match is written to their dev
database as a side effect of the test run.

Suggested fix: move the three into `ffb-tools` (or a `main` class under
`ffb-statetest/src/tools`) and invoke them from `tools/r5-*.mjs`, which already
own the R5 workflow. Remove them from `native-shards.json`.

### 3. Fifty-two test files reflect into `SetupSession` private fields (judgement call, highest maintenance cost)

Counts from `getDeclaredField(...)` in `ffb-server/src/test` and
`ffb-statetest/src/test`: `SetupSession.state` 51 uses, `SetupSession.document`
15, `SetupApplication.sessions` 8, and single uses of `failed`, `replayBytes`,
`transcript`, `history`, `events`, `announcements`, `activationSequencing` and
others. The heaviest users are `RecoverySessionTest` (11),
`SetupSessionMovementTest` (7, e.g. `SetupSessionMovementTest.java:727`),
`JumpPlanningTest` (3), and two each in about ten more.

Most copies are the same private helper, `nativeState(session)`, followed by
direct `FieldModel` mutation to arrange a scenario. `SetupSession` is a named
hotspot in the architecture map.

Why this lowers the tests' value:
- Renaming or splitting a private field of `SetupSession` breaks dozens of
  tests that are not about that field. The tests then resist exactly the
  refactors the hotspot most needs.
- Some uses go further than arranging state: `SetupSessionTest.java:309` sets
  `failed = true`, and `:536` forces `replayBytes`. These tests assert behaviour
  for states the public path may never produce, and they will keep passing if
  the real path to that state changes.

Suggested fix: add one supported test seam and migrate to it.
- A package-private `SetupSession` accessor for the native `GameState`, or a
  shared `SetupSessionFixture` in the test tree that owns the one reflective
  read. Delete the per-file `nativeState` copies.
- For `failed`, `replayBytes` and the transcript budget, drive the state through
  its real trigger (a failing engine stub, a large transcript fixture). Where
  that is impractical, expose a narrow fixture method with a name that says
  what invariant it bypasses.

This is a refactor of the tests, not a deletion. Do it before the next
`SetupSession` split, not as a standalone sweep.

### 4. `GameStateExecuteStepTest` pins logging-call counts (judgement call)

`ffb-statetest/src/test/java/com/fumbbl/ffb/test/GameStateExecuteStepTest.java`
has 34 tests with 85 Mockito interactions and 22 assertions. Most of them
usefully specify the step-stack contract (`CONTINUE`, `NEXT_STEP`, `REPEAT`,
`GOTO_LABEL` transitions). Keep those; the step stack is the engine's core loop.

The five `logging_*` / `loggingCommand_*` tests (from line 606) assert exact
counts of `logCurrentStep` calls, for example `assertEquals(3, logCurrentStepCount.get())`.
Logging is local diagnostics, not a rule or a protocol contract.

Failure scenario: someone adds a log line on the forward path to diagnose a
stuck sequence. Five tests fail, and none of them protects rules behaviour.

Suggested fix: collapse the five into one test that asserts the property that
matters, if any (for example "each started step is logged at least once"), or
delete them if no consumer depends on the log.

### 5. `SetupSessionMovementTest` is misnamed and duplicates the statetest's ground (judgement call)

`ffb-server/src/test/java/com/fumbbl/ffb/server/match/SetupSessionMovementTest.java`
is 1,439 lines with 28 tests, and almost none of them concern setup. They cover
pass and hand-off transfers, block previews, declarations, blitz, threat
guidance and recovery of paused actions. Several overlap in subject with
`ffb-statetest` (`PassWorkflowTest`, `CoreTurnActionsTest`,
`RecoverySessionTest`). I did not find literally duplicated assertions, so this
is about findability, not dead weight.

Suggested fix: split by subject (`TransferPlanningTest`, `DeclarationTest`,
`BlockPreviewTest`) when the file is next touched, and move the
recovery-across-restart cases beside `RecoverySessionTest`.

## Checked and fine

- `BrowserV2AdapterTest` (990 lines, 35 tests, 158 exact-JSON comparisons):
  the exact JSON is the V2 wire contract, so exact matches are the point. Test
  names map to the authorization and connection invariants in the architecture
  map. Keep it.
- `SetupSessionTest`, `DefaultSetupSessionTest`, `SavedFormationSessionTest`:
  behaviour-named, end-to-end through the native engine. The `legacyCheckpoint…`
  tests guard the stored-format invariant and must stay.
- `browser-client/test`: 104 files, about 7,900 lines, largest
  `v2-client.test.ts` at 770 lines. No snapshot tests, no skips. Nothing stood
  out in a shape pass; I did not read them test by test.
- Soak overlap: the soak tooling (`overnight-soak.mjs`,
  `soak-retained-requests.test.ts`) drives the browser protocol end to end and
  does not replace the native statetests. I found no redundancy to remove.

## Suggested order

1. Finding 2: move the three R5/R2 tools out of the test suite (small and
   self-contained).
2. Finding 1: add a MariaDB CI job for the persistence contract tests and a
   skip allow-list for `ffb-server`.
3. Finding 3: add the `SetupSession` test seam, then migrate files as they are
   touched.
4. Findings 4 and 5: opportunistic, when those files next change.

A follow-up measurement pass would make finding 5 and the "checked and fine"
items firmer: PIT mutation testing on `server/match` and `server/step`, and the
per-class timings `native-shard.ps1` already uploads as
`java-native-*` artifacts.
