# ADR request: single engine worker and bounded blocking I/O

Status: ADR accepted on 2026-11-09; gap implementation remains pending.
Source: [issue #509](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/509)
and [the maintainer's sequencing requirement](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/509#issuecomment-6742840786).
Reviewed: 2026-11-09 against checkout `53edb476af880091bbb88a26e36913f686257ee5`.
Template: [ADR request and decision template](../agents/adr-template.md).
Draft: [ADR 0006](../adr/0006-single-engine-worker.md).
Feedback: [request review](single-engine-worker-adr-review.md), incorporated below.
Policy update: [ADR review and recorded maintainer decisions](single-engine-worker-adr-0006-review.md).

## Objective

Define the single-worker engine model, the availability risks it creates, and
the rules reviewers must enforce to keep blocking dependencies from stopping all
matches. The resulting ADR must be defined and accepted before implementation
of the four known mitigation tickets proceeds, as requested in #509's discussion.
It must make the distinction between an architectural policy and the runtime's
current compliance with that policy explicit.

This warrants an ADR because shared mutable engine infrastructure makes a move
to parallel match execution consequential, the ownership rule is easy to miss
when editing a request handler, and serialization trades concurrency for simpler
ordering and state ownership.

## Context and evidence

Code links below are relative to this spec and identify symbols rather than
issue line numbers, which can drift.

- [FantasyFootballServer.run](../../ffb-server/src/main/java/com/fumbbl/ffb/server/FantasyFootballServer.java)
  creates one `ServerCommunication` thread named `browser-engine` per server
  process. Its `openConnection` delegates directly to `DriverManager`.
- [ServerCommunication.run / execute](../../ffb-server/src/main/java/com/fumbbl/ffb/server/net/ServerCommunication.java)
  execute queued work serially. This is one worker for all matches in that
  process, not one worker or process per match.
- [BrowserMatchTransport.submit / runQueued](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserMatchTransport.java)
  schedule foreground and advisory work on that same worker. Current admission
  limits are 16 connections and 128 tracked ingress requests. Lane selection
  changes scheduling order; it does not make tasks run concurrently or preempt a
  blocked task. The underlying communication queue and trusted control work
  must not be described as globally bounded by the tracked ingress limit.
- [SetupApplication](../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/SetupApplication.java)
  owns mutable session, generation, journal cursor, and lifecycle maps under
  worker confinement. [ActiveMatchPublisher](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/ActiveMatchPublisher.java)
  owns viewer state on the protocol worker; its publication and chat loops
  authorize recipients individually. `BrowserV2Adapter.preparationChanged` is
  another per-recipient reauthorization loop covered by the same fan-out rule.
- [BrowserV2Adapter](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserV2Adapter.java)
  synchronizes request, decision-expiry, and disconnect entry points. Confinement
  reduces the need for locks inside engine state; the entire runtime is not
  lock-free. Jetty, delivery callbacks, and the watchdog also have threads.
- [StepRiotousRookies.rookieName](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/phase/inducement/StepRiotousRookies.java)
  calls [UtilServerHttpClient.fetchPage](../../ffb-server/src/main/java/com/fumbbl/ffb/server/util/UtilServerHttpClient.java)
  once per rookie inside nested inducement/rookie loops, during native mutation
  before checkpoint commit. The HTTP builder sets a 10,000 ms connect timeout
  but no socket/read or connection-request timeout. An accepted connection with
  a stalled response can therefore freeze every match. The existing fallback
  name is reached only after a returned empty result or an `IOException`.
- A source sweep also finds synchronous filesystem logging in
  [DebugLog.logInternal](../../ffb-server/src/main/java/com/fumbbl/ffb/server/DebugLog.java)
  (including flush/close), reached by native `StepExecutor` logging and the
  communication worker's error handler. Auth diagnostics can write to stderr.
  Neither local disk nor redirected stderr can be assumed nonblocking.
- The issue attributes its findings to `docs/reviews/2026-11-09-concurrency-audit.md`
  (J1 and H1-H4). That file is absent from this checkout; the review here uses
  #509, its linked tickets, and the code above rather than claiming an independent
  review of the full audit.

Existing contracts remain authoritative:
[ADR 0002](../adr/0002-bounded-match-transcript.md) defines durable action and
transcript acceptance; [ADR 0004](../adr/0004-durable-recovery-journal.md) defines
journal recovery without command reexecution; [ADR 0005](../adr/0005-bounded-provider-revalidation.md)
defines provider-check freshness and immediate local authorization checks.
[Issue #39](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/39) measures
the current single-worker concurrency envelope and explicitly does not authorize
parallel per-match mutation or multi-instance ownership.

## Scope and deliverables

1. Draft an ADR in `docs/adr/` using the next unused number (currently `0006`)
   and the proposed name `0006-single-engine-worker.md`. Record the model,
   rationale, rules, watchdog responsibilities, alternatives, residual risks,
   and prerequisites for revisiting confinement. Keep it proposed until the
   maintainer accepts the actual text.
2. On acceptance, add a one-line link under the invariants in
   [the architecture map](../agents/architecture-map.md), identifying the
   worker's ownership and bounded-I/O rule. Until then, link it separately as
   proposed, not yet enforced; do not place the draft among accepted invariants.
3. Link #504, #505, #507, and #508 as known compliance gaps and implementation
   owners. Record acceptance evidence and the final ADR link in this request
   when that later work is authorized and completed.
4. Include the newly identified rookie-name HTTP path in a formal local request.
   Following maintainer approval, GitHub filing/assignment remains required before
   implementation, as recorded in the acceptance section; this does not authorize
   tracker writes during this documentation task. Record
   synchronous local logging as a narrow allowance with sink stalls as a named
   residual risk. No logging ticket or asynchronous logging gates acceptance.

This request is documentation only. It excludes implementing those mitigations,
per-match execution lanes, dependency offloading, pool implementation, changes to
authorization freshness, new protocol behavior, and capacity claims. It neither
closes #509 nor marks the four breaches resolved.

## Required decision content

### Ownership and allowed work

The accepted policy retains one worker for native game mutation and dice,
`SetupApplication` state, protocol/publisher state, recovery/checkpoint ordering,
and decision expiry. State-dependent projections and reads remain subject to
that ownership even when they do not mutate a match. A future offloaded operation
must use an explicitly safe snapshot or isolated input and return through the
owner; adding an executor must not grant access to live mutable engine objects.

State the central rule from #509 directly: **no blocking I/O on the engine worker
without an explicit time bound, and no per-recipient remote calls.** Enumerate
worker-side Firebase, JDBC, rookie-name HTTP, logging, and other potentially
blocking paths. Derive the inventory from a source sweep of worker-reachable
I/O, including native Steps, initialization, error paths, and transitive SDK
operations; the audit and four existing tickets are starting points, not the
inventory's boundary. Record sweep scope, exclusions, and uncertain reachability.
Bounded dependency work may remain on the worker only with an explained aggregate
budget and failure contract. CPU-heavy reads, parsing, and serialization also
need bounded input and work; an I/O timeout alone does not prevent starvation.
Outbound delivery must remain asynchronous and bounded, without waiting on a
recipient's network write from the worker.

The recorded maintainer decision permits local append logging at the configured
level, including existing stderr diagnostics/error output. A local-disk or stderr
stall remains an explicit residual risk, including possible execution-budget
overruns. This is not an allowance for arbitrary file I/O or remote logging;
asynchronous logging is deferred until a move to parallel execution.

The ADR must resolve what "remote calls" includes. #507 specifically prohibits
provider calls during publication but permits local lifecycle/scope refreshes
backed by JDBC. A database call can still be network I/O. State whether the rule
forbids every per-recipient network round trip or specifically provider calls,
and define bounded/batched local authorization work accordingly. Do not silently
exempt JDBC or claim all fan-out authorization is in-memory.

### Time bounds and failure semantics

Require a budget record for each blocking operation or operation family:

- Dependency, call sites, configuration owner, units, finite safe defaults, and
  behavior for missing, zero, negative, or otherwise invalid settings.
  Tickets may be stricter: #505 requires startup rejection of missing timeout
  configuration, rather than silently applying an ADR-level default.
- Connect, read/socket, query/lock/transaction, retry count, backoff, and any
  connection acquisition limits that contribute to the total worker occupancy.
  Explain which controls actually enforce the bound for the pinned SDK/driver.
- Maximum sequential calls per request, including recipient and browse loops.
  Bound the whole operation: a finite timeout on each of N calls is insufficient
  without bounding N and the resulting total delay.
- Failure result, cache invalidation, connection/resource cleanup, unknown
  commit handling, and evidence that the next queued request can run.

The [maintainer decisions](single-engine-worker-adr-0006-review.md#maintainer-decisions-2026-11-09-in-chat-with-the-reviewer)
set a provisional healthy p99 worker-execution target of ≤ 100 ms per task,
with investigation of tasks regularly above about 250 ms, and a worst-case
failure ceiling of ≤ 2,000 ms for an entire request's worker occupancy. Include
all sequential calls, retries, backoffs, native work, publication and cleanup;
helpers must not reset that budget. Keep queue wait and asynchronous delivery
separate from execution. The local-logging sink-stall residual risk is explicit;
it does not expand any remote-dependency allocation. #39 may inform a later
recorded revision. These are policy limits, not measured-compliance claims.

#504 must fit Firebase operation allocations (starting near 1,000 ms) inside the
whole-request ceiling, with no SDK retries on the worker. Its earlier 2,000 ms
connect / 3,000 ms read suggestion exceeds that ceiling and must be replaced.
#505 evaluates about 500 ms connect / 1,000–1,500 ms socket limits and an about
one-second `innodb_lock_wait_timeout` per request session. Each ticket must
verify its controls against the pinned SDK/driver and fit all sequential calls
within the request's remaining budget; these example allocations do not stack
into a larger allowance. A clean statement lock-wait error does not remove the
need to test other uncertain-commit outcomes.

RB1 corrects the earlier static-sum rule. Record per-call caps, reserves and
actual sequential connection counts, rather than requiring their maxima to add
to ≤ 2,000 ms. JDBC connection/statement/commit limits are
`min(perCallCap, remainingRequestTime - requiredReserve)`; fresh connections use
derived properties, with URL precedence and per-statement network timeout
behavior verified against Connector/J 3.5.8. Reject nonpositive usable allowance
without turning it into an infinite wait. Firebase's fixed operation allocation
retains the pre-call admission check. The one-second database lock wait is not a
minimum per-call allowance: a late request may time out sooner, preserving the
existing definite/unknown-outcome distinction.

Keep #506 pooling separate initially. The maintainer delegates bringing it
forward if measured unpooled overhead prevents healthy p99 or the request ceiling.
#505 owns that decision and evidence, after A and the connection/session controls
needed by a pool but before final B acceptance, without creating a dependency
cycle on all of #505 or relaxing the accepted timing targets.

#504 and #505 must also provide circuit breakers shared across requests using
the failing dependency. Repeated timeouts open the breaker for immediate
rejection during a short cooldown, followed by one recovery probe; failure
reopens it. Each ticket chooses/tests thresholds (suggested: three consecutive
timeouts and 5–10 seconds cooldown), with monotonic timing and fail-closed auth.
Validate an outage burst, not only one timed-out call: 128 sequential two-second
timeouts would consume 256 seconds despite per-request compliance. Preserve
expiry/disconnect progress and durable acceptance. The existing #497/#501 timing
traces supply healthy-path execution measurements. #508 still owns its browse
interval choice and must respect the same aggregate ceiling.

Authentication/provider failures must fail closed without extending the ADR
0005 success window. Persistence failure must preserve the single durable
boundary: a timed-out commit may have committed, so an exact retry must reconcile
the durable checkpoint without duplicating an accepted action. Recovery must
not rerun commands or dice. Timing out a waiting future does not itself stop an
underlying operation or make concurrent engine access safe.

### Shared watchdog and lifecycle

Document the existing single daemon `browser-match-write-watchdog`, shared
within each `BrowserMatchTransport` instance. It checks outbound delivery every
100 ms against the current 2,000 ms write-stall threshold and schedules a
coalesced decision check every second. These are observed settings, not an
engine request timeout or a guaranteed deadline-expiry latency.

The watchdog may inspect transport delivery state and enqueue control work.
Actual decision expiry, native mutation, publication, and normal disconnect
cleanup run on the engine worker. It cannot interrupt or unblock a stuck
Firebase/JDBC/name-generator call. A stall can delay decision expiry and queued
disconnect cleanup and retain connection permits. `ServerCommunication.shutdown`
waits at most 20 seconds for draining when called off the initialized worker,
then throws; it does not stop the stuck worker. Earlier lifecycle work, including
adapter-monitor acquisition, can prevent that timed wait from being reached.
Define ownership and bounded behavior for watchdog callbacks; do not move engine
work onto this shared scheduler as a workaround.

### Preconditions for future per-match lanes

A separate design decision and evidence are required before adding parallel
mutation. At minimum it must resolve:

- [Fortuna](../../ffb-server/src/main/java/com/fumbbl/ffb/server/util/rng/Fortuna.java):
  the process-shared mutable RNG/cipher/pool state and its ownership. The
  synchronized `rekeyGenerator` and `addEntropy` methods do not make the
  unsynchronized generation path (`getDieRoll`, `getByte`, `generateRandomData`)
  safe for concurrent use.
- [ScannerSingleton](../../ffb-common/src/main/java/com/fumbbl/ffb/util/ScannerSingleton.java):
  unsynchronized lazy initialization, publication, and exposed mutable scan result.
- [Constant](../../ffb-common/src/main/java/com/fumbbl/ffb/Constant.java) and
  [UtilPassing](../../ffb-common/src/main/java/com/fumbbl/ffb/util/UtilPassing.java):
  `Constant.REPLAY_NAME_MAX_LENGTH` and `Constant.MINIMUM_MOVE_TO_STAND_UP`
  are writable static integers; `Constant.CHECK_AFTER_PLAYER_REMOVAL` and
  `Constant.GRANT_ABLE_SKILLS` are mutable double-brace `HashSet`s (the latter
  also contains mutable arrays). `UtilPassing.RULER_WIDTH` is a writable static
  double. Prove immutability or define safe initialization and access.
- `SetupApplication`, `BrowserV2Adapter`, and publisher maps: explicit ownership
  for match-local and cross-match/session/connection state, including reconnect,
  expiry, publication, and shutdown ordering.
- Durable generation/CAS, exact retries, transcript ordering, and restoration
  under concurrent requests, with concurrency and failure tests. In-process lanes
  do not establish multi-process match ownership.

This list is a minimum audit scope, not certification that all shared state has
been identified. #39 measurements may motivate revisiting the decision but
cannot by themselves satisfy these prerequisites.

## Risks and mitigation ownership

| Risk / trigger | Consequence | Required mitigation or decision | Owner / tracking | Remaining risk |
| --- | --- | --- | --- | --- |
| Stalled Firebase call | Every match waits; expiry and cleanup stop progressing | Enforce whole-request 2,000 ms ceiling and operation allocation, no worker-side SDK retries, circuit breaker and fail-closed rejection | [#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504) | Finite calls still occupy the shared worker |
| Stalled JDBC call or uncertain commit | Cross-match stall; unsafe retries could duplicate an action | Enforce whole-request 2,000 ms ceiling, connection/socket/session-lock bounds and circuit breaker; reconcile both commit outcomes | [#505](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/505) | Timeout cannot prove rollback |
| Stalled name-generator HTTP call inside Riotous Rookies mutation | Every match freezes before checkpoint commit; one sequential GET per rookie multiplies delay | Remove remote name generation in favor of local/generated/fallback names; preserve native ordering | [Formal request](engine-worker-rookie-local-names.md); tracker assignment pending before implementation | Existing fallback does not end a stalled read; partial native work must not be replayed blindly |
| Provider lookup per publication, chat, or preparation-notification recipient | Spectator/subscriber count multiplies provider latency for all matches | Eliminate worker-side provider calls in all three fan-out paths; decide passive-recipient freshness explicitly | [#507](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507) | Security semantics need an ADR 0005 amendment; local checks still cost work |
| Repeated detailed browse/current-match reads | Query and checkpoint-parse work starves gameplay | Rate-limit, batch, and decide lane placement with an aggregate work bound | [#508](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/508) | Advisory scheduling cannot preempt a running request |
| Shared worker/process failure or CPU saturation | All resident matches lose progress together | State the residual failure domain; use durable recovery and measure the operating envelope | ADR author under #509; [#39](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/39) for measurements | Bounded I/O does not provide fault isolation or high availability |
| Parallel lanes added without resolving shared state | Races, corrupted ownership, or broken durable ordering | Require the prerequisite audit and a separately accepted design | Future concurrency proposal | No parallel-lane safety established by this request |

Allowed local append logging has a named residual risk: a local-disk or stderr
sink stall can block normal work or timeout reporting. It is not a compliance-gap
ticket or acceptance gate; asynchronous logging remains deferred until parallel
execution is proposed.

## Alternatives and open decisions

- **Retain serialization with bounded dependencies:** the direction requested by
  #509. It preserves ownership and durable ordering at the cost of cross-match
  contention and a shared failure domain.
- **Offload dependency I/O:** could reduce shared stalls but needs explicit
  snapshot, completion ordering, cancellation, and stale-result rules. Defer
  implementation; do not describe offloading as already safe.
- **Per-match lanes or isolated workers/processes:** could improve throughput
  or isolation but requires the shared-state and ownership work above. Defer
  selection and implementation to a separate proposal.

The maintainer has accepted the policy text, remote-call interpretation, budget
and local-logging allowance, then separately approved #507 option A: local checks
and token expiry on pushes, provider checks on incoming requests. The
[accepted ADR 0005 amendment](../adr/0005-bounded-provider-revalidation.md#accepted-amendment-local-authorization-for-passive-pushes)
records its existing-token-lifetime exposure and unchanged local cutoff controls.
No background provider refresher is required; implementation remains tracked by #507.

## Acceptance criteria

### Draft ready for maintainer review

- The ADR defines the per-process worker, owned state, allowed work, blocking-I/O
  rule, fan-out boundary, and budget-selection/failure contract above.
- It codifies the 100 ms p99 healthy target, investigation above about 250 ms,
  2,000 ms whole-request ceiling, per-dependency allocations and #504/#505 circuit
  breakers, with validation of combined request paths and sustained outages.
- It describes the watchdog's limited role and the expiry, cleanup, admission,
  shutdown, and process-wide residual risks without claiming stall recovery.
- It names all shared-state areas in the future-lanes prerequisites and
  preserves ADRs 0002, 0004, and 0005 or explicitly identifies a required amendment.
- It records alternatives and links each existing gap to its implementation
  ticket or local formal request, identifying outstanding tracker assignment
  before implementation.
  Unknown numeric budgets and security choices are visibly owned;
  nothing is marked implemented without evidence.
- It includes the worker-reachable I/O sweep and addresses the request review,
  including native HTTP, precise mutable statics, and the shutdown wait's limits.
- Before acceptance, the architecture map links the draft separately as proposed;
  after acceptance, the link belongs under the invariants.

### Accepted

- The maintainer accepts the remote-call boundary and final policy text. The
  rookie-name gap has a formal local request; tracker assignment remains required
  before its implementation following the explicit approval recorded below.
  The budget and local-logging decisions are recorded in the ADR review; no
  logging follow-up gates acceptance.
  #507's separate security-policy choice is approved and recorded in ADR 0005;
  implementation controls and tracker prerequisites still apply.
- The architecture map links the accepted ADR under its invariants, removing the
  separate draft pointer. Acceptance is recorded with maintainer
  approval evidence and date before #504, #505, #507, and #508 implementation
  proceeds. Agreement that an ADR is needed does not count as final acceptance.

## Validation and handoff

For this request and template, review issue/comment coverage, code references,
relative links, Markdown formatting, and consistency with existing ADRs. No
application tests or builds are required for these documentation-only edits.

The resulting ADR has completed policy acceptance; repeat source/consistency
checks when implementation changes its evidence or boundaries. The
implementation tickets retain their own runtime proof: stalled-provider and
database tests must show worker progress after failure; commit-timeout tests
must cover committed and uncommitted outcomes; publication tests must prove
zero provider calls and preserved local revocation; browse tests must verify
rate limits and bounded query work. #504 and #505 must verify combined request
paths against 2,000 ms and test sustained-outage circuit opening, immediate
rejections, one-probe recovery and expiry/disconnect progress. The rookie-name
ticket may remove HTTP entirely or prove bounded loop work and safe fallback for
stalled/failed responses; either approach must preserve native and durable
ordering. There is no stalled-logging-sink test requirement under the allowance;
healthy logging cost remains in execution measurements. Capacity evidence belongs
to #39.

## Maintainer acceptance

Accepted on 2026-11-09 in this conversation. Approval evidence: the maintainer
stated, "I approve the ADR." and requested formal feature/fix requests for its
gaps. This approves the policy and remote-call interpretation; it does not claim
runtime compliance. It did not itself select #507's security policy; the later
[option A approval](engine-worker-publication-authorization.md#maintainer-approval)
now resolves that separate decision and is recorded in ADR 0005.

The explicit approval supersedes the earlier pre-acceptance requirement to file
and assign the rookie-name GitHub ticket. Its formal local request is now linked
below; tracker creation/assignment remains a prerequisite before implementation.
No GitHub issue was created or changed during this documentation task.

| Gap | Formal request | Tracking / gate |
| --- | --- | --- |
| Firebase bounds and circuit breaker | [Firebase request](engine-worker-firebase-bounds.md) | Existing #504; after #505 A and pinned-SDK spike; independent slice evidence followed by combined validation |
| JDBC bounds, circuit breaker and durable retry | [JDBC request](engine-worker-jdbc-bounds.md) | Existing #505 owns prerequisite A (budget/control timing), then B (JDBC); combined validation with #504 |
| Publication authorization | [Publication request](engine-worker-publication-authorization.md) | Existing #507; option A / ADR 0005 amendment approved; implementation controls pending |
| Lobby read cost | [Lobby-read request](engine-worker-lobby-read-bounds.md) | Existing #508 |
| Rookie-name remote dependency | [Local-name request](engine-worker-rookie-local-names.md) | New issue/assignment pending before implementation |
| Shared-worker operating envelope | [Concurrent-match envelope](engine-worker-concurrent-match-envelope.md) | Existing #39 |

## Combined request review incorporation

The [request review](engine-worker-requests-review.md) is incorporated into the
six requests and ADR 0006's [handoff order](../adr/0006-single-engine-worker.md#implementation-order).
No implementation, feasibility spike or tracker write is claimed by these edits.

| Findings | Resolution / remaining evidence |
| --- | --- |
| C1 | #505 A owns the existing worker-context extension and shared budget/timing boundary; #504 consumes it. Both controls have symmetric independent slice acceptance with declared bounded doubles; production combined validation remains mandatory |
| C2 (superseded in part by RB1) | Firebase retains fixed-allocation admission; JDBC uses remaining-deadline-clamped connect/network limits. The former static-sum requirement is removed; native/CPU work remains non-preemptible and measured |
| C3 | Explicit order in ADR 0006: rookie/baseline independently; #505 A first; #504 spike before provider fix; #504/#505 B next; #508 and #507 after their controls (option A policy now approved); final #39 last. Separate #513 follows rookie removal |
| C4 / E1 | #505 A adds numeric full-task timing for untracked controls and post-reply work, with enforcement independent of trace flags. #39 owns reporting and cannot certify all-task p99 from ingress-only data |
| C5 / R3 | Existing issues must link revised requests before implementation; rookie issue creation/assignment remains pending. No tracker-write authorization is inferred from this documentation request |
| F1 / F2 | #504 begins with a pinned-SDK spike. Public Firebase and credential transport seams must share the complete cold key/OAuth/revocation deadline; test retry/backoff outside the transport. If no supported mechanism satisfies the accepted no-retry/total-bound policy, seek a separate maintainer decision before implementing the provider fix |
| F3 | Provider availability failures include fast DNS/refusal/5xx/throttling; user/token denials do not trip the shared breaker |
| J1 | Preserve `MATCH_OUTCOME_UNKNOWN`, `SAVE_OUTCOME_UNKNOWN` and `DELETE_OUTCOME_UNKNOWN`. Source verification found preparation already handles `CommitUnknown`; preserve it, while assessing missing standalone membership, principal-creation and preference-write acknowledgement handling |
| J2 / J3 | `db.url` is the one option source; startup rejects missing/invalid/duplicate/conflicting settings. Use `sessionVariables` for lock waits, avoiding an extra session query. Ordinary lock-wait errors do not open the shared availability breaker |
| P1 | One local-authorization batch query per nonempty publication; test 0/1/16 targets and 16 total transport sockets (origin plus up to 15 others) |
| P2 | Maintainer explicitly approved option A after the passive-viewing risk discussion. ADR 0005 now permits local-only pushes until existing token expiry, with incoming-request provider checks unchanged; no background refresher. See the publication request's approval record |
| L1 / L2 | Shared two-token bucket, one refill per 2,000 ms; unsupported/malformed requests do not consume expensive-work tokens. Initial/reconnect/fallback tests are explicit. Budget exhaustion uses `RATE_LIMITED`; actual persistence errors retain their codes |
| R1 / R2 | Preserved the reviewer's existing local-name edits and recorded maintainer approval of placeholders; deletion of shared endpoint code belongs to existing #513 after the rookie change |
| E2 | #39 states at most eight two-coach or sixteen one-coach matches at 16 sockets, reduced by other socket consumers, distinct from 32 resident matches |
| RB1 | User-requested correction: absolute deadline enforces total work; JDBC limits are min(cap, remainder minus reserve), with fresh-connection properties and verified precedence. Late lock waits may be cut short, preserving unknown outcomes. Longest healthy/late-lock paths require runtime proof. #506 may be brought forward by delegated agent decision if measured unpooled overhead prevents the targets |

The accepted [ADR 0006](../adr/0006-single-engine-worker.md) incorporates both
reviews and is linked under architecture-map invariants. Local logging remains
an allowed residual risk without a ticket. Documentation validation covers
template structure, relative links, approval status, gap coverage and consistency
with the source; no application code changed or implementation tests ran.

Preserve unrelated working-tree changes. Follow the delivery workflow when an
implementation handoff is authorized. Do not commit, push, publish, edit GitHub
state without explicit authorization. Record the acceptance already granted;
do not claim any runtime mitigation is complete.
