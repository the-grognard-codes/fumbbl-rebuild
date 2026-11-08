# Capture-driven gameplay performance outcome

Parent: [#496](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/496).
Working branch: `feature/496-capture-performance`.
Base: `601fbec14288adc718acceec8f0616036986ef3d`.
Implementation authorized on 2026-11-07. Changes remain uncommitted for review.

Results are recorded on GitHub: [parent #496](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/496#issuecomment-6717362769), [#489](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489#issuecomment-6717362117), [#490](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/490#issuecomment-6717362237), [#491](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/491#issuecomment-6717362384), [#492](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/492#issuecomment-6717362532) and [#493](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/493#issuecomment-6717362664). All remain open.

## Delivered behavior

Local gameplay reauthorization reads identity ownership, account/identity lifecycle and current scopes with one joined SQL query instead of four queries. Every operation still refreshes local permissions. Firebase's fixed five-second positive verification window, token expiry checks, initial revocation verification, failure eviction and fail-closed behavior remain unchanged.

The diagnostics presentation hook now subscribes to collection enablement rather than all metric notifications. Overlay counters/graphs still refresh, while those refreshes no longer force gameplay presentation renders. The deterministic regression observed eight extra renders for eight notifications before the change, and zero afterwards; enable/disable still causes the required presentation update.

The native browser profile also identified stationary-pointer hit testing during React commits. Hover refreshes from commits and DOM mutations now share a frame callback. Ten real LivePitch commits previously forced ten synchronous hit tests; they now force zero synchronous tests and one frame hit test. Suppressed hover remains hidden immediately, and stationary overlays/camera changes, keyboard, pen/touch and recovery behavior pass the cursor regression.

A bounded native server recording identified repeated `ModelChangeId.values()` and `NetCommandId.values()` clones in recovery parsing. Their factories now retain private enum snapshots, preserving lookup order, case-insensitive wire names, null/unknown handling and all enum values. A regression over 40,000 lookups allocated 20,160,000 bytes before the change and zero after on the pinned JDK. This removes demonstrated allocation work; it does not establish the cause of the intermittent checkpoint spike.

Opt-in server timing logs add local-authorization duration/check count, provider reuse count, checkpoint cursor preparation and fingerprint duration. Existing browser diagnostics reply fields and capture formats remain compatible. No persistence format, durable-acceptance boundary, native game rule, mutation-admission limit or theme changed.

Runnable workloads and comparison tooling are documented in [workloads.md](workloads.md), with the declared gates and affected tests in [validation-plan.md](validation-plan.md).

## Results by issue

| Issue | Result | Remaining limits |
| --- | --- | --- |
| [#489](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489) | Reproduced a live 1,078.789 ms checkpoint; added retained-start append/compaction/restore workloads and phase attribution; removed profiler-observed enum-array allocation in recovery parsing | The intermittent spike's complete cause remains unresolved. A subsequent bounded JFR captured related work without reproducing the spike. The application timing seam uses an in-memory repository; real SQL durability is tested separately. |
| [#490](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/490) | Four-to-one SQL query correction, real MariaDB security checks and three matched timing cohorts; native inside/outside-window workload added | Isolated directory timings exclude Firebase and transport. Complete authorization can still contain several fresh local checks in one request. |
| [#491](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/491) | Held-response workload verifies pending DOM before authoritative replies, with production feedback p95 below 100 ms in every cohort | Original 95–133 ms delay was not reproduced on this reference board. No broad pending-state scheduling change or physical-device claim is made. |
| [#492](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/492) | Removed diagnostics-induced gameplay rerenders and coalesced synchronous hover hit tests identified by a native CPU/timeline profile | The live workload still has broader React work and frame stalls; these bounded changes do not establish that all original stalls are resolved. No rendering rewrite was justified. |
| [#493](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/493) | Added a reproducible cohort comparison with artifact/fixture matching, missing-data rejection and explicit gates; all nine measured browser cohorts pass | Small cohorts do not establish long-term tail latency; Windows headless evidence does not replace physical Android acceptance under #330. |

## Matched browser evidence

This initial reference comparison measures **click-dispatch-to-feedback**, while the source capture's input clock begins at pointerdown. Self-review added separate press/click boundaries and a source-viewport/DPR comparison; its results are recorded separately below. The initial numbers must not be presented as a direct comparison against the source capture's 95–133 ms input feedback.

Windows Chrome `157.0.8103.38`, AMD Ryzen 7 260 with Radeon 780M, 1440×900 viewport. Each artifact ran three repetitions of Off/Counters/Graph, 12 actions per cohort, one warm-up action and a 300 ms held duplicate acknowledgment. The generated native board contains 22 players. Measurements ran after other builds/browser suites stopped. The same fixture and bundle-serving harness were used on both sides; the first Off cohort in each artifact included CPU sampling.

| Repetition | Mode | Feedback p95 before/after ms | Response presentation p95 before/after ms | >=50 ms gaps before/after | Declared gate |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | Off | 7.9 / 10.4 | 10.3 / 10.9 | 0 / 1 | PASS |
| 1 | Counters | 9.5 / 9.3 | 12.0 / 12.7 | 0 / 0 | PASS |
| 1 | Graph | 12.4 / 9.1 | 15.5 / 13.7 | 0 / 0 | PASS |
| 2 | Off | 8.6 / 8.9 | 14.1 / 11.6 | 0 / 0 | PASS |
| 2 | Counters | 9.7 / 7.3 | 12.9 / 13.7 | 0 / 0 | PASS |
| 2 | Graph | 7.4 / 8.2 | 13.4 / 11.9 | 0 / 0 | PASS |
| 3 | Off | 7.7 / 9.8 | 13.0 / 10.3 | 0 / 0 | PASS |
| 3 | Counters | 6.8 / 8.1 | 12.8 / 11.3 | 0 / 0 | PASS |
| 3 | Graph | 11.8 / 13.7 | 20.1 / 19.8 | 0 / 0 | PASS |

All 108 actions per artifact showed pending DOM before their held replies. Neither artifact recorded a >=100 ms frame gap. One >=50 ms gap occurred in the corrected first Off cohort; do not claim that the correction eliminated all stalls. Response presentation is a rAF opportunity after dispatch, not physical display latency. These measurements establish non-regression against the declared workload gates, not a general speedup.

Artifact SHA256:

- Baseline production bundle: `f91312113eef5402ff8e2f51eac43df6c0cd8fe7fc7f150de5d8d02629f956d2`.
- Intermediate diagnostics-only corrected bundle: `1d654efe6293ce60e456b5a73509c685a311a086dc01b763de138e6e8db17c3f`.
- Matched native browser fixture: `d20ec30d3eda8d6be59bbd184e3a0c039d31d3550dda9fd656b863b36197b37a`.

Raw numeric reports, medians/maxima, individual samples, screenshots and CPU profiles are retained under `.tools/performance-followup/browser-before` and `browser-after`; compact comparison: `.tools/performance-followup/browser-comparison.md`. A development-bundle smoke run during other tests is retained separately and excluded from performance acceptance. Visual inspection confirmed the production native-board/Graph layout retained MUTP presentation.

## Final source-display and pointerdown comparison

The final artifact was measured at the source capture's 1267×682 viewport and DPR 2. Input starts at pointerdown, with press-to-click and click-to-feedback recorded separately. Both artifacts use the same retained native board, three repetitions of Off/Counters/Graph, one warm-up and 12 measured actions per cohort. Diagnostics sit bottom-left to keep End Turn accessible at the short viewport. Windows headless Chrome and the controlled duplicate acknowledgments remain explicit limits; this is not a replay of the source game's full history.

| Repeat | Mode | Pointerdown feedback p95 before/final ms | Response presentation p95 before/final ms | >=50 ms gaps before/final | Gate |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | Off | 8.0 / 11.3 | 10.9 / 17.2 | 0 / 1 | PASS |
| 1 | Counters | 10.5 / 10.9 | 10.8 / 13.7 | 0 / 0 | PASS |
| 1 | Graph | 6.9 / 11.2 | 13.3 / 17.8 | 0 / 0 | PASS |
| 2 | Off | 9.5 / 7.4 | 13.3 / 17.6 | 0 / 0 | PASS |
| 2 | Counters | 7.1 / 12.0 | 10.9 / 14.4 | 0 / 0 | PASS |
| 2 | Graph | 7.5 / 12.2 | 13.9 / 15.3 | 0 / 0 | PASS |
| 3 | Off | 9.8 / 8.9 | 12.0 / 16.6 | 0 / 0 | PASS |
| 3 | Counters | 11.2 / 9.9 | 16.3 / 18.0 | 0 / 0 | PASS |
| 3 | Graph | 10.5 / 14.9 | 13.2 / 13.6 | 0 / 0 | PASS |

All 108 actions per artifact presented pending DOM before the held reply; no >=100 ms frame gaps occurred. Every cohort passed the declared 100 ms feedback and baseline-plus-20 ms response gates. Most response p95s rose slightly, so these results establish workload non-regression within the declared tolerance, not an overall response-time improvement. The direct regressions establish the avoided render/hit-test work; broader stutter remains open.

Final production bundle SHA256: `1a2a4cc68fb634d61227e6156292791171fbe0d667b6f5fb3193cd4f50209691`. Baseline and fixture hashes are unchanged. Evidence: `.tools/performance-followup/browser-source-before-v2`, `browser-source-final`, and `browser-source-final-comparison.md`. An intermediate diagnostics-only source-display comparison also passed; the initial source-display attempt stopped on a test locator error and remains preserved separately.

## Real MariaDB local authorization comparison

The isolated empty `ffb_capture_auth_test` schema uses the actual checked-in account/identity/scope schema. Tests verify both scopes, account disablement, identity revocation, changed identity ownership, immediate scope removal and empty-scope rejection. Provider revocation/failure and fixed-window semantics are additionally covered by existing controlled-clock regressions.

Ten warm-up pairs preceded three 40-pair cohorts, with old/new order alternating. The existing-account authentication path executes the same four SQL statements as the old reauthorization path and supplies the baseline without creating accounts; the corrected path executes the new joined refresh. These are actual loopback MariaDB times including connection setup, not added artificial delays.

| Cohort | Samples per path | Median before/after ms | p95 before/after ms | Maximum before/after ms |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 40 | 12.250 / 8.679 | 15.510 / 16.322 | 23.405 / 16.602 |
| 2 | 40 | 11.586 / 8.392 | 17.708 / 12.139 | 19.906 / 23.247 |
| 3 | 40 | 10.395 / 7.759 | 13.015 / 12.062 | 19.979 / 16.169 |

Median directory cost fell about 25–29%; the first cohort's p95 rose, and not every maximum improved. The deterministic guarantee is one query instead of four with current permissions preserved. These figures do not explain all of the source capture's 94–251 ms authorization spans. Private numeric evidence: `.tools/performance-followup/native/authorization.json`.

## Native checkpoint and live evidence

The final workload runs the real `SetupApplication` action/checkpoint/reply path from the same retained initial checkpoint, with native restore parity after every commit. It uses JDK 21.0.11 and a 768 MiB heap, matching the local server's heap limit. Three 36-action repetitions each contain 33 appends and three compactions; reconstructed artifacts reach about 2.0 MB. SQL/provider/socket costs are excluded from this in-memory timing seam and tested separately.

| Repetition | Initial artifact serialization ms | Append median/p95/max ms (n=33) | Compaction median/max ms (n=3) |
| ---: | ---: | ---: | ---: |
| 1 | 84.289 | 51.199 / 80.078 / 92.727 | 131.641 / 199.985 |
| 2 | 7.094 | 44.021 / 69.755 / 70.929 | 87.736 / 211.628 |
| 3 | 5.485 | 41.958 / 63.333 / 63.474 | 88.845 / 184.524 |

All checkpoints in this controlled seam passed the declared 1,000 ms reproduction gate. Maximum serialization was 154.721 ms; maximum cursor preparation was 54.418 ms. These phases overlap with checkpoint totals and must not be added as independent latency. Three compactions per repetition cannot establish a stable compaction p95. Evidence: `.tools/performance-followup/native-final/checkpoint.json` and `native-final.log`.

Real authenticated local requests ran three warm/expired advisory cohorts and three durable save proposal/cancel pairs on a retained synthetic match. The match returned to ACTIVE. Warm advisories performed two current local checks, two provider reuse hits and zero provider lookups: authorization 23.1–25.2 ms. After a 5.1-second wait, each advisory performed one provider lookup (140.7–198.0 ms) and two current local checks (29.3–33.8 ms), for 170.2–231.9 ms authorization. Warm mutations also had zero provider lookups. This distinguishes intentional provider refresh cost from local/repeated checks without extending freshness or caching permissions. A real compaction in this workload took 274.9 ms, including 131.5 ms serialization and 41.9 ms cursor preparation. Evidence: `native-authorization-summary.json` and private correlated server timing logs under `.tools/performance-followup`.

The first actual UI smoke recorded 19.3 ms pending feedback, 672.1 ms RTT, 654.1 ms server handling, 205.9 ms checkpoint and 67.4 ms authoritative presentation opportunity. A separate instrumented native action produced a bounded, untruncated 9,875-event timeline and CPU profile: a scheduled React callback reached 55.3 ms, websocket callbacks reached 19.0 ms, style updates 9.6 ms and major GC 9.5 ms. Stationary-pointer refresh was a prominent application-side sampled path, motivating the red/green hover regression and final correction. Nested trace events are not additive. Profiling itself perturbs timing; its 136 ms rAF gap is not an acceptance measurement or proof of physical display delay. Raw profiles remain private in `.tools/performance-followup/native-ui-profile`.

After the browser correction, a real end-turn reproduced the server spike family: pending feedback 13.8 ms, RTT 1,981.5 ms, server handling 1,959.782 ms, session apply 575.822 ms, checkpoint 1,078.789 ms, serialization 713.427 ms and SQL 155.680 ms. Presentation opportunity was 42.5 ms; three frame gaps reached 50 ms (maximum 60.7 ms), none reached 100 ms, and the maximum Long Animation Frame was 90.5 ms. This is one live observation, not a matched latency improvement or proof that the source capture's exact cause was reproduced. Evidence: `.tools/performance-followup/native-ui-final`.

Two bounded 60-second startup JFR recordings then covered 48 synthetic save/cancel mutations and, separately, two real end-turn actions. They retained the normal 768 MiB heap and container restrictions, and the server was restored to its normal non-recording configuration afterwards. Neither recording reproduced a one-second checkpoint: the two recorded end-turn checkpoints were 210.5/177.9 ms. The deeper recording had 210 execution samples, 2,526 allocation samples and a maximum GC pause of 29.0 ms. Sampled checkpoint allocation attributed about 30.9 MB to model-change enum arrays and 7.9 MB to command enum arrays, motivating the allocation correction above. Those weights are estimates, not exact retained heap or per-request allocations. GC evidence from a non-spiking recording cannot explain the earlier spike. Raw recordings remain private under `.tools/performance-followup/server-*-checkpoint.jfr`.

The remaining #489 investigation is precisely scoped: retain a native starting artifact with the same history size as a slow live action, repeat identical append/compaction sequences with bounded startup JFR and correlated phase logs, and attribute full JSON decode/order/combine/digest work and GC at the actual slow request. The existing smaller fixture and related JFR recordings are insufficient to justify caching mutable recovery state or changing durability boundaries. Keep #489 open for that result. Broader response-associated React work and physical Android acceptance also remain open.

After the enum allocation correction, the same retained initial artifact (`5abafa84f6b2bd56169b4eeb0457364b71c3b5a6cb78a6b29ae519899aa8c587`), JDK 21.0.11, 768 MiB heap and 36-action sequence produced:

| Repeat | Append median/p95/max before ms | Append median/p95/max after ms | Compaction median/max before ms | Compaction median/max after ms |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 51.199 / 80.078 / 92.727 | 31.762 / 55.389 / 60.391 | 131.641 / 199.985 | 96.603 / 127.014 |
| 2 | 44.021 / 69.755 / 70.929 | 29.945 / 44.990 / 48.044 | 87.736 / 211.628 | 82.145 / 100.848 |
| 3 | 41.958 / 63.333 / 63.474 | 23.523 / 36.536 / 50.234 | 88.845 / 184.524 | 82.547 / 110.855 |

Each side has 33 append and three compaction samples per repetition. Append medians fell about 32–44% in this workload; this is not a general live-game speedup. Elapsed game-clock fields vary, with maximum artifact-size differences of 8/6/9 bytes in the approximately 2 MB reconstructed histories. The comparison checks the starting-artifact hash, runtime/heap, action count and append/compaction sequence. Three compactions remain too few for a stable tail claim. Evidence: `.tools/performance-followup/native-enum-matched`, `native-enum-matched.log` and `native-enum-comparison.json`. The first attempted post-change run used an absent path and created a different start; hash validation rejected it. That run is excluded. The runner now rejects missing explicitly selected initial artifacts before accessing SQL.

The final rebuilt-server native UI smoke passed authenticated negotiation, a real end-turn, server timing, private export and Off teardown. It recorded 9.3 ms pending feedback, 377.5 ms mutation RTT, 337.9 ms handling, 147.0 ms checkpoint, 55.1 ms serialization and 58.4 ms presentation opportunity. Its frame maximum was 53.6 ms (two gaps at least 50 ms, none at least 100 ms); Long Animation Frames reached 159.8 ms during the captured window. This is a functional smoke on a later live state, not a matched before/after result or evidence that the earlier spike cannot recur. Evidence: `.tools/performance-followup/native-ui-enum-final`.

## Verification and self-review

- Focused native suite: 110 tests passed, no failures/errors/skips, via `tools/target-build.ps1 test` with the selectors in the validation plan. Log: `.tools/performance-followup/focused-native-final.log`.
- Protocol lookup regression: both wire-contract and allocation tests passed after the measured allocation failure. Logs: `.tools/performance-followup/enum-lookup-red.log` and `enum-lookup-green.log`.
- Native/MariaDB workload runner: three tests passed without skips, covering native recovery, joined authorization and real journal transaction/failure behavior. Log: `.tools/performance-followup/native-workloads.log`.
- Strengthened application/checkpoint/reply workload: one test passed. Log: `.tools/performance-followup/application-workload-check.log`.
- Browser units: all 518 passed, no failures/skips. Log: `.tools/performance-followup/browser-units.log`.
- Final browser units after hover coalescing: all 518 passed. Log: `.tools/performance-followup/browser-units-final.log`.
- Production browser build passed. Log: `.tools/performance-followup/browser-build.log`.
- Diagnostics presentation regression failed before the fix (`off=1, enabled=2, polled=10`) and passed after (`off=1, enabled=2, polled=2, disabled=3`).
- Comparison tests passed all three cases, covering declared gates, missing/mismatched/duplicate cohorts and exclusion of arbitrary raw input. All nine measured browser cohorts passed the comparison.
- The updated CI tools command passed all 30 tests locally, including the newly wired comparison regression. Log: `.tools/performance-followup/tools-ci-final.log`. GitHub CI itself has not run for these uncommitted changes.
- Full standard startup preflight passed 70 interaction and 12 hosted suites in 1,291.1 seconds with one worker. Reports: `.tools/validation/local-browser-Kcf9Jt`. This full preflight preceded the final narrow hover correction.
- After the hover correction, the cursor suite and ten affected suites passed: pending recovery, reconnect, camera perspective, movement flow, provisional movement, playback, playback motion, setup drag, performance diagnostics and diagnostics presentation. Logs: `.tools/performance-followup/hover-hit-test-green.log` and `final-*-ui.log`. The local client was rebuilt with the standard local-dev assembler; unchanged Java/server validation remains applicable.
- Final tested Docker server build passed 19 common tests and 682 reported server tests (676 passed, six environment-gated cases skipped), with no failures/errors. Log: `.tools/performance-followup/server-build-final.log`. The final retained-start workload and changed authorization/journal SQL integrations passed three tests separately against real MariaDB without skips. Four other opt-in schema integration cases did not run as standalone fixtures.

The complete `ffb-statetest` reactor/shards were not run in this session; verification used the focused native suite and full common/server build above. Physical Android performance acceptance was not performed. These remain distinct from the passing local evidence.

Self-review checked the SQL join against the actual schema, per-operation lifecycle/ownership/scope freshness (including an alternate account that has its own scope), unchanged provider reuse/expiry/failure semantics, private enum snapshot initialization/encapsulation and unchanged wire lookups, disabled diagnostics behavior, enable/disable presentation updates, hover lifecycle/cleanup and unchanged timing-reply/capture contracts. It also corrected a too-shallow initial checkpoint harness, input-clock/display metadata, browser test inventory registration, nested Mockito fixture stubbing, the timing-log field-count assertion and the missing explicitly selected starting-artifact guard.

The first startup preflight stopped when a newly added interaction test invalidated the inventory mid-run. After registration, a two-worker attempt hit an existing camera-click timeout in `reroll-accounting-ui.mjs`. That suite passed unchanged in isolation. The final startup uses one worker with other test/build workloads stopped. Logs retain both failed attempts; no timeout, assertion or validation gate was weakened.

The 768 MiB measurement's first invocation stopped at the tool version probe because Windows PowerShell 5 treated Java's `JAVA_TOOL_OPTIONS` notice as an error. The same pinned tools passed under installed PowerShell 7; the workload runner exposes `CAPTURE_POWERSHELL` for that case. The failed source-display attempt was a test locator mismatch for the Position control, corrected before retaining complete matched cohorts. These were harness/tooling failures, not silently accepted performance results.

## Manual validation handoff

Dev-local is running at **http://localhost:5000/play**. The local-dev environment, play/builder/spectate routes, exact served JS/CSS hashes, server/database health, current checkout ownership, Firebase credentials, real proxy authentication/reconnect and computer-player readiness passed. The healthy Java server remains running while the final browser artifact is served by local Hosting.

Server image: `sha256:4c0f0f969cd2569f96030f57154b5a27af31015f6fbc423cc63fd898b987f6cb`. Server JAR SHA256: `8de3e48acceee9ed172fbd0d61f55b876c321d21702f7eaf79171a549ffcfc8d`. Current readiness evidence: `.tools/performance-followup/ready.json`; full startup log: `dev-local-single-worker.log`; final server refresh: `server-final-start.log`. Normal JVM flags were restored and the current Hosting, proxy and computer-player processes are alive.

Open or reload the manual URL to use the final client. Play a normal movement/decision sequence and inspect **Debug → Performance & Network** if a delay recurs. The original checkpoint spike and broader React/native stalls remain explicitly unresolved; use a fresh bounded capture plus the new server phase/count diagnostics for follow-up. Keep physical Android acceptance under #330 separate.

Changes remain on the working branch for review. No commit, push, PR, merge, remote deployment or issue closure was performed.

## Tooling retrospective

The repository retrospective and writing guide were applied after product validation. Existing browser/typecheck/native guardrails already run in `.github/workflows/browser-validation.yml` and `maven-verify.yml`; no general replacement is needed. Findings in priority order:

1. The new comparison tests initially lacked a CI entry because the tools job uses an explicit file list. Added them to the existing tools validation command so malformed/mismatched evidence remains protected after this session.
2. A missing explicitly selected native initial artifact silently created a different baseline. The comparison caught the hash mismatch; the runner now rejects that input before accessing SQL. Preserve exact baseline manifests for future profiling runs.
3. Read-only container attach attempts and PowerShell 5 stderr handling consumed investigation time. The workload guide records the working bounded startup-JFR approach and PowerShell 7 override. Future profiling should start with those documented paths and finish browser test registration before starting the long inventory-checked preflight. Broader environment or policy edits are suggestions for separate work.
