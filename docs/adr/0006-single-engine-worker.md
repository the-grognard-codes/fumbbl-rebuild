# Keep one engine worker and bound its blocking dependencies

Status: accepted on 2026-11-09.
Approval: [maintainer acceptance in this conversation](../specs/single-engine-worker-adr.md#maintainer-acceptance).
Date: 2026-11-09
Issue: [#509](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/509)
Request: [single engine worker ADR](../specs/single-engine-worker-adr.md)
Review: [request findings](../specs/single-engine-worker-adr-review.md)
Implementation clarifications: [combined request review](../specs/engine-worker-requests-review.md).
Policy decisions: [maintainer decisions recorded in the ADR review, 2026-11-09](../specs/single-engine-worker-adr-0006-review.md#maintainer-decisions-2026-11-09-in-chat-with-the-reviewer)
Evidence revision: `53edb476af880091bbb88a26e36913f686257ee5`

Retain one `browser-engine` worker per game-server process to own native game
state and serialize browser operations across matches. Require explicit bounds
on blocking dependencies and prohibit external provider/service calls per
recipient during publication. This preserves state ownership and durable action
ordering while containing dependency stalls; it does not isolate matches from
one another or establish that the current runtime meets these rules.

## Decision and boundaries

### One owner across matches

[FantasyFootballServer.run](../../ffb-server/src/main/java/com/fumbbl/ffb/server/FantasyFootballServer.java)
starts one [ServerCommunication](../../ffb-server/src/main/java/com/fumbbl/ffb/server/net/ServerCommunication.java)
worker. [BrowserMatchTransport](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserMatchTransport.java)
queues browser work onto it. Native mutation and dice, `SetupApplication` sessions
and recovery cursors, adapter and publisher maps, state-dependent projections,
checkpoint ordering, decision expiry, and normal disconnect cleanup share that
owner. Work runs serially in the order selected by the transport; this is not a
claim that every ingress message is processed in arrival order across lanes.

Foreground/advisory lanes are scheduling choices on one worker. They cannot
preempt a running task. Current tracked ingress admission is 128 requests, with
16 connection permits; trusted control work bypasses that admission and the
underlying `LinkedBlockingQueue` is unbounded. Those limits are not a global
queue or latency guarantee. Jetty, delivery callbacks, and the watchdog run on
other threads; adapter methods, transport bookkeeping, and delivery state use
locks. Confinement does not mean the whole runtime is lock-free.

Do not introduce parallel access to live mutable engine objects. An offloaded
operation needs isolated inputs or an explicitly safe snapshot, bounded resource
use, and a completion returned to the owner with ordering and stale-result checks.
Introducing an executor or changing a map to a concurrent collection does not
establish these properties.

### Blocking work and fan-out

**No blocking I/O on the engine worker without an explicit time bound, and no
per-recipient remote calls.** Apart from the narrow local-logging allowance
below, the first clause covers network, database, filesystem, diagnostics,
initialization, and error/cleanup paths, including I/O hidden inside native Steps
or dependency SDKs. Unbounded dependency paths are compliance gaps listed below,
not implicit permissions. Waiting on a future counts as
blocking; timing out that wait alone does not cancel the underlying operation.

For the second clause, this decision defines **remote calls** as calls to
external identity providers or other external services. They must not occur
per recipient in `ActiveMatchPublisher.publish`, `publishChat`, or
`BrowserV2Adapter.preparationChanged`, even when each call has its own timeout.
Outbound socket delivery remains asynchronous, with bounded queues and write
stall handling; the worker must not wait for each recipient's write completion.

JDBC-backed authorization is an explicit, limited allowance: refreshing local
account, identity, membership, and scope state may use the application's database
while preserving immediate local revocation. It is network/blocking I/O, subject
to dependency and aggregate fan-out budgets. Batch where possible; otherwise
bound recipient count, query count, and their combined worst-case cost. Do not
claim all local authorization is in-memory or exempt it from the first clause.
The stricter alternative of prohibiting all per-recipient network calls,
including JDBC, is deferred because it requires a separate authorization/batching
design; the maintainer's ADR approval includes this interpretation.

Incoming-request provider freshness remains governed by
[ADR 0005](0005-bounded-provider-revalidation.md): token expiry, immediate local
refresh and successful provider checks reused for at most five seconds without
extending the window on hits. Its [accepted amendment](0005-bounded-provider-revalidation.md#accepted-amendment-local-authorization-for-passive-pushes)
selects option A for passive pushes: local checks and token expiry, no provider
call or fresh-provider-cache prerequisite. Firebase-only revocation may therefore
take effect at existing token expiry or on an earlier incoming request that
detects it; local suspension/scopes stop subsequent pushes. No background
refresher is required. The policy decision is approved; #507 implementation and
validation remain a gap. This exception does not authorize incoming requests
without the existing provider verification.

### Local-logging allowance

The worker may append to local logs at the configured logging level, including
the existing synchronous `DebugLog` path and diagnostic/error output to stderr.
This is a narrow allowance for local append logging, not arbitrary filesystem
work, log archival/compression, or synchronous remote logging/export calls.
Configured filtering remains in effect.

A local-disk or stderr sink stall can still block the worker and exceed the
execution targets below. This is a named, accepted residual risk of the logging
allowance, not a claim that local writes are nonblocking or enforceably timed.
Include ordinary logging cost in measured execution; do not claim a hard bound
under a stalled local sink. No logging ticket or asynchronous-logging change
gates ADR acceptance. Asynchronous logging is deferred until a move to parallel
execution, when its ordering and ownership must be reconsidered.

### Choose and enforce an aggregate budget

The [recorded maintainer decisions](../specs/single-engine-worker-adr-0006-review.md#maintainer-decisions-2026-11-09-in-chat-with-the-reviewer)
define **tolerable cross-match stall** as the following provisional policy:

| Measure | Requirement | Evidence / owner |
| --- | --- | --- |
| Healthy worker execution | p99 per task ≤ 100 ms; investigate tasks regularly above about 250 ms as regressions | Existing per-request timing traces ([#497](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/497), [#501](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/501)); keep queue wait separate |
| Failure occupancy | At most 2,000 ms for one request's complete worker execution, including every dependency call, retry, backoff and cleanup | Each affected implementation ticket proves the aggregate path, not just individual call timeouts |
| Reassessment | Provisional limits may be revised by an explicit recorded decision using the measured operating envelope | [#39](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/39); no need to measure first to adopt these limits |

Worker execution starts when an admitted task begins running and ends when its
worker-side work actually returns, including synchronous nested work, native
processing, publication and cleanup. Splitting a request across helpers must not
reset its budget. Scheduled control tasks use the same execution targets. Queue
wait and asynchronous socket-write completion are measured separately; the
20-second shutdown drain is a different lifecycle wait. The logging sink-stall
exception above remains a residual risk, not a dependency-budget extension.

The 2,000 ms ceiling matches the existing outbound write-stall threshold as a
policy choice; that watchdog does not enforce the worker ceiling. The cited
provider observations of about 100–170 ms inform the choice, not proof that the
healthy target is met. These are design/acceptance limits, not claims of measured
current compliance.

Each mitigation ticket's implementer records operation allocations, named
configuration/defaults, enforcement mechanisms and aggregate validation; the
maintainer reviews them before the control is considered compliant. Missing
values may use documented finite safe defaults unless a ticket is stricter:
in particular, #505 requires startup to reject missing timeout configuration.
Explicit zero, negative, or otherwise invalid bounds must be rejected rather
than selecting an infinite wait.

#505 deliverable A owns the shared request-budget seam and numeric full-task
timing, extending the existing `BrowserRequestTiming` worker context. It must
exist even with diagnostics off and include untracked expiry/disconnect/control
tasks. #504 consumes that seam. Existing reply-time diagnostics alone do not
time all tasks or all post-reply publication/cleanup.

RB1 supersedes the earlier static-sum model: the shared absolute deadline bounds
actual elapsed request work; configured call caps need not sum to ≤ 2,000 ms.
For each JDBC call, derive
`effectiveTimeout = min(perCallCap, remainingRequestTime - requiredReserve)`.
Record caps, native/CPU/cleanup reserves and measured sequential connection
counts. If no positive usable allowance remains, do not start the I/O; never
pass a zero timeout that means unlimited waiting.

Each fresh JDBC connection receives derived connect/socket limits through
per-call `Properties`; prove precedence against configured URL caps in pinned
Connector/J 3.5.8. Tighten subsequent statement/commit network timeouts as the
request progresses using verified millisecond `Connection.setNetworkTimeout`.
Whole-second statement limits alone cannot enforce a subsecond remainder.
Firebase settings remain per-app: admit an operation only when its verified
complete allocation plus required reserve fits the remaining deadline. Do not
assume Firebase options shrink dynamically.

Prove underlying call return, not just a timeout signal or an idle socket limit.
Native and CPU work is non-preemptible: it counts toward the limit, is measured
at complete task exit, and an overrun is a compliance failure rather than a claim
that a timer can interrupt native work. Neither this deadline nor pooling grants
permission to interrupt native mutation or misreport an uncertain commit.

For each operation family, the budget record must cover:

1. Connect/DNS/TLS where applicable, connection acquisition, read/socket,
   statement/lock/transaction/commit, cleanup, retry count, and backoff. Include
   transitive SDK requests such as credential/key refresh and redirects. Verify
   what the pinned SDK/driver can actually bound; a connect timeout is not a
   complete operation deadline.
2. Maximum sequential calls, bytes, recipients, and loop iterations. Account for
   actual elapsed attempts and backoffs across all calls, plus parsing,
   serialization, native work, and failure handling. Reject or redesign work
   whose aggregate cost cannot fit the approved budget. Rate limits and batching
   supplement this budget; neither alone bounds a running request.
3. Measured healthy latency, the selected maximum worker occupancy, units,
   configuration owner, failure outcome, and evidence for the worst retry/stall
   case. Measure queue wait separately from worker execution and record both.
4. How the underlying operation actually returns, releases resources, and lets
   the next request progress. A timeout signal without worker release is not
   compliance; moving the same unbounded call into a scheduler is not a fix.

Dependency allocations are starting points to verify against the pinned SDK
and driver, not independent allowances that can be added beyond 2,000 ms:

- **Firebase (#504):** aim for about 1,000 ms total per operation, with no SDK
  retries on the worker. A pinned-9.4.3 SDK spike is required: there is no public
  retry switch in `FirebaseOptions`. The fallback candidate is a custom
  deadline-aware `HttpTransport` supplied to Firebase and an `HttpTransportFactory`
  supplied to credentials. Prove all cold key/OAuth/revocation calls share the
  allocation, including any retry-handler backoff outside transport calls; an
  expired-attempt check alone cannot prove prompt worker return or no retries.
  If the supported approach fails that proof, require a separate maintainer
  decision before provider implementation, rather than relaxing the accepted
  policy or using SDK internals. A 500 ms connect / 750 ms read pair can already consume
  1,250 ms on one attempt; trim those settings or demonstrate the SDK control
  that caps the total. The ticket's earlier 2,000 ms connect / 3,000 ms read
  suggestion exceeds the whole-request ceiling and must be replaced.
- **JDBC (#505):** start by evaluating about 500 ms connect and 1,000–1,500 ms
  socket caps, clamped at each call to the remaining deadline less reserve, plus
  a low session `innodb_lock_wait_timeout` of about one
  second supplied through Connector/J `sessionVariables`, avoiding a separate
  `SET SESSION` round trip. `db.url` is the sole source of required timeout and
  session caps/options; startup rejects missing/invalid/duplicate/conflicting
  settings. Derived per-call properties are enforcement values, not a second
  operator configuration source; verify they cannot be overridden by longer URL
  values. The one-second lock wait is a database maximum, not a minimum socket
  allowance. With sufficient time, test the clean SQL error; late in a request,
  a shorter network deadline may cut it off first. Preserve definite versus
  unknown-outcome handling, especially at commit, without assuming rollback.

For example, a `join` that performs token verification, a provider cache miss and
several JDBC calls shares one 2,000 ms budget. Neither a 1,000 ms allocation to
each provider call nor a 1,500 ms timeout on each query makes that path compliant.
Enforce the remaining aggregate budget and prove it on the full request path.
Include healthy successful paths and late lock waits; systematically rejecting
valid healthy work does not demonstrate compliance. If measured unpooled
connection overhead prevents the healthy p99 target or request ceiling, the
maintainer has delegated the decision to bring #506 pooling forward. #505 owns
that evidence-based fallback; record the ordering change instead of weakening
targets or forcing artificial cap reductions. Pooling must retain bounded
acquisition, deadline-aware I/O and clean transaction/session reset, and cannot
repair an unproven underlying timeout mechanism by itself.
#507 owns fan-out counts and authorization semantics; #508 owns browse
query/input/rate bounds. Its example browse interval remains a ticket decision.
The [rookie-name fix request](../specs/engine-worker-rookie-local-names.md) is
implemented under #514, assigned before implementation. Slice 1 removes the
remote call and records its [evidence](../specs/engine-worker-rookie-local-names-outcome.md).
Implementation evidence remains required before claiming the other paths meet
the policy.

### Fail fast during sustained dependency outages

#504 and #505 must each include a circuit breaker shared across requests using
the failing dependency, so every queued request cannot repeat the same timeout.
After a small number of consecutive dependency-availability failures, reject immediately during a short
cooldown, then admit one recovery probe. A failed probe reopens the breaker; a
successful probe allows normal work again. Each ticket chooses and tests its
thresholds, scope and monotonic cooldown timing; three consecutive timeouts and
a 5–10 second cooldown are suggested starting points, not fixed settings.
Provider classification includes fast DNS/refusal/transport failures, 5xx and
throttling as well as timeouts; invalid tokens and user revocation are not
availability failures. Ordinary JDBC lock-wait errors do not open the shared
availability breaker; bounded connection/transport failures do.

At 128 tracked requests, consecutive 2-second timeouts could otherwise consume
256 seconds of worker time despite each request meeting its own ceiling. The
breaker must fail fast without further blocking dependency calls while open
and prove that unrelated work, expiry scheduling and disconnect cleanup can
progress. It does not make a failing database available for gameplay. Provider
rejections still fail closed under ADR 0005; an open breaker never grants access
from expired checks. Database rejection and recovery probes preserve the durable
acceptance and uncertain-commit handling below.

### Failures preserve security and durable acceptance

Provider timeouts fail closed through existing rejection handling and never
become cached successes or extend the ADR 0005 freshness window. Database
failures retain existing persistence error behavior: definite failures may use
`PERSISTENCE_FAILED`; uncertain match/preparation outcomes retain
`MATCH_OUTCOME_UNKNOWN`, and saved-team uncertainty retains `SAVE_OUTCOME_UNKNOWN`
or `DELETE_OUTCOME_UNKNOWN`. Preserve existing `OutcomeUnknown` / preparation
`CommitUnknown` handling rather than creating a parallel reconciliation scheme.
Inventory remaining membership/principal/preference write acknowledgement paths
and add safe handling where absent. A commit timeout may
mean either committed or uncommitted: reconcile the durable generation/checkpoint
on an exact retry, without appending a duplicate action or assuming rollback.

[ADR 0002](0002-bounded-match-transcript.md) and
[ADR 0004](0004-durable-recovery-journal.md) remain unchanged. Acceptance waits for
durable commit of an action and its outcomes. Recovery assembles recorded state;
it never reruns accepted commands, dice, clocks, or optional-skill decisions.
Timeouts during native mutation, such as rookie generation, must not cause blind
reexecution of partial work. Any fallback or abort must preserve the owner,
native sequence, and checkpoint contract; its follow-up ticket must prove this.

### Watchdog and shutdown are separate from operation deadlines

The transport has one daemon `browser-match-write-watchdog` per transport
instance. It checks delivery every 100 ms against the current 2,000 ms write-stall
threshold and schedules coalesced decision checks every second. These are
observed settings, not engine deadlines or guaranteed decision-expiry latency.
It may inspect bounded transport delivery state and enqueue control work;
callbacks must remain bounded and must not mutate native match state directly.
Actual decision expiry and publication run on the engine worker.

The watchdog cannot unblock Firebase, JDBC, HTTP, or logging. A stalled worker
delays expiry and queued disconnect cleanup, retaining connection permits until
cleanup can run. In `ServerCommunication.shutdown`, an off-worker caller waits
up to 20 seconds for an initialized worker to drain, then receives an
`IllegalStateException`; the stuck worker is still running. Earlier shutdown
steps or adapter-monitor acquisition can block before that wait starts. The
20-second wait is not a total shutdown bound, cancellation, or recovery mechanism.

## Source sweep and current I/O inventory

The 2026-11-09 source sweep covered Java I/O/network/filesystem/JDBC imports and
call sites in `ffb-server` and `ffb-common`, HTTP helper callers, Firebase entry
points, injected JDBC connections, native Step logging, socket send/close paths,
resource loading/scanning, and blocking waits. Reachability was checked against
the `BrowserV2Runtime` wiring and native engine entry points, rather than limiting
the list to the four audit tickets. It is source evidence, not a stalled-service
test or an exhaustive audit of SDK/driver internals. Repeat it when dependencies,
runtime wiring, native Steps, or I/O call sites change.

| Family and source | Worker reachability / current behavior | Policy application / tracking |
| --- | --- | --- |
| [FirebaseV2PrincipalAuthenticator](../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/FirebaseV2PrincipalAuthenticator.java) | `verifyIdToken(bearer, true)` and cache-miss `getUser` run synchronously; builder sets no explicit HTTP timeouts | #504 must include all transitive provider/credential/key calls and retries |
| [BrowserV2Runtime](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserV2Runtime.java) repository wiring | Match, membership, recovery, principal directory, saved-team, preparation, and skill-preference operations use injected JDBC connections on request paths | #505 covers every injected runtime repository, transaction and cleanup; #508 bounds repeated browse loads |
| [StepRiotousRookies](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/phase/inducement/StepRiotousRookies.java) | Resolved in slice 1: names are assigned locally as `RiotousRookie #n`; the Step makes no name-generator request. The former `UtilServerHttpClient` and FUMBBL endpoint configuration/tools are removed | [#514](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/514), [#513](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/513); [native, no-network and recovery evidence](../specs/engine-worker-rookie-local-names-outcome.md). This resolves this dependency only, not the aggregate request budget |
| [StepExecutor](../../ffb-server/src/main/java/com/fumbbl/ffb/server/StepExecutor.java) / worker error handler → [DebugLog.logInternal](../../ffb-server/src/main/java/com/fumbbl/ffb/server/DebugLog.java) | Synchronous file open/write/flush/close under a monitor. Auth diagnostics and exception reporting can write to stderr. No explicit worker occupancy bound | Permitted by the local-logging allowance at the configured level; local-disk/stderr stalls are residual risks, not a ticket or acceptance gate |
| [BrowserMatchSocket](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserMatchSocket.java) / [BrowserMatchDelivery](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserMatchDelivery.java) | Callback-based `sendString`, bounded per-connection message/byte admission, and watchdog expiry; close/retire can originate outside the worker and queue adapter cleanup | Preserve asynchronous delivery and bounded callbacks; do not wait for recipients or claim transport expiry releases queued engine cleanup immediately |
| Initialization and resources | Configuration files, schema verification, `Fortuna` construction (including network reachability checks), and initial classpath scan are startup work. `FactoryManager`/`RawScanner` also run during factory construction; class loading/resource initialization can occur on first use | Startup I/O is not request I/O merely because it exists in the same module. Verify preload or explicitly budget newly introduced lazy worker-side loads; do not assume classpath scanning is an in-memory operation |
| Compression, JSON and hashing | `UtilJson`, `BoundedJsonStorageCodec`, `CompletedMatch` and `JsonDigest` use in-memory streams/writers on these paths | CPU/heap and input-size budgets still apply; stream APIs alone do not establish filesystem/network I/O |

The sweep also found standalone schema/acceptance/token/cleanup tools. The former
`UtilServerHttpClient` methods had no other callers and were removed in slice 1.
The standalone tools are not asserted to be live request paths. `DebugLog` log archival exists,
but no call to `FantasyFootballServer.closeResources` was found in the inspected
worker paths; revisit archival reachability when lifecycle wiring changes.
Startup initialization does not excuse lazy I/O introduced later. The original
`docs/reviews/2026-11-09-concurrency-audit.md` is absent from this checkout; this
inventory does not claim to reproduce that full audit.

## Alternatives considered

- **Retain one worker with bounded dependencies:** chosen direction for its
  simple native-state ownership and serial durable handling. It retains
  cross-match contention and the shared process/worker failure domain.
- **Offload dependency I/O:** may reduce worker occupancy, but needs snapshot,
  completion-order, cancellation, and stale-result rules. Defer implementation
  until those contracts are designed; offloading cannot mutate live engine state.
- **Per-match lanes or isolated processes:** may improve throughput or fault
  isolation, but changes ownership of shared state and recovery. Defer pending
  the prerequisites below and a separate accepted design.

## Consequences and known gaps

Reviewers gain an explicit owner and a rule for evaluating new blocking work.
Finite operations can still delay every other match; queueing, CPU saturation,
and process failure remain shared risks. Bounded dependency calls do not provide
high availability, preemption, or a measured supported match count.

Local-disk or stderr sink stalls remain a named residual risk under the logging
allowance, including when reporting another dependency's timeout. There is no
logging compliance gap or required logging ticket; asynchronous logging is
deferred until a move to parallel execution.

| Gap / risk | Mitigation owner and required evidence |
| --- | --- |
| Stalled provider work freezes all matches, expiry and cleanup | [Firebase request / #504](../specs/engine-worker-firebase-bounds.md): after #505 A and its SDK spike, bounded complete provider operations without worker retries, circuit-breaker/outage tests and fail-closed behavior |
| JDBC stall or unknown commit outcome | [JDBC request / #505](../specs/engine-worker-jdbc-bounds.md): A owns the prerequisite budget/control-timing seam; B adds connection/socket/session bounds, breaker and existing unknown-outcome contracts |
| Publication/chat/preparation fan-out multiplies provider latency | [Publication request / #507](../specs/engine-worker-publication-authorization.md): zero provider calls during fan-out, preserved local revocation, and accepted passive-recipient freshness amendment |
| Browse/current-match queries and checkpoint parsing starve gameplay | [Lobby-read request / #508](../specs/engine-worker-lobby-read-bounds.md): rate-limit behavior, bounded query/input work and lane decision |
| Name-generator stall occurs between native work and checkpoint | Resolved by [#514](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/514) local names and [#513](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/513) endpoint removal; [evidence and limitations](../specs/engine-worker-rookie-local-names-outcome.md) |
| Shared worker/process remains a single failure domain | [Concurrent-match envelope / #39](../specs/engine-worker-concurrent-match-envelope.md): declared mixed-load envelope, queue wait, p95/p99 latency, resources, failures and cleanup; no authorization for parallel mutation |

The maintainer accepted this ADR on 2026-11-09; approval evidence is linked above.
Formal requests now cover all six rows. The earlier rookie-ticket filing gate
is superseded by that explicit approval: the local request exists, and GitHub
issue creation/assignment remains a tracking prerequisite before its
implementation. Logging requires no ticket. This document changes no runtime
behavior and resolves none of the implementation gaps. The ADR prerequisite to
#504, #505, #507 and #508 is satisfied. #507's option A security policy is also
accepted in the ADR 0005 amendment; runtime compliance still requires each
request's later implementation and validation.

## Implementation order

This order describes prerequisites, not authorization to implement or publish.
Each existing issue must link its revised local request (or incorporate its
scope) before implementation. The rookie issue must be created and assigned;
those tracker writes remain pending explicit authorization.

| Order | Work | Prerequisites / ownership |
| --- | --- | --- |
| Any time | [#514: rookie local names](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/514) | Independent; created and assigned before slice 1 implementation |
| After rookie change | [#513: remove FUMBBL endpoint code](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/513) | Authorized on the same slice 1 branch, after the rookie Step removes the runtime caller |
| Any time | #39 baseline and harness | Independent; mark missing control timing on pre-A baselines |
| First | #505 A: request-budget seam and control-task timing | Owned by #505; extends existing worker context; independently accepted prerequisite |
| Before #504 fix | #504 pinned-SDK spike | Can be investigated independently; must prove supported deadlines/retry and credential controls |
| Next | #504 provider fix and #505 B JDBC fix | Both consume validated #505 A; #504 additionally requires its successful spike |
| Conditional, before final #505 B acceptance | #506 pooling | Bring forward if measured unpooled overhead prevents the targets; #505 A and required bounded connection/session controls come first. Reconcile #506's current after-#505 tracker dependency when writes are authorized |
| Then | #508 lobby reads | #505 B controls; shared two-token read burst and budget-aware rejection |
| Then | #507 publication | Option A / ADR 0005 amendment approved; awaits #504 controls and #505 B for one local-auth batch per publication |
| Last | #39 integrated measurement | All five fixes, including implementation of approved #507 option A; complete ingress/control timing |

Provider and JDBC slices may be accepted independently with a declared bounded
double for the other unfinished dependency and explicit remaining noncompliance.
Neither may claim a production whole-request bound until real combined-path
validation passes. Numeric targets and the local-logging allowance remain as
accepted; these clarifications supply implementable ownership and evidence gates.

## Revisit conditions

Use #39's measured limits or repeated cross-match stalls to motivate a new
proposal, not to authorize parallel mutation. Before any per-match lanes or
multiple owners are introduced, at minimum resolve:

- [Fortuna](../../ffb-server/src/main/java/com/fumbbl/ffb/server/util/rng/Fortuna.java)
  ownership of mutable RNG/cipher/pool state. Synchronized `rekeyGenerator` and
  `addEntropy` do not make unsynchronized `getDieRoll`, `getByte`, and
  `generateRandomData` safe for concurrent use.
- [ScannerSingleton](../../ffb-common/src/main/java/com/fumbbl/ffb/util/ScannerSingleton.java)
  lazy initialization, safe publication, and the exposed mutable `scanResult`.
- [Constant](../../ffb-common/src/main/java/com/fumbbl/ffb/Constant.java): writable
  static integers `REPLAY_NAME_MAX_LENGTH` and `MINIMUM_MOVE_TO_STAND_UP`, and
  mutable double-brace `HashSet`s `CHECK_AFTER_PLAYER_REMOVAL` and
  `GRANT_ABLE_SKILLS`, including the latter's mutable array elements.
  [UtilPassing.RULER_WIDTH](../../ffb-common/src/main/java/com/fumbbl/ffb/util/UtilPassing.java)
  is a separate writable static double. Prove immutability or safe access.
- `SetupApplication`, `BrowserV2Adapter` and publisher maps: match-local and
  cross-match/connection ownership, reconnect, expiry, publication, and shutdown.
- Durable generation/CAS, exact retry and transcript ordering, plus restoration
  and failure tests under concurrent requests. In-process lanes do not establish
  safe multi-process match ownership.

These are minimum prerequisites, not a complete shared-state audit. Any successor
must preserve or explicitly supersede the affected accepted ADRs.
