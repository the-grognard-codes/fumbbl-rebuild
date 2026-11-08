# Running the capture follow-up workloads

These commands run from the repository root on the Windows development host. Use Node 26 and the pinned Java/Maven setup. Keep builds and other browser suites stopped during performance measurements. Artifacts under `.tools/performance-followup` are private local evidence; do not publish raw checkpoints, credentials or account/match data.

## Native application, authorization and durability

Start the existing dev-local database first. Run:

```powershell
node tools/diagnostics/run-native-workloads.mjs
```

The runner checks the managed database container and loopback port, requires empty dedicated `ffb_capture_auth_test` and `ffb_recovery_journal_test` schemas, then invokes `tools/target-build.ps1`. It never uses application tables in `ffb_local`. Tests remove only the tables they create; the test schemas remain available for another run. Database credentials stay in the child environment and are never logged.

Outputs in `.tools/performance-followup/native`:

- `initial-checkpoint.json`: retained synthetic native starting state, reused on subsequent runs.
- `checkpoint.json`: three 36-action application/checkpoint/reply repetitions, with append/compaction paths, first-use markers, artifact sizes and actual request phase measurements. Every accepted response follows the in-memory repository commit; every recorded state restores through the native engine. This excludes SQL, provider and socket latency.
- `authorization.json`: three 40-pair real MariaDB comparisons, alternating baseline/corrected order after ten warm-up pairs, plus lifecycle/ownership/scope regression results. The existing-account authentication path executes the same four SQL statements as the previous local refresh; the corrected refresh uses one joined query. This is local directory cost, not Firebase or complete authorization latency.
- `native-board.json`: generated 22-player native board for the controlled browser workload.

The real journal SQL test separately exercises append/compaction transactions, duplicate retries, generation conflicts, lost commit acknowledgment and failure/corruption recovery. A checkpoint timing ceiling of 1,000 ms makes the reproduction command detect an outlier of the original reported size. Failure to reproduce leaves that cause unresolved.

For another evidence directory, set `CAPTURE_WORKLOAD_OUTPUT`. Retain the same initial checkpoint when comparing changed native paths; do not create a different game and call it a matched baseline. An explicit `CAPTURE_CHECKPOINT_INITIAL` must name an existing file; the runner rejects a missing file before accessing SQL. `CaptureCheckpointWorkloadTest` can also run alone through the target-build test selector. Optional environment variables are `CAPTURE_CHECKPOINT_INITIAL`, `CAPTURE_CHECKPOINT_OUTPUT`, `CAPTURE_BROWSER_FIXTURE` and `CAPTURE_CHECKPOINT_CEILING_MS`.

For the local server's heap limit, set `JAVA_TOOL_OPTIONS=-Xmx768m` in the workload process. On Windows PowerShell 5, Java's stderr notice can stop the target-build version probe; use `CAPTURE_POWERSHELL` pointing to the installed PowerShell 7 executable for this case. Record the JDK, maximum heap and initial-artifact SHA256 from the output when comparing native runs.

## Production browser feedback and response handling

Build and retain the baseline bundle before browser changes:

```powershell
npm.cmd run build --prefix browser-client
New-Item -ItemType Directory -Force .tools/performance-followup/bundle-before | Out-Null
Copy-Item browser-client/dist-play/game.js .tools/performance-followup/bundle-before/game.js
Copy-Item browser-client/dist-play/game.css .tools/performance-followup/bundle-before/game.css
$env:CAPTURE_BROWSER_FIXTURE='.tools/performance-followup/native/native-board.json'
$env:CAPTURE_BUNDLE_DIRECTORY='.tools/performance-followup/bundle-before'
$env:CAPTURE_PROFILE_OUTPUT='.tools/performance-followup/browser-before'
$env:CAPTURE_ARTIFACT_SOURCE='baseline source commit and local modifications'
node browser-client/test/capture-response-profile.mjs
```

After changing the browser, rebuild it, remove `CAPTURE_BUNDLE_DIRECTORY`, update `CAPTURE_ARTIFACT_SOURCE`, set a different `CAPTURE_PROFILE_OUTPUT` and repeat with the same fixture. Set `CAPTURE_ENFORCE_FEEDBACK=true` to enforce the 100 ms per-cohort feedback p95 gate. The script runs three repetitions of Off/Counters/Graph, with one warm-up action and 12 duplicate end-turn acknowledgments per cohort. Authority is held for 300 ms so pending DOM must appear before the response. This exercises the real V2Client/play entry with a generated native board and controlled socket replies; it is not native server RTT evidence.

Each run saves a bounded timing report, screenshots and one Chrome CPU profile. The report identifies the exact served bundle and fixture SHA256, source identity, browser, CPU and viewport. The first Off cohort includes CPU sampling in both compared artifacts. Use `CAPTURE_PROFILE_DEVELOPMENT=true` only for development-code attribution and label those results separately. Use `CAPTURE_HEADED=true` when a foreground browser is required; headless Windows evidence does not replace physical Android acceptance.

Set `CAPTURE_VIEWPORT=1267x682` and `CAPTURE_PIXEL_RATIO=2` to match the source capture's display configuration. The workload records pointerdown-to-feedback, press-to-click and click-to-feedback separately; the original capture's input metric starts at pointerdown. A user's press duration is not React scheduling time. The initial reference comparison in the outcome report used click dispatch and is labelled separately.

Compare the independent cohorts:

```powershell
node tools/diagnostics/compare-browser-workloads.mjs .tools/performance-followup/browser-before/report.json .tools/performance-followup/browser-after/report.json .tools/performance-followup/browser-comparison.md
```

The comparison rejects missing/mismatched cohorts and preserves their independent clocks and percentiles. Its declared gates require visible pending state before the reply, feedback p95 at most 100 ms, and response-presentation p95 no more than baseline plus 20 ms. The latter is a comparison tolerance for this workload, not a general display guarantee. It refuses to overwrite the report. Small cohorts remain unsuitable for stable long-term tail claims.

## Focused regressions and actual local play

```powershell
node browser-client/test/diagnostic-presentation-ui.mjs
node --test tools/test/compare-browser-workloads.test.mjs
node browser-client/test/pending-recovery-ui.mjs
node browser-client/test/reconnect-ui.mjs
```

For an authenticated native smoke, use `browser-client/test/performance-diagnostics-native.mjs` with `COACH_ACCEPTANCE_TOKENS_FILE`, `COACH_ACCEPTANCE_RESUME_FROM` and `COACH_ACCEPTANCE_EVIDENCE` pointing to privately retained synthetic acceptance identities, an active retained synthetic match and a fresh output directory. It performs a real end-turn UI action and exports diagnostics. Never point a mutating workload at a user's match.

Set `COACH_ACCEPTANCE_CPU_PROFILE=1` for one bounded native end-turn CPU profile and browser timeline (20,000-event maximum with an explicit truncation flag). Instrumented traces are attribution evidence and perturb timing; do not mix them with uninstrumented acceptance cohorts.

With the same variables, run `node browser-client/test/capture-authorization-native.mjs` for three native mutation/advisory repetitions inside/outside the existing provider reuse window. It uses durable save proposal/cancel pairs to return the retained synthetic match to ACTIVE status. It requires a live local-dev artifact, authorized synthetic participant identities and an active PLAY match. These native requests supplement the isolated SQL comparison; they do not provide a matched baseline server-artifact comparison.

For checkpoint-only profiling, set `CAPTURE_CHECKPOINT_PAIRS` to an integer from 1 through 24. This mode skips the advisory and provider-window waits, sends that many save proposal/cancel pairs on an ACTIVE synthetic match, and records each result. Restore the normal mode by removing the variable. Bounded JVM startup JFR can profile the unchanged read-only server container without enabling attach privileges; cap duration/size, retain normal heap/security settings and restore the server's non-recording configuration afterwards. Use the host JDK's `jfr` CLI to inspect the copied recording, with sufficient `--stack-depth`; do not accidentally inherit the recording startup flags into a second container JVM.

Opt-in DEV server logs now distinguish `localAuthorizationMs`, `localAuthorizationChecks`, `firebaseReuseHits`, `firebaseLookups`, `recoveryCursorMs` and `recoveryFingerprintMs`. They supplement the existing phase timings without changing the browser wire schema. Match timings by capture-local request correlation; nested phases overlap.
