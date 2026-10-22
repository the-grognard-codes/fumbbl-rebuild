# Smooth gameplay: foreground latency fixes

Implementation continues on `feat/smooth-gameplay`, following the
[foreground trace](smooth-gameplay-foreground-trace.md). The user authorized
necessary performance changes while preserving core BB2025 mechanics.

## Tracked slices

- [#332](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/332): reduce
  recovery encoding and avoid repeated checkpoint work during publication.
- [#333](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/333): coalesce
  obsolete movement guidance and investigate presentation delay.
- [#334](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/334): prevent
  repeated reconstruction of unchanged rejected recovery checkpoints.
- [#335](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/335): correct
  computer setup eligibility after a captured halftime stall.

## Contracts

The native engine determines rules, rolls and legal actions. Accepted outcomes
and their transcript remain durable before acknowledgement. Preserve saved-match
compatibility, exact retries, authorization, replay, reconnect, theme and styles.
No commits, pushes or remote deployment. Physical Android validation remains
with the user. The one dev-local instance is the native validation target.

## Feedback loops and validation manifest

- Growing-history encoding workload: compare exact artifact/digest compatibility
  and encoding cost before/after; native recovery and transcript tests.
- Publication regression: other coach/computer updates must not invoke another
  mutating load/checkpoint after the source action has committed. Initial
  `ActiveMatchPublisherTest` failed with `NeverWantedButInvoked`, reproducing
  that redundant work (`.tools/smooth-gameplay/publication-red.log`).
- Browser guidance: hold a range response while revisions/selections change;
  bound in-flight work and discard stale responses without breaking current UI.
- Focused Java/browser regressions, then required unit/browser/server build
  checks and one fresh dev-local restart. Repeat the headed native trace with
  no concurrent builds/tests. Report separate request/data/presentation timings.

## Implementation

Recovery encoding now serializes the ordered payload once, using that exact
text for both the SHA-256 checksum and envelope. The existing format and UTF-8
size limit remain unchanged. It introduces no history cache or storage migration.

Player/computer publication now authorizes the recipient and reads the committed
resident state without invoking another `load` operation, refreshing preferences,
expiring decisions, or checkpointing again. Released/terminal sessions keep the
existing recovery path. Recipient-specific projections and private computer
information remain separated.

Movement guidance keeps at most one range request in flight and only the latest
unsent selection/revision. Dispatch checks current state again after the React
commit; pending mutations suppress obsolete reads. Valid same-revision guidance
is reused. Superseded replies cannot replace current guidance, real errors remain
visible, and disconnect/unmount disposes queued work. Hidden lobby tabs stop
automatic polling and refresh when visible again. Explicit refresh remains.

## Verification so far

- Encoding regression first failed on two full payload serializations instead of
  one; final encoding/native movement/activation/computer/transcript/checkpoint
  selection passed 43 tests. Exact envelope, all UTF-16 characters and byte-cap
  boundaries are covered.
- Publication/auth/live-transcript/adapter selection passed 56 Java tests.
- Guidance regression first observed four unanswered reads instead of one;
  hidden-lobby regression observed five requests instead of two. Both now pass.
- Browser unit suite: 371 passed, zero failures/skips. Focused range and
  preparation lifecycle interaction scripts plus TypeScript checking passed.
- Full serial browser preflight passed: 46 interaction suites and 10 hosted
  suites, 890.4 seconds. Reports: `.tools/validation/local-browser-1rLBoN`.
  Includes live/replay/reduced-motion/provisional rejection/disconnect/recovery
  checks and hosted actor/spectator history delivery.
- First-iteration server build passed: 175 common tests and 577 server tests,
  zero failures/errors; three existing integration tests were gated/skipped.
  The dev-local proxy authentication/reconnect gate and `/play` smoke check passed.

Independent review of encoding, publication/authorization and browser queue
contracts found no actionable issues. The reviewer did not duplicate test runs.

Paired alternating encoding benchmark (15 samples, identical payload and exact
output comparison): 8.32 MB median 116.4 → 83.4 ms; 16.64 MB median 309.6 →
238.0 ms. Actual native fixture checkpoints restored and re-encoded identically.
This is an encoding microbenchmark, not a live action-latency measurement.
Recovery still materializes the complete bounded artifact; work and memory grow
with history. Evidence: `.tools/checkpoint-encoding/final-paired.txt`.

Logs and follow-up captures: `.tools/smooth-gameplay/latency-followup/`.
No claims of completed smoothness acceptance until the native measurement and
remaining checks are recorded below.

## First native measurement and second iteration

The first follow-up completed 40 human PLAY decisions against the native computer
opponent, with 34 fully correlated foreground mutations. The synthetic match was
ended through the UI afterward; user matches and saved data were retained.
Evidence: `.tools/smooth-gameplay/latency-followup/run/` and `comparison.json`.

Compared with the original trace, mean recovery serialization fell from 398 to
184 ms and publication from 337 to 50 ms. Median request round trip fell from
858 to 704 ms, but the tail worsened: p95 2,836 ms and maximum 3,166 ms. These
are different native games, dice and history lengths, not paired workloads.
Input feedback remained about 21 ms median. Dice/decision presentation after
state availability had only four samples, 208 ms median; this is insufficient
to characterize all dice paths. Frame sampling still included tracing overhead.

The two longest requests waited 2,378 and 2,113 ms in the ordered server queue.
Their queues overlapped consecutive periodic computer `load` operations for
other matches. The initial interpretation was redundant resident-load checkpoint
work. That work was independently reproduced and removed, but the next trace
disproved it as the cause of these particular long loads: they fail during
restoration, before resident-session execution or checkpoint serialization.

The second iteration skips checkpoint construction for unchanged resident loads
while retaining initial recovery normalization and any actual proposal, reaction
or clock maintenance. Movement guidance also stops automatically refreshing a
retained selection on every opponent revision; explicit inspection remains
available, and automatic refresh resumes on the coach's turn. Focused regressions
cover both causes. Final review, full validation and another native trace follow.

Second-iteration independent review found no actionable issues. The read-only
audit covers protocol validation, all restore entry paths, transient skill-use
preferences, proposal expiry, and native reaction/turn-clock changes. The native
load regression initially constructed six full encoders for six unchanged loads;
it now constructs one for the first restore. The focused Java selection passed
39 tests. The opponent-turn UI regression initially made two range reads where
one was expected and now passes. All 371 browser unit tests passed again after
the second-iteration change.

## Second native measurement: remaining recovery retry stalls

The second iteration passed the complete browser preflight again: 46 interaction
suites and 10 hosted suites (875.8 seconds), reports in
`.tools/validation/local-browser-GiDapa`. The server build passed 758 tests
(175 common, 583 server), with three existing gated skips and no failures/errors.
Proxy initial/reconnect authentication checks and the `/play` smoke check passed.

The next native run completed 40 human decisions, 34 fully correlated foreground
mutations, and post-measurement reconnect/convergence. Synthetic match cleanup
passed. Evidence: `.tools/smooth-gameplay/latency-followup/run2/`.

- Movement-range requests: 31 accepted, zero stale, compared with 35 accepted and
  71 stale in the preceding run. Different boards/actions prevent a paired claim.
- Median round trip: 606 ms; p95 2,664 ms; maximum 2,750 ms. The long tail remains
  unacceptable despite a lower median.
- Input feedback: 16.7 ms median. First observed movement: 39.3 ms median over
  19 correlated moves. Four decision-after-data samples: 202.9 ms median.
- All 18 measured setup loads had zero checkpoint serialization, verifying the
  new fast path. Two foreground requests still waited 2,129–2,139 ms behind
  consecutive computer loads taking roughly 1.1–1.4 seconds each.

The computer service log identifies repeated `RECOVERY_CORRUPT` failures for two
older saved matches. Those requests never reach the measured session/checkpoint
phases. The daemon retries them, and each attempt reconstructs the same rejected
checkpoint on the shared worker. This corrects the earlier resident-load
interpretation; no saved match will be deleted or altered to mask it.

The third iteration bounds a cache of deterministic failed restorations by match
and durable generation. It checks generation metadata before repeating an old
failure; a changed or missing generation retries the normal path. Authorization,
transient SQL failures and capacity errors are not cached. Legitimate checkpoint
replacement uses the existing CAS contract and increments generation. Manual
same-generation database edits require a server restart to discard this cache.
The regression initially performed four validations for four rejected requests;
it now performs one validation and one full artifact fetch across repeated coach,
spectator and chat reads. Focused validation passed 71 tests: the nine selectors
below. Independent review found no actionable issues, including lifecycle,
authorization, administrative access and metadata-race behavior. The mandatory
local preflight, full server build and a fresh native trace are underway.

```text
SetupApplicationRecoveryFailureTest,JdbcRecoveryRepositoryTest,BrowserRequestTimingTest,
SetupApplicationReadOnlyLoadTest,SetupApplicationCheckpointTest,
SetupApplicationSkillUsePreferencesTest,ReactiveSkillDecisionTest,
ComputerPolicyRecoveryTest,ActiveMatchPublisherTest
```

The command uses Maven `-pl ffb-server -am -Dtest=<selectors above>
-Dsurefire.failIfNoSpecifiedTests=false test`, with the repository settings and
JDK 21. Diagnostics now report `recoveryRestoreMs` separately, including failed
restores and metadata-only retries; payloads and saved-state contents remain
excluded from timing output.

## Third iteration validation and newly captured setup stall

The full browser preflight passed again: 46 interaction suites, 10 hosted suites,
946.8 seconds, `.tools/validation/local-browser-kPL9Tq`. Server build: 175 common
tests and 593 server tests passed, three existing gated skips, no failures/errors.
The skipped tests are `SkillUsePreferenceSchemaIntegrationTest`, one case in
`Marker6SchemaTest`, and `V2PreparationJdbcTest`. Proxy initial/reconnect
authentication and `/play` smoke checks passed. `git diff --check` passed.

The third native capture is **failed acceptance evidence**, retained in `run3/`.
It collected 22 correlated foreground mutations before timing out waiting for
the computer in second-half setup (revision 273, half 2, drive 3). There were no
projection errors. The computer repeatedly received `ILLEGAL_PLACEMENT`, exited,
and retried the same placement. Synthetic match cleanup succeeded.

Its completed requests still establish that recovery retry cost fell: 22 setup
loads averaged 70.9 ms (54.2 ms median, 214.3 ms maximum), with restore work at
most 17.3 ms. Foreground queue wait was at most 108.1 ms, compared with 2,139 ms
in the prior run. Those completed mutation responses averaged 692 ms and were
all below 985 ms. This truncated, different game is not a clean before/after
acceptance comparison, and the later computer stall must not be omitted.

The captured setup contains a badly hurt away player with `offPitch: casualty`.
The random computer's eligibility check uses injury text and misses that case.
Issue #335 covers the captured-state regression and policy correction; native
BB2025 placement legality remains unchanged.

## Final implementation and verification

The random computer now uses the explicit off-pitch category when deciding who
can be placed. The captured regression first failed with `Cannot place has been
badly hurt from casualty`. Both computer policies now reach confirmation with
ten eligible players and three on the line, leaving the casualty out. Category
and legacy-description regressions also pass. This is a computer choice fix;
the native `STANDING`/`RESERVE` placement rule is unchanged.

`npm.cmd test` in `computer-player` passed all 39 policy/transport/daemon tests.
The first sandbox run encountered Windows `Get-CimInstance` access denial; the
authorized host rerun passed. No game-server or browser production code changed
after their final full build/preflight. The final native runs use newly spawned
computer clients with the corrected policy; manifests include its source hash.
Self-review found no further issue. User-facing change-list entries were added.

Two final foreground captures completed 40 human PLAY decisions each, with 34
fully correlated mutations each (initial route/reload boundaries account for
the remaining decisions). All 34 sends and responses in each capture were
visible and focused. Native lifecycle, route-preview reconnect and final
participant convergence passed. `light` also asserts successful second-half
setup/kickoff and reached second-half PLAY. These are bounded workloads, not
full-match acceptance.

| Measurement (ms) | Earlier follow-up `run` | Final full trace `run4` | Lighter control `light` |
| --- | ---: | ---: | ---: |
| Request round trip, mean | 861 | 664 | 574 |
| Request round trip, median | 704 | 608 | 574 |
| Request round trip, p95 | 2,836 | 924 | 790 |
| Request round trip, maximum | 3,166 | 1,020 | 797 |
| Foreground queue wait, maximum | 2,378 | 111 | 230 |
| Sampled load handling, mean | 768 | 88 | 82 |
| Recovery serialization, mean per mutation | 184 | 165 | 125 |
| Publication, mean per mutation | 50 | 44 | 40 |

These are different native games with different dice, actions and history sizes.
The lighter control also omits CPU profiling and the geometry observer. They
are not paired benchmarks or proof of a particular percentage improvement.
The targeted regressions separately establish removal of redundant work.
Compared with the original pre-fix trace, mean recovery encoding was 398 ms and
publication 337 ms; those original values also came from a different game.

Final full-trace input feedback was 19.6 ms median (36.5 ms p95). First observed
movement was 32.7 ms median across 23 correlated moves, with 710 ms p95: activation
and roll-boundary moves still wait for authority. Three decision/dice presentation
samples appeared 198 ms median after state data, insufficient to characterize all
dice paths. Request, data availability and presentation are not interchangeable.

The lighter control sampled 9,811 active frame intervals: median 8.0 ms, p95
18.8 ms, ten above 50 ms and one above 100 ms (maximum 162.5 ms). The full profiler
run sampled 7,938 intervals, p95 23.3 ms and maximum 331 ms. Automation, navigation
and occasional screenshots remain in these harnesses; rAF is a presentation
opportunity, not physical display latency. These numbers do not certify flawless
frame pacing or diagnose GPU hardware. No stale range responses occurred in
either final capture (36 and 33 accepted range requests respectively).

The multi-second recovery retry stalls did not recur. Typical confirmation is
still about 0.6 seconds. In the lighter run, nested mean spans were 233 ms for
checkpointing, 142 ms for authorization (including 102 ms Firebase lookup), and
50 ms for native session work. Do not add nested spans. Local hosting still uses
Firebase and synchronous durable checkpoints; a dedicated GPU cannot eliminate
those waits. Further reductions would need to address those remaining measured
costs. Perfect smoothness remains a visual acceptance question, not a claim here.

All synthetic matches were ended without changing user matches. The lighter
capture's initial post-measurement cleanup timed out during a computer turn;
a separate pointer confirmation then hit the animated button's stability check.
Keyboard confirmation on the stable human turn succeeded (`light/cleanup-retry.json`,
FULL_TIME revision 322). The original timeout evidence is retained.

Final environment check: one healthy review game server/database, one computer
daemon, one Hosting process, no Vite processes, and `/play` returned HTTP 200.
The single instance is at <http://localhost:5000/play>. Working branch remains
`feat/smooth-gameplay`; no changes were staged, committed or pushed. Physical
Android testing remains with the user. Two older saved matches still reject
recovery; this work isolates their repeated failures and does not repair or
discard their data.

Evidence: `.tools/smooth-gameplay/latency-followup/final-comparison.json`, `run4/`,
`light/`, their manifests and `restart-recovery.log`. Earlier failed/intermediate
captures remain separately named. Token files are credential material and must
not be included in shared evidence. The diagnosis lesson is to distinguish failed
restoration from resident loading before attributing all slow `load` operations
to checkpoint serialization.
