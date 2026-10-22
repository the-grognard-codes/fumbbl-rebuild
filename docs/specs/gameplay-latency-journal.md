# Gameplay confirmation latency follow-up

Approved on 2026-10-22. Parent: [#324](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/324).
Working branch: `feat/gameplay-latency-journal`, continuing the uncommitted
`feat/smooth-gameplay` work without discarding or committing it.

## Objective and baseline

Reduce the measured 574–664 ms mean authoritative request round trip while
preserving native BB2025 outcomes, durable acceptance, recovery and public replay.
The existing foreground captures are recorded in
[the preceding report](smooth-gameplay-latency-followup.md). In the lighter capture,
mean checkpoint work was 233 ms, authorization 142 ms (102 ms Firebase), native
session work 50 ms, publication 40 ms and queue wait 35 ms. Spans nest and are not
an additive end-to-end budget.

## Tracked slices

- [#336](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/336): compact
  durable recovery records with periodic full checkpoints. Restore by assembling
  recorded native continuation and history tails, never rerunning dice or actions.
- [#337](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/337): positive
  Firebase lifecycle verification valid for at most five seconds from check start.
  Initial authentication checks revocation; token expiry and local account,
  identity and scopes remain checked on every operation. Refresh fails closed.
- [#338](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/338): mutations
  precede queued advisory reads, with bounded admission and starvation protection.
  The currently running request is not preempted; native engine work stays serial.

## Constraints and acceptance

Preserve existing matches, completed replays, MUTP styling, native rules and
unrelated working-tree changes. Do not stage, commit, push or publish. Keep a
single dev-local instance. Physical Android validation remains with the user.
Measure request latency, data availability and visible presentation separately.
Do not claim perfect smoothness based on request averages or rAF intervals.

Durability tests must cover native round-trip equivalence, duplicate requests,
CAS conflicts, crash boundaries, corruption, legacy recovery, bounds and terminal
results. Authentication tests must cover fixed-window expiry, revocation,
disablement, outage, identity isolation, local permission changes and bounded
memory. Queue tests must exercise real socket ingress and show a mutation
bypassing pending advisory work, plus fairness, capacity and failure cleanup.

Run focused regressions first, then relevant browser units and live/replay/recovery
journeys, computer tests and the game-server build. Complete independent review
of the storage, security and concurrency changes, then repeat foreground native
measurement without concurrent builds. Record exact checks and limitations below.

## Execution evidence

The three approved changes are implemented and functionally validated; smoothness
acceptance remains open because the measurements below still contain long stalls.
Initial authentication test invocation
stopped before compilation because PowerShell split an unquoted Maven property;
this is a command failure, not regression evidence.

Corrected focused command:
`mvn.cmd -pl ffb-server -am test '-Dtest=FirebaseV2PrincipalAuthenticatorTest#consecutiveOperationsReuseRecentProviderCheckButRefreshLocalPermissions' '-Dsurefire.failIfNoSpecifiedTests=false'`.
The regression failed as intended: one expected provider lookup, two actual.
Evidence: `.tools/smooth-gameplay/auth-session-red.log`. The real socket queue
regression also failed with reads before actions instead of actions before reads
(`.tools/advisory-queue-red.log`).

Design decisions: [durable journal](../adr/0004-durable-recovery-journal.md) and
[fixed provider window](../adr/0005-bounded-provider-revalidation.md). The latter
explicitly permits up to five seconds before observing Firebase-only revocation.

Focused verification:

- `mvn.cmd -pl ffb-server -am test '-Dtest=BrowserMatchTransportTest,BrowserMatchSocketTest,BrowserRequestTimingTest,BrowserV2AdapterTest,BrowserV2RouteTest,FirebaseSessionVerificationTest,FirebaseV2PrincipalAuthenticatorTest' '-Dsurefire.failIfNoSpecifiedTests=false'`:
  82 passed, zero failures/errors/skips (`.tools/advisory-queue-green-final.log`).
  An earlier round had two test-fixture setup errors (nested Mockito stubbing and
  uninitialized Jetty cleanup); corrected before the passing run.
- `npm.cmd test` in `browser-client`: 371 passed
  (`.tools/smooth-gameplay/journal-browser-unit.log`).
- `npm.cmd test` in `computer-player`: 39 passed, including Windows daemon tests
  (`.tools/smooth-gameplay/journal-computer-unit.log`).
- `node --test tools/test/review-current-matches-index.test.mjs tools/test/dev-local-clear-games.test.mjs`:
  14 passed. These use injected Docker fixtures; no user games were cleared.
- `node --check tools/match-review-provision.mjs`: passed.

Queue scheduling preserves the foreground order of timer expiry, disconnect,
operator controls and mutations. Trusted control work is exempt from browser
admission counts; advisory capacity is 112 of 128 browser requests, with one
advisory turn after at most eight foreground selections. Already-running work
cannot be interrupted. Independent review and focused persistence validation passed.

The first persistence review found two issues before rollout: native log entries
can retain mutable target-selection objects, and typed journal corruption needed
translation on retained-concession reads. The implementation now freezes new
native command JSON at the browser recovery boundary without changing live engine
objects, and translates corruption consistently. Independent review approved these fixes.
The target-selection regression checks that the live object really changes while
the committed recovery prefix remains stable.

`node .tools/smooth-gameplay/run-journal-sql-tests.mjs` ran
`RecoveryJournalMariaDbTest` with real MariaDB transactions in the separate,
initially empty `ffb_recovery_journal_test` database: one passed, zero skips
(`.tools/smooth-gameplay/journal-sql-tests.log`). It covers additive migration,
CAS retries, interrupted append, lost commit acknowledgement, failed/successful
compaction and missing-tail rejection. The test removes only the tables it
created; user match storage is untouched. This initial pass preceded the frozen
native-log fix and will be repeated on the final implementation.

Final focused persistence selectors were `RecoveryJournalTest`,
`SetupApplicationJournalTest`, `SetupApplicationRecoveryFailureTest`,
`SetupSessionMovementTest`, `PlayerActivationRecoveryTest`,
`ReactiveSkillDecisionTest`, `MatchTranscriptTest`, `RecoveryNativeJsonTest`,
`SetupApplicationReadOnlyLoadTest`, `SetupApplicationCheckpointTest`,
`JdbcRecoveryRepositoryTest`, and `Marker6SchemaTest` with the same Maven reactor
and `surefire.failIfNoSpecifiedTests=false` option: 93 reported, **92 passed**, one
existing gated database case skipped, zero failures/errors. The aggregate is
saved in `.tools/smooth-gameplay/journal-focused-summary.json`.

The actual native tests cover setup and kickoff choices, a turn-driven match
across compaction, movement and pickup rolls, blitz/block dice/push/follow-up, and
a Diving Tackle reaction timeout. They compare assembled full recovery and native
restore results, including committed prefix stability; they are not exhaustive
tests of every BB2025 skill combination. The real MariaDB test was repeated
successfully after the frozen-prefix fix and again on the final source.

Independent review approved authentication and queue scheduling, then approved
the journal after the two findings above were fixed. Final follow-up review also
approved the implementation. One serialized string per native command is retained for recovery,
adding resident memory. Full checkpoint compaction still occurs at the bounded
entry/byte thresholds; recovery assembly and validation remain cold-path costs.

The full Docker build initially found an outdated `LocalSchemaTest` startup
fixture still supplying schema 8 and verifying the legacy recovery table shape.
It now supplies schema 9 and verifies the journal-enabled shape. The focused
`LocalSchemaTest` run passed all 15 tests. A first host invocation stopped before
testing because `JAVA_HOME` was invalid; rerunning with the installed JDK 21
succeeded. No production change was needed for this fixture correction.

`docker build -f containers/local/Dockerfile -t ffb-server:match-review .` then
passed: **175 common tests and 616 server tests passed**, with four gated server
tests skipped, zero failures/errors. The image packages the tested server.
Log: `.tools/smooth-gameplay/journal-server-build-final.log`.

The additive local schema 8-to-9 migration completed after taking a private
backup and stopping the game server. Verification confirmed all existing recovery
artifact bytes and generations were unchanged, account/team/match/preference
counts were unchanged, checkpoint generations equalled the durable heads, and
the new journal was empty. Sanitized evidence:
`.tools/smooth-gameplay/journal-schema-migration.json`. The private SQL backup is
excluded from shared evidence.

The standard local refresh ran the complete browser preflight with one worker:
`$env:FFB_BROWSER_TEST_WORKERS='1'; $env:DEV_LOCAL_GAMEPLAY_TIMING='true'; node tools/deploy.mjs --environment dev-local`.
All 46 interaction and 10 hosted suites passed (954.6 seconds; reports under
`.tools/validation/local-browser-jzUR1n`). These cover live pitch interaction,
dice and block choices, movement ranges, menus, playback, provisional movement,
replay, recovery snapshots, reconnect and exact retained retries. The reports
record the base HEAD; this validation ran the uncommitted working tree.

Additional standalone Chrome checks passed:
`node browser-client/test/reconnect-ui.mjs` and
`node browser-client/test/pending-recovery-ui.mjs`. They verify play/builder
authentication recovery and ordinary actions without a recovery popup while
preserving exact retries for uncertain outcomes. Logs are
`.tools/smooth-gameplay/journal-reconnect-ui.log` and
`.tools/smooth-gameplay/journal-pending-recovery-ui.log`.

The local refresh rebuilt and started the schema-9 server, then detected expired
Google Application Default Credentials and opened the standard sign-in flow.
The user completed sign-in. The immediate post-login probe returned
`ADC_RENEWAL_INVALID`; a subsequent direct probe returned `OK`, and the standard
`node tools/match-review-start.mjs` verified healthy database/server and Firebase
credentials. The original probe does not preserve a more specific error code,
so its exact transient failure is unknown.

Restarting the standard launcher with four browser workers failed the
`playback-motion-ui.mjs` frame-sampling assertion (one intermediate position).
The same test passed immediately when run alone, without changing the assertion
or production code. The earlier complete single-worker run had also passed.
This supports scheduling contention as a cause, rather than establishing that
the product always meets its frame target. Logs:
`.tools/smooth-gameplay/journal-dev-local-renewed.log` and
`.tools/smooth-gameplay/journal-motion-isolated.log`. The launcher is being rerun
with one worker and passed all 56 suites / 76 reported tests again in 946.5
seconds (`.tools/validation/local-browser-ZSgPnb`). The standard launcher then
completed server/ADC health, the real proxy authentication-gate test, hosting,
and computer-player startup (`journal-dev-local-final.log`).

The first foreground attempt (`latency-followup/journal-light`) stopped before
gameplay: real saved-team creation returned `PERSISTENCE_FAILED`. Diagnosis
found `JdbcSavedTeamRepository.lockWrites` still rejected schema versions above
8. The account create/update regression was extended to schema 9 and failed
before the fix, then passed all 12 repository tests after extending that guard
to 9; unknown version 10 and legacy/account incompatibility still fail closed.
An audit of production schema-version guards found no other equivalent limit.
This is a migration-integration defect missed by the initial journal review and
mocked browser suites, caught by the real native capture. No valid gameplay
timing is claimed from that failed attempt. Red/green logs:
`journal-saved-team-red.log` and `journal-saved-team-green.log` under
`.tools/smooth-gameplay`. The corrected Java image passed the full build again:
175 common and 616 server tests passed, four gated server tests skipped, zero
failures/errors (`journal-server-build-compatibility.log`). Only the Java server
was then refreshed with the existing Compose configuration; browser source and
already-validated hosting artifacts were unchanged. The subsequent real captures
created teams successfully through the production UI.

## Foreground results on the final local image

Two separate native Human/Orc games against the random computer completed with
headed Chrome 155, a visible/focused 1920x1080 human page, real Firebase, loopback
transport and no concurrent builds/tests. The lighter run used 41 decisions and
required second-half play; the detailed run used 40 decisions and CPU/geometry
instrumentation. Their 34 and 35 PLAY mutations respectively matched server
timings, with all matched requests focused at send and response. Each passed
reconnect and authoritative convergence. These are bounded workloads, not full
match acceptance or a paired benchmark: native outcomes, action mixtures, history
lengths and instrumentation differ from the earlier games.

| Metric (ms unless stated) | Prior lighter capture | New lighter capture | New detailed capture |
| --- | ---: | ---: | ---: |
| Matched PLAY mutations | 34 | 34 | 35 |
| Request round trip, mean | 574.04 | 461.28 | 361.30 |
| Request round trip, median | 573.90 | 380.50 | 309.80 |
| Request round trip, p95 | 789.50 | 1013.70 | 860.90 |
| Request round trip, maximum | 796.60 | 2018.10 | 928.40 |
| Queue wait, mean | 35.49 | 2.88 | 3.99 |
| Authorization, mean | 142.33 | 58.54 | 44.52 |
| Firebase lookup count | 34 | 1 | 1 |
| Checkpoint work, mean | 233.20 | 204.98 | 143.44 |
| Checkpoint work, median | 213.85 | 106.62 | 96.82 |
| Publication, mean | 40.21 | 53.40 | 44.45 |

The new medians and provider/queue costs are lower, but the tail is not
acceptable for consistently fluid play. The 2018 ms request spent 1832 ms in
checkpoint work, including 814 ms recovery serialization and 328 ms storage
(285 ms encoding/compression, 43 ms SQL). Queue wait was 0.08 ms, native apply
6.43 ms, and it made no Firebase lookup. These spans nest; do not add them as
independent delays. The checkpoint total also includes authorization and work
outside its nested serialization/storage spans. Current instrumentation does not
explicitly label append versus full compaction, so the exact path of this sample
is not proven. Full checkpoint/compaction, cursor construction and repeated
encoding remain candidates to separate in the next server profile.

Visible presentation in the detailed run was measured separately:

| Boundary | Samples | Median | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Input to visible feedback opportunity | 40 | 20.1 | 33.0 | 36.2 |
| Request to first correlated screen movement | 21 | 43.1 | 382.2 | 472.8 |
| Request to dice-data availability | 13 | 316.1 | 925.0 | 925.0 |
| Dice-data availability to decision paint opportunity | 5 | 204.9 | 241.5 | 241.5 |

The dice-decision sample is small and does not cover every decision path.
Provisional movement can precede the server response. Paint opportunities and
geometry samples are not measurements of physical display latency. Focused rAF
intervals had p95/max of 31.1/445.9 ms in the lighter run and 34.7/426.6 ms in the
detailed run (41 and 39 intervals above 50 ms). The browser trace includes
automation/profiling overhead; it establishes outliers, not their exclusive
production cause or physical FPS. No claim of perfectly smooth play is made.

Evidence is under `.tools/smooth-gameplay/latency-followup/journal-light2` and
`journal-full`: `performance.json`, `correlated.json`, `server-timing.log`,
`measurement.json`, and `timeline.json`. Adjacent manifests record exact bundles,
drivers and server-image hashes. `.tools/smooth-gameplay/journal-comparison.json`
contains the comparison. Credential files and the private SQL backup are excluded
from shared evidence.

Both synthetic matches reached FULL_TIME through UI concession after measurement.
The lighter run's first cleanup timed out and was retried on a stable human turn;
`cleanup-retry.json` confirms completion. User matches were not changed. Final
checks found healthy server/database, running managed proxy/hosting/computer
processes and HTTP 200 at `http://localhost:5000/play`. `git diff --check` passed
with only line-ending notices. The branch remains uncommitted and unpushed.
Physical Android and user visual acceptance remain outstanding.

## Rebase onto Hail Mary Pass changes, 2026-10-22

At the user's request, `feat/gameplay-latency-journal` was rebased from
`b73f7ad8f` onto current `origin/main`, `89a64307b` (Hail Mary Pass/bomb PR #331).
There were no feature commits to replay: all gameplay work remained uncommitted.
It was preserved with `git stash --include-untracked`, the branch was rebased,
and the stash was applied. The recovery stash is retained as
`e6b2438495d811c13110dd91f948e0abb4ad5ce5`; older stashes were untouched.

The sole textual conflict was `ChangeList.java`. Both Hail Mary entries and all
smooth-gameplay entries were retained. Four other overlapping files merged
automatically and were reviewed: `LivePitch.tsx`, `SetupPanel.tsx`,
`SetupSession.java`, and `tools/validation/browser-shards.json`. Review confirmed
that Hail Mary version-3 passing projections, mode changes with retained draft
routes, native mode projection/recovery, provisional movement, and both sets of
browser tests remained present. No additional behavior adjustment was required.

All 103 pre-rebase modified/untracked files were restored. A comparison against
the preserved stash, normalizing line endings, found changes only in those five
expected overlapping files. Evidence is in
`.tools/smooth-gameplay/rebase-hail-mary/preservation.json` and `before.patch`.
Git reports no unmerged paths, no staged changes, and a clean `git diff --check`.

Post-rebase validation:

- `npm.cmd test` in `browser-client`: 375 passed, no failures/skips.
- `npm.cmd run build` in `browser-client`: TypeScript and production build passed;
  existing bundle-size advisory only.
- `node browser-client/test/hail-mary-pass-ui.mjs`: passed Hail Mary ball/bomb,
  coach views, mode switching, movement, Blizzard targeting, reload/replay paths.
- `node browser-client/test/provisional-movement-ui.mjs`: passed movement,
  rejection, disconnect, recovery, dice ordering and replay isolation.
- `node browser-client/test/playback-motion-ui.mjs`: initially failed during
  concurrent Java compilation (zero sampled intermediate frames); passed in
  isolation with 13 intermediate frames, with no assertion or code change.
- `node --test tools/test/validation.test.mjs`: 15 passed, validating combined
  test registration.
- `mvn.cmd -pl ffb-statetest -am test '-Dtest=HailMaryPassTest,HailMaryPassRangeTest,HailMaryTargetValidationTest,HailMaryWorkflowTest,HailMaryBombAllowanceTest,PassRangeProjectionTest,PassWorkflowTest,RecoveryScenariosTest,RecoverySessionTest,NativeRollPresentationTest,RecoveryJournalTest,SetupApplicationJournalTest,SetupApplicationRecoveryFailureTest' '-Dsurefire.failIfNoSpecifiedTests=false'`:
  65 passed (49 native integration and 16 journal/recovery), no failures/skips.
- `mvn.cmd -pl ffb-server -am package`: full common/server build and tests passed,
  175 common plus 616 server tests, with four existing gated server skips.

Java checks used installed Temurin 21.0.12.101. Attempts to use the repository's
target-build wrapper stopped before tests because its pinned 21.0.11 JDK was
missing/incomplete; exact pinned-toolchain validation was not performed. Logs
for all checks are under `.tools/smooth-gameplay/rebase-hail-mary`.

No feature commit, push, merge to main, or runtime restart was performed. The
running dev-local instance remains the previously reviewed build; the rebased
sources and local package/build outputs include Hail Mary Pass. The earlier
foreground timing measurements predate this rebase and were not rerun.
