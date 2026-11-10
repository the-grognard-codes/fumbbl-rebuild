# Feature: Remove provider calls from engine-worker publication fan-out

Tracking: [#507](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507).
Status: option A implemented after [validated #504 controls](engine-worker-firebase-bounds-outcome.md);
[focused/matched integration, clean verification, complete browser gate and rebuilt dev-local smoke passed](engine-worker-publication-authorization-outcome.md).
The outcome records the historical startup diagnostic limitation.
Decision: [accepted ADR 0006](../adr/0006-single-engine-worker.md).
Security policy: [accepted ADR 0005 amendment](../adr/0005-bounded-provider-revalidation.md#accepted-amendment-local-authorization-for-passive-pushes).
Review: [combined findings C3/C5 and P1/P2](engine-worker-requests-review.md).

## Abstract

Stop publication, chat and preparation-notification loops from issuing a remote
provider request for each recipient. Apply approved option A: check local
authorization and token expiry on pushes, retaining provider checks for incoming
requests and accepting passive viewing until the existing token expires.

## Objective

Make worker publication cost independent of provider latency and keep its local
authorization/projection work inside the complete request's 2,000 ms budget.

## Context / Existing Behavior

[ActiveMatchPublisher.publish / publishChat](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/ActiveMatchPublisher.java)
and [BrowserV2Adapter.preparationChanged](../../ffb-server/src/main/java/com/fumbbl/ffb/server/local/BrowserV2Adapter.java)
reauthorize recipients individually. Provider-cache misses may call Firebase
`getUser` on the shared worker. More passive recipients can therefore add remote
round trips to an action and delay every match.

[ADR 0005](../adr/0005-bounded-provider-revalidation.md) bounds provider-success
reuse on incoming requests to five seconds and keeps local checks immediate.
ADR 0006 permits bounded JDBC-backed local refresh in fan-out but prohibits
per-recipient external provider/service calls. The maintainer separately approved
option A after discussing its passive-viewing exposure; ADR 0005 now records that
exception. This approves the policy, not runtime compliance. #490 concerns
request-path cost; that request's authorization semantics stay unchanged.

## In Scope

- Implement the explicitly accepted ADR 0005 local-only passive-push amendment.
- All three publication paths, including players, spectators and preparation
  subscribers, with current recipient-specific projections and visibility.
- Bounded local lifecycle/membership/scope refresh, token expiry and fail-closed
  behavior without provider network I/O from worker fan-out.
- Provider-call-count, authorization, budget and spectator-latency regressions.

## Out of Scope

- Changing request-path authorization, token-expiry rules or recipient visibility.
- Treating existing viewer enrollment as permanent authorization.
- Removing JDBC/local checks, changing rules/protocol formats, or parallel mutation.
- A background provider refresher or a new passive-push verification cache.

## Functional Requirements

- Implement approved **option A**: pushes refresh local lifecycle/scopes and
  token expiry without a provider lookup or a fresh-provider-cache prerequisite.
  Provider revalidation remains on the recipient's own incoming requests under
  the existing five-second reuse rule. No background refresher is required.
- Standard Firebase ID tokens last one hour according to
  [Firebase's session documentation](https://firebase.google.com/docs/auth/admin/manage-sessions).
  A newly issued token could therefore permit passive pushes for roughly its
  remaining hour after Firebase-only disablement, versus the original five-second
  provider reuse window, unless its own request detects revocation sooner.
  This changes provider-only revocation exposure; local lifecycle/scopes still
  take effect on the next push. Do not confuse ID-token
  lifetime with the much longer refresh-token lifetime.
- Bound passive exposure by the existing token's remaining lifetime, never by a
  newly granted hour. Pushes do not refresh tokens, extend expiry or update the
  provider-success cache. Once an explicit provider rejection is observed on an
  incoming request, remove/deny that rejected session's subscriptions. The
  local-only push path never authorizes an incoming action/read/chat/team edit
  or reconnect from expired provider verification.
- For every push in `publish`, `publishChat` and `preparationChanged`, enforce
  token expiry and current local account, identity, scope and relevant membership
  state before delivery. Revocation/removal takes effect on the next push; errors
  fail closed using existing unavailable/removal behavior.
- Publication triggers zero external provider/service calls, including deferred
  calls initiated to satisfy a push. Provider outage or provider-success cache
  expiry alone does not stop eligible passive pushes, but a local authorization/
  database failure or expired token does. Incoming provider failures still fail
  closed and invalidate successful-check cache entries under ADR 0005.
- Exhaustion of the originating request's budget skips that best-effort push
  without retiring otherwise valid subscriptions. This includes typed JDBC
  request-allowance/deadline refusals. Undelivered recipients enter a bounded
  catch-up queue ordered per match (64 publications total, 4 Mi UTF-16 code units
  of retained payload). A new full state supersedes older queued states for that
  match; chat remains ordered and is not coalesced. Reserve transcript capacity
  only for live-transcript recipients or an already loaded frame. Each deferred
  recipient captures permission to load its optional frame at reservation time;
  later capability changes cannot cause an unreserved load. Healthy matches
  deliver immediately when their own queue is empty; deferred matches rotate
  behind peers on retry. A new publication first drains older retained work for
  its own match within the caller's remaining deadline, then attempts its own
  delivery. There is no new inline budget. The existing watchdog checks a volatile pending hint
  every second and schedules a coalesced control task only when work is pending.
  Each control task receives one measured 2,000 ms deadline shared across all
  matches. Each nonempty publication attempt requires one new local batch for
  still-enrolled recipients; neither the original deadline nor an old grant is
  extended. Already delivered chat recipients are not resent; retained publications
  cannot overtake earlier retained publications for the same match, and no
  mutation is rerun. Coalesced state is appended after preceding retained chat. Token expiry and
  enrollment are rechecked, including immediately before payload enqueue.
  Full-time spectators retire after final delivery. Queue overflow explicitly
  fails unavailable and retires affected subscriptions rather than silently
  dropping content. Scheduling is best effort behind other worker tasks, not
  a one-second delivery guarantee. After three deferrals from attempts that began
  with at least 500 ms remaining (including its initial attempt when applicable),
  release the retained payload and send a `publicationDelayed` notice with code
  `PUBLICATION_DELAYED`, match ID and family. Preserve enrollment. Shorter attempts
  may deliver but do not consume the allowance; coalesced replacement states
  inherit only counted deferrals. This prevents another match or the actor's work
  from spending the retry allowance with a nearly exhausted budget.
  The browser keeps its current board and coalesces fresh setup-load/watch or
  preparation reads; delayed chat loads the next missing page. The computer
  client likewise requests a fresh setup read. These are ordinary incoming
  requests with existing provider/local checks, never mutation replay. The notice
  contains no state or authorization grant. Delivery exhaustion alone cannot
  assert lost access; actual denial, expiry and database failures still can.
  Browser gap recovery pages missing public history after coalescing or omitted
  optional frames. This catch-up corrects the stall/lost-chat
  findings in PR #518; it performs no provider work or token refresh.
  Actual local authorization/database failures and token expiry retain the
  existing unavailable/removal behavior.
- JDBC-backed local refresh remains subject to the
  [JDBC controls](engine-worker-jdbc-bounds.md) and the originating request budget.
  Require one batched local-authorization SQL query per nonempty publication,
  covering all target account/identity states, scopes and relevant memberships/
  roles for that publication family; zero queries when no targets remain. Do not
  query once per recipient or hide per-recipient refresh inside a batch facade.
  Cap target processing at the current 16-socket transport bound. With an
  initiating coach occupying one socket, at most 15 other socket recipients
  remain; use 16 as the conservative publisher target-list bound, not permission
  to admit a seventeenth socket. Prove the aggregate for each fan-out family and
  all publication work in the originating task. A separate allowance per viewer must
  not multiply a request beyond 2,000 ms.
- Preserve recipient-specific player/spectator projections, chat and preparation
  semantics, asynchronous delivery and slow-recipient isolation. Passive local
  authorization must not be recorded as successful provider verification.
- Preserve [ADR 0002](../adr/0002-bounded-match-transcript.md) and
  [ADR 0004](../adr/0004-durable-recovery-journal.md): a failed push
  cannot undo or duplicate an already durable action; authorized readers recover
  through existing state/transcript reads.

## Acceptance Criteria

- The accepted ADR 0005 amendment and approval record identify option A, the
  existing-token expiry bound and provider-outage behavior. This policy gate is
  satisfied; implementation and the dependency prerequisites remain outstanding.
- With multiple coaches, spectators and preparation subscribers, tests count
  zero provider calls on the worker across state, chat and preparation fan-out,
  including provider-cache misses and expired provider results.
- Local disablement, identity/scope/membership removal and token expiry deny the
  next push, including during provider outage and reconnect. No recipient gets
  another role's private projection.
- Tests prove passive pushes continue with an expired/missing provider-success
  entry or unavailable provider when local checks/token expiry pass, and stop at
  token expiry or local revocation. Incoming requests still observe five-second
  provider freshness, fail closed on required verification failure, and retire
  the rejected session on observed explicit disablement/revocation. Restart and
  reconnect require ordinary authentication; pushes never extend expiry/cache age.
- A matched spectator capture and query-count/timing evidence show publication
  does not grow with provider latency and fits the complete request ceiling at
  the defined 16-target upper bound. Unit/query-count tests cover 0, 1 and 16
  targets for state, chat and preparation notifications; a transport integration
  case uses 16 total sockets including the origin (up to 15 other recipients),
  with mixed coaches/spectators/subscribers and one authorization query per
  nonempty publication. Report the 100 ms p99 healthy target separately.

## Constraints

- Apply approved option A; do not add a refresher or weaken incoming-request checks.
- Create a new working branch for implementation; preserve unrelated changes.
- Follow Java 21, instance-service and import conventions, worker ownership and
  V2 stored-format compatibility. Apply ADR 0005's accepted amendment explicitly.
- Preserve MUTP presentation and existing browser behavior; add no implementation
  details to player-facing flows. Record visible changes in CHANGELOG.md.
- Do not commit, push, publish, deploy or edit GitHub state without authorization.

## Implementation Guidance

Separate local recipient authorization from provider-refresh decisions at the
existing access/authenticator boundary. Reuse #504's provider failure controls
where appropriate and #505's batched query/budget controls. Follow #505 A and
#504's validated provider controls, with #505 B available for bounded local SQL.
The ADR 0005 policy prerequisite is satisfied. This request does not authorize
duplicate identity caches or a second engine owner. Keep the local push path
separate from incoming-request provider verification. See the
[handoff order](../adr/0006-single-engine-worker.md#implementation-order).

## Validation

Run focused authorization/fan-out tests for every push family and selected
freshness policy, then recovery/transcript regressions. Capture equal workloads
with zero and several spectators, separating worker execution, queue wait,
provider calls, JDBC and asynchronous writes. After code changes, run browser
unit tests/build, relevant multiplayer/chat/reconnect smoke checks and
`tools/target-build.ps1 verify` for the clean server build/tests.

## Completion Notes

Option A is implemented. The [outcome report](engine-worker-publication-authorization-outcome.md)
records local batch authorization, expiry/rejection retirement, privacy corrections,
real SQL/socket/native/provider evidence and validation status.
The revised scope was linked from [#507](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507#issuecomment-6758906523)
before the slice 3 spike. The [initial #504 outcome](engine-worker-firebase-bounds-spike.md)
records the first failed candidate. Its [successful continuation](engine-worker-firebase-bounds-spike-2.md)
preserves the original #504 → #507 order; no dependency exception was applied.
Record
approval, changed freshness guarantee and matched evidence in an outcome report;
diagnose failures until resolved or a concrete blocker is recorded.

### Maintainer approval

On 2026-11-09 the maintainer replied, "I approve." to the recommendation:
"A: local checks on pushes, provider checks on incoming requests." The discussion
explicitly covered up to roughly one hour of continued passive viewing after
Firebase-only revocation, unchanged five-second provider verification reuse on
incoming requests, and local account/scope controls for prompt cutoff. This is
the acceptance evidence for the ADR 0005 amendment and resolves review finding P2.
It does not authorize implementation, tracker writes or publication.
