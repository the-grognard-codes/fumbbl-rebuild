# Capture follow-up validation plan

Parent: [#496](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/496).
Branch: `feature/496-capture-performance`, based on `601fbec14288adc718acceec8f0616036986ef3d`.

## Workloads and declared gates

- Native checkpoint workload: three repetitions of 36 native actions from the same retained initial checkpoint, with recovery equivalence after every append/compaction. An explicit 1,000 ms checkpoint gate detects a spike of the reported size. This in-memory seam excludes SQL/provider/socket costs; record first-use and warmed results separately. A non-reproduction does not establish the cause of the original 1,761.968 ms checkpoint.
- Local authorization: the regression must observe one query per reauthorization instead of the four observed before the change. Real MariaDB checks must cover inactive account/identity, changed scopes, moved identity ownership and absent/unknown scopes. Existing fixed-clock provider tests cover freshness, revocation, failures, capacity and identity isolation. Compare old four-query and new one-query paths in three matched cohorts without adding artificial latency.
- Pending/response browser workload: use the same generated native 22-player board and retained production bundles, one warm-up and 12 held-response duplicate actions per repetition; three repetitions of Off/Counters/Graph. Pending DOM must exist at the next recorded rAF before the 300 ms controlled reply, and feedback p95 must be at most 100 ms in every cohort. Response presentation p95 must not regress by more than 20 ms versus the matched baseline cohort; this is a workload comparison tolerance, not a universal frame guarantee. Report frame gaps at 50/100 ms. No native action, socket, display or dice correctness claim follows from the controlled reply workload.
- Diagnostics presentation regression: metric notifications cause zero presentation-hook rerenders; collection enable/disable still commits the current presentation. The failing baseline produced eight extra renders for eight notifications.
- Native protocol lookup allocation: preserve every enum wire name and case-insensitive/null/unknown lookup behavior. After warm-up, 40,000 lookups must allocate less than 256 KiB on a JVM exposing thread allocation counters. The failing baseline allocated 20,160,000 bytes; the corrected pinned-JDK run allocated zero.
- Hover regression: ten synchronous LivePitch commits must perform zero synchronous `elementFromPoint` hit tests and one coalesced frame hit test, while preserving stationary overlays/camera, input modes and immediate suppression.

Do not run official performance cohorts concurrently with builds or other browser suites. The initial development-bundle smoke ran during preflight and is functional/diagnostic evidence only. Record production artifact hashes and fixture hashes; compare cohorts without combining their clocks. Existing physical Android acceptance remains under #330.

Self-review found that the source capture used a 1267×682 viewport at DPR 2 and measured input from pointerdown. The initial 1440×900/DPR 1 controlled workload measured from click dispatch. Retain that reference comparison with its narrower semantics, then repeat paired production measurements with `CAPTURE_VIEWPORT=1267x682`, `CAPTURE_PIXEL_RATIO=2` and the instrumented pointerdown/press-to-click/click-to-feedback boundaries. Use the same fixture and existing declared gates for both artifacts; do not equate press duration with React commit cost. Run this additional comparison after startup with all validation workloads stopped.

## Affected-test manifest

- Authorization: `JdbcV2PrincipalDirectoryTest`, `JdbcAuthorizationMariaDbTest`, `FirebaseV2PrincipalAuthenticatorTest`, `FirebaseSessionVerificationTest`, `V2MatchAccessTest`, `BrowserV2RouteTest`, `BrowserV2AdapterTest`.
- Native checkpoint/diagnostics: `ProtocolIdLookupTest`, `CaptureCheckpointWorkloadTest`, `RecoveryJournalTest`, `RecoveryJournalMariaDbTest`, `SetupApplicationJournalTest`, `SetupApplicationCheckpointTest`, `SetupApplicationRecoveryFailureTest`, `BrowserRequestTimingTest`.
- Browser: `diagnostic-presentation-ui.mjs`, `performance-diagnostics-ui.mjs`, existing pending/reconnect/provisional/playback/replay journeys, browser unit suite and production build. The new interaction test belongs in the browser shard manifest.
- Delivery: complete the standard dev-local browser preflight, tested Docker game-server build, local proxy smoke, Firebase ADC health and computer-coach readiness. Run the required Java reactor validation separately from the local Docker build as appropriate.

## Known execution findings

- Sandboxed Git reference creation and Maven dependency reads needed narrowly scoped normal-user execution; the branch and native tests then ran successfully.
- The initial native harness reached full time before its maximum action count; use a fixed 36-action retained-start workload for the final paired comparison. The initial Mockito failure was nested stubbing in a new test fixture, corrected before the passing run.
- Creating a new `-ui.mjs` test during dev-local preflight invalidated its dynamically checked browser inventory after two shards. Register the test before the final startup run; do not bypass validation.
- A two-worker preflight hit an existing camera-click timeout during concurrent verification. The suite passed unchanged in isolation; final startup uses one worker and no competing test/build workload.
