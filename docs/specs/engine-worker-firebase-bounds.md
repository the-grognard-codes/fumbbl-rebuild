# Feature: Bound engine-worker Firebase calls and fail fast during outages

Tracking: [#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504).
Status: [continued feasibility gate passed](engine-worker-firebase-bounds-spike-2.md);
production implementation pending.
Historical evidence: [initial candidate outcome](engine-worker-firebase-bounds-spike.md).
Decision: [accepted ADR 0006](../adr/0006-single-engine-worker.md).
Review: [combined findings C1-C5 and F1-F3](engine-worker-requests-review.md).
Budget correction: [RB1 replaces the static-sum requirement](engine-worker-requests-review.md#rb1-high-blocks-505-b-and-the-integrated-budget-claims-of-504-the-static-sum-rule-cannot-be-satisfied).

## Abstract

Bound Firebase work on the shared engine worker, disable worker-side SDK retries,
and add a circuit breaker so an outage cannot make every queued request repeat a
full provider timeout. Preserve fail-closed authentication and ADR 0005 freshness.

## Objective

Make provider failure return control to the worker within the request's remaining
2,000 ms aggregate budget, allowing other requests and lifecycle work to progress.

## Context / Existing Behavior

[FirebaseV2PrincipalAuthenticator](../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/FirebaseV2PrincipalAuthenticator.java)
builds Firebase options without explicit HTTP timeouts. Authentication calls
`verifyIdToken(bearer, true)`; reauthorization can call `getUser` when its successful
provider check is outside ADR 0005's fixed five-second reuse window. All browser
requests share one worker; provider delay also delays decision expiry and queued
disconnect cleanup.

#504's original 2,000 ms connect / 3,000 ms read suggestion predates ADR 0006 and
must be replaced. The accepted ceiling is for the complete request, including
sequential provider calls and JDBC, not one HTTP attempt. This local request
adds the accepted budget and circuit-breaker scope to the existing issue; the
GitHub body has not been edited.

The pinned `firebase-admin` 9.4.3 public `FirebaseOptions.Builder` exposes static
connect/read/write settings and `setHttpTransport`, but no public retry switch.
Its internal authorized-request factory installs retry handling for `getUser`
and revocation checks. OAuth refresh from application-default credentials uses
the credential's own transport, outside those Firebase option timeouts. This
requires the bounded feasibility spike below; setting smaller options is not
proof of whole-operation control.

## In Scope

- Explicit finite bounds for every provider-related operation reachable on the
  worker, including transitive credential/key refresh, redirects and cleanup.
- Shared request-budget propagation, provider allocations, and no SDK retries on
  the worker; consume the budget/timing seam owned by #505 deliverable A.
- A pinned-SDK spike proving supported transport/credential deadline and retry
  controls before implementing the provider fix.
- A provider circuit breaker across affected requests/principals and connections.
- Fail-closed error mapping, session-cache invalidation and focused regressions.

## Out of Scope

- Moving provider work off the worker or introducing parallel engine execution.
- Changing ADR 0005's success-cache lifetime or #507's push authorization policy.
- JDBC implementation, connection pooling, or changes to client-visible error codes.

## Functional Requirements

- Limit total worker execution for a request to 2,000 ms under the ADR's stated
  local-logging residual risk. Use one monotonic remaining-budget context from
  task start through response/publication/cleanup; nested calls cannot reset it.
  The [JDBC request](engine-worker-jdbc-bounds.md) owns its prerequisite A in
  `BrowserRequestTiming`/`BrowserMatchTransport`, reusing the existing per-worker
  context and adding control-task timing. Consume that contract; do not create a
  second timer or take ownership of shared transport files under #504.
- Start by evaluating about 1,000 ms total per Firebase operation, covering its
  complete cold key/OAuth/revocation path. Before starting an operation, reject through
  the existing failure path if the remaining request budget cannot cover its
  verified allocation and required remaining work. Do not pretend per-app
  `FirebaseOptions` can be changed per call. Later JDBC calls use deadline-clamped
  connect/network limits from #505 rather than a requirement that all configured
  per-call caps add to ≤ 2,000 ms. A join with verification, a cache miss and
  several queries still shares the same absolute deadline. A 500/750 ms
  connect/read pair can consume 1,250 ms;
  do not present it as a 1,000 ms cap without a verified total-deadline mechanism.
- First spike the pinned Firebase/HTTP/credential dependencies using supported
  public seams. If a supported way to suppress retries is unavailable, the
  required fallback candidate is a custom `HttpTransport` supplied through
  `FirebaseOptions.Builder.setHttpTransport`, enforcing an absolute monotonic
  per-operation deadline and refusing attempts after it expires. Prove it can
  also satisfy the ADR's no-worker-retry policy and full-operation bound; merely
  failing an expired retry's network call is not enough if the SDK sleeps first.
- Construct supported credential types through an `HttpTransportFactory` using
  the same deadline-aware transport policy; do not leave `getApplicationDefault()`
  refresh traffic on an independent unbounded transport. A cold
  `verifyIdToken(bearer, true)` may fetch public keys, refresh an OAuth access token
  and call `getUser` for revocation: all three together share the approximately
  1,000 ms operation allocation, not three allocations. Verify applicable ADC
  credential types and reject/document any unsupported path rather than silently
  bypassing the deadline.
- The spike must exercise SDK response/IOException retry handlers, backoff/sleeper
  behavior, key cache misses and credential refresh. Internal package-private
  retry configuration is not an approved production API; no reflection or SDK
  patching is authorized. If neither supported control nor the custom-transport
  approach proves no retries and bounded total return, stop provider implementation
  at this gate and present the evidence for a separate maintainer architecture/
  dependency decision. A wrapper alone must not be declared feasible by this spec.
- Connect/read settings alone do not prove
  bounded DNS/TLS, key refresh, acquisition or cleanup. Bound the underlying
  call; a timed future that leaves the worker or operation blocked is insufficient.
- Use named settings with finite documented defaults where allowed. Reject
  explicit zero, negative and otherwise invalid settings before serving traffic.
- Open the breaker after consecutive provider timeouts; while open, reject work
  requiring a provider lookup without another blocking provider call. Suggested
  initial values are three timeouts and 5–10 seconds cooldown; choose, document
  and test the actual thresholds and monotonic timing. Admit one recovery probe;
  failure reopens the breaker and success restores normal operation. Scope it
  across requests using the same provider dependency, not per connection.
- Count dependency-availability failures toward opening: deadline/connect/read/
  write timeouts, refused connections, DNS/transport failures, provider 5xx and
  throttling/unavailability responses. Do not count invalid/expired tokens, bad
  signatures, revoked/disabled users or local permission denials as an outage.
  Record exact SDK error classification; successful dependency checks reset the
  consecutive availability-failure streak, ordinary denied identities do not
  masquerade as provider recovery. Test at least refusal/DNS or fast 5xx in
  addition to stalled I/O.
- Initial authentication still verifies revocation. An expired/missing provider
  success cannot authorize while the breaker is open. Existing unexpired positive
  checks may be reused only under the unchanged
  [ADR 0005](../adr/0005-bounded-provider-revalidation.md) rules, with current token
  expiry and local lifecycle/scopes checked on every operation.
- Timeout/rejection must use existing authentication failure responses
  (`AUTHENTICATION_FAILED` / `AUTHENTICATION_REQUIRED` as appropriate), forget
  affected cached sessions, and never cache failure as successful authorization.
  Breaker availability state is distinct from the identity success cache.
- Preserve worker ownership and native/durable ordering. Record ordinary logging
  cost in timing, keeping queue wait separate from execution. Healthy p99 target
  is ≤ 100 ms; investigate repeated execution above about 250 ms rather than
  claiming provider timeout compliance proves healthy latency compliance.

## Acceptance Criteria

- The spike records the pinned public API mechanism, credential transport coverage,
  cold-path total and retry/backoff proof. This gate and #505 deliverable A must
  pass before the #504 fix starts; no production implementation is claimed here.
- Stalled connect, accepted-but-stalled response, transitive refresh and cleanup
  cases return rejection within the operation allocation and remaining request
  ceiling; existing healthy authentication and freshness tests still pass.
- Budget records state provider operation allocation, JDBC per-call caps and
  reserves without requiring a static sum of all call caps. Pre-call Firebase
  admission tests reject an operation when its verified allocation cannot fit;
  longest-path tests prove subsequent JDBC limits shrink to the remaining
  deadline, including late lock waits and non-preemptible native/CPU reserves.
  A complete provider/JDBC request
  proves one ≤ 2,000 ms aggregate bound. For independent slice acceptance while
  #505 B is outstanding, use a declared bounded database double and record the
  noncompliant production dependency, matching #505's rule. Real combined controls
  are required for final integrated validation and whole-runtime claims.
- An outage burst across connections/identities proves breaker opening, zero
  provider calls for rejected work while open, exactly one recovery probe, failed
  probe reopening and successful recovery. It does not spend 128 full timeouts.
- Another queued request, expiry scheduling and disconnect/permit cleanup progress
  after failure; no stale authorization, cache-window extension or bearer logging.
- Invalid configuration and no-worker-retry behavior have regression coverage;
  implementation notes identify effective defaults and the pinned controls used.
- Cold public-key/OAuth/revocation paths, Firebase allocation admission rejection
  and fast provider failures are tested; no retry/backoff or credential transport escapes
  the operation allocation or underlying worker return deadline.

## Constraints

- Create a new working branch for implementation; preserve unrelated changes.
- Follow repository Java 21, service, import and BB2025 conventions. Preserve V2
  protocol, transcript and recovery compatibility and ADRs 0002/0004/0005/0006.
- Retain the local-logging allowance; asynchronous logging is not required.
- Record user-visible failure/recovery improvements under Unreleased in CHANGELOG.md.
- Do not commit, push, publish, deploy or change GitHub state without authorization.

## Implementation Guidance

Run the pinned-SDK spike first; #505 owns the prerequisite budget seam and control
timing. After both gates, keep provider availability state bounded at the
authenticator/runtime boundary and implement #504 independently of #505 B.
Inject a monotonic clock and controllable transport for deterministic tests.
Native/CPU work cannot be preempted; measure complete tasks and report overruns
without inventing an interrupt guarantee. #507 follows these controls under the
approved ADR 0005 option A amendment; #39 performs final combined validation. See the
[handoff order](../adr/0006-single-engine-worker.md#implementation-order).
If measured unpooled connection overhead prevents the combined healthy or failure
targets, #505 owns the evidence-based decision to bring #506 pooling forward
under the maintainer's RB1 delegation; Firebase alone does not implement a pool
or relax the shared deadline.

## Validation

Run focused authentication, cache, circuit-breaker and engine-queue regressions
first with stalled transport coverage, then combined request tests with #505.
Capture execution/queue-wait timing using existing #497/#501 traces. After code
changes, run browser unit tests/build and pinned server unit/build verification
with `tools/target-build.ps1 verify` (clean build), plus relevant V2 smoke checks.

## Completion Notes

The revised scope was linked from [#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504#issuecomment-6758906276)
before the spike. The [initial spike](engine-worker-firebase-bounds-spike.md)
records the first candidate's failed gate; the [owned DNS/TCP continuation](engine-worker-firebase-bounds-spike-2.md)
passed the mechanism and validation gate. No production runtime fix is claimed yet.
Record implementation, settings, timing evidence and validation in a local outcome
report. Investigate failures until resolved or a concrete blocker is recorded.
