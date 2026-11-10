# PR #518: independent review dispositions

Review: [complete independent notes](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#issuecomment-6768578581),
against `c2e3a4f8b`. This response covers every recommendation; optional refactors
are distinguished from incorrect recommendations and confirmed defects.

## Behavior findings

1. **Budget exhaustion retires valid passive viewers — accepted and fixed.**
   `V2MatchAccess.PublicationDeferred` distinguishes scheduling exhaustion from
   authorization failure. State, chat and preparation skip the exhausted push
   and retain subscriptions. No SQL starts after exhaustion; typed JDBC
   `NotStarted`/`DeadlineExpired` refusals also skip delivery. Final admission
   still checks token expiry and the same absolute deadline. A later publication
   obtains fresh local authorization; no queued retry or old grant is introduced.
   Generic database failures and known authorization/expiry denials still remove
   subscriptions. Deterministic tests cover every family before admission, after
   batch completion, at final enqueue and after typed JDBC deadline refusal,
   followed by a successful fresh-budget publication to the same recipients.

2. **Denied probes extend cooldown — symptom accepted; proposed healing rejected.**
   The request explicitly says ordinary denied identities must not masquerade as
   recovery ([#504 requirements](../specs/engine-worker-firebase-bounds.md)).
   Treating a rejected identity as availability success would clear the existing
   outage streak/open state and bypass the required positive recovery probe.
   Instead, an unfinished lease's `close()` releases the probe without changing
   `openedAt`, clearing failures or caching identity success. The elapsed cooldown
   stays elapsed, permitting the next identity to probe immediately. Availability
   failure renews cooldown; validated provider success heals. Regressions prove
   one probe at a time, no healing by denials, no delay to the next valid identity,
   unavailable-probe reopening and no positive caching of the denied identity.

## Standards and heuristic recommendations

| Recommendation | Disposition and specific reason |
| --- | --- |
| Explicit `Consumer`/`List` imports | Accepted; fixed at the cited interfaces/authenticator and nearby touched access types. |
| Remove internal spike CHANGELOG item | Accepted. Spike evidence stays in outcome reports; the public list describes user-visible behavior. |
| Give spectator privacy its own CHANGELOG line | Accepted for clarity. It was already stated in the passive-update entry, so it was not absent; it now has a separate line. |
| One `FirebaseProviderRuntime.call(...)` lifecycle | Optional refactor not adopted. Initial authentication verifies signed metadata before revocation and observes rejection on failure; refresh may skip all provider work on a fixed positive-cache hit, then validates `getUser` before healing. Both close the operation before local SQL. A generic callback must preserve these distinct trust/cache/error orderings. No ownership/cleanup defect was demonstrated; the narrow lease-release correction avoids redesigning those proven boundaries. |
| One shared publication dispatcher / `send` helper | Optional refactor not adopted. State creates role-specific projections and optional transcript predecessors, chat distributes an existing page and excludes computers, and preparation sends membership-sensitive invalidations from another subscription map. All retain the final guard after serialization. A generic dispatcher would need to expose these different sources, projections and retirement hooks. The shared authority/budget classification is centralized in `V2MatchAccess`; dispatch remains explicit and regression-tested for all three families. |
| Collapse bounded cause-chain walks | Not adopted. The walkers return different evidence: transport-failure precedence, credential rejection and trusted lifecycle rejection/observer input. Keeping their small bounded walks local preserves classification precedence and avoids a generic traversal API solely for four loops. |
| Collapse duplicate worker startup guards | Rejected as removal of redundant protection. DNS discovery and ADC discovery are independently reachable startup operations; each must refuse request-worker execution. A guard in one entry point cannot protect direct use of the other. |
| Role enum in publication snapshots | Optional model change not adopted. Existing membership/storage/protocol roles are strings throughout this boundary. `publicationRole` already admits only audience-compatible `home`/`away`/`spectator`, denying null/unrecognized values. A local enum adds conversions without changing the authority check; a broader domain migration exceeds this correction. |
| Issuer/subject identity value type | Optional model change not adopted. `VerifiedIdentity` already carries trusted identity plus temporal claims. `ProviderSessionRejection` deliberately exposes only `rejects(principal)`, not identifier getters. Introducing another transferable identity object is unnecessary to preserve that opaque observation contract. |
| Remove two-argument `response(...)` | Accepted cleanup, with correction: it had test callers, though no production caller. Tests now explicitly pass endpoint provenance; production still recognizes lifecycle codes only from the expected identity lookup endpoint. |
| Named no-network test factory | Accepted. SDK doubles use `withoutNetworkForTests`; the flag constructor is private. Production still constructs the owned network transport. |
| Rename generic `Lease.denied(false)` release | Accepted. `Lease.close()` explicitly releases unfinished work without implying any identity/provider verdict. |
| Boolean `availability(...)` name | Accepted; renamed `isAvailabilityFailure(...)`. |
| `startedWrites()` actually counts header callbacks | Accepted; renamed `requestsWithHeaders()`, including cancellation probes/tests. It is not evidence of body-write completion. |
| Inject publication authority separately from `V2PrincipalDirectory` | Optional API redesign not adopted. The default deliberately denies unsupported batch authorization, preserving authentication-only directory implementations without falling back to provider-backed per-recipient checks. The Firebase live-directory implementation explicitly delegates this capability to its local directory. Another constructor dependency would duplicate wiring without fixing a demonstrated authority leak. |

## Scope confirmations and evidence limits

- **Endpoint/header/body/encoding policy:** retained intentionally and now
  documented in the [provider operator notes](../specs/engine-worker-firebase-bounds-outcome.md).
  New Google endpoints fail closed; upgrades require reviewed transport evidence.
- **Spike fixtures:** retained intentionally as production-mechanism regressions.
  Loopback test trust material is not a production credential or TLS override.
- **Spectator projection:** intended privacy correction. Acting-coach formations
  and block previews are invalid/private in spectator projections; the original
  source projection is preserved. It now has a separate public changelog line.
- **Narrow SDK revocation retirement:** documented next to the accepted passive
  exposure in the [publication outcome](../specs/engine-worker-publication-authorization-outcome.md).
  The SDK denial does not disclose a cutoff for later authentication times;
  widening it speculatively could retire valid post-revocation sessions.
- **Timing/capture not rerun by reviewer:** agreed evidence limitation of that
  review, not a claim that the measurements failed. The committed sanitized
  measurements and outcome identify the actual provider/JDBC/native workloads,
  pool configuration, sinks versus real sockets, fixture hashes and limitations.
  Historical measurements are not relabeled as new executions.

## Revision validation

The new regressions failed before the fix (three budget failures and one denied-
probe error). Focused corrected validation passed 103 tests, zero failures/errors
and no skips, including real loopback TLS/credential/cancellation tests, unchanged
incoming freshness, rejection retirement and transcript behavior.
Evidence: `.tools/pr518-revisions-{red,focused-final}.log`.
Final clean, real provider/JDBC and rebuilt runtime validation is pending.
