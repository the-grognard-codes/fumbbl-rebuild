# Feature: Bound engine-worker JDBC work and preserve durable retries

Tracking: [#505](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/505).
Status: deliverable A independently validated; deliverable B implementation pending.
Evidence: [slice 2 outcome report](engine-worker-jdbc-bounds-outcome.md).
Decision: [accepted ADR 0006](../adr/0006-single-engine-worker.md).
Review: [combined findings C1-C5 and J1-J3](engine-worker-requests-review.md).
Budget correction: [RB1 supersedes the round-one static-sum model](engine-worker-requests-review.md#rb1-high-blocks-505-b-and-the-integrated-budget-claims-of-504-the-static-sum-rule-cannot-be-satisfied).

## Abstract

Bound database operations and add a shared database circuit breaker so outages
release the engine worker promptly. Preserve the durable action boundary when a
timed-out commit may have succeeded.

## Objective

Fit all JDBC work into the request's remaining 2,000 ms worker budget, while
retaining correct authorization, checkpoint acceptance and exact retry behavior.

## Context / Existing Behavior

[FantasyFootballServer.openConnection](../../ffb-server/src/main/java/com/fumbbl/ffb/server/FantasyFootballServer.java)
opens connections through `DriverManager`. The
[V2 runtime wiring](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserV2Runtime.java)
injects this source into match, membership, recovery, principal, preparation,
saved-team and skill-preference persistence. One database stall therefore blocks
every match on the process worker.

[ADR 0004](../adr/0004-durable-recovery-journal.md) commits recorded outcomes and
checkpoint/journal state under a durable generation boundary. A commit timeout
does not establish rollback. This request expands #505 with the accepted total
budget, per-session lock policy and circuit breaker; its GitHub body is unchanged.

The source already distinguishes `MATCH_OUTCOME_UNKNOWN` from a definite
persistence failure. `JdbcMatchRepository` and `JdbcRecoveryRepository` use
`OutcomeUnknown` after an attempted commit. `V2PreparationService` already wraps
commit errors as `CommitUnknown` and returns `MATCH_OUTCOME_UNKNOWN`, including
SQL close errors. Saved-team operations return `SAVE_OUTCOME_UNKNOWN` or
`DELETE_OUTCOME_UNKNOWN` through `BrowserSavedTeamJson`. Preserve these existing
signals; do not replace them with a new reconciliation scheme.

RB1 corrects the earlier allocation model. Several fresh connections and a cold
provider check can occur sequentially; the sum of all configured call caps can
exceed 2,000 ms. The monotonic request deadline limits actual elapsed work, not
a requirement that all independent caps add up below the ceiling.

## In Scope

- Connection/acquisition, socket, statement/lock/transaction, commit and cleanup
  bounds across every V2 runtime JDBC path, including local authorization reads.
- Startup configuration validation and matching local/container configuration.
- **Deliverable A (prerequisite, owned by #505):** the common request-budget seam
  and numeric worker-task timing in `BrowserRequestTiming` / `BrowserMatchTransport`.
- **Deliverable B:** JDBC bounds, the shared database breaker and consumption of
  deliverable A's context. #504 consumes A; it does not own a second context.
- Persistence failures, recovery reconciliation and tests for uncertain commits.

## Out of Scope

- Pool implementation in this slice; #506 remains a separate, conditionally
  advanced prerequisite under the fallback decision below. Database offloading
  and parallel engine lanes remain out of scope.
- New storage formats, action reexecution for recovery, or ownership across processes.
- Provider authentication controls, owned by the [Firebase request](engine-worker-firebase-bounds.md).

## Functional Requirements

- Deliverable A extends/reuses the existing `BrowserRequestTiming.CURRENT`
  per-worker `ThreadLocal<Request>` lifecycle. Make budget enforcement available
  with diagnostics off; currently `queued()` may return null unless tracing is
  enabled. Attach one monotonic task start/deadline and bounded numeric task-kind
  metadata at worker execution start, with nesting/restoration and cleanup in
  `finally`. Optional trace output must not enable or disable enforcement.
- Time untracked `submitControl` work as well as tracked ingress, including
  decision expiry and disconnect cleanup. Use numeric task-kind/count, queue-wait
  and full execution durations; record scope exit after publication/cleanup, not
  just correlated-reply time. Do not require a browser request ID or retain
  bodies, account/match IDs, credentials or native state. Preserve untracked
  admission and existing control scheduling. #39 consumes this instrumentation.
- Every JDBC operation consumes the same monotonic request budget used by #504.
  All sequential reads, mutations, commit/rollback and resource cleanup must fit
  the remaining ≤ 2,000 ms total. A new connection/query/helper must not reset the
  budget. #505 owns the transport/timing boundary and the public budget contract;
  #504 owns its provider adapter and consumes that contract after A is ready.
- Before each JDBC connection/open, statement, commit and cleanup phase, recompute
  `effectiveTimeout = min(perCallCap, remainingRequestTime - requiredReserve)`.
  The reserve covers native/CPU and cleanup work still required by that path;
  record caps, units, reserve rules and measured sequential connection counts.
  Do not require the sum of fixed call caps to fit 2,000 ms. Refuse work through
  its existing failure/recovery contract when no positive usable allowance remains;
  nested operations and fresh connections never reset the absolute deadline.
- Each repository call opens a new connection, so derive `connectTimeout` and
  the initial `socketTimeout` in a fresh per-call `Properties` object passed to
  `DriverManager.getConnection`. Recompute after connection setup and tighten
  statement/commit I/O with `Connection.setNetworkTimeout(executor, milliseconds)`
  as verified against pinned Connector/J 3.5.8. A fixed timeout established at
  connection creation cannot remain the full allowance for every later query.
- Verify URL/Properties precedence against that driver. Configured values in
  `db.url` are caps; a duplicate URL value must not override a shorter derived
  effective timeout. Use verified precedence or normalize controlled options into
  one effective parameter source, retaining unrelated options/session variables.
  Do not mutate global configuration. Test a URL that already contains the same
  connect/socket keys alongside smaller per-call values.
- JDBC statement query timeouts use whole seconds, so they cannot alone enforce
  a subsecond remaining allowance. Round derived millisecond limits safely;
  never pass zero where the driver interprets it as unlimited, or round up past
  the available budget. Prove actual underlying call return across DNS/handshake,
  multiple response reads, retries and cleanup, not merely an idle socket timeout.
  Native/CPU work is not preemptible: enforce at I/O boundaries and measure full
  task overruns. Never interrupt a Step or misreport an already committed action
  to meet the ceiling; record an overrun as a compliance failure for redesign.
- Evaluate about 500 ms connect and 1,000–1,500 ms socket limits as configurable
  per-call caps, shortened by the remaining request deadline. Caps do not promise
  that much time to each successive call. Do not reduce configured caps below
  healthy latency merely to make an artificial static sum pass acceptance.
- Supply and verify `innodb_lock_wait_timeout` of about one second using
  Connector/J's `sessionVariables` connection option, not a separate `SET SESSION`
  round trip on each new connection. It is a database-side maximum lock wait,
  not a minimum allowance for every statement. With sufficient remaining time,
  test the clean SQL lock-wait error; when less time remains, the request deadline
  may cut the call short first. That is permitted: use the existing definite
  failure or unknown-outcome contract as appropriate, especially during commit.
  Do not require every socket deadline to exceed the one-second lock wait, lower
  the whole-request ceiling, or infer rollback from the earlier timeout. A zero
  lock-wait setting is not required by this request.
- Verify the pinned driver's controls, units, retries, DNS/acquisition and cleanup
  behavior. A socket timeout alone does not bound a multi-query transaction or
  establish prompt return from all failure paths.
- Startup must reject missing or non-finite/invalid required timeout settings;
  do not silently use the ADR's general default allowance instead of #505's
  stricter configuration contract. Update relevant local and container settings.
- The existing `IServerProperty.DB_URL` (`db.url`) is the single configuration
  source for the configured caps `connectTimeout`, `socketTimeout` and
  `sessionVariables` containing the lock-wait value. Per-call derived timeouts
  are enforcement values, not a second operator configuration source. Parse/validate
  through a supported URL/options mechanism before serving traffic; reject
  missing/zero/negative/non-integral values, duplicate/conflicting parameters or
  repeated lock-wait assignments rather than silently taking first/last values.
  Verify millisecond timeout and second lock-wait units; redact URL credentials
  from validation errors and document the supported encoded URL syntax.
- The database breaker is shared across requests using the same dependency.
  After consecutive timeouts, reject immediately during a monotonic cooldown,
  then admit one recovery probe. Suggested starting points are three timeouts
  and 5–10 seconds cooldown; choose and test actual values. Failed probes reopen
  the breaker. While open, rejected operations must not open another database
  connection or begin native work that depends on a successful durable commit.
- Classify availability timeouts separately from ordinary validation, duplicate
  or optimistic-concurrency failures; do not turn every SQL error into an outage.
  By default, lock-wait errors do not count toward the server-wide availability
  breaker: contention on one hot row must not reject database work for all
  matches. Timeout/connection availability failures do count; test classification.
  A local budget rejection before contacting the database is not a database
  availability failure and must not open the database breaker.
- Definite persistence failures return `PERSISTENCE_FAILED` only where that
  existing contract applies. Preserve `MATCH_OUTCOME_UNKNOWN` for uncertain match
  outcomes and `SAVE_OUTCOME_UNKNOWN` / `DELETE_OUTCOME_UNKNOWN` for saved teams,
  including failures after commit while closing resources. SQL failures on authentication paths retain existing
  fail-closed authentication responses; do not bypass checks or leak SQL details.
- Reconcile uncertain commits from durable state before retry or further mutation.
  If committed, an exact retry returns the recorded result and appends nothing.
  If uncommitted, do not report a durable success; follow existing restore/retry
  admission semantics with at most one eventual accepted action. Never recover
  by blindly rerunning accepted commands, dice, clocks or skill decisions.
- Preserve transcript/checkpoint/result atomicity, CAS ownership and storage
  admission. The breaker must not prevent necessary reconciliation by pretending
  that an unknown action is already accepted or rolled back.
- Inventory every writing path, including autocommit acknowledgements: preserve
  existing preparation `CommitUnknown` handling, and assess standalone membership
  insert, principal first-account creation and skill-preference upsert. The latter
  paths currently lack a dedicated typed uncertain-outcome boundary. Add bounded
  durable readback/idempotent retry handling where needed, keeping their existing
  client/auth contracts; read-only authorization failures stay fail-closed and do
  not need a fabricated commit outcome. Test post-write/close uncertainty as well
  as explicit commit failures; do not label preparation as wholly unhandled.

## Acceptance Criteria

- Deliverable A has independent acceptance: one always-present budget context,
  no reset through nested helpers, cleanup after exceptions, no dependency on
  trace flags, and numeric full-task timing for ingress and untracked control
  work. #504 can consume its documented contract without changing its owner.
- Startup rejects missing/invalid configuration; all runtime repositories inherit
  effective connection, socket and session limits, including new connections.
- Locked-row, stalled-connect/read and commit/cleanup regressions prove deadline-
  clamped per-call limits, exhausted-budget rejection and worker release. While
  #504 is outstanding,
  use a declared bounded provider double and identify the noncompliant production
  dependency, matching #504's slice-acceptance rule. Final integrated validation
  with real #504 controls proves the complete request's ≤ 2,000 ms budget; neither
  independently accepted slice may claim whole-runtime compliance before it.
- Longest-path tests cover cold Firebase followed by multiple fresh connections,
  ordinary successful healthy requests and a lock wait late in the request.
  Early phases reduce subsequent connect/network limits without resetting the
  deadline; a late statement may time out before one second, preserving exact
  response/retry semantics. Returning quick errors for all valid healthy requests
  does not satisfy acceptance. Record actual connection counts and healthy p99.
- Tests cover both actual outcomes of a commit timeout, including exact retry,
  restoration and later mutation: no duplicate transcript, partial checkpoint,
  false success or accepted-command reexecution occurs.
- Multi-request outages prove breaker opening, fast rejection without new JDBC
  work while open, one recovery probe and reopening/recovery behavior. Queue,
  expiry/disconnect and permit-release work progress despite database rejection.
- Ordinary concurrency/validation errors retain their existing semantics;
  authorization stays fail-closed. Existing journal/transcript suites pass.
- Tests preserve exact unknown-outcome codes for match, preparation and saved-team
  paths, exercise membership/principal/preference write acknowledgement loss,
  reject duplicate/conflicting URL options and prove lock waits do not open the
  availability breaker. No extra session-configuration query is introduced.
- URL-versus-Properties tests prove shorter derived connect/socket limits take
  effect, sub-millisecond/exhausted allowances never become infinite waits, and
  commit/cleanup deadline expiry preserves uncertain outcomes and worker progress.

## Constraints

- Create a new working branch for implementation and preserve unrelated changes.
- Follow pinned Java/Maven and repository conventions. Preserve ADRs
  0002/0004/0005/0006 and V2 stored-format compatibility.
- Keep local logging within the accepted allowance; no logging migration required.
- Record user-visible changes under Unreleased in CHANGELOG.md.
- Do not commit, push, publish, deploy or edit external state without authorization.

## Implementation Guidance

Apply controls at the injected connection/runtime boundary so repositories cannot
quietly bypass them. Keep transaction/unknown-outcome decisions at the existing
durable boundary. Implement and validate deliverable A first under #505; after
it is available, #504 and #505 deliverable B can proceed independently (#504 also
needs its pinned-SDK spike). #508 follows B; #507 follows #504, using B for batched
local authorization under its now-approved ADR 0005 option A policy. The final
#39 run follows all five fixes. See the
[handoff order](../adr/0006-single-engine-worker.md#implementation-order).

Pooling fallback decision (RB1): start with deadline-aware unpooled connections.
If measured connection/setup overhead prevents admitted healthy paths from
meeting the ≤ 100 ms p99 target or the 2,000 ms ceiling despite correct deadline
enforcement, the acting agent will use the maintainer's delegated discretion to
bring [#506](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/506) forward
before final #505 B acceptance. Record the evidence and sequencing decision;
do not weaken the targets or fabricate tiny caps. #505 A and the bounded
connection/session controls needed by a pool precede that work; #506 then
precedes final integrated B validation, avoiding a circular dependency on all
of #505 being complete. Its existing tracker ordering must be reconciled when
tracker writes are authorized. The pool keeps bounded acquisition, transaction/
session reset and the shared deadline. Pooling does not itself prove that driver
I/O obeys a deadline; an unsupported timeout mechanism remains a reported blocker.

## Validation

Use focused MariaDB integration tests with a second session holding a row lock,
plus controlled transport/fault injection for both commit outcomes and cleanup
stalls. Include a late lock wait with less than one second remaining and per-call
connect timeout precedence tests against Connector/J 3.5.8. Test breaker
transitions with an injected monotonic clock. Run existing
authorization, recovery, transcript and engine-queue regressions. After code
changes, run browser unit tests/build and `tools/target-build.ps1 verify` for the
clean server build/tests, with relevant V2 recovery/reconnect smoke coverage.

## Completion Notes

Request only; no runtime validation has run for this request. Before implementation,
link this revised scope from #505 or update its body when tracker writes are
authorized. Record effective
settings, failure classification, timing and exact-retry evidence in an outcome
report; diagnose failing checks until resolved or a concrete blocker is recorded.
