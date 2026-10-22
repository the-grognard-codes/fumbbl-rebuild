# Smooth gameplay delivery

Parent: [#324](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/324).
Branch: `feat/smooth-gameplay`, base `b73f7ad8f`.

The user's subsequent recording exposed frequent normal-play synchronization
waits. The [recording follow-up](smooth-gameplay-video-followup.md) documents the
data-before-state delivery correction and its newer validation; the original
workload figures below predate that correction.

The [second recording review](smooth-gameplay-second-video-review.md) separates
remaining action waits, visible decision boundaries and rendering evidence. It
does not claim an exact cause without a correlated trace of that run.

The subsequent [foreground native trace](smooth-gameplay-foreground-trace.md)
reproduced long waits and identified substantial checkpoint serialization and
shared-worker read contention, alongside presentation/frame outliers. It records
segment validity, exact checks and sanitized artifact locations.

The [latency implementation follow-up](smooth-gameplay-latency-followup.md)
records subsequent encoding, publication, guidance and recovery-retry fixes,
including unsuccessful intermediate measurements and the latest validation.
The newer [durable journal and scheduling follow-up](gameplay-latency-journal.md)
records the approved persistence, authentication and queue changes, their
validation, and current measurement status. Use that record for the latest
implementation status; the earlier reports retain their original measurements.

Implementation and functional validation are ready for review. **Performance
acceptance remains open:** the provisional 100 ms visible-presentation ceiling
was not met consistently in the native Windows workload. The unresolved evidence
is described below; passing functional tests is not a performance sign-off.

## Acceptance scope

Windows is the automated performance and visual acceptance platform. The user
will perform physical Lenovo Android tablet validation afterward (confirmed
2026-10-21). [#330](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/330)
remains open for that evidence. Mobile emulation is correctness coverage only.

## Work slices

| Issue | Deliverable | State |
| --- | --- | --- |
| [#326](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/326) | Current V2 timing baseline and repeatable measurements | Baseline and two complete post-change captures retained; limitations documented |
| [#327](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/327) | Prompt durable event delivery | Implemented; independent review and final server build passed |
| [#328](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/328) | Continuous playback and bounded provisional movement | Implemented and reviewed; functional tests pass, rendering tail remains unresolved |
| [#330](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/330) | Windows and physical Android acceptance | Windows functional/visual checks pass; performance gate open; tablet deferred by user |

## Affected-test manifest

- Server timing unit tests and transport/application correlation tests.
- Native movement, route interruption, transcript, projection, retry and recovery tests.
- Browser timing observer tests; protocol and movement/playback unit tests.
- Browser interaction: playback, movement flow, movement interruptions, dice,
  reconnect, hosted replay and reactive decisions.
- Browser unit suite and both browser builds.
- Maven server/common build and tests under the repository's actual server JDK 21 requirement.
- Real V2 browser workload: pre/post timing distributions and visual evidence,
  with explicit limitations on sampling and browser paint-opportunity timestamps.

## Initial verification

- `node test/playback-ui.mjs` (browser-client): passed on unchanged playback,
  including ordered moves, dice, interrupted decisions, seeks, recovery and reduced motion.
- Isolated acceptance Docker baseline server/common build and tests: passed.
- `node tools/coach-match-acceptance.mjs --start-browser`: passed, including
  browser typecheck, production play build and local hosting assembly.

No code has been staged, committed, pushed, or deployed remotely.

## Baseline findings

The successful baseline uses the unchanged gameplay bundle with observation-only
attributes, instrumented server, and 40 real V2 PLAY decisions. It ran in headless
Chrome 155 on Windows 10.0.26300, AMD Ryzen 7 260 (16 logical processors), 16 GB
RAM, localhost without network throttling. Other task builds/tests were paused
during this capture; the host is not a dedicated performance machine.

| Browser measurement | Samples | Mean ms | p95 ms |
| --- | ---: | ---: | ---: |
| Mutation send to authoritative reply | 40 | 747.3 | 1097.4 |
| Reply to matching transcript availability | 40 | 690.3 | 839.8 |
| Input to visible pending feedback | 40 | 21.3 | 35.3 |
| Movement request to presentation opportunity | 18 | 1254.5 | 1496.5 |
| Movement reply to presentation opportunity | 19 | 628.2 | 762.1 |
| Dice data to presentation opportunity | 8 | 107.4 | 252.8 |

The movement-reply cohort includes a push. One queued route and two block commits
are insufficient to establish reliable tail-latency thresholds for those
categories. Frame intervals: 4,977 samples, mean 29.85 ms, p95 48.7 ms, maximum
108.2 ms; 214 intervals exceeded 50 ms and three exceeded 100 ms. These are
requestAnimationFrame and visible-DOM observations, not GPU or physical-display
latency. A negative transcript-to-presentation interval means the old bounded
snapshot fallback appeared before its late transcript, not provisional movement.

Backend timings distinguish reply delivery from completion of viewer publication:
the actor receives its reply before peer/spectator work finishes on the shared
protocol worker. A following transcript request queues behind that work.
Baseline joined setup spans averaged 193 ms queue wait, 37 ms session apply,
254 ms checkpoint, and 800 ms other handling. Session apply includes native
execution and reply construction; it is not a pure engine benchmark. Do not add
overlapping spans or equate full server handling with actor RTT.

Acceptance persistence is local MariaDB through `JdbcRecoveryRepository`.
Firebase lifecycle verification calls remote Firebase Auth; initial browser
sign-in and occasional ADC OAuth token refresh also use remote services.

Raw baseline: `.tools/smooth-gameplay/baseline/performance.json`,
`server-timing.jsonl`, `server-correlated.json`, `measurement.json` and
`native-route-sample.json`. The latter successful synthetic three-square route
is retained as `browser-client/test/fixtures/smooth-gameplay-route.json` for
regression coverage. These samples report observed latency, not a 100 ms RTT
promise.

## Browser implementation and review

- Restored position interpolation disabled by the later projected-pitch CSS rule.
  Memoized stadium surfaces with stable camera/theme inputs and stopped repeated
  ResizeObserver attachment. Camera, theme, fallback artwork and crowd behavior
  remain responsive to their own changes.
- Playback provides animation duration to live/replay markers and ball highlights;
  long routes/backlogs and required decisions accelerate. Reduced motion, replay
  speed, skip/seek and recovery remain explicit.
- Safe provisional movement requires a matching preview and an already active
  player. Route forecasts omit activation rolls, so new activations wait for the
  server. Prediction stops before any square-entry check or reaction. Rejected,
  divergent or disconnected requests restore the authoritative snapshot.
- Accepted motion consumes only the shown prefix. Native ball state for that
  prefix reconciles once at its endpoint; later events retain their order.
- The existing transcript read is queued immediately behind an action/route/
  movement mutation on the same ordered socket. It does not submit another
  mutation or change the wire schema. Normal pagination, gap and error handling
  remain available.
- Independent review identified and fixed duplicate response-roll animation,
  a synchronization indicator left on at full time, and carried-ball rewind
  during provisional confirmation. Hook tests assert intermediate states.
- The first post-change native workload exposed another avoidable wait:
  ordinary rolls following movement waited for the full 140 ms animation.
  Live playback now reveals immediately following authoritative dice after the
  board update commits, while retaining the complete movement interval before
  the next board update or completion. Replay keeps its existing timing.
  Frozen-clock tests cover intermediate squares, end-of-record duration,
  cancellation and single presentation; independent review approved the change.
- The next native capture identified `move → unchanged block context → dice`.
  The drain now skips only context events that make no change, preserving actual
  context, ball and movement ordering. It also identified an uphill block whose
  authoritative faces already existed in state choices. Complete, strictly
  indexed `blockDie` choices now supply live faces while history is in flight;
  partial reroll sets and unsupported labels are rejected. Late history does
  not animate the same roll again. Opponent and spectator viewing and reconnect
  are covered; clickable choices still use the existing authorization filters.

The first motion reproducer failed with zero intermediate screen positions.
After the CSS and stadium change it observed 14. Under concurrent full-suite
and server-build load it also exposed long frame stalls; final motion/performance
validation runs without that concurrent load. The fixture and real-game home,
away and spectator screenshots were inspected for pitch/camera/theme preservation.
The native reaction screenshot also preserves readable response controls and
game-log dice. The last complete timing capture predates the two final native
edge-case corrections; those corrections received focused regression validation.

## Intermediate post-change measurement

The first complete post-change workload also captured 40 accepted PLAY requests
and passed native reload/participant convergence. The raw result is retained
under `.tools/smooth-gameplay/post-fix/`; it predates the final live dice correction.
Random native outcomes changed category counts, so these are comparable workloads,
not identical scripted outcomes.

| Measurement | Baseline mean / p95 ms | Intermediate mean / p95 ms |
| --- | ---: | ---: |
| Input to visible pending feedback | 21.3 / 35.3 | 18.7 / 32.1 |
| Mutation round trip | 747.3 / 1097.4 | 559.1 / 873.6 |
| Reply to matching transcript | 690.3 / 839.8 | 556.8 / 602.2 |
| Safe zero-check movement request to DOM presentation opportunity | 1291.3 / 1496.5 (15) | 17.6 / 19.0 (9) |
| Dice data to presentation opportunity | 107.4 / 252.8 (8) | 83.7 / 202.7 (15) |

New screen-geometry observations were available only in the post-change capture:
nine safe provisional moves averaged 52.7 ms from input, p95/max 110.9 ms. That
slow move updated DOM coordinates at 11 ms and had an animation-frame opportunity
at 18 ms, but measurable geometry changed later. No nearby recorded frame interval
exceeded 50 ms. The initial trace cannot distinguish transition startup from its
geometry threshold; the final observer retains bounded frame-by-frame movement
and excludes unrelated source-player changes from correlation.

All seven mandatory decisions appeared within 38.8 ms after their state arrived;
the two initial block faces appeared within 33.3 ms. Ordinary roll-boundary tails
around 200 ms exposed the 140 ms animation wait corrected above. These small
cohorts are diagnostic evidence, not universal tail guarantees.

Frame intervals over 50 ms fell from 214/4977 (4.3%) to 82/4490 (1.8%); p95
fell from 48.7 to 44.5 ms. Forty joined post-change gameplay requests averaged
218.5 ms server queue wait, 14.1 ms session apply, 194.4 ms checkpoint and
354.4 ms authorization. Local SQL averaged 24.4 ms, storage encoding 23.1 ms,
and recovery serialization 114.8 ms. These nested spans must not be added;
authorization also covers peer/spectator publication after the actor reply.

## Last complete Windows workload and remaining limits

`.tools/smooth-gameplay/post-final/` retains the second fresh 40-decision capture,
its `comparison.json`, exact-request server spans, raw motion samples, screenshots
and `slow-native-records.json`. Native reload and participant convergence passed.
An additional eight offered actions sought screenshots only after metrics froze;
they are excluded from the performance workload. The local final bundle contains
the subsequent no-op-context and state-derived block-face corrections, verified
by regression tests rather than a third full workload capture.

| Measurement | n | Mean ms | Median ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Input to visible pending feedback | 40 | 20.6 | 20.3 | 31.5 | 51.8 |
| Actor request round trip | 40 | 574.1 | 472.3 | 909.8 | 1027.0 |
| Reply to matching transcript | 40 | 542.9 | 521.2 | 621.0 | 1292.3 |
| State to mandatory-decision presentation | 8 | 32.9 | 33.0 | 45.7 | 45.7 |
| Safe provisional move to DOM presentation opportunity | 9 | 22.2 | 22.2 | 26.2 | 26.2 |
| Safe provisional move input to measured screen geometry | 9 | 206.9 | 132.4 | 881.5 | 881.5 |
| Dice-data to presentation, mixed rolls | 15 | 89.4 | 34.1 | 565.6 | 565.6 |
| Initial block faces, after data | 2 | 42.5 | 34.1 | 50.8 | 50.8 |

The actor RTT mean improved about 23% and median about 24% from baseline. Local
SQL averaged 24.5 ms (p95 31.8 ms), session apply 12.9 ms (p95 34.2 ms), queue
wait 220.7 ms (p95 537.2 ms), and checkpoint 209.9 ms (p95 352.5 ms). Remote
Firebase verification and serialized publication remain material costs. Full
mean/median/p95/max distributions are retained in `comparison.json`; nested
spans and post-ack publication are not additive actor latency.

Two slow dice traces led to the final corrections: revision 74 waited 190 ms
after transcript because of the unchanged context event; revision 61 waited
565.6 ms after already-available block faces, including 499.9 ms waiting for
history. Tests now reproduce and protect both cases. Those last two fixes have
**not** established a new native-workload dice p95.

The screen-geometry gate remains unresolved. The slowest safe move coincided
with an 831.6 ms animation-frame gap. Other sampled moves updated their target
coordinates promptly but retained old computed CSS positions for approximately
100 ms before interpolating; the camera did not move. The complete final frame
sample had n=4263, mean 29.6 ms, median 30.9 ms, p95 48.0 ms, maximum 1328 ms,
160 intervals above 50 ms and eight above 100 ms. Expanded per-frame geometry
sampling can itself affect timing, so this is not a controlled rendering
comparison with baseline. It establishes that DOM updates alone cannot certify
smooth visible motion.

A final bounded isolation experiment used the retained native board in the
existing playback harness at 1920×1080, two warmups and twelve measured moves
per page, with minimal in-page sampling and no per-frame automation callbacks.
One page showed first movement at median 66.8 ms, maximum 80.2 ms; three pages
(36 moves) showed median 84.6 ms, maximum 106.1 ms. Commit-to-screen medians were
27.1 versus 37.6 ms, maxima 33.2 versus 55.3 ms. Each transition retained its
140 ms duration. Initial old computed positions coincided with an animation
whose start time was not yet assigned; geometry moved when that clock started.
The 831.6 ms gap did not recur (maximum gaps 32.4/49.9 ms). This supports viewer
and rendering-scheduler contention rather than a persistent >100 ms single-page
CSS delay. It does not isolate observer overhead or explain every native tail.
Evidence: `.tools/smooth-gameplay/rendering-isolation/{report,analysis}.json`.
These are controlled fixture results, not new live-workload acceptance numbers.

Accordingly, input-feedback and observed mandatory-decision targets passed;
universal visible-presentation, full-match and physical-tablet acceptance did
not. Remaining tails stay tracked in #328/#330. No unsupported rendering change
was made solely to force a timing assertion to pass.

## Validation

- `npm.cmd test` in `browser-client`: final 363 passing tests, zero failures/skips,
  including existing client mutation/retry coverage and the timing-summary unit test.
- `npx.cmd tsc --noEmit`: passing after the latest browser source changes.
- `npm.cmd run build` and `npm.cmd run build:play`: passing; final local-dev
  hosting assembly passed after the last browser source change.
- `node browser-client/test/provisional-movement-ui.mjs`: passing including
  prefix/confirmation, duplicate, rejection, disconnect, divergence, missing
  history/full time, carried ball and single response-roll checks.
- `node --test --test-name-pattern 'hosted history read' site/test/play-browser.test.mjs`:
  five passing assertions/subtests covering pipelining, acknowledgement lock,
  rejection, duplicate and gap recovery.
- `node tools/validation/browser-suites.mjs --family interaction --shard N
  --report-directory .tools/smooth-gameplay/validation`, N=1,2,3: all 29 suites
  passed. Shard 4 passed its first 12 suites, then the new motion test exposed an
  evidence path that assumed the browser-client working directory. After fixing
  resolution from the test file, the remaining five scripts passed individually:
  `playback-motion-ui.mjs`, `provisional-movement-ui.mjs`, `teammate-ui.mjs`,
  `manual-reroll-ui.mjs`, `route-check-ui.mjs`. All 46 interaction suites passed
  across those runs; there is no fabricated all-green shard-4 JSON report.
- `node tools/validation/browser-suites.mjs --family hosted --report-directory
  .tools/smooth-gameplay/validation`: all 10 suites / 25 reported tests passed.
  Focused observer/history checks passed again after adding screen-geometry
  measurements; the ordinary unit suite does not require a browser installation.
- `node browser-client/test/reconnect-ui.mjs` and
  `node browser-client/test/pending-recovery-ui.mjs`: passed.
- After the final dice scheduling correction: all 362 unit tests, typecheck and
  standard build, `provisional-movement-ui.mjs`, `playback-ui.mjs` (including
  dice stream timing), `reconnect-ui.mjs` and `pending-recovery-ui.mjs` passed
  again. Evidence: `.tools/smooth-gameplay/final-*.log`.
- After the two native edge-case corrections: 363 unit tests, typecheck/build,
  `provisional-movement-ui.mjs`, `playback-ui.mjs`, final play build/local
  assembly and seven focused hosted observer/history checks passed. Evidence:
  `.tools/smooth-gameplay/final-native-fixes-*.log` and the final assembly logs.
- The final native fixes also passed `reroll-choices-ui.mjs`,
  `reroll-readiness-ui.mjs`, `block-visibility-ui.mjs`, `dice-ui.mjs`,
  `manual-reroll-ui.mjs` and `route-check-ui.mjs`. The last isolated
  `playback-motion-ui.mjs` run observed 15 intermediate browser frames.
- Focused frozen-clock checks using the retained native revisions 61/74 passed:
  uphill faces render while history is withheld, and pickup dice render across
  the unchanged context event before the movement hold completes. Revision 74's
  native stream is unchanged; preceding coordinates and revision 61's canonical
  state options are explicitly derived fixture setup, not an additional native
  timing benchmark. Evidence and inspected screenshots:
  `.tools/smooth-gameplay/latest-native-fixes/native-tail-check.json`.
- Final isolated `node browser-client/test/playback-motion-ui.mjs`: passed with
  16 intermediate screen positions and first sampled frame at 20.6 ms. Earlier
  concurrent heavy-test/build runs stalled; performance conclusions use the
  dedicated quiet capture, not those loaded runs.
- Final Docker server/common build: 175 common and 550 server tests,
  zero failures/errors, three existing gated skips. Before that full build,
  the focused Java 21 Maven selection passed all 70 tests.
  Evidence: `.tools/smooth-gameplay/server-final-build.log`.

The final server build was invoked with
`ACCEPTANCE_GAMEPLAY_TIMING=true ACCEPTANCE_AUTH_DIAGNOSTICS=true`
and `node tools/acceptance-local-server.mjs --start --resume-identities
.tools/coach-oriented-match-ui/coach-tokens.json`; its Docker build runs
`mvn -B -ntp -pl ffb-server -am package`. The focused Java 21 Maven run used
`-pl ffb-server -am -Dsurefire.failIfNoSpecifiedTests=false test` with selectors
`RequestFirebaseVerificationTest,SetupApplicationCheckpointTest,BrowserRequestTimingTest,BrowserMatchTransportTest,BrowserMatchSocketTest,FirebaseV2PrincipalAuthenticatorTest,V2MatchAccessTest,SetupApplicationSkillUsePreferencesTest,ReactiveSkillDecisionTest,JdbcRecoveryRepositoryTest`.

## Server implementation and review

Firebase lifecycle verification now reuses successful provider results only
within one transport request, with a 32-identity bound and keys covering the
verifier and authentication claims. Local account, permissions and expiry
checks still run on every authorization call. There is no cross-request cache.

Durable SHA-256 recovery fingerprints eliminate serialization of the unchanged
pre-action artifact. The post-action artifact remains mandatory; fingerprints
advance only after successful persistence and clear when failed or uncertain
writes release the session. Checkpoint persistence still precedes acknowledgements
and publication. Independent review approved these changes and the pipelined
transcript read, including request-scope cleanup and failure/retry ordering.

Three unchanged stale-request probes improved from 874/691/682 ms to
358/326/304 ms. Each still performed two authorization checks, but remote
Firebase lookups fell from two to one. Recovery serialization fell from
251–395 ms to 71–115 ms. These unchanged requests performed no persistence write.

A separate accepted save-consent request/cancel pair improved from 1325/948 ms
to 405/398 ms. Post-change checkpoint storage took 67–73 ms: encoding accounted
for 31–36 ms and local SQL/open/commit for 31–41 ms. Artifact serialization was
80–83 ms and authorization 170–173 ms. These tiny diagnostic samples isolate
costs; they do not substitute for gameplay distributions. The pair restored
ACTIVE status at the same gameplay revision. Evidence is retained under
`.tools/smooth-gameplay/authorization-{before,after}-*` and
`accepted-{before,after}-*`.

## Environment diagnosis

The initial real-server run failed Firebase authentication because the installed
ADC had no quota project. The acceptance compose file now supplies the existing
DEV quota project via `GOOGLE_CLOUD_QUOTA_PROJECT`; credentials and authorization
rules were unchanged. The identical probe then authenticated successfully.
The acceptance driver also needed to recognize direct kickoff choices and
exclude the actor-only block preview from cross-viewer equality, just as it
already excludes other private guidance. No gameplay rules changed.
Fresh repeated runs also require unique saved team names. Cross-viewer reaction
comparison now excludes only `serverNow`, a timestamp generated separately for
each recipient; reaction IDs, choices, actors and authoritative deadlines still
must match. Failed diagnostic captures were retained separately from complete
performance samples.

The Windows sandbox launcher later returned account-lock error 1909. Existing
test processes completed; narrowly scoped host executions through runtime
approval completed subsequent validation. No Windows account or credential
settings were changed.

## Acceptance review against the plan

| Requirement | Implementation and evidence |
| --- | --- |
| Separate request, data and visible timing | Correlated browser observer and server spans; baseline and final workload retained separately. Frame opportunity and geometry observations are explicitly distinguished from physical display latency. |
| Immediate feedback; one pending mutation | Existing pending state remains immediate; hosted history tests cover the mutation lock while reads are pipelined. |
| Continuous ordered travel and prompt decisions | CSS interpolation, stable scenery rendering and bounded playback durations; real frame probe plus movement/dice/decision suites. |
| Safe provisional route prefix | Active-player restriction; native preview checks and reaction boundaries; confirmation, rejection, mismatch and disconnect tests. New activation is deliberately authoritative because route previews omit activation rolls. |
| Missing history and recovery | One-second explicit synchronization/reconciliation; missing/full-time history, reconnect and pending-recovery coverage. |
| Replay and accessibility | Existing replay speeds, skip/seek, reduced motion and hosted replay suites; shared interpolation duration reaches replay rendering. |
| Durability and authorization | Final server regression suite and independent security/durability review; successful checkpoint still precedes acknowledgement. |
| Preserve rules and visual identity | No rules changes; CSS/layout work limited to movement/performance, existing themes/camera/artwork preserved. |
| Windows and physical Android | Windows functional checks and bounded native workload completed; visible-presentation timing remains an open gate. Physical tablet intentionally left to the user. No hardware conclusion from emulation. |

The bounded real-server workload exercises 40 PLAY decisions; it is not a
completed full-match acceptance run. Rare blocks and roll-boundary outcomes
remain small cohorts. No remote deployment or production performance claim is
part of this handoff.

## Retrospective

The delivery workflow requires a process retrospective. Applying the `retro`
and `writing-for-agents` guidance to this session suggests these follow-ups:

1. Keep Java toolchain instructions aligned with module requirements: the
   server currently requires JDK 21 while the general agent instructions still
   advertise Java 8. The actual Docker build supplied a reliable toolchain here.
2. Keep performance sampling isolated from builds and parallel browser suites.
   A real frame probe correctly detected host contention that endpoint-only
   assertions would miss. CI should retain the behavior test while benchmark
   evidence records hardware, foreground state and competing workload.
3. Keep the acceptance driver's direct-decision and recipient-projection
   assumptions covered by tests when new protocol/UI features ship. This run
   repaired stale kickoff-choice and private block-preview assumptions before
   collecting the baseline.

These are process recommendations, not additional instruction-file changes.
