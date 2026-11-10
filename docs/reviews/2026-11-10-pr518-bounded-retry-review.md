# PR #518: bounded retries and transcript recovery

Baseline: `3fe31a51826c9fcfb6748c8bf1c8c8704d3bba9a`. Prior findings and validation
limits remain in [the previous report](2026-11-10-pr518-per-match-review.md).

## Dispositions

1. [Indefinite retry](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4528229724): **accepted**. Three typed deferrals from attempts starting with remaining budget retire the undelivered recipients explicitly unavailable. This includes the initial attempt if it starts with budget. Calls already out of budget do not consume the allowance. Coalesced states inherit the count; replacement cannot keep an unsuccessful chain alive indefinitely. Retirement releases queue count/retained characters and allows later work to drain. It indicates delivery unavailability, not proof of revocation.
2. [Fresh state behind deferred chat](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4528229950): **accepted**. Publication drains preceding work for the same match before attempting the new payload. Both use the caller's existing absolute deadline, fresh local authorization per attempted publication and unchanged final enqueue guards. A failed head preserves ordering; the watchdog remains the fallback. No fresh inline budget or mutation replay occurs.
3. [Unreserved transcript load](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4528230211): **defensive fix accepted; current protocol scenario rejected**. A socket cannot enable live transcript after initial authentication: same-socket reauthentication is rejected, and the only current protocol path can disable it on a rejected authentication attempt. Nonetheless, the publisher now captures each recipient's transcript permission when reserving retention and refuses optional loading on retry unless that permission was captured. A direct publisher regression deliberately enables the flag after queuing: the mandatory state arrives with no frame load; a subsequent newly reserved publication can deliver its frame. This makes the retention rule explicit even for future capability changes.
4. [Coalesced transcript gap coverage](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4528230401): **accepted**. Server tests coalesce three pending states for a live recipient and load only the latest frame. The new mounted production-browser test receives revision 5 after revision 2, with revisions 3 and 4 superseded, and proves a correlated page from 3 through 5 restores the missing log entries. It covers both a latest optional predecessor and no predecessor, then duplicate latest delivery without duplicate history or reads. Existing gap detection required no browser product-code change; no protocol gap marker is needed.
5. [Scattered counter updates](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4528230554): **accepted**. `enqueue` and `removed` own collection membership, count, retained characters and the volatile hint. The duplicate finally blocks are removed. Rotation changes order only, not retention accounting.

## Security and limits

No provider call, original token-expiry extension, identity-cache change or
incoming freshness change is introduced. Each nonempty attempted publication
still requires a fresh local batch and final expiry/enrollment admission.
Global 64-entry/4-Mi-character and 16-target limits remain. Generic database errors
retain fail-closed retirement. A zero-budget inline attempt neither performs
local I/O nor spends a retry; positive-budget typed refusal does count. Three
failed attempts are a bounded delivery policy, not a promise that slow work will
succeed. Optional history loss remains recoverable through existing paged reads.

## Review and validation

Runtime revision: `72b8802cf2914550cabf6b6ec0059dfbbfe0e2ab`.

### Standards

Independent review found no actionable documented-standard violations or heuristic
findings. Pending ownership, shared draining/accounting and transcript reservation
were approved. The reviewer did not run separate tests.

### Spec

Independent review found no actionable findings. Retry limits survive coalescing,
zero-budget callers do not spend retries, and authorization/deadline/cleanup paths
are shared. Browser coverage exercises both transcript-gap variants. The reviewer
did not run separate tests.

Review totals: Standards 0; Spec 0; neither axis has an outstanding finding.

Focused server tests: **76 passed**, no skips. The strengthened seven-test delivery
suite also passed, including reuse of all 64 slots after retirement. Browser units:
**530 passed**, no skips. Logs: `.tools/pr518-round4-focused-r2.log`,
`.tools/pr518-round4-capacity.log`, `.tools/pr518-round4-browser-unit.log`.
The old fairness test's final pending expectation was updated to expect retirement
at the third deferral, as required by the new policy.
The new browser regression passed after correcting its fixture response envelope
(required `duplicate` field) and selecting the authoritative log rather than chat.
No product browser behavior was changed to make it pass.

Full browser gate: **all 83 suites passed** in **664.2 seconds with two workers**,
including TypeScript/Vite assembly and the new live transcript recovery suite.
Evidence: `.tools/validation/local-browser-vcQqYk`, `.tools/pr518-round4-dev-local.log`.

Linux image: **797 tests, zero failures/errors, 13 expected opt-in skips**.
Full non-quick dev-local startup passed: database/server health, verified ADC,
initial and reconnect websocket auth gates, and computer service startup. Server
application error markers were zero and computer stderr was empty.

Actual Firebase/MariaDB boundary rerun: **108 passed, no skips**, including
provider/cache/expiry/revocation, real sockets and query counts. For each of
STATE/CHAT/PREPARATION, 0/1/16 targets executed **0/1/1** authorization queries;
16-target batches took **8.4-8.8 ms**. The real-socket scenario used 16 sockets,
13 state targets, 13 chat targets and one preparation target; provider fan-out
calls were **zero**. Cold authentication **672 ms**, OAuth refresh **235 ms**,
late-lock refusal **1,853 ms**, JDBC allowance **699 ms**. Log:
`.tools/pr518-round4-real-provider-jdbc-r2.log`.

Retained first-run failure: the initial combined suite had one error in the strict
loopback `coldUserAndServiceCredentialsVerifyThroughRealDnsTlsOAuthAndRevocationWithinOneAllocation`
fixture, at its unchanged 1,000 ms allocation. Its actual Firebase/JDBC and
publication tests passed; the overall first run is still **failed**, not counted
as passing. The unchanged suite passed after startup settled. Startup contention
is a possible contributor, not an established cause. Initial log:
`.tools/pr518-round4-real-provider-jdbc.log`.

Real UI: diagnostic and unmodified canonical flows each completed **7 native
decisions**, with **zero invalid projections**, including movement/block,
two-coach/spectator convergence, escaped durable chat, negative authorization,
route preview, reconnect and save/resume. The canonical spectator screenshot was
visually inspected. These are bounded smokes, not full-match acceptance. Logs:
`.tools/pr518-round4-ui-diagnostic.log`, `.tools/pr518-round4-ui-smoke-r2.log`.
Application error markers remained zero after both successful flows.

Retained UI failure: the first canonical attempt timed out waiting for initial
`Connected` status **after** the diagnostic flow had succeeded. The server was
therefore not wholly cold; cold-start alone does not explain this occurrence.
No diagnostic response code was captured for that canonical wait, and its cause
remains unestablished. The unchanged canonical retry passed. No timeout or
security limit was relaxed. Log: `.tools/pr518-round4-ui-smoke.log`.

**Matched native timing remains incomplete.** Both fresh profiles passed the
14 owned-transport tests and the actual Firebase/JDBC test, then failed during
fixture authentication before publication: zero recipients **1,111 ms / 3 HTTP
calls / 2 responses**; fifteen recipients **1,105 ms / 1 call / 0 responses**.
Both reported provider `TimeoutException` and failed closed. Each combined
16-test process is **failed**, not counted as passing. No current matched p99
comparison or merge-readiness claim is made; prior profiles remain historical.
Logs: `.tools/pr518-round4-native-0.log`, `.tools/pr518-round4-native-15.log`.

The first clean host verification failed in the unrelated
`LimitedActionTagsTest.failedActivationTraitsKeepTheConfirmedPassTag`: random
kickoff added `dodgySnack` beside the expected `distracted` marker. The fixture
now removes kickoff/prayer marker enhancements before testing activation traits,
following the existing gameplay fixture convention. The strict marker assertion
and production gameplay behavior remain unchanged. Log:
`.tools/pr518-round4-verify.log`.

An incremental focused invocation then failed compilation with missing class-file
errors despite Maven reporting production classes up to date. A clean verification
recompiled the same sources successfully; the incremental failure is retained in
`.tools/pr518-round4-fixture-fix.log`. Its underlying filesystem/build-output cause
is not established. Clean host `tools/target-build.ps1 verify` then passed **1,108 tests, zero failures
or errors, twenty expected opt-in skips**, in **14m30s**. Both the corrected
four-test activation-tag suite and seven-test negative-marker suite passed.
Log: `.tools/pr518-round4-verify-r2.log`.


The fixture-only correction is `a98e165da1df615e76020ebd06674cfc0755e436`.
Production Java/browser sources, browser regression and shard configuration are
identical to runtime revision `72b8802cf`; the completed browser, Linux startup
and real provider/JDBC results therefore exercise the delivered runtime. The
clean host run includes the fixture correction. No deadline or authorization
policy changed during validation.

[Sanitized measurements and failed-log hashes](2026-11-10-pr518-bounded-retry-validation.json)
retain source identities and failure evidence without credentials or private game
state. No merge or remote deployment is performed.
