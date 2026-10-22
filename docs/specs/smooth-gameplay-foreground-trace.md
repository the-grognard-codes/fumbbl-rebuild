# Foreground native gameplay trace

2026-10-21 · `feat/smooth-gameplay` · [#326](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/326)

Results recorded in the [performance issue update](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/326#issuecomment-6326103633)
and parent #324; issues remain open pending acceptance.

Long action waits were reproduced on the current dev-local build. The largest
measured costs are checkpoint construction/serialization and contention on the
ordered server worker. Browser frame pacing also misses the smoothness target
in some intervals. Graphics complexity does not explain the server costs.

## Conditions and validity

Windows, Chrome 155.0.8059.85, headed browser, 1920 × 1080 viewport, native engine,
real DEV Firebase authentication, localhost Hosting/nginx/MariaDB, no artificial
network throttling. One visible human client against Gobbo's random computer
policy. Temporary observer pages closed before measured play. No builds or
test suites ran concurrently. Existing background service/lobby traffic was not
disabled; its contention is part of the observed environment.

| Segment | Human decisions | Fully correlated foreground mutations | Trace duration | Lifecycle result |
| --- | ---: | ---: | ---: | --- |
| Main | 40 | 33 | 197.489 s | Measurement completed; final assertion caught three diagnostic initializer errors on blank startup pages. |
| Continuation | 12 | 12 | 18.625 s | Clean measured segment; optional later visual routine tried to control the computer's side. |
| Verification | 4 | 4 | 8.654 s | Entire repaired lifecycle passed, including post-measurement reconnect. |

All 49 correlated mutations were visible and focused at both send and reply.
Seven main-run decisions lack independent buffered-wire correlation across the
route/reload boundary and are excluded from the primary metrics. The first two
harness exits were failures, not passing full acceptance runs. Their stopped
measurements are preserved separately. Blank-page initialization and optional
post-capture continuation were repaired before verification. A prior chat check
failed before measurement when the opening dialog intercepted Send; it supplies
no performance evidence. These are bounded diagnostic segments, not a controlled
before/after comparison or full-match acceptance.

Retries resumed the same synthetic-account match. It was ended by UI concession
after the last measurement, with authoritative `FULL_TIME` confirmed. User matches
were unchanged. A pause request after the main segment did not reach SUSPENDED;
that pending proposal was cancelled before continuing the same test match.

## Action latency

Main segment, 33 matched PLAY mutations; all values in milliseconds:

| Boundary / phase | Mean | Median | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Input → visible feedback opportunity | 22.4 | 23.9 | 38.7 | 40.3 |
| Browser mutation round trip | 859.6 | 857.8 | 1230.6 | 1251.9 |
| Server queue wait | 84.4 | 0.2 | 344.7 | 372.3 |
| Session apply | 109.5 | 99.1 | 199.7 | 266.5 |
| Checkpoint | 567.7 | 453.2 | 1013.1 | 1041.0 |
| Recovery serialization | 398.0 | 301.5 | 743.0 | 799.0 |
| Checkpoint SQL | 40.6 | 38.7 | 57.2 | 98.5 |
| Authorization | 177.2 | 175.0 | 222.9 | 249.5 |
| Viewer publication | 337.0 | 308.4 | 556.8 | 601.9 |

Spans nest; do not add rows. Serialization/SQL are within checkpoint, and
authorization can overlap other phases. Actor acknowledgement precedes completion
of publication: publication can delay the next request without adding its entire
duration to the actor's RTT. Session apply is not a pure native-rules benchmark.
Feedback, geometry and rAF measure presentation opportunities, not physical pixels.

The 12-decision continuation had median RTT 827.5 ms, mean checkpoint 700.8 ms,
and mean recovery serialization 484.1 ms. The four-decision verification had
median RTT 917.5 ms, mean checkpoint 870.8 ms and mean serialization 616.9 ms.
These small continuations confirm substantial costs, not reliable tail estimates.

Among the main segment's movement requests, serialization averaged 250.2 ms in
the first seven and 583.5 ms in the last seven. Growing history is an optimization
lead consistent with full recovery-artifact serialization; changing board/native
context prevents attributing the entire difference solely to history length.
Local SQL is substantially shorter than total checkpoint work.

## Queue contention and obsolete reads

| Main-segment request | Count | Median RTT | p95 RTT | Maximum RTT | Mean queue wait |
| --- | ---: | ---: | ---: | ---: | ---: |
| Movement range | 93 | 1201.7 ms | 2173.1 ms | 4049.1 ms | 923.7 ms |
| Movement preview | 53 | 659.8 ms | 1566.2 ms | 1823.6 ms | 494.6 ms |

**57 of 93 movement-range reads returned `STALE_REVISION`; 36 were accepted.**
All 53 previews were accepted. Obsolete reads still occupied the request path.

Directly correlated examples:

- A 1182.2 ms action spent 372.3 ms queued. Its queue interval overlapped about
  65 ms of an earlier action's tail and 306 ms of a movement-range read.
- A 1420.6 ms verification action spent 501.1 ms behind a `currentMatches` read
  outside the captured foreground client.
- A 1230.6 ms movement had almost no queue wait, 1041.0 ms checkpoint work and
  799.0 ms recovery serialization. No browser long task or frame gap above
  50 ms overlapped its request-to-reply interval.

Expensive mutations and head-of-line blocking both occur. Main-segment Firebase
provider lookups averaged 124.5 ms; localhost Hosting does not make Auth local.
The evidence does not justify weakening authorization or durability.

## Presentation still needs work

Main segment: 11,254 visible/focused frame intervals, median 11.6 ms, p95
22.3 ms, maximum 272.7 ms; 34 exceeded 50 ms, three exceeded 100 ms. Four
observed long tasks reached 85 ms. Continuation frame p95 was 27.0 ms, maximum
137.0 ms; verification p95 was 36.6 ms, maximum 144.3 ms. Different workloads
and small samples prevent interpreting those differences as a time trend.

Five continuation decisions appeared a median 209.3 ms after state receipt,
maximum 245.2 ms. Frontend scheduling/presentation still needs attention after
server latency is reduced. Main-segment request-to-first-movement opportunity
had median 36.7 ms across 21 movements, but p95 906.3 ms: safe provisional
travel does not hide every authoritative roll/activation boundary.

Chrome timelines contain CPU, layout, paint and layer activity. The observers
use DOM queries/geometry reads, and profiling adds overhead. The capture does
not assign every frame gap to a product function, establish physical FPS, or
verify GPU acceleration. It does establish second-scale action waits without
corresponding second-scale browser stalls.

## Next implementation slices

1. Reduce full checkpoint serialization/materialization on the mutation path,
   preserving checkpoint-before-ack and recovery/replay guarantees. Establish a
   growing-history regression workload before choosing codec/storage changes;
   an incremental storage migration needs a separate design review.
2. Coalesce/cancel obsolete range/preview work and prevent lobby/viewer work
   from blocking gameplay. Preserve access checks and native decision ordering;
   do not simply parallelize engine execution.
3. Reduce remaining decision-presentation delay and frame gaps, with a lighter
   observer/control run that separates rendering from data waits.

## Changes and verification

Opt-in server timing now includes validated loads/allowlisted reads, UTC handling
boundaries, request type and publication spans. It retains no payloads, accounts,
match IDs or credentials. Diagnostic clock/output failures cannot change request
outcomes. `DEV_LOCAL_GAMEPLAY_TIMING=true` enables it; compose defaults false.
Timing remains enabled on the running local instance for follow-up investigation.
No browser production code changed for this trace.

Checks run:

- The read-only timing regression first failed, then **63 focused Java tests**
  passed: `BrowserRequestTimingTest`, `ActiveMatchPublisherTest`,
  `BrowserMatchTransportTest`, `BrowserV2AdapterTest`,
  `BrowserV2LiveTranscriptTest`, `BrowserV2RouteTest`.
- Standard dev-local restart with `FFB_BROWSER_TEST_WORKERS=1` and
  `DEV_LOCAL_GAMEPLAY_TIMING=true`: **46 interaction suites and 10 hosted suites**
  passed. Reports: `.tools/validation/local-browser-3EX4Fr`; 943.4 seconds.
- Full Docker JDK 21 Maven build: common 175 passed; server 573 reported,
  570 passed and three unchanged gated integration skips. **745 passed, zero
  failures/errors**. Skips: `SkillUsePreferenceSchemaIntegrationTest`, one
  `Marker6SchemaTest` case, `V2PreparationJdbcTest`.
- Diagnostic harness checks passed for preview/state/long-task collection, CPU
  samples, clock mapping, blank-page startup and credential/state exclusion.
- Final four-decision headed native lifecycle passed: valid projections, no
  runtime exceptions, post-measurement reconnect/convergence and synthetic cleanup.
  Inspected `run/performance-home.png`: native pitch and follow-up decision render
  with the existing theme; the snapshot does not establish animation smoothness.
- Proxy initial/reconnect authentication gate test passed; final `/play` HTTP
  status 200. Only the match-review server/database run in Docker, both healthy.
- `git diff --check` passed. No commits/pushes, database deletions or unrelated
  edits reverted. This trace does not complete overall performance acceptance.

## Evidence

Local directory: `.tools/smooth-gameplay/foreground-trace/`.

- `summary.json`: per-segment metrics and slow examples.
- Measured segment directories: `run-with-startup-diagnostic-errors`,
  `run-clean-measurement-postcapture-failure`, and final passing `run`.
- Each segment has `correlated.json`, `performance.json`, sanitized
  `foreground-events.json`, `server-timing.log`, and Chrome-importable
  `timeline.json`.
- `run/measurement.json` and `run/cleanup.json` confirm verification and cleanup.
  Manifests hash the local driver, browser bundles and server image;
  `restart.log` records full preflight and build results.

`coach-tokens.json` is short-lived credential material, **not a shareable trace
artifact**. Do not package the whole directory. Timelines exclude network bodies,
screenshots and page-supplied user timing strings. Physical tablet and full-match
acceptance remain open.
