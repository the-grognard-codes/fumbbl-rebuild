# Slice 3: provider bounds and publication authorization

Follow-up: [automatic publication catch-up and the eight inline review dispositions](../reviews/2026-11-10-pr518-catch-up-review.md) supersede the earlier skip-until-next-publication behavior.

Tracking: [#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504),
[#507](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507).
Independent security-review PR: [#518](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518).
Branch: `fix/firebase-bounds-publication-authorization`, from current main
`031495c72` after RB2 and slice 2 merged.
Status: latest review revisions isolate catch-up by match, coalesce obsolete
states and avoid empty retry tasks. See the
[latest six dispositions and validation](../reviews/2026-11-10-pr518-per-match-review.md),
[previous catch-up review](../reviews/2026-11-10-pr518-catch-up-review.md) and
[first review responses](../reviews/2026-11-10-pr518-review-responses.md).
Runtime `1c1cf0534` passed 1,102-test clean verification, 102 real provider/JDBC
boundary tests, 530 browser unit tests, all 82 browser suites, full dev-local
startup and a nine-decision real three-party smoke. Both independent review axes
approved. The report retains the initial UI connection wait and successful
probes/reruns without claiming its cause is resolved. Historical cold-process
provider failures remain documented in the prior report. This round's attempted
matched native profiles failed closed before publication at 1,110?1,115 ms, even
with the same explicit SDK warm-up; no updated matched latency comparison or
merge-readiness claim is made.
The original delivery evidence below predates these review revisions.
No merge or deployment performed.

The [continued feasibility spike](engine-worker-firebase-bounds-spike-2.md)
passed before production work, following the initial candidate's recorded failed
gate and the maintainer's authorization to continue. Public pinned SDK seams plus
owned cancellable DNS/TCP proved cold keys, credential refresh, revocation,
retry suppression and physical cancellation. The accepted spike has its own
commit/clean-build/browser validation boundary.

The [#504 outcome](engine-worker-firebase-bounds-outcome.md) records the separate
production series (`c72a1b5f4`, `1ca75927a`), measured 1,200 ms provider allocation,
shared absolute two-second deadline, supported credential factories, outage
breaker, fail-closed/cache semantics, real Firebase/JDBC evidence and successful
dev-local startup. Its clean validation passed 1,071 tests plus browser unit/build
and all 82 browser suites.

The [#507 outcome](engine-worker-publication-authorization-outcome.md) records
approved option A, one actual local authorization query per nonempty fan-out,
zero provider work during fan-out, sixteen-target/socket bounds, original-token
expiry and observed-rejection retirement. It documents the accepted passive
revocation exposure and the spectator privacy corrections found during real UI
validation and independent review.

[Matched sanitized evidence](../reviews/2026-11-10-engine-worker-slice3-measurements.json)
shows actual Firebase/JDBC/native workloads with zero versus fifteen passive
recipients: healthy action p99 77.63 versus 88.54 ms, publication maximum 17 ms,
one provider lookup per forced miss and none per healthy action, with no measured
request overrun. Actual SQL and sixteen real-socket tests provide separate
query, transport/queue and cleanup evidence.

The [environment retrospective](../reviews/2026-11-10-engine-worker-slice3-retrospective.md)
records follow-up candidates for wiring existing database and credentialed smoke
checks, matching the JVM credential profile and investigating browser contention.
It introduces no new agent rules or CI permission changes.

The revised requests were linked before implementation:
[#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504#issuecomment-6758906276),
[#507](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507#issuecomment-6758906523).
Final `tools/target-build.ps1 verify` passed **1,081 tests**, zero failures/errors,
twenty expected opt-in skips. Real provider/JDBC boundary tests separately passed
**62 tests without skips**. Browser unit tests passed **530/530**, TypeScript/Vite
build passed, and all **82 browser suites** passed the unchanged coverage gate at
`604a884c8` in 636.6 seconds with two workers. The native fixture and asynchronous
composer-test corrections have separate test-only commits. Production security
semantics were independently approved at `dee89afd1`; subsequent code changes
only corrected test doubles and synchronization.

Full non-quick dev-local startup passed its Linux server tests, schema/ADC checks,
Hosting/proxy authentication gates and computer-service startup. The final stack
is healthy at `http://localhost:5000/play`. Two real three-party smokes passed
authentication, native gameplay including movement/block, spectator/chat delivery,
reconnect, save/resume and negative authorization checks, with zero invalid live
projections. These bounded gameplay smokes do not claim full-match UI acceptance.

One initial retained computer-load `PERSISTENCE_FAILED` rejection recovered; its
underlying exception was not logged and its original cause is not established.
Two diagnostic cold restarts and the final smoke produced no additional rejection.
The final 170-request instrumented snapshot had maximum execution 1,527.19 ms and
zero executions over two seconds. The detailed outcome distinguishes this from
the earlier uninstrumented failure and ADR 0006's native/CPU residual risk.

At the original delivery, no required implementation or validation remained pending. The historical
non-reproducing startup rejection remains an explicitly recorded diagnostic
limitation for review. [PR #518](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518)
will close both issues on merge;
neither issue is closed independently while review remains outstanding.

PR #518 review corrections preserve valid subscriptions when only the originating
request/JDBC deadline expires, including during state projection. Denied provider
probes now release their slot without renewing cooldown or falsely healing the
breaker. The proposed denial-as-success policy is specifically rejected against
the #504 contract. All optional refactors and scope notes have individual
dispositions in the linked response. Current code passed 104 focused tests,
1,086 clean-verification tests (twenty expected opt-in skips), six actual
MariaDB/socket tests, 530 browser unit tests and the complete 82-suite gate.
After ADC renewal, the fresh combined provider/JDBC boundary passed 75 tests
without skips. Actual measurements were 742 ms cold authentication, 258 ms refresh
and 1,861 ms late-lock rejection within the shared deadline. Full non-quick
startup completed and the unchanged three-party driver passed native movement/
block, spectator/chat, reconnect/save/resume and negative checks with five play
decisions and zero invalid projections. The detailed response retains the initial
loopback timeout and UI connection wait, their successful reruns, and the known
recovered cold-computer-load diagnostic limitation. No credential validation
remains blocked. No merge or deployment is authorized by these revisions.


Latest PR #518 revision: [bounded retry and transcript recovery report](../reviews/2026-11-10-pr518-bounded-retry-review.md).
Runtime `72b8802cf` limits unsuccessful budget-bearing attempts to three,
inherits retry counts across state coalescing, drains earlier work inline within
the caller deadline, captures optional transcript reservation and centralizes
retention accounting. Mounted browser coverage proves paged recovery of
coalesced transcript gaps. All five comments have explicit dispositions; the
mid-socket capability-enable scenario is rejected against the current protocol,
while its defensive reservation guard is implemented. Both review axes approved.

This revision passed 76 focused tests, 108 real provider/JDBC tests without skips,
530 browser units, all 83 browser suites and full dev-local startup. Real query
counts remain 0/1/1 for 0/1/16 targets per family, with zero provider fan-out calls.
Diagnostic and canonical three-party smokes each completed seven decisions with
zero invalid projections. Clean pinned verification passed 1,108 tests with zero
failures/errors and twenty expected opt-in skips in 14m30s. A separate test-only
commit `a98e165da` isolates activation-trait assertions from random kickoff
markers; runtime sources remain identical to the browser/real-boundary build.

Current matched native latency evidence remains incomplete: both profiles failed
closed during fixture authentication before publication. The report retains
those failures, the initial strict loopback timeout, an unexplained canonical UI
connection wait, the random kickoff fixture failure and incremental compilation
failure alongside subsequent passing checks. No timeout policy was relaxed; no
new matched p99 comparison or merge-readiness claim is made. Dev-local remains
running. No merge or remote deployment occurred.
