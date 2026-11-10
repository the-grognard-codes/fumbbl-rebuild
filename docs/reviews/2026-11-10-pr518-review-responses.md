# PR #518: independent review dispositions

Follow-up: [automatic publication catch-up and the eight inline review dispositions](2026-11-10-pr518-catch-up-review.md) supersede the earlier skip-until-next-publication behavior.

Review: [complete independent notes](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#issuecomment-6768578581),
against `c2e3a4f8b`. This response covers every recommendation; optional refactors
are distinguished from incorrect recommendations and confirmed defects.

## Spec

Independent follow-up at `0717c4d70`: **APPROVE**, no actionable findings remain.
Projection-read deferral and fresh-batch recovery are covered; final enqueue
checks expiry/budget, actual denials still retire, and denied probes neither heal
nor renew cooldown. The reviewer ran no builds; root validation is recorded below.

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
   Revision review found the same typed deadline path in the subsequent player/
   computer projection read; its state-dispatch catch now defers too. A separate
   regression injects both typed refusals into `publishedState`, then proves the
   same player and spectator receive a later fresh-batch publication.

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

## Standards

Independent follow-up at `0717c4d70`: **APPROVE**, no actionable documented-standard
violations or heuristic findings remain. The projection fix and import hierarchy
corrections were checked. Previously dispositioned optional refactors remain
explicitly distinguished below. The reviewer ran no builds.

| Recommendation | Disposition and specific reason |
| --- | --- |
| Explicit `Consumer`/`List` imports | Accepted; fixed at the cited interfaces/authenticator and nearby touched access types. |
| Remove internal spike CHANGELOG item | Accepted. Spike evidence stays in outcome reports; the public list describes user-visible behavior. |
| Give spectator privacy its own CHANGELOG line | Accepted for clarity. It was already stated in the passive-update entry, so it was not absent; it now has a separate line. |
| One `FirebaseProviderRuntime.call(...)` lifecycle | Optional refactor not adopted. Initial authentication verifies signed metadata before revocation and observes rejection on failure; refresh may skip all provider work on a fixed positive-cache hit, then validates `getUser` before healing. Both close the operation before local SQL. A generic callback must preserve these distinct trust/cache/error orderings. No ownership/cleanup defect was demonstrated; the narrow lease-release correction avoids redesigning those proven boundaries. |
| One shared publication dispatcher / `send` helper | Optional refactor not adopted. State creates role-specific projections and optional transcript predecessors, chat distributes an existing page and excludes computers, and preparation sends membership-sensitive invalidations from another subscription map. All retain the final guard after serialization. A generic dispatcher would need to expose these different sources, projections and retirement hooks. The shared authority/budget classification is centralized in `V2MatchAccess`; dispatch remains explicit and regression-tested for all three families. |
| Collapse bounded cause-chain walks | Not adopted. The walkers return different evidence: transport-failure precedence, credential rejection and trusted lifecycle rejection/observer input. Keeping their small bounded walks local preserves classification precedence and avoids a generic traversal API solely for four loops. |
| Collapse duplicate worker startup guards | Optional helper extraction not adopted. DNS and ADC discovery are independently reachable, so both call sites must retain a guard even with a shared helper. The current two-line predicates make that requirement visible at each entry point; extracting only the predicate adds indirection without reducing the two required checks. This is a tradeoff, not a claim that the reviewer proposed removing protection. |
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

Revision review summary: **Standards 0 remaining findings; Spec 0 remaining
findings**. Both original actionable issues and the follow-up projection case
are fixed; proposed identity-denial healing is rejected for the stated contract
reason, rather than silently changing the accepted security policy.

The new regressions failed before the fix (three budget failures and one denied-
probe error). Focused corrected validation passed 104 tests, zero failures/errors
and no skips, including real loopback TLS/credential/cancellation tests, unchanged
incoming freshness, rejection retirement and transcript behavior.
Evidence: `.tools/pr518-revisions-{red,focused-r2}.log`.
At frozen code commit `0717c4d70`, clean `tools/target-build.ps1 verify` passed in
16:52: **19 common + 775 server + 292 native = 1,086 tests**, zero failures/errors,
twenty expected opt-in skips. Evidence: `.tools/pr518-revisions-verify-r2.log`.
The actual MariaDB publication/role/computer/16-socket integration class separately
passed **6 tests without skips** in `.tools/pr518-revisions-real-jdbc.log`.
Browser unit tests passed **530/530**; TypeScript/Vite assembly and all **82 browser
suites** passed the unchanged coverage gate in **734.5 seconds with two workers**.
Reports: `.tools/validation/local-browser-JWwxyO`; logs:
`.tools/pr518-revisions-browser-unit.log` and
`.tools/pr518-revisions-dev-local-r2.log`. The Linux image build also ran all
775 server tests successfully (thirteen expected opt-in skips).

**Credential blocker resolved:** the initial standard/mounted JVM ADC profiles
returned `SESSION_EXPIRED` (`invalid_rapt`). After the user renewed sign-in, both
profiles verified, the existing mounted profile was renewed with quota metadata,
and fresh synthetic DEV tokens were minted without printing or committing them.
No authentication policy, transport limit or credential type was relaxed.

The fresh combined boundary then passed **75 tests, zero skips/failures/errors**,
including actual Google Firebase + MariaDB, real loopback TLS/credentials,
all publication families, request timing, breaker policy and transcripts.
Actual provider/JDBC measurements: **742 ms cold authentication, 258 ms refresh,
1,861 ms late-lock rejection, 696 ms remaining JDBC allowance**. Evidence:
`.tools/pr518-renewed-real-provider-jdbc-r2.log`. The first combined run had one
strict one-second loopback cold-key TLS timeout while startup was running; its
actual Google/JDBC case passed. That failed run is retained in
`.tools/pr518-renewed-real-provider-jdbc.log`. The complete standalone rerun passed
without changing timeout values or adding worker retries.

Full non-quick startup resumed using the unchanged 82-suite reports at `0717c4d70`.
Before reuse, the standard coverage validator checked all reports/manifest entries,
and Git comparison confirmed the current tracked source differed only in reporting
documents, with no untracked source files. Report commit IDs were not rewritten.
The validated image, schema/ADC checks, Hosting/proxy initial/reconnect gates and
computer service all started successfully at `http://localhost:5000/play`.
Evidence: `.tools/pr518-renewed-dev-local.log`.

The first UI attempt timed out awaiting team-builder `Connected` after initial
sign-in had succeeded. A temporary redacted status/auth-code probe did not
reproduce it and completed the full smoke (eleven play decisions). The unchanged
driver then passed authentication, native movement/block, spectator/chat delivery,
reconnect, save/resume and wrong-coach/spectator/stale/fabricated-request rejection,
with **five play decisions and zero invalid live projections**. These are bounded
gameplay smokes, not full-match UI acceptance. Evidence:
`.tools/pr518-renewed-ui-{smoke,diagnostic,smoke-r2}.log` and corresponding private
artifact directories. The temporary source probe was deleted; no product or
driver code changed during this follow-up.

The retained-computer cold-load generic `PERSISTENCE_FAILED` warning appeared once
and its existing daemon retry recovered. Its underlying exception was not logged;
no new root-cause claim is made for this previously documented limitation. Final
service health is `healthy`, both retained computer matches load and wait for their
human coaches, and the rejection count stayed at one during the smokes.
The owned synthetic JDBC database was stopped after validation; the ready
dev-local stack/data remain. Known generated files were restored. No unrelated
work was changed. No credential-dependent validation remains blocked.
