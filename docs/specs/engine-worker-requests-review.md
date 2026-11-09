# Review: ADR 0006 engine-worker fix requests

Reviewer: Claude (planner/reviewer role). Date: 2026-11-09.
Decision under review: [ADR 0006](../adr/0006-single-engine-worker.md), accepted.
Basis: the checkout at `main` 53edb476a (#502). Source references were checked in that
checkout. The pinned `firebase-admin` 9.4.3 jar was inspected with `javap`.

| Request | Tracking |
| --- | --- |
| [Firebase bounds and circuit breaker](engine-worker-firebase-bounds.md) | #504 |
| [JDBC bounds and durable retries](engine-worker-jdbc-bounds.md) | #505 |
| [Publication authorization](engine-worker-publication-authorization.md) | #507 |
| [Lobby read bounds](engine-worker-lobby-read-bounds.md) | #508 |
| [Local rookie names](engine-worker-rookie-local-names.md) | no issue yet |
| [Concurrent-match measurement](engine-worker-concurrent-match-envelope.md) | #39 |

## Verdict

All six requests are complete enough to start. They agree with the ADR, they don't
over-claim, and their acceptance criteria can be tested. The main gaps:

- **Mechanism.** Two required controls cannot be built as written with the pinned
  libraries (C2, F1).
- **Ownership.** No request owns the shared request-budget seam that #504 and #505 both
  depend on (C1).
- **Measurability.** The ADR's per-task targets apply to control tasks that nothing
  times today (C4).

Resolve C1, C2 and F1 before implementation starts on #504 or #505. Everything else can
be fixed while those requests are being implemented.

The maintainer accepted `RiotousRookie #n` naming (R1). Removing all code that targets
FUMBBL-hosted endpoints is backlogged as
[#513](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/513) (R2).

Severity: **High** blocks a correct implementation, **Medium** risks rework or a
misleading result, **Low** is a clarification. Findings marked *judgement* are policy
choices for the maintainer, not defects.

## Cross-cutting findings

### C1 (High): no request owns the shared request-budget seam

Both [Firebase](engine-worker-firebase-bounds.md#functional-requirements) and
[JDBC](engine-worker-jdbc-bounds.md#functional-requirements) require "one monotonic
remaining-budget context". Each says only to "coordinate ownership" with the other. The
two acceptance sections are also asymmetric:
- #504 has a fallback: "record which dependency remains noncompliant".
- #505 says "prove … the complete request's ≤ 2,000 ms budget, jointly with #504", with
  no fallback.

**Failure scenario:** both implementers wait for each other, or each builds its own timer
and the two reset each other's budget. #505 also cannot reach acceptance before #504
lands.

**Fix:**
- Assign the seam to exactly one slice, either a small prerequisite or #505, since JDBC
  appears on almost every request path.
- Build on the existing per-request context: the `ThreadLocal<Request>` in
  [BrowserRequestTiming.java:23](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserRequestTiming.java)
  already spans each tracked request on the worker.
- Give #505 the same "record the noncompliant dependency" fallback as #504.

### C2 (High): "shrink each call to the remaining budget" has no feasible mechanism

Both requests ask for per-call allocations that shrink to the remaining request budget.
The pinned controls are static or coarse:
- Firebase connect/read/write timeouts are fixed per `FirebaseOptions`, and so per
  `FirebaseApp`.
- MariaDB Connector/J `connectTimeout` and `socketTimeout` are fixed per connection.
- JDBC `Statement.setQueryTimeout` takes whole seconds.

At the same time, the specs exclude offloading ("Out of Scope") and forbid timed futures
that leave the operation blocked. That leaves no compliant way to give a later call less
time.

**Fix:** state the enforcement model explicitly:
1. **Static allocations.** Choose fixed worst-case allocations so that the longest
   request path (for example `join`: token verification, a provider cache miss and N JDBC
   calls) sums to ≤ 2,000 ms. Record that sum in the budget record.
2. **Fail-fast pre-call check.** Before each dependency call, if the remaining budget is
   below that call's allocation, fail with the existing failure response rather than
   start the call.
3. **Per-call JDBC adjustment where it helps.** `Connection.setNetworkTimeout(executor,
   ms)` gives millisecond, per-call control for JDBC. No equivalent exists for Firebase
   without a custom transport (see F1).
4. **Native work is not preemptible.** The budget is enforced at I/O boundaries only.
   Native and CPU work counts toward the total but cannot be interrupted, and the budget
   record should say so.

### C3 (Medium): no sequencing across the six requests

Each request names some neighbours, but nothing gives the order. Recommended order:

| Order | Work | Depends on |
| --- | --- | --- |
| Any time | Rookie local names | Nothing; independent |
| After rookie names | #513 FUMBBL endpoint removal | Rookie change (it removes the last runtime caller) |
| Any time | #39 baseline run and harness | Nothing (a baseline only) |
| 1 | Request-budget seam (C1) | Nothing |
| 2 | #504 Firebase and #505 JDBC, in parallel | Seam; F1 spike for #504 |
| 3 | #508 lobby reads | #505 controls |
| 3 | #507 publication | Accepted ADR 0005 amendment; #504 controls |
| Last | #39 integrated run | All five fixes |

Record this order in ADR 0006's gap table, or in each request's Implementation Guidance.

### C4 (Medium): control tasks are untimed

The ADR says "Scheduled control tasks use the same execution targets" (p99 ≤ 100 ms,
ceiling 2,000 ms). Timing only exists for tracked ingress, though:
[BrowserMatchTransport.java:155](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserMatchTransport.java)
creates a timing `Request` only when `trackedIngress` is true.

**Failure scenario:** decision expiry, disconnect cleanup and other control work run on
the worker without measurement. #39 then cannot report the per-task p99 that the ADR
defines.

**Fix:** add worker-task timing for untracked control work, numeric only, using the
#497/#501 diagnostics. Put it in #39's In Scope or in the C1 seam.

### C5 (Low, process): tracker state lags the requests

- #504, #505, #507 and #508 all say "the GitHub body has not been edited".
- The rookie request has no issue.

Before implementation starts, link each spec from its issue (or update the issue body),
and create and assign the rookie issue.

## #504 Firebase bounds and circuit breaker

### F1 (High): "disable SDK retries on the worker" may not be possible with the public API

In `firebase-admin` 9.4.3:
- `com.google.firebase.internal.ApiClientUtils.DEFAULT_RETRY_CONFIG` is package-private.
- `newAuthorizedRequestFactory(FirebaseApp)` applies it to user-management requests,
  which is the `getUser` path at
  [FirebaseV2PrincipalAuthenticator.java:120](../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/FirebaseV2PrincipalAuthenticator.java),
  and also to the revocation check made by `verifyIdToken(…, true)`.
- `FirebaseOptions` exposes only connect, read and write timeouts and an `HttpTransport`.
  No public retry setting was found.

**Failure scenario:** the implementer sets small timeouts. A 5xx response or a slow
upstream then triggers SDK retries with backoff. Each attempt fits its timeout, but the
operation as a whole exceeds its ~1,000 ms allocation and the request ceiling.

**Fix:**
- Make a short spike the first step, against the pinned SDK version.
- If retries cannot be disabled, the agreed fallback is a custom `HttpTransport`, passed
  through `FirebaseOptions.Builder.setHttpTransport`. It enforces an absolute
  per-operation deadline and fails retry attempts immediately once the deadline passes.
- Write the chosen control into the request so acceptance tests it.

### F2 (Medium): credential refresh bypasses the Firebase timeouts

[FirebaseV2PrincipalAuthenticator.java:36](../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/FirebaseV2PrincipalAuthenticator.java)
uses `GoogleCredentials.getApplicationDefault()`. Its OAuth token refresh uses the
credential's own transport factory, which the `FirebaseOptions` timeouts do not cover.

`verifyIdToken(bearer, true)` at `:55` can therefore make three sequential HTTP calls on
a cold path:
1. a public-key fetch;
2. an OAuth access-token refresh;
3. `getUser` for the revocation check.

The request does mention "transitive credential/key refresh" in general terms. Make it
concrete:
- Build credentials with an `HttpTransportFactory` that uses the same deadline transport.
- State that the ~1,000 ms per-operation allocation covers all three calls together.

### F3 (Low): which failures count toward the breaker is undefined

The breaker counts "consecutive provider timeouts". Fast failures, such as a refused
connection, a DNS failure or repeated 5xx responses, are not timeouts. Under F1 they can
still be slow once retries add up. Define which failure classes count toward opening the
breaker, and test one fast-failure case.

## #505 JDBC bounds and durable retries

### J1 (Medium, accuracy): the failure contract misses `MATCH_OUTCOME_UNKNOWN`

The request says "Persistence failures return the existing `PERSISTENCE_FAILED` result".
That is incomplete. Uncertain commits already have their own contract:
- The response code is `MATCH_OUTCOME_UNKNOWN`
  ([SetupApplication.java:197](../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/SetupApplication.java)
  and `:475`).
- It is raised from existing `OutcomeUnknown` types: `JdbcMatchRepository.java:73`,
  `JdbcRecoveryRepository.java:152` and `:194` (thrown when `commitAttempted`), and
  `BrowserSavedTeamJson.java:80`.

**Failure scenario:** an implementer maps a commit-time socket timeout to
`PERSISTENCE_FAILED`, or builds a second reconciliation mechanism. The client then loses
its signal to retry the exact same request.

**Fix:**
- Inventory the existing uncertain-commit handling.
- Require it to be preserved.
- List which runtime repositories lack it today (preparation, membership, principal,
  skill preferences) and therefore need new handling.

### J2 (Medium): where timeout settings live and how they are validated is unspecified

Every connection comes from `DriverManager.getConnection(DB_URL, …)` per call
([FantasyFootballServer.java:87](../../ffb-server/src/main/java/com/fumbbl/ffb/server/FantasyFootballServer.java)),
with no pool. "Startup must reject missing … timeout settings" does not say where those
settings are supplied:
- parameters inside `DB_URL`, or
- new named `IServerProperty` keys merged into the URL.

**Fix:**
- Pick one source, and specify how startup validates it, including a URL that already
  carries conflicting parameters.
- Set `innodb_lock_wait_timeout` through Connector/J `sessionVariables` instead of a
  `SET SESSION` statement. Without pooling, a separate statement adds a round trip to
  every connection.

### J3 (Low): lock-wait classification needs a stated default

The request rightly requires explicit, tested lock-wait classification but chooses no
default. Make the default "lock-wait errors do not count toward the breaker". Otherwise
contention on one hot row can open a server-wide breaker and reject every match's
database work.

## #507 Publication authorization

### P1 (Medium): "the admitted recipient limit" is never defined

Acceptance requires publication to fit the request ceiling "at the admitted recipient
limit", but no number is given. The effective cap is the transport connection limit,
`MAX_CONNECTIONS = 16`
([BrowserMatchTransport.java:20](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserMatchTransport.java)).

**Fix:**
- State the bound and the test configuration.
- Require one batched local-authorization query per publication, rather than one per
  recipient.

Without a stated bound, "batch where possible" makes the cost depend on spectator count,
and the "fits at the limit" proof has nothing to measure against.

### P2 (Low, judgement): give the maintainer the input for the ADR 0005 choice

The request correctly refuses to choose between (a) and (b). It would help the decision
to state the expected exposure under option (a). For a Firebase-only disablement, the
worst case is roughly the remaining ID-token lifetime: up to about one hour for standard
Firebase ID tokens, set against the five-second reuse window today. The local
lifecycle/scope checks remain immediate under either option.

## #508 Lobby read bounds

### L1 (Medium): legitimate client reads collide with a strict 2,000 ms interval

The browser client sends `browse` as soon as authentication succeeds
([v2-client.ts:305](../../browser-client/src/v2-client.ts)). If the server rejects
`includeDetails`, the client immediately re-requests `browse`
([v2-client.ts:330-334](../../browser-client/src/v2-client.ts)). A single shared allowance
across `browse` and `currentMatches` with a fixed 2,000 ms interval would:
- rate-limit that immediate fallback read, and
- rate-limit any `currentMatches` request the lobby issues during the same load.

So a normal connect or reconnect can show a `RATE_LIMITED` state.

**Fix:**
- Specify a small burst allowance (for example a token bucket with two tokens and one
  refill per 2,000 ms), or exempt the protocol-fallback retry.
- Add a reconnect and initial-load case to the browser acceptance tests.

### L2 (Low): the over-budget failure response is not named

"Fail using a documented compatible response" leaves the code open. Choose an existing
code, such as `PERSISTENCE_FAILED`, or reuse `RATE_LIMITED` with retry semantics. This
keeps the lobby's retry handling to one well-defined path.

Lane note (accurate as written): `browse` and `currentMatches` are not advisory today.
[BrowserMatchTransport.java:213](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserMatchTransport.java)
treats only `movementRange`, `movementPreview`, `routePreview` and diagnostics probes as
advisory.

## Rookie local names

### R1 (resolved): players will see placeholder names

The fallback is the string `"RiotousRookie #" + index`
([StepRiotousRookies.java:75](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/phase/inducement/StepRiotousRookies.java)).
Using it gives every Riotous Rookie a placeholder name in the pitch, player cards,
transcript and replay.

**Maintainer decision (2026-11-09, in chat with the reviewer):** `RiotousRookie #n` names
are acceptable for now. No local name list is required. Record the change in
CHANGELOG.md as a user-visible naming change.

### R2 (backlogged as #513): remove all code that targets FUMBBL-hosted endpoints

**Maintainer decision (2026-11-09, in chat with the reviewer):** code that points to
FUMBBL-hosted service endpoints must be removed, not just bypassed.

The removal is backlogged as its own issue,
[#513](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/513). The rookie
request stays limited to local `RiotousRookie #n` naming. It deletes only the Step's own
`rookieName`/`unquote` code and defers the shared code to #513, so #513 depends on the
rookie change landing first.

#513 removes the following, which were found by `git grep` over tracked source
(excluding `.notes/`, `.tools/`, `site/` and docs):

| Location | What it is | Action |
| --- | --- | --- |
| [StepRiotousRookies.java:92-117](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/phase/inducement/StepRiotousRookies.java) | `rookieName` HTTP lookup and `unquote` | Delete; assign the `"RiotousRookie #" + index` name directly at `:75` |
| [ServerUrlProperty.java](../../ffb-server/src/main/java/com/fumbbl/ffb/server/ServerUrlProperty.java) | Enum whose only member is `FUMBBL_NAMEGENERATOR_BASE` | Delete the enum |
| [ServerUrlPropertyTest.java](../../ffb-server/src/test/java/com/fumbbl/ffb/server/ServerUrlPropertyTest.java) | Tests for that enum | Delete with the enum |
| [IServerProperty.java:20-21](../../ffb-server/src/main/java/com/fumbbl/ffb/server/IServerProperty.java) | `FUMBBL_BASE` / `FUMBBL_PORT` keys | Delete after confirming no other reader |
| [UtilServerHttpClient.java](../../ffb-server/src/main/java/com/fumbbl/ffb/server/util/UtilServerHttpClient.java) | Shared HTTP helper; its only worker caller is the rookie Step (ADR 0006 inventory) | Delete if no caller remains; otherwise record the remaining caller and its endpoint |
| [CollectRosters.java:24-26](../../ffb-tools/src/main/java/com/fumbbl/ffb/tools/CollectRosters.java) | Offline tool that fetches `www.fumbbl.com/xml:roster` | Delete the tool (and any helper used only by it, such as `ffb-tools` `UtilUrl`, if nothing else uses it) |
| [ffb-common UtilUrl.java:31-36](../../ffb-common/src/main/java/com/fumbbl/ffb/util/UtilUrl.java) | `main()` demo that builds `fumbbl.com` URLs | No callers of `createUrl` were found outside this file, so delete the class (or at least its `main` method) |

Also check:
- `ffb-common/keystore.jks` contains the bytes `fumbbl.com`, most likely a certificate
  subject. Confirm whether it is used; this is not necessarily an endpoint.
- Configuration and deployment files: no tracked `.ini`, `.properties`, YAML, script or
  Dockerfile sets `fumbbl.base`, `fumbbl.port` or `fumbbl.namegenerator.base`. Recheck at
  implementation time.

#513's acceptance criteria:
- A repository search finds no FUMBBL-hosted URL or FUMBBL endpoint property in tracked
  runtime or tool source.
- The build and tests pass with the deleted classes gone.

The rookie request has been revised to match: its abstract records the decision, and
its Out of Scope names #513.

### R3 (Process)

As the request already states, create and assign the tracking issue before
implementation.

## #39 Concurrent-match envelope

### E1 (Medium): add control-task timing

See C4. Without it, the "healthy p99 per task" result covers ingress requests only, and
the report cannot show compliance for expiry and cleanup work.

### E2 (Low): state what concurrency the admission limits allow

Resident capacity is 32
([SetupApplication.java:227](../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/SetupApplication.java)),
and the request handles that limit well. Also state the active ceiling it implies: 16
sockets allow at most 8 matches with both coaches connected, or 16 with one coach each.
That way, "admitted gameplay subset" has a concrete expected size before any run.

## Items checked and found accurate

- The ADR's I/O inventory matches the source:
  - Firebase options set no timeouts.
  - `DriverManager` opens a connection per call.
  - The rookie HTTP call runs inside native mutation, after `rollGender` and before
    player creation.
- Transport limits match the code: 16 connections, 128 tracked ingress, 112 advisory.
- `RATE_LIMITED` and per-connection limiter cleanup already exist for diagnostics probes
  (`BrowserV2Adapter.java:175-179`, `:520`, `:528`). #508 can extend that pattern as it
  proposes.
- None of the requests authorize parallel mutation or offloading, or relax ADR 0002,
  0004 or 0005.

No implementation was performed. This review changes no runtime behavior or tracker state.

---

# Round 2: re-review of the revised requests (2026-11-09)

Scope: the six requests as revised at 11:21, ADR 0006 (including its new
[Implementation order](../adr/0006-single-engine-worker.md#implementation-order)), and
the accepted [ADR 0005 amendment](../adr/0005-bounded-provider-revalidation.md#accepted-amendment-local-authorization-for-passive-pushes).
Also checked: `origin/main` e9ed91bf8 (#512, concurrency audit), which this checkout
has not pulled yet.

## Status of round-1 findings

| Finding | Status | Where it is addressed |
| --- | --- | --- |
| C1 budget-seam owner | Resolved | #505 deliverable A owns the seam; both requests have a symmetric bounded-double fallback |
| C2 remaining-budget mechanism | **Superseded by RB1**: the adopted fix is internally inconsistent | #504, #505 |
| C3 sequencing | Resolved | ADR 0006 Implementation order |
| C4 control-task timing | Resolved | #505 A; consumed by #39 |
| C5 tracker state | Open, see RB3 | — |
| F1 SDK retries | Resolved as a gate | #504 spike, with a stop-and-escalate rule |
| F2 credential transport | Resolved | #504 (`HttpTransportFactory`; three cold calls share one allocation) |
| F3 breaker classes | Resolved | #504 |
| J1 unknown-outcome codes | Resolved | #505 (also covers preparation `CommitUnknown` and saved-team codes) |
| J2 configuration source | Resolved | #505 (`db.url` only; strict validation; `sessionVariables`) |
| J3 lock-wait classification | Resolved | #505 (lock waits excluded from the breaker by default) |
| P1 recipient bound | Resolved | #507 (16-target bound; one batched query per publication) |
| P2 decision input | Resolved | Option A approved; ADR 0005 amended |
| L1 limiter vs. reconnect | Resolved | #508 (two-token bucket; fallback not charged) |
| L2 over-budget code | Resolved | #508 (`RATE_LIMITED`) |
| R1–R3 rookie | Resolved / backlogged | Placeholder naming accepted; endpoints moved to #513; issue still missing (RB3) |
| E1–E2 envelope | Resolved | #39 |

## Roadblocks

### RB1 (High, blocks #505 B and the integrated budget claims of #504): the static-sum rule cannot be satisfied

This finding corrects my own round-1 C2 recommendation.

#505 now requires "fixed, verified worst-case allocations … Record the longest admitted
request-path sum … at ≤ 2,000 ms". #504 requires the same "static worst-case
request-path sums". Combined with the other numbers in the same requests, that sum
cannot fit:

- **No pooling.** Every repository call opens a new `DriverManager` connection
  (`FantasyFootballServer.java:87`). The #512 audit (H2) counts several connections in
  series per gameplay action: principal reauthorization, membership, the
  checkpoint-time reload, and the checkpoint write. Pooling (#506) is out of scope.
- **Lock-wait floor.** `innodb_lock_wait_timeout` is specified at about one second, and
  the socket timeout must exceed it so that lock conflicts surface as SQL errors. Lock
  wait is set in whole seconds, so any statement that can wait on a row lock needs a
  socket allocation above 1,000 ms.
- **Provider allocation.** A cold provider operation is allocated about 1,000 ms.

**Worked example:** a `join`, or a first action after the provider cache expires, has
1,000 ms of Firebase plus four or more connect allocations plus at least one statement
of more than 1,000 ms. That exceeds 2,000 ms before any native work. The implementer
must then either break the lock-wait rule or fail acceptance.

**Fix (amend #505, and #504's matching sentence):**
1. **Enforce the aggregate with the deadline, not a static sum.** Each call's effective
   timeout is `min(per-call cap, remaining − reserve)`. The budget record lists the
   per-call caps and reserves. Tests prove that the deadline holds on the longest
   paths, including a lock wait late in the request.
2. **JDBC can do this per call.** Connections are opened per call, so `connectTimeout`
   can be passed in per-call `Properties` from the remaining budget. Verify how
   Connector/J 3.5.8 resolves this against the same option in `db.url`. Statements can
   then use `Connection.setNetworkTimeout(executor, ms)`.
3. **Firebase options remain static.** Keep the pre-call admission check: reject if the
   remaining budget is below the verified operation allocation.
4. **Lock wait.** Either accept that a lock-waiting statement may be cut short by the
   request deadline (as a definite failure, or `OutcomeUnknown` if it happens at commit,
   both already handled), or evaluate a lock wait of 0 (fail immediately, where the
   pinned MariaDB version supports it) for paths where retry is cheap.
5. **Connection count.** Record the measured number of connections on the longest
   paths. If even deadline enforcement leaves the healthy p99 target (≤ 100 ms) or the
   ceiling unreachable, pull #506 pooling forward as an explicit maintainer decision
   rather than shrinking allocations below healthy latency.

#505 deliverable A (seam and timing) is not affected and can start now.

### RB2 (High, process; blocks every handoff): the governing documents are not committed

The following are untracked or modified in a `main` working tree that is one commit
behind `origin/main`:
- ADR 0006;
- the ADR 0005 amendment;
- all six requests;
- the two ADR review records;
- this review.

An implementation branch cut from `origin/main` will contain none of them. Every
request's "Decision", the option A approval and the implementation order exist only on
this machine.

**Fix:** with the maintainer's authorization, pull #512, then commit the ADRs, requests
and reviews through the normal docs PR before any implementation branch is created.

### RB3 (Medium, process; blocks starting each slice under the requests' own gates)

ADR 0006's Implementation order states that "each existing issue must link its revised
local request … before implementation". The rookie issue must be created and assigned.
Neither has happened: #504, #505, #507, #508 and #39 do not link their revised scope,
and the rookie request has no issue. This is cheap to fix but needs tracker-write
authorization.

## Not roadblocks (proceed, or track)

- **#504 spike may fail.** This is a designed gate, not a defect. A hint for the spike:
  the transport is a public seam, so a wrapper that converts retryable 5xx responses
  into a non-retryable failure before the SDK's response handler would avoid backoff
  sleeps. If even that is unsupported, the likely escalation is to keep the SDK only for
  local JWT verification and to make the revocation lookup through an owned, bounded
  HTTP client. That is a dependency decision for the maintainer.
- **ADR 0006 is stale against #512.** Line 299 says the concurrency audit "is absent
  from this checkout". It now exists on `origin/main`; reconcile the inventory after
  pulling. Audit J3 (the watchdog shares one scheduler thread with deadline checks) is
  not covered by any request. It is a candidate for later work, not a prerequisite.
- **Remaining work in #507, #508 and #39 is implementation detail** that the requests
  already specify adequately.

## Answer

Three items block implementation:
1. **RB1:** fix the static-sum budget rule in #505 (and the matching sentence in #504)
   before #505 B or any whole-request claim.
2. **RB2:** commit the ADRs, requests and reviews before any branch is cut.
3. **RB3:** link the existing issues and create the rookie issue.

Once RB2 and RB3 are done, #505 A, the #504 spike, the rookie change and the #39
baseline can start. RB1 is needed only before #505 B begins.
