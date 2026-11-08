# Performance observability implementation outcome

Issue: [#499](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/499).
Branch: `feature/performance-observability`.
Base: `46d896256758f1deb0417566e556b56228d90d21`.
Implemented and self-reviewed November 8, 2026. The subsequent user handoff
authorizes staging all changes, committing, pushing and opening a PR for
independent review; merge and deployment remain outside this handoff.

During this work the shared branch was fast-forwarded to
`11a5d3c51` (PR #500: Claude reviewer setup and architecture map). That intervening
commit changes documentation/skill wrappers only; its changes were preserved.
The implementation diff remains against that current branch head.

## Result

The requested database/commit, response-delivery and browser-processing
instrumentation is implemented. It provides the missing application boundaries
needed for a comprehensive investigation. Actual early/mid/late live-match
captures, profiler attribution and collection-overhead measurements remain the
next evidence-gathering step; this delivery makes no live latency improvement claim.

Enable **Detailed phase traces** alongside Counters/Graph in the DEV/dev-local
Debug menu. Collection still starts Off. The [collection guide](collection.md)
specifies the measurement matrix, export/analysis commands, artifact manifest,
phase semantics, privacy limits, supplementary profiling and decision criteria.

## Acceptance review

| Requirement | Delivered behavior / evidence |
|---|---|
| FR1 database/storage detail | Recovery connection, query/row consumption, mutation, commit/rollback, decode and compression spans; codec input/output byte totals. JDBC failure semantics remain covered, and a real MariaDB journal test verified write/commit plus read/decompression observations |
| FR2 compatibility | Optional detail version 1 negotiation; legacy timing family retained; one fallback to lightweight configuration on old-server rejection. Tests cover malformed optional frames, lightweight → detail and Off/on renegotiation |
| FR3 asynchronous delivery | Mandatory correlated response owns a cross-thread observer. It joins worker exit and write outcome once, outside delivery locks. Tests cover actual Jetty loopback WebSocket delivery, predecessor ordering, queue/write durations, close/timeout and duplicate completion |
| FR4 safe correlation | Opaque per-request 32-hex token shared by server log and browser detail; capture-local numeric trace links response/browser spans. Fixed phase/context vocabulary; explicit primitive projection rejects private fields and avoids caller toJSON hooks |
| FR5 browser boundaries | Real V2 receive measures parse, strict decoding/validation, synchronous notify/transcript callbacks and enclosing receive. A controlled-clock test verifies callback duration, and a Chrome UI test verifies a matching real React layout-effect observation |
| FR6 history/context | Numeric history, event, command, transcript, revision, half/turn, journal, codec/response/predecessor bytes and path flags. Tests distinguish append from full fallback; no extra retained-history serialization is used to obtain counters |
| FR7 bounded captures/analysis | Capture format 2 with detail version 1; format-1 compatibility. Shared Java/TS vocabulary fixture. Bounded collector, server spans and optional frames; sanitized offline phase statistics and individual correlated evidence; malformed/private input, missing detail and report truncation tests |
| FR8 repeatable collection | Runbook covers actual SQL/live play, controlled response replay, history scaling, provider reuse, append/compaction, independent clocks, overhead cohorts and supplementary JVM/database/browser/device attribution. Existing native browser smoke has an opt-in detailed-capture assertion mode |

No gameplay, authorization policy, persistence/recovery format, queue capacity,
commit-before-ack contract or rule behavior was intentionally changed. Existing
uncommitted history-scaling experiment files and results were preserved separately.

## Self-review findings resolved

- A lightweight or Off negotiation response initially poisoned the cached detail
  capability. Capability inference now applies only to an actual detailed request;
  explicit tests cover later enabling details and Off/on cycles.
- Worker completion and asynchronous write completion can occur in either order.
  The trace joins them once; I/O callbacks do not read worker ThreadLocal state.
  Observer failures are isolated from delivery and callbacks execute outside its lock.
- A full-checkpoint fallback initially shared the compaction flag. The path now
  reports compaction only after an actual journal compaction decision; no-write
  fingerprint equivalence is reported as unchanged.
- Dense traces could exceed the optional 8 KiB frame limit. Span tails now trim
  to fit while preserving phase totals/context and incrementing truncation counts.
  A dense multi-phase test verifies the transport budget.
- The new cross-language contract fixture needed an explicit Docker-context
  allowlist entry. The tested server build now receives it.
- Export/report projection retains only allowed primitives, and the offline
  report preserves browser timeline anchors. Format-2 analyzer tests were added
  to the existing CI tooling command.

## Validation

Local evidence logs are under ignored `.tools/observability-*`; screenshots are
under `.tools/debug-performance/evidence`. These are functional validation runs,
not controlled performance comparisons.

| Check | Result |
|---|---|
| Browser unit suite | 527 passed, no failures/skips |
| Browser TypeScript/production build | Passed; `game.js` 1,042.66 kB, gzip 262.79 kB |
| Diagnostics Chrome UI | Passed DEV/live/replay controls, new detail opt-in, matching commit span, format-2 export, clock anchors, privacy, Off/reset, production/unknown gating and unsupported observer fallback |
| Presentation-hook regression | Passed; metric notifications do not rerender gameplay; enable/disable still does |
| Pending recovery, reconnect, provisional movement, ordered playback Chrome journeys | All passed, including exact retry/recovery behavior, authoritative dice and stale-timer/reduced-motion paths |
| Offline capture analysis | 17 passed, including legacy captures, format-2 correlation, privacy/malformed inputs and global report caps |
| Exact affected CI tooling command | 47 passed |
| Focused Java diagnostics/JDBC/codec/transport/journal suite | 95 passed before final byte-cap addition; final trace/journal checks added one dense-trace case and passed all 7 selected tests |
| Real MariaDB recovery journal contract | Passed against the existing managed database in an empty dedicated schema; observed connection/write/commit and read/decode/decompression spans; transaction/conflict/rollback/lost-ack/compaction checks passed; test tables removed and database restored to stopped |
| Final tested Docker server image | Passed full common/server clean package: 19 common tests and 695 server tests, 705 passed overall, 9 environment/experiment-gated skips, no failures/errors. Local image `fumbbl-observability-review:local`, image ID `sha256:dc5d1c2f298e09b44c3a521edda736514e4d2118c9e1f64269c3348cb3bbc6d1` |
| Syntax / diff / visual review | Native collection script syntax passed; `git diff --check` passed; new control inspected in its actual Debug drawer screenshot |
| Service cleanup | Managed server/database containers stopped, manager state absent, loopback 5000/22232/22234/23317 all closed; volumes retained |

The real socket contract test uses Jetty and the actual transport but a small
test protocol. The real SQL test exercises the recovery repository. Browser
tests exercise actual V2 processing and React separately. Together they validate
the new boundaries; they are not a new authenticated, SQL-backed whole-match
performance capture. The existing native acceptance smoke's new detailed branch
has been syntax-checked but not run against a newly started full dev-local stack.

The Docker skips comprise six environment-gated database cases and three opt-in
history-scaling experiment methods. The changed recovery journal database case
passed separately against real MariaDB. The other five database integration
cases and the long history experiment were not rerun as part of this delivery;
the existing history results remain preserved. No new state-test-module or full
browser preflight run was required for this instrumentation-only scope.

## Remaining evidence and delivery state

Collect actual match progression and matched history-length windows on the
affected device, then add bounded JFR, browser CPU/timeline and database wait
evidence as the observed outliers require. Record observer overhead and data
coverage before drawing a remediation priority list. Physical Android/display,
database-internal waits and one-way network latency are not established by these
application timers.

No new dev-local gameplay server was started or left running. The implementation
was initially delivered uncommitted. The subsequent publication handoff includes
the backfilled feature request, all current changes and a PR for independent
review. No merge, public update entry or deployment is included. The issue stays
open through review until the feature is merged.

The user explicitly approved publishing the prepared GitHub issue progress
comment after the initial automatic approval rejection. The update was
[posted to #499](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/499#issuecomment-6726278287).
Its local copy remains at `.tools/observability-issue-update.md`.
