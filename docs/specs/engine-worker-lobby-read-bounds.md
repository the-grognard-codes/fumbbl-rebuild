# Feature: Throttle and batch browse and current-match reads

Tracking: [#508](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/508).
Status: implemented and locally validated; independent review pending. See [outcome](engine-worker-lobby-read-bounds-outcome.md).
Decision: [accepted ADR 0006](../adr/0006-single-engine-worker.md).
Review: [combined findings C3/C5 and L1/L2](engine-worker-requests-review.md).

## Abstract

Rate-limit lobby reads and replace per-match database fetch loops with bounded
batch work so browse traffic cannot repeatedly monopolize the engine worker.

## Objective

Preserve browse/current-match content and authorization while keeping each
request inside the shared 2,000 ms execution ceiling and protecting gameplay
from repeated expensive reads.

## Context / Existing Behavior

[BrowserV2Adapter](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserV2Adapter.java)
loads browse documents per entry for detailed `browse` and `currentMatches`.
[SetupApplication.browseState](../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/SetupApplication.java)
can load and parse a non-resident match's recovery checkpoint. Up to 100 entries
can therefore create repeated JDBC and JSON work on the same worker as gameplay.
Only diagnostics probes have a corresponding rate limiter; browse does not
currently use the advisory lane. Lane scheduling cannot preempt a running read.

## In Scope

- Per-connection throttling for browse/current-match reads and `RATE_LIMITED`
  handling in the browser lobby.
- Batch document reads, bounded recovery-state reads/parsing and explicit query,
  entry/byte/work limits within the existing response/authorization contract.
- An evidenced decision on foreground/advisory lane placement.
- Server rate/query/budget regressions and browser behavior tests.

## Out of Scope

- A summary cache refreshed at checkpoint commit; propose separately if needed.
- Visibility/content policy changes, unsolicited pagination changes or activation
  of native engines merely to answer lobby reads.
- Connection pooling, parallel mutation, or a lobby redesign.

## Functional Requirements

- Add a monotonic per-connection read limiter covering `browse` and
  `currentMatches`: use one shared token bucket with capacity two, initially
  full, refilling one token per 2,000 ms up to capacity. Each admitted expensive
  read costs one token; alternating request types cannot bypass the shared cap.
  Reject unsupported/malformed request shapes before consuming a work token and
  before expensive reads, so a detailed-browse protocol rejection does not charge
  the immediately following compatibility fallback. This permits ordinary initial
  browse plus current-match load without an unbounded fallback exemption.
- Throttled requests return the existing request-correlated protocol envelope
  with `RATE_LIMITED` and perform no expensive document/checkpoint read. Keep
  authorization fail-closed; a limiter must not bypass authentication or expose
  match existence. Apply #504/#505 budgets to any authorization still needed.
- Load the admitted page's match documents in one batch, not one query/connection
  per entry. Account for recovery-state lookups too: batch or otherwise redesign
  them into a documented fixed query bound independent of admitted match count.
  Preserve ordering, membership filtering, lifecycle handling and response fields.
- Preserve the current bounded result/page contract. Bound decoded bytes, parse
  work and serialization for non-resident checkpoints as well as JDBC calls.
  Do not activate or mutate a match to produce a read-only summary. If a request
  cannot fit its budget, return the correlated `RATE_LIMITED` response with the
  same client backoff semantics as bucket exhaustion; do not
  silently return a truncated or differently authorized successful result.
  An invalid or oversized stored record keeps its membership and degrades only that entry to unavailable, preserving existing lifecycle semantics. Page-level aggregate exhaustion is distinct. Actual storage failures retain existing `PERSISTENCE_FAILED`/unavailable
  semantics and malformed input retains validation errors; do not label those
  as ordinary throttling. Budget checks apply before each admitted read allocation.
- Every read request consumes the same remaining ≤ 2,000 ms budget as its
  authentication and database work. A page-size limit or per-query timeout alone
  is insufficient. Use [#505's controls](engine-worker-jdbc-bounds.md) and preserve
  the ADR's 100 ms p99 healthy target and investigation threshold near 250 ms.
- Decide lane placement from gameplay/read-load evidence and record the reason.
  Preserve existing advisory fairness/control ordering. Do not describe moving
  a read into the advisory lane as bounding or preempting its execution.
- In the lobby, treat `RATE_LIMITED` as a retryable read outcome: preserve the last
  successful list/selection, avoid an error/reconnect loop, and coalesce requests only when type and fields match, queue distinct cursors/detail modes, or back
  off subsequent refreshes. An accepted read resets the backoff delay. Queued reads keep their refill spacing, and the cooldown clears when the queue completes. Surface an accessible status when useful without
  clearing valid match data or automatically issuing rapid retries.
- Dispose limiter state on connection cleanup; reconnect cannot gain unlimited
  work through leaked state. Existing global connection/ingress admission still
  applies; this does not promise protection from arbitrary new identities.

## Acceptance Criteria

- Deterministic-clock tests cover first read, repeated read, alternating request
  types, two-token burst, refill/cap boundaries and disconnect cleanup. Rejected reads cause zero
  expensive document/checkpoint queries and keep correlation/auth semantics.
- Small and maximum admitted result sets prove a fixed query bound independent
  of match count, including non-resident state. Results match the previous
  authorized content/order and no native session is created for browsing.
- Maximum admitted entries/bytes and sequential authorization/database work fit
  the full request budget; malformed/oversized data and storage failures fail
  safely without partial-success truncation.
- Browser tests prove list/selection retention and bounded retry/coalescing for
  `RATE_LIMITED`, with no reconnect storm or unusable refresh control.
- Initial connect/reconnect with browse plus `currentMatches` succeeds within the
  two-token burst; a rejected `includeDetails` request and immediate fallback do
  not collide with the limiter. A third supported read is throttled until refill.
  Protocol fallback is still bounded and performs no unsupported expensive work.
- Both pre-call aggregate-budget rejection and bucket exhaustion return correlated
  `RATE_LIMITED`; genuine persistence/validation errors retain their own codes.
- A concurrent gameplay/browse capture records query count, parse/serialization
  cost and queue/worker latency; the lane decision and remaining limits are stated.

## Constraints

- Create a new branch for implementation; preserve unrelated working-tree edits.
- Preserve V2 formats, match visibility, worker ownership and ADRs 0002/0004/0006.
- Preserve MUTP styling and accessible lobby controls on supported Android,
  Windows and Linux browser layouts; reuse existing status/error scaffolding.
- Record user-visible changes under Unreleased in CHANGELOG.md.
- Do not commit, push, publish, deploy or edit external state without authorization.

## Implementation Guidance

Extend the existing diagnostics-limiter pattern rather than adding an independent
rate-limit dependency. Put batch access at the existing repository/service seam
and bound recovery parsing explicitly. Coordinate JDBC/deadline ownership with
#505 deliverable B after its prerequisite budget seam A; implementation of this
slice follows those controls and may progress independently of #507 implementation.
See the [handoff order](../adr/0006-single-engine-worker.md#implementation-order).
Keep performance counters free of private match/identity details.

## Validation

Run focused adapter/repository/limiter tests, lobby protocol/UI tests and relevant
recovery/read regressions. Inspect current browser lobby selectors before choosing
test files. Compare content and query counts at small/maximum page sizes, then
capture mixed gameplay/read traffic. After code changes, run browser unit
tests/build, relevant lobby smoke checks and `tools/target-build.ps1 verify` for
the clean game-server build/tests.

## Completion Notes

Implemented on the slice-4 branch with separate #508 commits and validation boundaries. The revised request is linked from #508. The [outcome report](engine-worker-lobby-read-bounds-outcome.md) records bounds, scheduling evidence, exact revisions, validation and the missed healthy latency target. Issue closure awaits independent review.

PR #521 review corrections and current validation are recorded in the [final review outcome](../reviews/2026-11-11-pr521-final-review.md). Historical captures remain separate. The current repeated series retains all healthy reads as admitted work, includes a discarded workload warmup and records contention. Full-verification and latency target failures remain explicit.