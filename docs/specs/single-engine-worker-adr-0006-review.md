# Review: ADR 0006 single engine worker (proposed)

Reviewed: 2026-11-09 against the working tree on `53edb476a`.
Subject: [ADR 0006](../adr/0006-single-engine-worker.md).
Checked against: [the request](single-engine-worker-adr.md), [the request review](single-engine-worker-adr-review.md),
issue #509, #504/#505/#507/#508/#39, ADRs 0002/0004/0005, and the cited code.

## Verdict

**The draft meets the request's acceptance criteria, and its factual claims are
correct.** After the two decisions in "Before acceptance" below, it is ready for
maintainer acceptance, and #504 and #505 can then start. The draft adopts all
seven earlier request findings. The architecture-map pointer now sits under a
separate "Proposed decisions" heading, which resolves the old concern about a
proposed ADR appearing among the enforced invariants.

These claims were spot-checked and are accurate:

- the 128 / 16 admission limits, the untracked `submitControl`, and the
  unbounded `LinkedBlockingQueue`;
- the watchdog's name and its 100 ms / 2,000 ms / 1 s checks;
- the 20 s drain in `ServerCommunication.shutdown`, followed by
  `IllegalStateException`;
- `FirebaseOptions` built with no timeouts (`FirebaseV2PrincipalAuthenticator.java:36`);
- the Riotous Rookies HTTP call and its 10 s connect-only timeout;
- synchronized file writes in `DebugLog.logInternal` (`DebugLog.java:186-198`);
- the `Fortuna` constructor's `Thread.sleep` / `isReachable` work, which runs at startup only;
- the Fortuna, `Constant` and `UtilPassing` prerequisites.

`StepRiotousRookies` belongs to `RulesCollection.Rules.COMMON` (`:30`), so the
BB2025 runtime can reach it. The inventory row for it is justified.

## Before acceptance (decisions, not rewrites)

1. **The aggregate budget has no target.** The draft defers "the tolerable
   cross-match stall" to the maintainer (`0006:81`). Every ticket then records
   its own budget. Without a shared limit, nobody checks the total cost of one
   request.
   *Scenario:* #504 picks a 2 s connect / 3 s read limit plus SDK retries, and
   #505 picks its own socket timeout. A single `join` can then run
   `verifyIdToken(checkRevoked=true)`, a cache-miss `getUser`, and several JDBC
   calls in sequence. Each call meets its ticket's budget, yet the request can
   hold the worker for tens of seconds.
   *Fix:* at acceptance, have the maintainer set a provisional worst-case
   worker-occupancy ceiling for one request, and per dependency family if
   useful. #39 can revise it later. The number is the maintainer's call, not
   something to measure first. Without it, #504 and #505 have nothing to
   validate their totals against.
2. **The logging follow-up should not block acceptance.** The draft makes an
   unowned logging ticket a precondition for acceptance (`0006:164`, `:204`), and
   says local files and stderr are "not exempt" (`0006:48`). Under that rule,
   every log write is a compliance gap with no realistic fix. `DebugLog` already
   filters by level (`DebugLog.java:155`) and writes to local disk.
   *Fix:* choose one of these.
   - (a) State a narrow allowance: local append-only logging at the configured
     level is permitted, with a local-disk stall listed as a named residual risk.
   - (b) Keep the rule, but file logging as a low-priority ticket that does not
     gate acceptance.

   Option (a) is more honest about where the risk actually sits. Keep the
   Riotous Rookies HTTP ticket as a gate either way, because it is a real
   remote dependency with no read timeout.

## Maintainer decisions (2026-11-09, in chat with the reviewer)

The maintainer resolved both items above. Record them in ADR 0006 and cite the
approval when acceptance is recorded.

- **Item 2: local logging allowance (option a).** The worker may append to local
  logs at the configured level. Remove the "unowned logging follow-up" from the
  acceptance gate and from the gap table. List a local-disk or stderr stall as a
  named residual risk instead. Asynchronous logging is deferred until any move to
  parallel execution and is not a current requirement. The Riotous Rookies HTTP
  ticket remains an acceptance gate.
- **Item 1: worker-occupancy budget.** The maintainer accepted the reviewer's
  recommendation in principle. Write it into the budget section as follows.
  1. *Healthy target:* p99 worker execution per task ≤ 100 ms. Investigate
     anything regularly above about 250 ms as a regression. Measure it with the
     existing per-request timing traces (#497, #501), keeping queue wait separate
     from execution.
  2. *Failure ceiling:* worst-case worker occupancy is ≤ 2,000 ms per request,
     counting every dependency call, retry, backoff and cleanup on the worker. It
     matches the existing 2,000 ms outbound write-stall threshold. Healthy
     provider checks take about 100–170 ms (ADR 0005 and the video review). The
     ceiling is provisional, and #39 measurements may revise it.
  3. *Per-dependency allocations* are owned by their tickets and must fit inside
     the ceiling. Suggested starting points follow; the tickets must verify them
     against the pinned SDK and driver.
     - **Firebase (#504):** about 1,000 ms total per operation, with no SDK
       retries on the worker. A pair such as 500 ms connect / 750 ms read can
       reach 1,250 ms on one attempt. So either trim the values or show which
       SDK control caps the total. #504's suggested 2,000 ms connect /
       3,000 ms read would exceed the ceiling on its own.
     - **JDBC (#505):** about 500 ms connect and a 1,000–1,500 ms socket timeout.
       Also set a low `innodb_lock_wait_timeout` (about 1 s) on each request
       session. A lock wait then fails with a clean SQL error, and the socket
       timeout does not kill the connection and leave a commit's outcome unknown.
  4. *Fail fast during sustained outages:* a per-call timeout limits one stall,
     not a queue of them. With 128 tracked requests, back-to-back 2 s timeouts
     would freeze matches for about four minutes even though every call
     complies. #504 and #505 must therefore include a circuit breaker. After a
     small number of consecutive timeouts (suggested: 3), reject immediately for
     a short cooldown (suggested: 5–10 s), then let one request through to test
     recovery. Firebase rejections still fail closed under ADR 0005. A failing
     database already stops gameplay, so the breaker keeps expiry, disconnect
     cleanup and connection permits moving. The ADR states the requirement; each
     ticket picks and tests its own thresholds.

## Worth tightening (non-blocking)

3. **Default values conflict with #505.** The ADR allows "documented finite safe
   defaults" for missing settings (`0006:85`). #505's acceptance criteria require
   startup to *reject* a configuration without a timeout. Add a line saying a
   ticket may be stricter than the ADR, or align #505. Otherwise its implementer
   has to choose between the two.
4. **Removal is a valid fix for the rookie call.** The row asks to bound
   acquisition, connect, read, redirects, size and loop work (`0006:163`). The
   simplest compliant fix may be to stop calling the name generator during
   native mutation. The step could use local or generated names, or the existing
   fallback, which the code already accepts. Say that removal counts as
   compliance, so the ticket is not scoped as an HTTP-hardening project.
5. **The inventory will go stale inside the ADR.** The source-sweep table is
   point-in-time evidence (`0006:148-176`), and the ADR itself says to repeat it.
   Policy belongs in an ADR, and inventories go stale. Consider moving the table
   to the request (or a review file) and keeping a one-line pointer plus the
   evidence revision in the ADR. This is a matter of style. Leaving it in place
   is acceptable because it is dated and tied to a revision.

## Suggested path to implementation

1. Update ADR 0006 with the maintainer decisions above, then record acceptance
   with a date. A comment on #509 is enough.
2. File the Riotous Rookies HTTP ticket and link it from the ADR's gap table. No
   logging ticket is needed.
3. Add the budget allocation and circuit-breaker requirement to the scope of
   #504 and #505, then start both. Neither depends on the #507 security
   decision. #508 can run in parallel. #507 waits for its ADR 0005 amendment
   choice.
